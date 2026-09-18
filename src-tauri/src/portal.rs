//! Portal tab: external web apps (Discord, Instagram, ...) as native child
//! webviews of the main window.
//!
//! Those sites refuse to load in an iframe, so each app gets a real webview
//! that the view positions over a placeholder element. The webviews live here,
//! keyed by app id, so switching tabs only hides them: they keep running and
//! stay signed in. Each app has its own data directory, which keeps sessions
//! apart and lets one app be signed out without touching the others.
//!
//! Remote pages get no IPC access: capabilities/default.json has no `remote`
//! entry, so Tauri rejects commands from their origins.
//!
//! Commands that create webviews are async: creating one from a synchronous
//! command deadlocks on Windows.
//!
//! A webview stays hidden while its page loads (first open, Reload, Back to
//! home page, Sign out), so the view's skeleton placeholder shows through
//! instead of a blank dark rectangle. It is revealed when the page finishes
//! loading, or after `LOAD_TIMEOUT` if it never reports that.
//!
//! Menus and dialogs cannot draw over a native webview, so the view hides it
//! while one is open. `portal_snapshot` captures the page first, and the view
//! shows that picture in its place, so the page stays visible behind the menu.
//!
//! Keys pressed inside an app page go to that page, not the main webview, so
//! the tab shortcuts are caught in the app webview and sent to the view as
//! `SHORTCUT_EVENT` (Windows only; see portal/webview2.rs).

#[cfg(windows)]
mod webview2;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::utils::config::BackgroundThrottlingPolicy;
use tauri::webview::{Color, NewWindowResponse, PageLoadEvent, WebviewBuilder};
use tauri::ipc::Response;
use tauri::{AppHandle, Emitter, EventTarget, LogicalPosition, LogicalSize, Manager, Rect, Runtime, Url, Webview, WebviewUrl};
use tauri_plugin_opener::OpenerExt;

/// Page titles carry unread counts, e.g. `(3) Discord`; the view turns them
/// into badges.
const TITLE_EVENT: &str = "portal://title";
/// A tab shortcut pressed inside an app page. Payload: `next`, `previous`,
/// `close` or `reload` (`PortalShortcut` in src/lib/portalNative.ts).
const SHORTCUT_EVENT: &str = "portal://shortcut";
const LABEL_PREFIX: &str = "portal-";
const MAIN: &str = "main";

/// A snapshot that takes longer than this is skipped; the view falls back to
/// its placeholder.
#[cfg(windows)]
const SNAPSHOT_TIMEOUT: Duration = Duration::from_millis(800);

/// A page that has not finished loading by then is shown anyway, so a stalled
/// request cannot leave the skeleton up forever.
const LOAD_TIMEOUT: Duration = Duration::from_secs(20);

/// How long an app stays off screen before its caches are trimmed. Long enough
/// that opening a menu, or switching to another app and back, never trims the
/// one being used: those hide it for a moment and would otherwise make it drop
/// caches it is about to need again.
const IDLE_DELAY: Duration = Duration::from_secs(30);

/// Webview background while a page is loading or faded out, so neither shows
/// WebView2's default white.
const BACKGROUND: Color = Color(5, 5, 10, 255);

/// Browser arguments shared by every Portal app.
///
/// The three `ms*` features are wry's own defaults, repeated because passing
/// arguments at all replaces them: `msWebOOUI` and `msPdfOOUI` are the "mini
/// menu", `msSmartScreenProtection` is SmartScreen.
///
/// `BackForwardCache` is ours. It keeps whole rendered pages in memory so the
/// back button can restore them instantly, which is worth little in an app
/// whose pages are single-page sites, and costs tens of megabytes each. Going
/// back re-renders instead.
///
/// The cache cap keeps a long-running app's data folder, and the index WebView2
/// holds for it, from growing without limit.
///
/// Every app passes the same string on purpose: WebView2 groups webviews into
/// one browser process only when their environments match, and the arguments
/// are part of that match.
const BROWSER_ARGS: &str =
  "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,BackForwardCache --disk-cache-size=52428800";

/// Fades the page in from transparent. Run just before a hidden webview is
/// shown; the fade starts on its first frames once visible.
const FADE_IN: &str = "(() => { const s = document.documentElement && document.documentElement.style; if (!s) return; \
  clearTimeout(window.__crystalPortalFade); s.transition = 'none'; s.opacity = '0'; \
  requestAnimationFrame(() => requestAnimationFrame(() => { s.transition = 'opacity 220ms ease-out'; s.opacity = '1'; \
  window.__crystalPortalFade = setTimeout(() => { s.transition = ''; s.opacity = ''; }, 260); })); })();";

/// Shows the page at once. Used when the view already shows a snapshot of it.
const SHOW_NOW: &str = "(() => { const s = document.documentElement && document.documentElement.style; if (!s) return; \
  clearTimeout(window.__crystalPortalFade); s.transition = ''; s.opacity = ''; })();";

/// Fades the visible page out before the view switches to another app.
const FADE_OUT: &str = "(() => { const s = document.documentElement && document.documentElement.style; if (!s) return; \
  clearTimeout(window.__crystalPortalFade); s.transition = 'opacity 140ms ease-in'; s.opacity = '0'; })();";

#[derive(Default)]
pub struct PortalState {
  /// Held while checking for and creating a webview, so two quick
  /// `portal_show` calls for a new app do not both try to create it.
  create: Mutex<()>,
  /// Label of the webview currently on screen. Showing a different one fades
  /// it in; repeated calls that only move the same one do not.
  shown: Mutex<Option<String>>,
  /// Labels of webviews kept hidden until their page loads, each with the id
  /// of that load so an older load's timeout does not reveal a newer one.
  loading: Mutex<HashMap<String, u64>>,
  next_load: AtomicU64,
  /// Labels waiting to have their caches trimmed, each with the id of that
  /// wait, so an app shown again before `IDLE_DELAY` is up is not trimmed by
  /// the timer its earlier hide started.
  idle: Mutex<HashMap<String, u64>>,
  next_idle: AtomicU64,
}

/// Mirrors `PortalBounds` in src/lib/portalNative.ts. Logical (CSS) pixels
/// relative to the main window's content area.
#[derive(Deserialize, Clone, Copy)]
pub struct Bounds {
  x: f64,
  y: f64,
  width: f64,
  height: f64,
}

#[derive(Serialize, Clone)]
struct TitlePayload {
  id: String,
  title: String,
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

/// App ids become directory names, so only lowercase letters, digits and
/// dashes are allowed.
fn valid_id(id: &str) -> bool {
  !id.is_empty() && id.len() <= 40 && id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

fn check_id(id: &str) -> Result<(), String> {
  if valid_id(id) {
    Ok(())
  } else {
    Err(format!("Invalid Portal app id: {id:?}"))
  }
}

/// Only https pages with a host can be connected.
fn parse_home(url: &str) -> Result<Url, String> {
  let parsed = Url::parse(url).map_err(|_| format!("Not a valid URL: {url}"))?;
  if parsed.scheme() != "https" || parsed.host_str().is_none() {
    return Err("Portal apps must use an https:// address".into());
  }
  Ok(parsed)
}

/// The last two labels of a host: `mail.google.com` gives `google.com`.
/// Good enough to keep a site's own popups in-app; a two-part public suffix
/// such as `co.uk` just means those popups open in the browser instead.
fn site_of(host: &str) -> &str {
  let host = host.trim_end_matches('.');
  match host.rmatch_indices('.').nth(1) {
    Some((i, _)) => &host[i + 1..],
    None => host,
  }
}

fn same_site(home: &Url, target: &Url) -> bool {
  match (home.host_str(), target.host_str()) {
    (Some(a), Some(b)) => site_of(a).eq_ignore_ascii_case(site_of(b)),
    _ => false,
  }
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/// The Portal shortcut for a key press, matching the view's own keydown
/// handler: Ctrl+Tab and Ctrl+Shift+Tab cycle apps, Ctrl+W removes the active
/// one, Ctrl+R reloads it. `key` is a Windows virtual-key code.
#[cfg_attr(not(windows), allow(dead_code))]
fn shortcut_for(key: u32, ctrl: bool, shift: bool, alt: bool) -> Option<&'static str> {
  const TAB: u32 = 0x09;
  const R: u32 = 0x52;
  const W: u32 = 0x57;
  if !ctrl || alt {
    return None;
  }
  match key {
    TAB if shift => Some("previous"),
    TAB => Some("next"),
    W => Some("close"),
    R => Some("reload"),
    _ => None,
  }
}

fn label_of(id: &str) -> String {
  format!("{LABEL_PREFIX}{id}")
}

fn data_dir<R: Runtime>(app: &AppHandle<R>, id: &str) -> Result<PathBuf, String> {
  let base = app.path().app_config_dir().map_err(|e| e.to_string())?;
  Ok(base.join("portal").join(id))
}

fn portal_webviews<R: Runtime>(app: &AppHandle<R>) -> impl Iterator<Item = (String, Webview<R>)> {
  app.webviews().into_iter().filter(|(label, _)| label.starts_with(LABEL_PREFIX))
}

fn find<R: Runtime>(app: &AppHandle<R>, id: &str) -> Result<Option<Webview<R>>, String> {
  check_id(id)?;
  Ok(app.get_webview(&label_of(id)))
}

fn rect(bounds: Bounds) -> Rect {
  Rect {
    position: LogicalPosition::new(bounds.x, bounds.y).into(),
    size: LogicalSize::new(bounds.width.max(1.0), bounds.height.max(1.0)).into(),
  }
}

/* ------------------------------------------------------------------ *
 * Memory
 * ------------------------------------------------------------------ *
 *
 * An app that is not on screen keeps running, but nothing it has painted is
 * being looked at, so WebView2 is asked to trim its caches. That is where most
 * of the Portal's memory sits: the pages themselves are small next to the
 * render caches behind them.
 *
 * Trimming is delayed by `IDLE_DELAY` because hiding is also what happens for
 * a moment when a menu opens or the user switches apps and comes straight
 * back. Hiding the main window to the tray trims at once instead: nothing is
 * on screen at all then, and the window staying hidden is the normal case. */

/// Trims (or restores) one webview's caches. Does nothing off Windows, where
/// WebView2 is not the engine.
fn set_memory_saving<R: Runtime>(app: &AppHandle<R>, label: &str, saving: bool) {
  let Some(webview) = app.get_webview(label) else { return };
  #[cfg(windows)]
  if let Err(err) = webview2::set_memory_saving(&webview, saving) {
    log::warn!("[portal] could not set the memory level for {label}: {err}");
  }
  #[cfg(not(windows))]
  let _ = (&webview, saving);
}

/// Puts a webview back to its normal memory level and cancels any pending
/// trim, so an app being shown keeps the caches it is about to paint from.
fn wake<R: Runtime>(app: &AppHandle<R>, state: &PortalState, label: &str) {
  state.idle.lock().unwrap().remove(label);
  set_memory_saving(app, label, false);
}

/// Trims a webview's caches once it has been off screen for `IDLE_DELAY`,
/// unless it is shown again first.
fn trim_when_idle<R: Runtime>(app: &AppHandle<R>, state: &PortalState, label: &str) {
  let idle = state.next_idle.fetch_add(1, Ordering::Relaxed);
  state.idle.lock().unwrap().insert(label.to_string(), idle);
  let app = app.clone();
  let label = label.to_string();
  std::thread::spawn(move || {
    std::thread::sleep(IDLE_DELAY);
    let state = app.state::<PortalState>();
    {
      let mut waiting = state.idle.lock().unwrap();
      // Shown again, or a later hide restarted the wait: leave it alone.
      if waiting.get(&label) != Some(&idle) {
        return;
      }
      waiting.remove(&label);
    }
    if state.shown.lock().unwrap().as_deref() == Some(label.as_str()) {
      return;
    }
    set_memory_saving(&app, &label, true);
  });
}

/// Trims every webview at once, or puts them back. Called when the main window
/// is hidden to the tray and when it comes back: with the window gone there is
/// nothing to paint, so the wait that `trim_when_idle` uses would only hold
/// memory for no one.
///
/// This covers the main window's own webview too, not just the Portal apps.
/// Crystal OS's own interface is the largest single page the app runs, and
/// while the window is in the tray none of it is being looked at.
pub fn set_all_memory_saving<R: Runtime>(app: &AppHandle<R>, saving: bool) {
  let state = app.state::<PortalState>();
  let shown = state.shown.lock().unwrap().clone();
  for (label, _) in portal_webviews(app) {
    // On the way back only the app on screen is restored; the rest stay
    // trimmed until they are shown.
    if !saving && shown.as_deref() != Some(label.as_str()) {
      continue;
    }
    state.idle.lock().unwrap().remove(&label);
    set_memory_saving(app, &label, saving);
  }
  set_memory_saving(app, MAIN, saving);
}

/// Records that `label` is loading a page and starts its timeout. The caller
/// hides the webview (or creates it and then hides it).
fn start_loading<R: Runtime>(app: &AppHandle<R>, state: &PortalState, label: &str) {
  let load = state.next_load.fetch_add(1, Ordering::Relaxed);
  state.loading.lock().unwrap().insert(label.to_string(), load);
  let app = app.clone();
  let label = label.to_string();
  std::thread::spawn(move || {
    std::thread::sleep(LOAD_TIMEOUT);
    finish_loading(&app, &label, Some(load));
  });
}

/// Hides an existing webview until the page it is about to load finishes.
fn hide_while_loading<R: Runtime>(app: &AppHandle<R>, webview: &Webview<R>) {
  start_loading(app, &app.state::<PortalState>(), webview.label());
  let _ = webview.hide();
}

/// Ends a load and shows the webview if it is still the one on screen.
/// `load` is set by the timeout, which only ends the load it started.
///
/// Runs on the main thread for page-load events, so each lock is released
/// before the next is taken; `portal_show` holds `shown` while reading
/// `loading`.
fn finish_loading<R: Runtime>(app: &AppHandle<R>, label: &str, load: Option<u64>) {
  let state = app.state::<PortalState>();
  {
    let mut loading = state.loading.lock().unwrap();
    match (loading.get(label), load) {
      (None, _) => return,
      (Some(current), Some(load)) if *current != load => return,
      _ => {
        loading.remove(label);
      }
    }
  }
  let on_screen = state.shown.lock().unwrap().as_deref() == Some(label);
  if !on_screen {
    return;
  }
  if let Some(webview) = app.get_webview(label) {
    let _ = webview.eval(FADE_IN);
    let _ = webview.show();
  }
}

fn create<R: Runtime>(app: &AppHandle<R>, id: &str, home: Url, bounds: Bounds, keep_live: bool) -> Result<Webview<R>, String> {
  let window = app.get_window(MAIN).ok_or("The main window is not available")?;
  let dir = data_dir(app, id)?;
  std::fs::create_dir_all(&dir).map_err(|e| format!("Could not create {}: {e}", dir.display()))?;

  let title_app = app.clone();
  let title_id = id.to_string();
  let popup_app = app.clone();
  let popup_home = home.clone();

  let builder = WebviewBuilder::new(label_of(id), WebviewUrl::External(home))
    .data_directory(dir)
    .additional_browser_args(BROWSER_ARGS)
    .background_color(BACKGROUND)
    // An app marked "keep live" runs at full speed while hidden, which is what
    // a call or a message socket needs. The rest are throttled: timers and
    // animations are slowed while off screen, but the page is not suspended,
    // so sockets stay open and messages still arrive. Honoured on macOS;
    // WebView2 has no switch for it, which is why hidden apps there are
    // trimmed through `set_memory_saving` instead.
    .background_throttling(if keep_live {
      BackgroundThrottlingPolicy::Disabled
    } else {
      BackgroundThrottlingPolicy::Throttle
    })
    .on_page_load(|webview, payload| {
      if payload.event() == PageLoadEvent::Finished {
        finish_loading(webview.app_handle(), webview.label(), None);
      }
    })
    .on_document_title_changed(move |_, title| {
      let payload = TitlePayload { id: title_id.clone(), title };
      let _ = title_app.emit_to(EventTarget::webview(MAIN), TITLE_EVENT, payload);
    })
    .on_new_window(move |url, _features| {
      // The site's own popups (sign-in flows) stay in-app; links to other
      // sites open in the default browser.
      if same_site(&popup_home, &url) {
        return NewWindowResponse::Allow;
      }
      if matches!(url.scheme(), "http" | "https") {
        if let Err(err) = popup_app.opener().open_url(url.as_str(), None::<&str>) {
          log::warn!("[portal] could not open {url} in the browser: {err}");
        }
      }
      NewWindowResponse::Deny
    });

  let r = rect(bounds);
  let webview = window.add_child(builder, r.position, r.size).map_err(|e| e.to_string())?;
  #[cfg(windows)]
  if let Err(err) = webview2::forward_shortcuts(&webview) {
    log::warn!("[portal] could not forward shortcuts: {err}");
  }
  Ok(webview)
}

/// Gives keyboard focus to the app on screen, or to the main webview when no
/// app is. Run after the window is shown.
pub fn focus_content<R: Runtime>(app: &AppHandle<R>) {
  let shown = app.state::<PortalState>().shown.lock().unwrap().clone();
  let target = shown.and_then(|label| app.get_webview(&label)).or_else(|| app.get_webview(MAIN));
  if let Some(webview) = target {
    let _ = webview.set_focus();
  }
}

/* ------------------------------------------------------------------ *
 * Commands
 * ------------------------------------------------------------------ */

/// Shows one app at the given bounds, creating its webview on first use, and
/// hides every other Portal webview. `fade` (default true) fades the page in;
/// the view turns it off when a snapshot of the page is already on screen.
#[tauri::command]
pub async fn portal_show<R: Runtime>(
  app: AppHandle<R>,
  state: tauri::State<'_, PortalState>,
  id: String,
  url: String,
  bounds: Bounds,
  fade: Option<bool>,
  keep_live: Option<bool>,
) -> Result<(), String> {
  check_id(&id)?;
  let target = label_of(&id);

  let webview = {
    let _guard = state.create.lock().unwrap();
    match app.get_webview(&target) {
      Some(existing) => {
        existing.set_bounds(rect(bounds)).map_err(|e| e.to_string())?;
        existing
      }
      None => {
        let home = parse_home(&url)?;
        start_loading(&app, &state, &target);
        // Only read here: the policy is fixed when the webview is built, so
        // changing it takes effect the next time the app is loaded.
        match create(&app, &id, home, bounds, keep_live.unwrap_or(false)) {
          Ok(created) => {
            let _ = created.hide();
            created
          }
          Err(err) => {
            state.loading.lock().unwrap().remove(&target);
            return Err(err);
          }
        }
      }
    }
  };

  // Before anything is painted, so the page has its caches back by the time
  // it is on screen.
  wake(&app, &state, &target);

  let mut shown = state.shown.lock().unwrap();
  if shown.as_deref() == Some(target.as_str()) {
    return Ok(());
  }
  for (label, other) in portal_webviews(&app) {
    if label != target {
      let _ = other.hide();
      trim_when_idle(&app, &state, &label);
    }
  }
  // A page still loading stays hidden; `finish_loading` shows it once this
  // app is recorded as the one on screen.
  if !state.loading.lock().unwrap().contains_key(&target) {
    let _ = webview.eval(if fade.unwrap_or(true) { FADE_IN } else { SHOW_NOW });
    webview.show().map_err(|e| e.to_string())?;
  }
  *shown = Some(target);
  Ok(())
}

/// Hides every Portal webview. They keep running. When an app was on screen,
/// keyboard focus moves to the main webview, which the menu or dialog opening
/// in its place needs.
#[tauri::command]
pub async fn portal_hide<R: Runtime>(app: AppHandle<R>, state: tauri::State<'_, PortalState>) -> Result<(), String> {
  let was_shown = {
    let mut shown = state.shown.lock().unwrap();
    for (_, webview) in portal_webviews(&app) {
      let _ = webview.hide();
    }
    shown.take().is_some()
  };
  // Waits out `IDLE_DELAY` first: this also runs for a menu opening over the
  // Portal, which puts the same app back on screen a moment later.
  for (label, _) in portal_webviews(&app) {
    trim_when_idle(&app, &state, &label);
  }
  if was_shown {
    if let Some(main) = app.get_webview(MAIN) {
      let _ = main.set_focus();
    }
  }
  Ok(())
}

/// A JPEG of the app on screen, taken before it is hidden for a menu or
/// dialog. Empty when no app is fully shown, when the capture fails or is
/// slow, and on platforms other than Windows.
#[tauri::command]
pub async fn portal_snapshot<R: Runtime>(app: AppHandle<R>, state: tauri::State<'_, PortalState>) -> Result<Response, String> {
  let shown = state.shown.lock().unwrap().clone();
  let Some(label) = shown.filter(|label| !state.loading.lock().unwrap().contains_key(label)) else {
    return Ok(Response::new(Vec::new()));
  };
  let Some(webview) = app.get_webview(&label) else {
    return Ok(Response::new(Vec::new()));
  };

  #[cfg(windows)]
  {
    let pending = webview2::capture(&webview)?;
    let result = tauri::async_runtime::spawn_blocking(move || pending.recv_timeout(SNAPSHOT_TIMEOUT))
      .await
      .map_err(|e| e.to_string())?;
    match result {
      Ok(Ok(bytes)) => Ok(Response::new(bytes)),
      Ok(Err(err)) => {
        log::warn!("[portal] snapshot failed: {err}");
        Ok(Response::new(Vec::new()))
      }
      Err(_) => Ok(Response::new(Vec::new())),
    }
  }
  #[cfg(not(windows))]
  {
    let _ = webview;
    Ok(Response::new(Vec::new()))
  }
}

/// Starts fading out the app on screen. The view waits for the fade before
/// showing the next app.
#[tauri::command]
pub async fn portal_fade_out<R: Runtime>(app: AppHandle<R>, state: tauri::State<'_, PortalState>) -> Result<(), String> {
  let shown = state.shown.lock().unwrap().clone();
  if let Some(webview) = shown.and_then(|label| app.get_webview(&label)) {
    webview.eval(FADE_OUT).map_err(|e| e.to_string())?;
  }
  Ok(())
}

/// `back`, `forward`, `reload`, or `home` (which needs `url`). Reload and home
/// hide the app until the page has loaded.
#[tauri::command]
pub async fn portal_nav<R: Runtime>(app: AppHandle<R>, id: String, action: String, url: Option<String>) -> Result<(), String> {
  let Some(webview) = find(&app, &id)? else { return Ok(()) };
  let result = match action.as_str() {
    "back" => webview.eval("history.back()"),
    "forward" => webview.eval("history.forward()"),
    "reload" => {
      hide_while_loading(&app, &webview);
      webview.reload()
    }
    "home" => {
      let home = parse_home(url.as_deref().ok_or("home needs a url")?)?;
      hide_while_loading(&app, &webview);
      webview.navigate(home)
    }
    other => return Err(format!("Unknown Portal action: {other}")),
  };
  if result.is_err() {
    finish_loading(&app, webview.label(), None);
  }
  result.map_err(|e| e.to_string())
}

/// Opens the page an app is on in the default browser, or its home page if it
/// has not been loaded. Done here because the webview's opener permission only
/// allows Google sign-in URLs.
#[tauri::command]
pub async fn portal_open_external<R: Runtime>(app: AppHandle<R>, id: String, url: String) -> Result<(), String> {
  let current = find(&app, &id)?.and_then(|webview| webview.url().ok());
  let target = match current {
    Some(page) if matches!(page.scheme(), "http" | "https") => page,
    _ => parse_home(&url)?,
  };
  app.opener().open_url(target.as_str(), None::<&str>).map_err(|e| e.to_string())
}

/// Signs an app out by wiping its cookies and storage, then returns it to its
/// home page. An app that is not loaded has its data folder deleted instead.
#[tauri::command]
pub async fn portal_sign_out<R: Runtime>(app: AppHandle<R>, id: String, url: String) -> Result<(), String> {
  match find(&app, &id)? {
    Some(webview) => {
      let home = parse_home(&url)?;
      webview.clear_all_browsing_data().map_err(|e| e.to_string())?;
      hide_while_loading(&app, &webview);
      webview.navigate(home).map_err(|e| {
        finish_loading(&app, webview.label(), None);
        e.to_string()
      })
    }
    None => remove_dir(&data_dir(&app, &id)?),
  }
}

/// Closes an app's webview and deletes its data. WebView2 can hold files for
/// a moment after closing, so a folder that cannot be deleted yet is left for
/// `portal_prune` to remove on a later visit.
#[tauri::command]
pub async fn portal_remove<R: Runtime>(app: AppHandle<R>, state: tauri::State<'_, PortalState>, id: String) -> Result<(), String> {
  if let Some(webview) = find(&app, &id)? {
    let _ = webview.clear_all_browsing_data();
    webview.close().map_err(|e| e.to_string())?;
    state.loading.lock().unwrap().remove(webview.label());
    state.idle.lock().unwrap().remove(webview.label());
    let mut shown = state.shown.lock().unwrap();
    if shown.as_deref() == Some(webview.label()) {
      *shown = None;
    }
  }
  if let Err(err) = remove_dir(&data_dir(&app, &id)?) {
    log::warn!("[portal] {err}");
  }
  Ok(())
}

/// Closes an app's webview without touching its data folder, so the next
/// `portal_show` builds a fresh one and the app stays signed in.
///
/// Needed for settings that WebView2 fixes when the webview is built and will
/// not change afterwards — "keep live in background" is one. Reloading the page
/// is not enough: that keeps the same webview.
#[tauri::command]
pub async fn portal_rebuild<R: Runtime>(app: AppHandle<R>, state: tauri::State<'_, PortalState>, id: String) -> Result<(), String> {
  let Some(webview) = find(&app, &id)? else { return Ok(()) };
  let label = webview.label().to_string();
  webview.close().map_err(|e| e.to_string())?;
  state.loading.lock().unwrap().remove(&label);
  state.idle.lock().unwrap().remove(&label);
  let mut shown = state.shown.lock().unwrap();
  if shown.as_deref() == Some(label.as_str()) {
    *shown = None;
  }
  Ok(())
}

/// Deletes data folders of apps that are no longer connected and not loaded.
#[tauri::command]
pub async fn portal_prune<R: Runtime>(app: AppHandle<R>, keep: Vec<String>) -> Result<(), String> {
  let base = app.path().app_config_dir().map_err(|e| e.to_string())?.join("portal");
  let Ok(entries) = std::fs::read_dir(&base) else { return Ok(()) };
  for entry in entries.flatten() {
    let name = entry.file_name().to_string_lossy().to_string();
    let stale = valid_id(&name) && !keep.contains(&name) && app.get_webview(&label_of(&name)).is_none();
    if stale && entry.path().is_dir() {
      if let Err(err) = remove_dir(&entry.path()) {
        log::warn!("[portal] {err}");
      }
    }
  }
  Ok(())
}

fn remove_dir(dir: &std::path::Path) -> Result<(), String> {
  match std::fs::remove_dir_all(dir) {
    Ok(()) => Ok(()),
    Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
    Err(err) => Err(format!("Could not delete {}: {err}", dir.display())),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn ids_are_safe_directory_names() {
    assert!(valid_id("discord"));
    assert!(valid_id("my-app-2"));
    assert!(!valid_id(""));
    assert!(!valid_id("Discord"));
    assert!(!valid_id("../escape"));
    assert!(!valid_id("a/b"));
    assert!(!valid_id("a\\b"));
    assert!(!valid_id(&"a".repeat(41)));
  }

  #[test]
  fn home_must_be_https_with_host() {
    assert!(parse_home("https://discord.com/app").is_ok());
    assert!(parse_home("http://discord.com").is_err());
    assert!(parse_home("javascript:alert(1)").is_err());
    assert!(parse_home("file:///C:/Windows").is_err());
    assert!(parse_home("discord.com").is_err());
  }

  #[test]
  fn tab_shortcuts_need_ctrl_without_alt() {
    assert_eq!(shortcut_for(0x09, true, false, false), Some("next"));
    assert_eq!(shortcut_for(0x09, true, true, false), Some("previous"));
    assert_eq!(shortcut_for(0x57, true, false, false), Some("close"));
    assert_eq!(shortcut_for(0x52, true, true, false), Some("reload"));
    assert_eq!(shortcut_for(0x52, false, false, false), None);
    assert_eq!(shortcut_for(0x09, true, false, true), None);
    assert_eq!(shortcut_for(0x41, true, false, false), None);
  }

  #[test]
  fn site_is_last_two_host_labels() {
    assert_eq!(site_of("mail.google.com"), "google.com");
    assert_eq!(site_of("discord.com"), "discord.com");
    assert_eq!(site_of("localhost"), "localhost");
    assert_eq!(site_of("a.b.c.example.org."), "example.org");
  }

  #[test]
  fn popups_on_the_same_site_stay_in_app() {
    let home = Url::parse("https://discord.com/app").unwrap();
    assert!(same_site(&home, &Url::parse("https://ptb.discord.com/login").unwrap()));
    assert!(same_site(&home, &Url::parse("https://DISCORD.com/x").unwrap()));
    assert!(!same_site(&home, &Url::parse("https://discord.gg/abc").unwrap()));
    assert!(!same_site(&home, &Url::parse("https://evil-discord.com").unwrap()));
    assert!(!same_site(&home, &Url::parse("about:blank").unwrap()));
  }
}
