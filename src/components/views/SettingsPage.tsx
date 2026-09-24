import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, CloudSun, Download, FolderOpen, Gauge, ImagePlus, Keyboard, Orbit, Power, Settings, Sparkles, Trash2 } from "lucide-react";
import NebulaSettingsSection from "@/components/nebula/NebulaSettingsSection";
import InstallerSection from "@/components/views/InstallerSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import HotkeySettingsDialog from "@/components/HotkeySettingsDialog";
import { useGlobalHotkeys } from "@/hooks/useGlobalHotkey";
import { usePickVault, useVaultStatus } from "@/hooks/useVault";
import { HOTKEY_COPY, formatAccelerator, paletteShortcutLabel, type HotkeyAction } from "@/lib/hotkey";
import { isDesktop } from "@/lib/platform";
import { usePortal } from "@/hooks/usePortal";
import { PORTAL_THEMES, portal } from "@/lib/portalStore";
import { MAX_UNLOAD_DELAY, perfSettings, usePerfSettings } from "@/lib/perfSettings";
import { atmosphere, useAtmosphere } from "@/lib/atmosphereStore";
import { IMAGE_TYPES } from "@/lib/atmosphereImage";

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

/**
 * A Settings panel whose header folds it open and closed. The body eases
 * between heights in CSS; `settled` lifts its clip once fully open so focus
 * rings and shadows at the edges show. Collapsed sections are remembered on
 * this device.
 */
function Section({ id, icon: Icon, title, children }: { id: string; icon: React.ElementType; title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(() => !readCollapsed().has(id));
  const [settled, setSettled] = useState(open);
  const bodyId = useId();

  useEffect(() => {
    if (!open) {
      setSettled(false);
      return;
    }
    const timer = window.setTimeout(() => setSettled(true), COLLAPSE_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  const toggle = () => {
    writeCollapsed(id, open);
    setOpen(!open);
  };

  return (
    <section className="glass-card p-6">
      <h3>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={bodyId}
          className="group flex w-full items-center gap-2 rounded-md text-left text-sm font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Icon className="w-4 h-4 text-primary" />
          {title}
          <ChevronDown
            aria-hidden="true"
            className={`ml-auto h-4 w-4 transition-transform duration-300 ease-out ${open ? "" : "-rotate-90"}`}
          />
        </button>
      </h3>
      <div
        id={bodyId}
        data-smooth=""
        data-open={open || undefined}
        data-settled={(open && settled) || undefined}
        className="settings-collapse"
      >
        <div>
          <div className="divide-y divide-white/[0.06] pt-4">{children}</div>
        </div>
      </div>
    </section>
  );
}

function Row({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{description}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">{children}</div>
    </div>
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
 * Picks, previews and removes The Atmosphere's background image. The file is
 * checked and stored by atmosphereStore; failures show as a toast and keep
 * the current background.
 */
function AtmosphereImagePicker({ imageUrl }: { imageUrl: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      await atmosphere.setImage(file);
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
        {busy ? "Saving…" : imageUrl ? "Change" : "Choose image"}
      </Button>
      {imageUrl && (
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => atmosphere.clearImage()} aria-label="Remove background image">
          <Trash2 className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}

/**
 * How much the Atmosphere's background image is blurred. Moves freely while
 * dragging and re-blurs the image once on release, since each blur is a
 * canvas pass over the whole image.
 */
function ImageBlurSlider({ value }: { value: number }) {
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
          atmosphere.setImageBlur(v);
          setDraft(null);
        }}
        aria-label="Image blur"
      />
      <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{shown}%</span>
    </div>
  );
}

/**
 * Seconds before a Portal app with "Keep loaded" off is closed. Typed freely
 * and saved (clamped) on blur or Enter, so a half-typed number is not cut
 * short.
 */
function UnloadDelayInput({ value }: { value: number }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null) perfSettings.setUnloadDelay(draft);
    setDraft(null);
  };
  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        max={MAX_UNLOAD_DELAY}
        step={1}
        value={draft ?? String(value)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setDraft(null);
        }}
        className="h-8 w-24 text-right"
        aria-label="Unload delay in seconds"
      />
      <span className="text-xs text-muted-foreground">seconds</span>
    </div>
  );
}

export default function SettingsPage() {
  const desktop = isDesktop();
  const hotkeys = useGlobalHotkeys();
  const [editing, setEditing] = useState<HotkeyAction>("toggle");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { theme: portalTheme } = usePortal();
  const perf = usePerfSettings();
  const sky = useAtmosphere();

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

  return (
    <div className="max-w-3xl space-y-4">
      <header className="flex items-center gap-3 px-1">
        <Settings className="w-6 h-6 text-primary" />
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
          <p className="text-sm text-muted-foreground">
            {desktop
              ? "Hotkeys, startup, your vault folder, The Nebula, The Portal's theme, and installing updates."
              : "Global hotkeys, launch at login, the vault folder, and updates are handled in the desktop app."}
          </p>
        </div>
      </header>

      <Section id="shortcuts" icon={Keyboard} title="Keyboard shortcuts">
        {(["toggle", "palette"] as const).map((action) => {
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
        <Row title="Focus search bar" description="Jumps to the search bar while Crystal OS is focused.">
          <Combo>{paletteShortcutLabel()}</Combo>
        </Row>
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

      <Section id="portal" icon={Orbit} title="The Portal">
        <div className="py-3 first:pt-0 last:pb-0 space-y-3">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Theme</p>
            <p className="text-xs text-muted-foreground">How The Portal looks while it is open.</p>
          </div>
          <div role="radiogroup" aria-label="Portal theme" className="grid gap-2 sm:grid-cols-3">
            {PORTAL_THEMES.map((theme) => {
              const selected = portalTheme === theme.id;
              const [bg, a, b] = theme.swatch;
              return (
                <button
                  key={theme.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => portal.setTheme(theme.id)}
                  className={`group flex flex-col gap-2 rounded-lg border p-2 text-left transition-colors ${
                    selected ? "border-primary/60 bg-primary/10" : "border-white/10 bg-white/[0.03] hover:border-white/20"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="relative block h-14 overflow-hidden rounded-md"
                    style={{ background: `radial-gradient(circle at 30% 30%, ${a}33, transparent 60%), ${bg}` }}
                  >
                    <span
                      className="absolute inset-x-5 inset-y-3 rounded-md"
                      style={{ padding: 2, background: `conic-gradient(from 90deg, ${a}, ${b}, ${a})` }}
                    >
                      <span className="block h-full w-full rounded-[4px]" style={{ background: bg }} />
                    </span>
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{theme.name}</span>
                    {selected && <Check className="h-4 w-4 text-primary" />}
                  </span>
                  <span className="text-xs text-muted-foreground">{theme.description}</span>
                </button>
              );
            })}
          </div>
        </div>
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
          title="Background image"
          description="A PNG or JPEG shown behind the page and the Home box, under frosted glass, with the sky's tint and effects drawn over it. Stored on this device only."
        >
          <AtmosphereImagePicker imageUrl={sky.imageUrl} />
        </Row>
        {sky.imageUrl && (
          <Row
            title="Image blur"
            description="How much the glass blurs your background image, from sharp (0%) to heavily frosted (100%)."
          >
            <ImageBlurSlider value={sky.imageBlur} />
          </Row>
        )}
      </Section>

      <Section id="performance" icon={Gauge} title="Performance">
        <Row
          title="Performance mode"
          description="Loads Pulse, Engine, Horizon, Vault, Atmosphere, Archive and Settings only when you first open them, frees their cached data after a minute unused, and turns off transitions and backdrop animation. The Nebula, Terminal and Portal keep running in the background as usual."
        >
          <Switch checked={perf.performanceMode} onCheckedChange={perfSettings.setPerformanceMode} />
        </Row>
        {desktop && (
          <Row
            title="Portal unload delay"
            description={`How long a Portal app with "Keep loaded in background" turned off (right-click its tab) can stay hidden before it is closed to free memory. 0 closes it as soon as you switch away. Up to ${MAX_UNLOAD_DELAY} seconds.`}
          >
            <UnloadDelayInput value={perf.unloadDelay} />
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
  );
}
