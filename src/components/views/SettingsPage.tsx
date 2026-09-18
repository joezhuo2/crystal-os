import { useState } from "react";
import { toast } from "sonner";
import { Check, Download, FolderOpen, Keyboard, Orbit, Power, Settings, Sparkles } from "lucide-react";
import NebulaSettingsSection from "@/components/nebula/NebulaSettingsSection";
import InstallerSection from "@/components/views/InstallerSection";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import HotkeySettingsDialog from "@/components/HotkeySettingsDialog";
import { useGlobalHotkeys } from "@/hooks/useGlobalHotkey";
import { usePickVault, useVaultStatus } from "@/hooks/useVault";
import { HOTKEY_COPY, formatAccelerator, paletteShortcutLabel, type HotkeyAction } from "@/lib/hotkey";
import { isDesktop } from "@/lib/platform";
import { usePortal } from "@/hooks/usePortal";
import { PORTAL_THEMES, portal } from "@/lib/portalStore";

function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <section className="glass-card p-6 space-y-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="w-4 h-4 text-primary" />
        {title}
      </h3>
      <div className="divide-y divide-white/[0.06]">{children}</div>
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

export default function SettingsPage() {
  const desktop = isDesktop();
  const hotkeys = useGlobalHotkeys();
  const [editing, setEditing] = useState<HotkeyAction>("toggle");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { theme: portalTheme } = usePortal();

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

      <Section icon={Keyboard} title="Keyboard shortcuts">
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
        <Section icon={Power} title="Startup">
          <Row
            title="Launch at login"
            description="Starts hidden in the tray so the hotkeys work right after you sign in. Closing the window keeps Crystal OS in the tray; use Quit in the tray to exit."
          >
            <Switch checked={hotkeys.launchAtLogin} onCheckedChange={hotkeys.setLaunchAtLogin} />
          </Row>
        </Section>
      )}

      {desktop && (
        <Section icon={FolderOpen} title="Vault">
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
        <Section icon={Sparkles} title="The Nebula">
          <div className="py-3 first:pt-0 last:pb-0">
            <NebulaSettingsSection />
          </div>
        </Section>
      )}

      <Section icon={Orbit} title="The Portal">
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

      {desktop && (
        <Section icon={Download} title="Install & update">
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
