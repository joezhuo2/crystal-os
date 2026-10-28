import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Bell, Bug, ChevronDown, ClipboardCopy, CloudSun, Download, EyeOff, FolderOpen, Gauge, ImagePlus, Images, Keyboard, ListTodo, Orbit, PanelLeft, Power, Search, Settings, Sparkles, Trash2, X } from "lucide-react";
import { orbitStore, useOrbitStore } from "@/lib/orbitStore";
import NebulaSettingsSection from "@/components/nebula/NebulaSettingsSection";
import InstallerSection from "@/components/views/InstallerSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import HotkeySettingsDialog from "@/components/HotkeySettingsDialog";
import { useGlobalHotkeys } from "@/hooks/useGlobalHotkey";
import { usePickVault, useVaultStatus } from "@/hooks/useVault";
import { HOTKEY_COPY, formatAccelerator, paletteShortcutLabel, type HotkeyAction } from "@/lib/hotkey";
import { KEYMAP, KEYMAP_CATEGORY_LABELS, bindingFor, bindingFromEvent, formatBinding, setBinding, useKeymapOverrides, type KeymapCategory } from "@/lib/keymap";
import { findConflict } from "@/lib/keymapConflicts";
import { isDesktop } from "@/lib/platform";
import { MAX_CACHE_MINUTES, MAX_UNLOAD_DELAY, perfSettings, usePerfSettings } from "@/lib/perfSettings";
import { privacySettings, usePrivacyMode } from "@/lib/privacySettings";
import { changelogSettings, useShowChangelog } from "@/lib/changelogSettings";
import { atmosphere, useAtmosphere } from "@/lib/atmosphereStore";
import { IMAGE_TYPES } from "@/lib/atmosphereImage";
import { BACKDROP_IMAGES, backdropSettings, useBackdropSettings, type BackdropImage } from "@/lib/backdropSettings";
import { buildDiagnosticsReport } from "@/lib/diagnostics";
import { MAX_EVENT_LEAD, notifySettings, useNotifySettings } from "@/lib/notifySettings";
import { notify } from "@/lib/notifications";
import { capacitySettings, useCapacitySettings } from "@/lib/capacitySettings";
import { TimeField } from "@/components/ui/field-controls";
import { appUi, useAppUi } from "@/lib/appUi";
import { TAB_INFO, tabAvailable } from "@/components/layout/Navigation";
import { ALWAYS_SHOWN, navSettings, useNavSettings } from "@/lib/navSettings";

const COLLAPSED_KEY = "crystal-os-settings-collapsed";

/** Section ids the user has collapsed. Storage may be unavailable; then nothing is remembered. */
function readCollapsed(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    const ids: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

function writeCollapsed(id: string, collapsed: boolean) {
  try {
    const ids = readCollapsed();
    if (collapsed) ids.add(id);
    else ids.delete(id);
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...ids]));
  } catch {
    // Not remembered; the section still toggles.
  }
}

/** Matches the grid-row transition on .settings-collapse (index.css). */
const COLLAPSE_MS = 360;
/** How long a section jumped to from the command palette stays highlighted. */
const FLASH_MS = 1600;

/**
 * A Settings panel whose header folds it open and closed. The body eases
 * between heights in CSS; `settled` lifts its clip once fully open so focus
 * rings and shadows at the edges show. Collapsed sections are remembered on
 * this device.
 */
/**
 * The Settings search box's text, lowercased and trimmed, plus a way for each
 * section to say whether it matched, so the page can say when nothing did.
 */
const SearchContext = createContext<{ query: string; report: (id: string, match: boolean) => void }>({
  query: "",
  report: () => {},
});

/** Whether `query` appears in any of `texts`; an empty query matches everything. */
function matchesQuery(query: string, ...texts: (string | null | undefined)[]): boolean {
  if (!query) return true;
  return texts.some((t) => t?.toLowerCase().includes(query));
}

function Section({ id, icon: Icon, title, children }: { id: string; icon: React.ElementType; title: string; children: React.ReactNode }) {
  const { query, report } = useContext(SearchContext);
  const [open, setOpen] = useState(() => !readCollapsed().has(id));
  const sectionRef = useRef<HTMLElement>(null);
  const [match, setMatch] = useState(true);
  // While searching, a section opens because it matched, not because the user
  // opened it: that is not saved, and a click toggles it for this search only.
  const [override, setOverride] = useState<boolean | null>(null);
  const searching = query.length > 0;
  const shown = searching ? (override ?? match) : open;
  const [settled, setSettled] = useState(shown);
  const bodyId = useId();

  // Bodies stay mounted while collapsed, so their text can be searched too.
  useLayoutEffect(() => {
    const next = matchesQuery(query, title, sectionRef.current?.textContent);
    setMatch(next);
    setOverride(null);
    report(id, next);
  }, [query, title, id, report]);

  useEffect(() => {
    if (!shown) {
      setSettled(false);
      return;
    }
    const timer = window.setTimeout(() => setSettled(true), COLLAPSE_MS);
    return () => window.clearTimeout(timer);
  }, [shown]);

  // The command palette's "jump to section": unfold it (saved, like a click),
  // scroll to it and flash it. Waits for the page to clear its search first,
  // since a filtered-out section is hidden and cannot be scrolled to.
  const jumpTarget = useAppUi((s) => s.settingsSection);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (jumpTarget !== id || searching) return;
    appUi.setSettingsSection(null);
    writeCollapsed(id, false);
    setOpen(true);
    setFlash(true);
  }, [jumpTarget, searching, id]);

  // Apart from the jump, which re-runs as soon as it clears the request.
  useEffect(() => {
    if (!flash) return;
    const frame = requestAnimationFrame(() => sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    const timer = window.setTimeout(() => setFlash(false), FLASH_MS);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [flash]);

  const toggle = () => {
    if (searching) return setOverride(!shown);
    writeCollapsed(id, open);
    setOpen(!open);
  };

  return (
    <section ref={sectionRef} hidden={searching && !match} data-settings-section={id} data-flash={flash || undefined} className="glass-card p-6 scroll-mt-4">
      <h3>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={shown}
          aria-controls={bodyId}
          className="group flex w-full items-center gap-2 rounded-md text-left text-sm font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Icon className="w-4 h-4 text-primary" />
          {title}
          <ChevronDown
            aria-hidden="true"
            className={`ml-auto h-4 w-4 transition-transform duration-300 ease-out ${shown ? "" : "-rotate-90"}`}
          />
        </button>
      </h3>
      <div
        id={bodyId}
        data-smooth=""
        data-open={shown || undefined}
        data-settled={(shown && settled) || undefined}
        className="settings-collapse"
      >
        <div>
          <div className="divide-y divide-white/[0.06] pt-4">{children}</div>
        </div>
      </div>
    </section>
  );
}

function CopyDiagnosticsButton() {
  const [busy, setBusy] = useState(false);

  const copy = async () => {
    setBusy(true);
    try {
      await navigator.clipboard.writeText(await buildDiagnosticsReport());
      toast.success("Diagnostics copied");
    } catch (err) {
      toast.error("Could not copy diagnostics", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={copy} disabled={busy}>
      <ClipboardCopy className="w-4 h-4" />
      Copy diagnostics
    </Button>
  );
}

function Row({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  const { query } = useContext(SearchContext);
  // Inside a matching section, rows that don't match fade back so the hit stands out.
  const dim = !matchesQuery(query, title, description);
  return (
    <div
      data-search-dim={dim || undefined}
      className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0 transition-opacity ${dim ? "opacity-40" : ""}`}
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{description}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">{children}</div>
    </div>
  );
}

/** Settings → Navigation: each page's place, group and visibility in the sidebar. */
function NavigationSettings() {
  const nav = useNavSettings();
  const groups = [
    { bottom: false, label: "Top of the sidebar" },
    { bottom: true, label: "Pinned to the bottom" },
  ];
  return (
    <>
      {groups.map(({ bottom, label }) => {
        const ids = nav.order.filter((id) => tabAvailable(id) && nav.bottom.includes(id) === bottom);
        return (
          <div key={label} className="py-3 first:pt-0">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
            {ids.length === 0 && <p className="text-xs text-muted-foreground py-2">No pages here.</p>}
            {ids.map((id, i) => {
              const tab = TAB_INFO[id];
              const hidden = nav.hidden.includes(id);
              return (
                <Row
                  key={id}
                  title={tab.label}
                  description={id === ALWAYS_SHOWN ? "Always shown, so this page stays reachable." : hidden ? "Hidden from the sidebar." : "Shown in the sidebar."}
                >
                  <Button variant="ghost" size="icon" className="h-8 w-8" disabled={i === 0} onClick={() => navSettings.move(id, -1)} aria-label={`Move ${tab.label} up`}>
                    <ArrowUp className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" disabled={i === ids.length - 1} onClick={() => navSettings.move(id, 1)} aria-label={`Move ${tab.label} down`}>
                    <ArrowDown className="w-4 h-4" />
                  </Button>
                  <Select value={bottom ? "bottom" : "top"} onValueChange={(v) => navSettings.setBottom(id, v === "bottom")}>
                    <SelectTrigger className="h-8 w-[6.5rem] text-xs" aria-label={`${tab.label} position`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="top" className="text-xs">Top</SelectItem>
                      <SelectItem value="bottom" className="text-xs">Bottom</SelectItem>
                    </SelectContent>
                  </Select>
                  <Switch
                    checked={!hidden}
                    disabled={id === ALWAYS_SHOWN}
                    onCheckedChange={(on) => navSettings.setHidden(id, !on)}
                    aria-label={`Show ${tab.label}`}
                  />
                </Row>
              );
            })}
          </div>
        );
      })}
      <Row title="Reset navigation" description="Back to the default order, with every page shown.">
        <Button variant="outline" size="sm" onClick={navSettings.reset}>
          Reset
        </Button>
      </Row>
    </>
  );
}

function Combo({ children, error }: { children: React.ReactNode; error?: boolean }) {
  return (
    <kbd
      className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium ${
        error ? "border-red-500/30 bg-red-500/10 text-red-400" : "border-white/10 bg-white/5 text-muted-foreground"
      }`}
    >
      {children}
    </kbd>
  );
}

/**
 * Picks, previews and removes a background image. The file is checked and
 * stored by `onChoose`; failures show as a toast and keep the current
 * background. Removing the user's image goes back to the default.
 */
function ImagePicker({
  imageUrl,
  custom,
  onChoose,
  onClear,
}: {
  imageUrl: string | null;
  custom: boolean;
  onChoose: (file: File) => Promise<void>;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      await onChoose(file);
    } catch (err) {
      toast.error("Could not use that image", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-2">
      {imageUrl && (
        <span
          aria-hidden="true"
          className="h-8 w-14 rounded-md border border-white/10 bg-cover bg-center"
          style={{ backgroundImage: `url("${imageUrl}")` }}
        />
      )}
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_TYPES.join(",")}
        className="hidden"
        onChange={(e) => choose(e.target.files?.[0])}
      />
      <Button variant="outline" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
        <ImagePlus className="w-4 h-4 mr-1.5" />
        {busy ? "Saving…" : custom ? "Change" : "Choose image"}
      </Button>
      {custom && (
        <Button variant="ghost" size="sm" disabled={busy} onClick={onClear} aria-label="Remove background image and use the default">
          <Trash2 className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}

/**
 * A 0–100% amount, such as how much a background image is blurred. Moves
 * freely while dragging and commits once on release, since each blur is a
 * canvas pass over the whole image.
 */
function PercentSlider({ value, label, onCommit }: { value: number; label: string; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? value;
  return (
    <div className="flex items-center gap-3">
      <Slider
        className="w-40"
        min={0}
        max={100}
        step={1}
        value={[shown]}
        onValueChange={([v]) => setDraft(v)}
        onValueCommit={([v]) => {
          onCommit(v);
          setDraft(null);
        }}
        aria-label={label}
      />
      <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{shown}%</span>
    </div>
  );
}

const BACKDROP_LABELS: Record<BackdropImage, string> = {
  home: "The Pulse (Home)",
  settings: "Settings",
  horizon: "The Horizon",
  engine: "The Engine",
  orbit: "The Orbit",
  portal: "The Portal",
  archive: "The Archive (Home box)",
};

/** Picks a page, then its background image, blurs and opacity. */
function BackgroundsSettings() {
  const all = useBackdropSettings();
  const [page, setPage] = useState<BackdropImage>("horizon");
  const c = all[page];
  return (
    <>
      <Row title="Page" description="The page whose background the settings below change.">
        <Select value={page} onValueChange={(v) => setPage(v as BackdropImage)}>
          <SelectTrigger className="h-8 w-52" aria-label="Page to change the background of">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BACKDROP_IMAGES.map((i) => (
              <SelectItem key={i} value={i}>
                {BACKDROP_LABELS[i]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Row>
      <Row
        title="Background image"
        description="Shown behind the page and its box on the Home tab. Choose a PNG or JPEG of your own (stored on this device only), or remove yours to go back to the default."
      >
        <ImagePicker
          imageUrl={c.customUrl}
          custom={!!c.customUrl}
          onChoose={(file) => backdropSettings.setImage(page, file)}
          onClear={() => backdropSettings.clearImage(page)}
        />
      </Row>
      {page !== "archive" && (
        <Row title="Page blur" description="How much the image is blurred behind the page, from sharp (0%) to heavily frosted (100%).">
          <PercentSlider key={`${page}-page`} value={c.pageBlur} label="Page blur" onCommit={(v) => backdropSettings.setAmount(page, "pageBlur", v)} />
        </Row>
      )}
      <Row title="Home box blur" description="How much the image is blurred behind the page's box on the Home tab.">
        <PercentSlider key={`${page}-card`} value={c.cardBlur} label="Home box blur" onCommit={(v) => backdropSettings.setAmount(page, "cardBlur", v)} />
      </Row>
      <Row title="Image opacity" description="How strongly the image shows, behind both the page and its Home box. Lower lets the page's own colour through.">
        <PercentSlider key={`${page}-opacity`} value={c.opacity} label="Image opacity" onCommit={(v) => backdropSettings.setAmount(page, "opacity", v)} />
      </Row>
      <Row title="Reset" description="Puts this page's blurs and opacity back to their defaults. Keeps your image.">
        <Button variant="outline" size="sm" onClick={() => backdropSettings.resetAmounts(page)}>
          Reset
        </Button>
      </Row>
    </>
  );
}

/**
 * A whole number typed freely and saved (clamped by the store) on blur or
 * Enter, so a half-typed number is not cut short.
 */
function NumberInput({
  value,
  min,
  max,
  unit,
  label,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  unit: string;
  label: string;
  onCommit: (draft: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null) onCommit(draft);
    setDraft(null);
  };
  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={draft ?? String(value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setDraft(null);
        }}
        className="h-8 w-24 text-right"
        aria-label={label}
      />
      <span className="text-xs text-muted-foreground">{unit}</span>
    </div>
  );
}

function EventLeadInput({
  value,
  disabled,
  onCommit = notifySettings.setEventLead,
  label = "Minutes before an event to remind",
}: {
  value: number;
  disabled: boolean;
  onCommit?: (value: string) => void;
  label?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null) onCommit(draft);
    setDraft(null);
  };
  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        max={MAX_EVENT_LEAD}
        step={1}
        disabled={disabled}
        value={draft ?? String(value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setDraft(null);
        }}
        className="h-8 w-24 text-right"
        aria-label={label}
      />
      <span className="text-xs text-muted-foreground">minutes</span>
    </div>
  );
}

function TestNotificationButton() {
  const [sending, setSending] = useState(false);
  const send = () => {
    setSending(true);
    notify({ title: "Crystal OS", body: "Notifications are working." }, true)
      .then((shown) => {
        if (!shown) toast.error("Notifications are blocked. Allow them for Crystal OS in your system settings.");
      })
      .finally(() => setSending(false));
  };
  return (
    <Button variant="outline" size="sm" disabled={sending} onClick={send}>
      Send test
    </Button>
  );
}

function KeymapSettings() {
  const overrides = useKeymapOverrides();
  const [recording, setRecording] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      if (e.code === "Escape") return setRecording(null);
      const binding = bindingFromEvent(e);
      if (!binding) return;
      setBinding(recording, binding);
      setRecording(null);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recording]);

  const groups = (Object.keys(KEYMAP_CATEGORY_LABELS) as KeymapCategory[])
    .map((category) => ({ category, actions: KEYMAP.filter((a) => a.category === category) }))
    .filter((g) => g.actions.length > 0);

  if (groups.length === 0) return <p className="text-sm text-muted-foreground">No in-app shortcuts yet.</p>;

  return (
    <>
      {groups.map(({ category, actions }) => (
        <div key={category} className="space-y-3 pt-3 first:pt-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{KEYMAP_CATEGORY_LABELS[category]}</p>
          {actions.map((action) => {
            const binding = bindingFor(action.id) ?? action.defaultKey;
            const clash = findConflict(KEYMAP, action, binding, bindingFor);
            const overridden = action.id in overrides;
            return (
              <Row key={action.id} title={action.title} description={clash ? `Also used by “${clash.title}”.` : ""}>
                <Button variant="outline" size="sm" onClick={() => setRecording(recording === action.id ? null : action.id)}>
                  {recording === action.id ? "Press a key… (Esc to cancel)" : formatBinding(binding)}
                </Button>
                {overridden && (
                  <Button variant="ghost" size="sm" onClick={() => setBinding(action.id, null)}>
                    Reset
                  </Button>
                )}
              </Row>
            );
          })}
        </div>
      ))}
      {Object.keys(overrides).length > 0 && (
        <div className="pt-3">
          <Button variant="outline" size="sm" onClick={() => Object.keys(overrides).forEach((id) => setBinding(id, null))}>
            Reset all
          </Button>
        </div>
      )}
    </>
  );
}

export default function SettingsPage() {
  const desktop = isDesktop();
  const hotkeys = useGlobalHotkeys();
  const [editing, setEditing] = useState<HotkeyAction>("toggle");
  const [dialogOpen, setDialogOpen] = useState(false);
  const perf = usePerfSettings();
  const privacyMode = usePrivacyMode();
  const showChangelog = useShowChangelog();
  const sky = useAtmosphere();
  const orbit = useOrbitStore();
  const notifications = useNotifySettings();
  const capacity = useCapacitySettings();

  const vaultStatus = useVaultStatus();
  const pickVault = usePickVault();
  const chooseVault = () =>
    pickVault.mutate(undefined, {
      onSuccess: (status) => {
        if (status) toast.success("Vault connected", { description: status.path ?? undefined });
      },
      onError: (err) => toast.error("Could not use that folder", { description: err.message }),
    });

  const editHotkey = (action: HotkeyAction) => {
    setEditing(action);
    setDialogOpen(true);
  };

  const vaultPath = vaultStatus.data?.path ?? null;
  const vaultError = vaultStatus.data?.error;

  // ── Search ──
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const [sectionMatches, setSectionMatches] = useState<Record<string, boolean>>({});
  const report = useCallback((id: string, match: boolean) => {
    setSectionMatches((m) => (m[id] === match ? m : { ...m, [id]: match }));
  }, []);
  const searchContext = useMemo(() => ({ query, report }), [query, report]);
  const noMatches = query.length > 0 && !Object.values(sectionMatches).some(Boolean);
  const searchRef = useRef<HTMLInputElement>(null);

  // Ctrl/Cmd+F finds a setting, since the webview has no find bar of its own.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A palette jump to a section needs every section visible.
  const jumpTarget = useAppUi((s) => s.settingsSection);
  useEffect(() => {
    if (jumpTarget) setSearch("");
  }, [jumpTarget]);

  const jumpToFirstMatch = () => {
    document
      .querySelector<HTMLElement>("[data-settings-section]:not([hidden])")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <SearchContext.Provider value={searchContext}>
      <div className="max-w-3xl space-y-4">
        <header className="flex items-center gap-3 px-1">
          <Settings className="w-6 h-6 text-primary" />
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
            <p className="text-sm text-muted-foreground">
              {desktop
                ? "Hotkeys, startup, your vault folder, The Nebula, and installing updates."
                : "Global hotkeys, launch at login, the vault folder, and updates are handled in the desktop app."}
            </p>
          </div>
        </header>

        <div className="glass-card flex items-center gap-2 px-3 py-2">
          <Search className="w-4 h-4 text-muted-foreground/60 shrink-0" />
          <input
            ref={searchRef}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") jumpToFirstMatch();
              if (e.key === "Escape" && search) {
                e.stopPropagation();
                setSearch("");
              }
            }}
            placeholder="Search settings…"
            aria-label="Search settings"
            className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {noMatches && (
          <p className="text-sm text-muted-foreground px-1 py-6 text-center">
            No settings match “{search.trim()}”.
          </p>
        )}

        <Section id="shortcuts" icon={Keyboard} title="Keyboard shortcuts">
          {(["toggle", "palette", "home", "dnd"] as const).map((action) => {
            const status = hotkeys.statuses?.[action];
            if (!status) return null;
            return (
              <Row key={action} title={HOTKEY_COPY[action].title} description={HOTKEY_COPY[action].description}>
                <Combo error={Boolean(status.error)}>
                  {status.error ? "not registered" : formatAccelerator(status.accelerator)}
                </Combo>
                <Button variant="outline" size="sm" onClick={() => editHotkey(action)}>
                  Change
                </Button>
              </Row>
            );
          })}
          <Row title="Open search bar" description="Opens or closes the search bar over any page while Crystal OS is focused.">
            <Combo>{paletteShortcutLabel()}</Combo>
          </Row>
        </Section>

        <Section id="keymap" icon={Keyboard} title="In-app shortcuts">
          <KeymapSettings />
        </Section>

        <Section id="navbar" icon={PanelLeft} title="Navigation">
          <NavigationSettings />
        </Section>

        {hotkeys.launchAtLogin !== null && (
          <Section id="startup" icon={Power} title="Startup">
            <Row
              title="Launch at login"
              description="Starts hidden in the tray so the hotkeys work right after you sign in. Closing the window keeps Crystal OS in the tray; use Quit in the tray to exit."
            >
              <Switch checked={hotkeys.launchAtLogin} onCheckedChange={hotkeys.setLaunchAtLogin} />
            </Row>
          </Section>
        )}

        {desktop && (
          <Section id="vault" icon={FolderOpen} title="Vault">
            <Row
              title="Obsidian vault folder"
              description={vaultError && vaultPath ? `Unavailable: ${vaultPath}` : vaultPath ?? "No folder chosen yet."}
            >
              <Button variant="outline" size="sm" disabled={pickVault.isPending} onClick={chooseVault}>
                {vaultPath ? "Change folder" : "Choose folder"}
              </Button>
            </Row>
          </Section>
        )}

        {desktop && (
          <Section id="nebula" icon={Sparkles} title="The Nebula">
            <div className="py-3 first:pt-0 last:pb-0">
              <NebulaSettingsSection />
            </div>
          </Section>
        )}

        <Section id="engine" icon={ListTodo} title="The Engine">
          <Row
            title="Work day starts"
            description="Free time for the Fits today? bar counts from here, or from now once the day has started."
          >
            <TimeField
              value={capacity.dayStart}
              aria-label="Work day starts"
              onChange={(v) => {
                if (!capacitySettings.setTime("dayStart", v)) toast.error("The work day has to start before it ends.");
              }}
              className="w-32 px-2"
            />
          </Row>
          <Row
            title="Work day ends"
            description="Free time stops here. Timed events in the Google calendar picked in The Horizon are taken out of it."
          >
            <TimeField
              value={capacity.dayEnd}
              aria-label="Work day ends"
              onChange={(v) => {
                if (!capacitySettings.setTime("dayEnd", v)) toast.error("The work day has to end after it starts.");
              }}
              className="w-32 px-2"
            />
          </Row>
        </Section>

        <Section id="notifications" icon={Bell} title="Notifications">
          <Row title="Notification sounds" description="Play a chime when a notification arrives.">
            <Switch checked={notifications.sounds} onCheckedChange={(on) => notifySettings.setFlag("sounds", on)} />
          </Row>
          {Object.entries({ task: "Task due", remind: "Task reminders", event: "Calendar and Pulse", habit: "Habit reminders", pomodoro: "Focus timer", portal: "Portal messages", review: "Reviews", other: "Other notifications" }).map(([kind, label]) => (
            <Row key={kind} title={label + " sound"} description="Enable sound for this notification category.">
              <Switch disabled={!notifications.sounds} checked={notifications.soundKinds[kind] !== false} onCheckedChange={(on) => notifySettings.setSoundKind(kind, on)} />
            </Row>
          ))}
          <Row
            title="Do Not Disturb"
            description="Silences every notification below while it is on, without changing their switches."
          >
            <Switch checked={notifications.doNotDisturb} onCheckedChange={(on) => notifySettings.setFlag("doNotDisturb", on)} />
          </Row>
          <Row
            title="Scheduled Do Not Disturb"
            description="Also silences every notification each day between these times, such as 10 PM to 7 AM. Reminders held meanwhile show once it ends."
          >
            <Switch checked={notifications.dndSchedule} onCheckedChange={(on) => notifySettings.setFlag("dndSchedule", on)} />
          </Row>
          {notifications.dndSchedule && (
            <>
              <Row title="Quiet from" description="When the scheduled Do Not Disturb starts.">
                <TimeField value={notifications.dndFrom} aria-label="Quiet from" onChange={(v) => notifySettings.setDndTime("dndFrom", v)} className="w-32 px-2" />
              </Row>
              <Row title="Quiet until" description="When it ends. Earlier than the start runs past midnight.">
                <TimeField value={notifications.dndTo} aria-label="Quiet until" onChange={(v) => notifySettings.setDndTime("dndTo", v)} className="w-32 px-2" />
              </Row>
            </>
          )}
          <Row
            title="What's new after updates"
            description="Opens the changelog for the new version the first time you launch after an update. Off by default."
          >
            <Switch checked={showChangelog} onCheckedChange={changelogSettings.setEnabled} />
          </Row>
          <Row title="Task due times" description="When an open task reaches its end time, including each repeat.">
            <Switch checked={notifications.tasks} onCheckedChange={(on) => notifySettings.setFlag("tasks", on)} />
          </Row>
          <Row title="Task reminders" description="A heads-up before an open task is due, ahead of its due-time notification. Held while Do Not Disturb is on and shown once it is off, if the task is still due.">
            <Switch checked={notifications.taskReminders} onCheckedChange={(on) => notifySettings.setFlag("taskReminders", on)} />
          </Row>
          <Row
            title="Remind tasks"
            description="From the start of the day a task is due (untimed tasks too), or a set number of minutes before its end time."
          >
            <Select
              value={notifications.taskReminderWhen}
              onValueChange={(v) => notifySettings.setTaskReminderWhen(v as "dayStart" | "before")}
              disabled={!notifications.taskReminders}
            >
              <SelectTrigger className="h-8 w-44" aria-label="When to remind about tasks">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dayStart">At the start of the day</SelectItem>
                <SelectItem value="before">Minutes before</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          {notifications.taskReminderWhen === "before" && (
            <Row title="Remind before tasks" description={`How many minutes before a task's end time. 1 to ${MAX_EVENT_LEAD} (a day).`}>
              <EventLeadInput
                value={notifications.taskLead}
                disabled={!notifications.taskReminders}
                onCommit={notifySettings.setTaskLead}
                label="Minutes before a task to remind"
              />
            </Row>
          )}
          <Row
            title="Show task reminders"
            description="Once per task and day, or again each time Crystal OS launches while the reminder still applies."
          >
            <Select
              value={notifications.taskReminderRepeat}
              onValueChange={(v) => notifySettings.setTaskReminderRepeat(v as "once" | "everyLaunch")}
              disabled={!notifications.taskReminders}
            >
              <SelectTrigger className="h-8 w-44" aria-label="How often task reminders show">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="once">On one launch</SelectItem>
                <SelectItem value="everyLaunch">On every launch</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          <Row
            title="Calendar reminders"
            description="Before each timed event in the Google calendar picked in The Horizon. All-day events get no reminder."
          >
            <Switch checked={notifications.calendar} onCheckedChange={(on) => notifySettings.setFlag("calendar", on)} />
          </Row>
          <Row
            title="Pulse reminders"
            description="For an event with a location, remind 10 minutes before it is time to leave, with the leave-by time and drive, worked out from your current location (OpenStreetMap). When the drive cannot be timed, the default below is used."
          >
            <Switch
              checked={notifications.pulse}
              disabled={!notifications.calendar}
              onCheckedChange={(on) => notifySettings.setFlag("pulse", on)}
            />
          </Row>
          <Row
            title="Remind before events"
            description={`Default minutes before an event its reminder shows. 0 reminds as it starts. Up to ${MAX_EVENT_LEAD} (a day).`}
          >
            <EventLeadInput value={notifications.eventLead} disabled={!notifications.calendar} />
          </Row>
          <Row title="Pomodoro" description="When a focus session or a break runs out.">
            <Switch checked={notifications.pomodoro} onCheckedChange={(on) => notifySettings.setFlag("pomodoro", on)} />
          </Row>
          <Row
            title="Portal messages"
            description="When a Portal app's unread count goes up while Crystal OS is not focused. Turn it off for one app by right-clicking its tab. Only apps that are loaded can report."
          >
            <Switch checked={notifications.portal} onCheckedChange={(on) => notifySettings.setFlag("portal", on)} />
          </Row>
          <Row
            title="Orbit reviews"
            description="When a weekly, monthly or yearly review is ready (6 PM on its last day), or the next time the app opens if you have not opened it yet. Once per review, with an Open button; reviews ready together share one toast."
          >
            <Switch checked={notifications.reviews} onCheckedChange={(on) => notifySettings.setFlag("reviews", on)} />
          </Row>
          <Row
            title="Habit reminders"
            description="When a habit is not ticked by the reminder time set on it (the bell in The Orbit's habit manager), up to its count a day, an hour apart."
          >
            <Switch checked={notifications.habitReminders} onCheckedChange={(on) => notifySettings.setFlag("habitReminders", on)} />
          </Row>
          <Row
            title="Remind habits on every startup"
            description="Also each time Crystal OS launches, for every habit past its reminder time and not ticked yet, even after its count for the day."
          >
            <Switch
              checked={notifications.habitReminderStartup}
              disabled={!notifications.habitReminders}
              onCheckedChange={(on) => notifySettings.setFlag("habitReminderStartup", on)}
            />
          </Row>
          <Row title="Test" description="Shows a notification now, even with Do Not Disturb on. The first one asks for permission.">
            <TestNotificationButton />
          </Row>
        </Section>

        <Section id="orbit" icon={Orbit} title="The Orbit">
          <Row
            title="Auto-export reviews"
            description="Writes each weekly, monthly and yearly review to Reviews/Weekly, Reviews/Monthly and Reviews/Yearly in your vault once it is ready (Sunday, the month's last day and December 31, from 6 PM), or the next time the app opens. Never overwrites a note that is already there, and leaves out the reflection, which you can add by exporting again from The Orbit."
          >
            <Switch checked={orbit.autoExport} onCheckedChange={orbitStore.setAutoExport} />
          </Row>
        </Section>

        <Section id="atmosphere" icon={CloudSun} title="The Atmosphere">
          <Row
            title="Weather effects"
            description="Clouds, rain, snow, fog and lightning over the Living Sky, following the current conditions."
          >
            <Switch checked={sky.weatherEffects} onCheckedChange={atmosphere.setWeatherEffects} />
          </Row>
          <Row
            title="Aurora"
            description="Northern lights over a pine treeline, bending toward your cursor. Brightest at night, faint by day. Works with weather effects: clouds and rain pass in front of it."
          >
            <Switch checked={sky.aurora} onCheckedChange={atmosphere.setAurora} />
          </Row>
          <Row
            title="Update location on launch"
            description="Once at the start of every launch, picks the nearest Environment Canada location to where you are. Your position is read once, not stored or sent anywhere. Needs Windows location services; if it cannot be found, your chosen location stays."
          >
            <Switch checked={sky.autoLocate} onCheckedChange={atmosphere.setAutoLocate} />
          </Row>
          <Row
            title="Background image"
            description="Shown behind the page and the Home box, under frosted glass, with the sky's tint and effects drawn over it. A misty forest lake by default; choose a PNG or JPEG of your own (stored on this device only), or remove yours to go back to the default."
          >
            <ImagePicker imageUrl={sky.imageUrl} custom={sky.customImage} onChoose={atmosphere.setImage} onClear={atmosphere.clearImage} />
          </Row>
          {sky.imageUrl && (
            <Row
              title="Image blur"
              description="How much the glass blurs the background image, from sharp (0%) to heavily frosted (100%)."
            >
              <PercentSlider value={sky.imageBlur} label="Image blur" onCommit={atmosphere.setImageBlur} />
            </Row>
          )}
        </Section>

        <Section id="backgrounds" icon={Images} title="Backgrounds">
          <BackgroundsSettings />
        </Section>

        <Section id="privacy" icon={EyeOff} title="Privacy">
          <Row
            title="Privacy mode"
            description="Blurs money amounts in The Vault, The Orbit, the Home page and search, and the names and previews of Archive notes until you open one. Handy when sharing your screen."
          >
            <Switch checked={privacyMode} onCheckedChange={privacySettings.setEnabled} />
          </Row>
        </Section>

        <Section id="performance" icon={Gauge} title="Performance">
          <Row
            title="Performance mode"
            description="Turns all four switches below on or off together. It shows as on only while every one of them is on; change any of them on its own to fine-tune. The Nebula, Terminal and Portal keep running in the background as usual."
          >
            <Switch checked={perf.performanceMode} onCheckedChange={perfSettings.setPerformanceMode} />
          </Row>
          <Row
            title="Load views on demand"
            description="Pulse, Engine, Horizon, Vault, Atmosphere, Archive and Settings load the first time you open them. Off fetches the three you open most in the background after startup."
          >
            <Switch checked={perf.lazyViews} onCheckedChange={(on) => perfSettings.setSwitch("lazyViews", on)} />
          </Row>
          <Row
            title="Free cached data sooner"
            description="Data no page is using is dropped after the time below instead of five minutes. A page reopened within that time shows its data at once; later it loads again."
          >
            <Switch checked={perf.freeCache} onCheckedChange={(on) => perfSettings.setSwitch("freeCache", on)} />
          </Row>
          {perf.freeCache && (
            <Row
              title="Free cached data after"
              description={`How long unused data is kept before it is freed, from 1 to ${MAX_CACHE_MINUTES} minutes.`}
            >
              <NumberInput
                value={perf.cacheMinutes}
                min={1}
                max={MAX_CACHE_MINUTES}
                unit="minutes"
                label="Cached data lifetime in minutes"
                onCommit={perfSettings.setCacheMinutes}
              />
            </Row>
          )}
          <Row
            title="Reduce transitions"
            description="Page transitions and animations jump straight to their end state. Loading spinners, switches and sliders keep moving. Backdrops have their own switch."
          >
            <Switch checked={perf.reduceTransitions} onCheckedChange={(on) => perfSettings.setSwitch("reduceTransitions", on)} />
          </Row>
          <Row
            title="Still backdrops"
            description="The backdrops behind every page (stars, aurora, rain, nebula, terminal static, sparkles) hold one frame instead of animating, which also takes the load off the GPU. Nothing running in the Nebula, Terminal or Portal is affected."
          >
            <Switch checked={perf.stillBackdrops} onCheckedChange={(on) => perfSettings.setSwitch("stillBackdrops", on)} />
          </Row>
          {desktop && (
            <Row
              title="Portal unload delay"
              description={`How long a Portal app with "Keep loaded in background" turned off (right-click its tab) can stay hidden before it is closed to free memory. 0 closes it as soon as you switch away. Up to ${MAX_UNLOAD_DELAY} seconds.`}
            >
              <NumberInput
                value={perf.unloadDelay}
                min={0}
                max={MAX_UNLOAD_DELAY}
                unit="seconds"
                label="Unload delay in seconds"
                onCommit={perfSettings.setUnloadDelay}
              />
            </Row>
          )}
        </Section>

        {desktop && (
          <Section id="install" icon={Download} title="Install & update">
            <div className="py-3 first:pt-0 last:pb-0">
              <InstallerSection />
            </div>
          </Section>
        )}

        <Section id="diagnostics" icon={Bug} title="Diagnostics">
          <Row
            title="Error report"
            description={
              desktop
                ? "Unhandled errors and failed saves are logged to diagnostics.log in the app's log folder, without the content of your tasks or transactions. Copies the latest entries with the app version, for a bug report."
                : "Unhandled errors and failed saves from this session, without the content of your tasks or transactions. Copies them with the app version, for a bug report."
            }
          >
            <CopyDiagnosticsButton />
          </Row>
        </Section>

        {hotkeys.statuses && (
          <HotkeySettingsDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            action={editing}
            status={hotkeys.statuses[editing]}
            setAccelerator={hotkeys.setAccelerator}
            pause={hotkeys.pause}
          />
        )}
      </div>
    </SearchContext.Provider>
  );
}
