import { useEffect, useState } from "react";
import { CheckCircle2, Circle, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import SetupKeysDialog from "@/components/SetupKeysDialog";
import { calendarWasConnected } from "@/hooks/useGoogleCalendar";
import { usePickVault, useVaultStatus } from "@/hooks/useVault";
import { appUi } from "@/lib/appUi";
import { harnessNative } from "@/lib/harness/native";
import { useInstalledModules } from "@/lib/installedModules";
import { isDesktop } from "@/lib/platform";
import { checklist, dismissOnboarding, getEnvStatus, invoke, onboardingDismissed, type ChecklistId, type EnvStatus } from "@/lib/setup";

export default function OnboardingCard({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [dismissed, setDismissed] = useState(() => !isDesktop() || onboardingDismissed());
  if (dismissed) return null;
  return (
    <Checklist
      onNavigate={onNavigate}
      onDismiss={() => {
        dismissOnboarding();
        setDismissed(true);
      }}
    />
  );
}

function Checklist({ onNavigate, onDismiss }: { onNavigate?: (tab: string) => void; onDismiss: () => void }) {
  const { uninstalled } = useInstalledModules();
  const vault = useVaultStatus();
  const pickVault = usePickVault();
  const [env, setEnv] = useState<EnvStatus | null>(null);
  const [nimKey, setNimKey] = useState<boolean | null>(null);
  const [launchAtLogin, setLaunchAtLogin] = useState<boolean | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const nebulaOn = !uninstalled.includes("nebula");

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      getEnvStatus(),
      invoke<boolean>("get_launch_at_login"),
      nebulaOn ? harnessNative.envStatus().then((s) => s.keys.nvidia) : Promise.resolve(null),
    ]).then(([envResult, loginResult, nimResult]) => {
      if (cancelled) return;
      if (envResult.status === "fulfilled") setEnv(envResult.value);
      if (loginResult.status === "fulfilled") setLaunchAtLogin(loginResult.value);
      if (nimResult.status === "fulfilled") setNimKey(nimResult.value);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [nebulaOn]);

  const items = checklist({
    env,
    vaultChosen: Boolean(vault.data?.path),
    calendarConnected: calendarWasConnected(),
    nimKey,
    launchAtLogin,
    installed: (module) => !uninstalled.includes(module),
  });

  if (!loaded || vault.isLoading || items.every((item) => item.done)) return null;

  const act: Record<ChecklistId, () => void> = {
    keys: () => setKeysOpen(true),
    vault: () => pickVault.mutate(),
    calendar: () => onNavigate?.("calendar"),
    nim: () => {
      appUi.setSettingsSection("nebula");
      onNavigate?.("settings");
    },
    login: () => {
      invoke<boolean>("set_launch_at_login", { enabled: true }).then(setLaunchAtLogin, (err) =>
        toast.error("Could not change launch at login", { description: String(err) }),
      );
    },
  };

  const left = items.filter((item) => !item.done).length;

  return (
    <section className="glass-card p-6 mb-4" aria-label="Finish setting up">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-primary">Finish setting up</p>
          <p className="text-sm text-muted-foreground">
            {left} of {items.length} left. Everything here is also in Settings.
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Hide the setup checklist" onClick={onDismiss}>
          <X className="w-4 h-4" />
        </Button>
      </div>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3">
            {item.done ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-primary" aria-label="Done" />
            ) : (
              <Circle className="w-4 h-4 shrink-0 text-muted-foreground" aria-label="Not done" />
            )}
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${item.done ? "text-muted-foreground line-through" : ""}`}>{item.title}</p>
              {!item.done && <p className="text-xs text-muted-foreground">{item.detail}</p>}
            </div>
            {!item.done && (
              <Button variant="outline" size="sm" onClick={act[item.id]}>
                {item.action}
              </Button>
            )}
          </li>
        ))}
      </ul>
      <SetupKeysDialog open={keysOpen} status={env} onOpenChange={setKeysOpen} onSaved={setEnv} />
    </section>
  );
}
