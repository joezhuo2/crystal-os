//! WebView2-only parts of the Portal: page snapshots and shortcut forwarding.

use std::sync::mpsc::{self, Receiver, Sender};

use tauri::{Emitter, EventTarget, Manager, Runtime, Webview};
use webview2_com::Microsoft::Web::WebView2::Win32::{
  ICoreWebView2Controller, ICoreWebView2_19, COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_JPEG, COREWEBVIEW2_KEY_EVENT_KIND,
  COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW,
  COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL, COREWEBVIEW2_PHYSICAL_KEY_STATUS,
};
use webview2_com::{AcceleratorKeyPressedEventHandler, CapturePreviewCompletedHandler};
use windows::core::Interface;
use windows::Win32::Foundation::HGLOBAL;
use windows::Win32::System::Com::StructuredStorage::CreateStreamOnHGlobal;
use windows::Win32::System::Com::{IStream, STREAM_SEEK_SET};
use windows::Win32::UI::Input::KeyboardAndMouse::{GetKeyState, VIRTUAL_KEY, VK_CONTROL, VK_MENU, VK_SHIFT};

use super::{shortcut_for, MAIN, SHORTCUT_EVENT};

pub type Snapshot = Result<Vec<u8>, String>;

/// Starts a JPEG capture of what the webview is showing. The receiver gets
/// the image, or an error, once WebView2 has encoded it.
pub fn capture<R: Runtime>(webview: &Webview<R>) -> Result<Receiver<Snapshot>, String> {
  let (tx, rx) = mpsc::channel();
  webview
    .with_webview(move |platform| {
      let failed = tx.clone();
      if let Err(err) = unsafe { start_capture(&platform.controller(), tx) } {
        let _ = failed.send(Err(err.message()));
      }
    })
    .map_err(|e| e.to_string())?;
  Ok(rx)
}

unsafe fn start_capture(controller: &ICoreWebView2Controller, tx: Sender<Snapshot>) -> windows::core::Result<()> {
  let core = controller.CoreWebView2()?;
  let stream = CreateStreamOnHGlobal(HGLOBAL::default(), true)?;
  let output = stream.clone();
  let handler = CapturePreviewCompletedHandler::create(Box::new(move |result| {
    let _ = tx.send(result.and_then(|()| read_stream(&output)).map_err(|e| e.message()));
    Ok(())
  }));
  core.CapturePreview(COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_JPEG, &stream, &handler)
}

unsafe fn read_stream(stream: &IStream) -> windows::core::Result<Vec<u8>> {
  stream.Seek(0, STREAM_SEEK_SET, None)?;
  let mut bytes = Vec::new();
  let mut chunk = [0u8; 64 * 1024];
  loop {
    let mut read = 0u32;
    stream.Read(chunk.as_mut_ptr().cast(), chunk.len() as u32, Some(&mut read)).ok()?;
    if read == 0 {
      return Ok(bytes);
    }
    bytes.extend_from_slice(&chunk[..read as usize]);
  }
}

/// Asks WebView2 to trim what an off-screen page holds in memory: renderer
/// caches, decoded images and GPU tiles. Sockets, timers and scripts keep
/// running, so a message app still receives messages and its unread count
/// stays current; only the caches go. The page is put back to `Normal` before
/// it is shown again, and rebuilds them as it paints.
///
/// Needs WebView2 runtime 114 or newer (`ICoreWebView2_19`). On older runtimes
/// the cast fails and the page simply stays at its normal level.
pub fn set_memory_saving<R: Runtime>(webview: &Webview<R>, saving: bool) -> Result<(), String> {
  let level = if saving {
    COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW
  } else {
    COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL
  };
  webview
    .with_webview(move |platform| unsafe {
      let Ok(core) = platform.controller().CoreWebView2() else { return };
      let Ok(core) = core.cast::<ICoreWebView2_19>() else { return };
      if let Err(err) = core.SetMemoryUsageTargetLevel(level) {
        log::warn!("[portal] could not set the memory level: {err}");
      }
    })
    .map_err(|e| e.to_string())
}

fn held(key: VIRTUAL_KEY) -> bool {
  unsafe { GetKeyState(i32::from(key.0)) < 0 }
}

/// Keys pressed inside an app page never reach the main webview, so the
/// Portal's tab shortcuts are caught here, before the page sees them, and sent
/// to the view.
pub fn forward_shortcuts<R: Runtime>(webview: &Webview<R>) -> Result<(), String> {
  let app = webview.app_handle().clone();
  webview
    .with_webview(move |platform| unsafe {
      let handler = AcceleratorKeyPressedEventHandler::create(Box::new(move |_, args| {
        let Some(args) = args else { return Ok(()) };
        let mut kind = COREWEBVIEW2_KEY_EVENT_KIND::default();
        args.KeyEventKind(&mut kind)?;
        if kind != COREWEBVIEW2_KEY_EVENT_KIND_KEY_DOWN {
          return Ok(());
        }
        let mut key = 0u32;
        args.VirtualKey(&mut key)?;
        let Some(shortcut) = shortcut_for(key, held(VK_CONTROL), held(VK_SHIFT), held(VK_MENU)) else {
          return Ok(());
        };
        // Handled even when repeating, so the page never acts on it (Ctrl+R
        // would reload the page without the loading skeleton).
        args.SetHandled(true)?;
        let mut status = COREWEBVIEW2_PHYSICAL_KEY_STATUS::default();
        args.PhysicalKeyStatus(&mut status)?;
        if !status.WasKeyDown.as_bool() {
          let _ = app.emit_to(EventTarget::webview(MAIN), SHORTCUT_EVENT, shortcut);
        }
        Ok(())
      }));
      let mut token = 0i64;
      if let Err(err) = platform.controller().add_AcceleratorKeyPressed(&handler, &mut token) {
        log::warn!("[portal] could not forward shortcuts: {err}");
      }
    })
    .map_err(|e| e.to_string())
}
