import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { DEFAULT_ACCELERATOR, acceleratorFromEvent, formatAccelerator } from "@/lib/hotkey";
import type { HotkeyStatus } from "@/hooks/useGlobalHotkey";
import { Keyboard, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface HotkeySettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: HotkeyStatus | null;
  setAccelerator: (accelerator: string) => Promise<HotkeyStatus>;
  pause: (paused: boolean) => Promise<void>;
  /** null until Rust reports; the switch is hidden until then. */
  launchAtLogin: boolean | null;
  setLaunchAtLogin: (enabled: boolean) => Promise<void>;
}

/**
 * Records a new global hotkey. The current combo is released while the dialog
 * is open so pressing it here is captured instead of hiding the window, and
 * re-registered on close unless a new one was saved.
 */
export default function HotkeySettingsDialog({
  open,
  onOpenChange,
  status,
  setAccelerator,
  pause,
  launchAtLogin,
  setLaunchAtLogin,
}: HotkeySettingsDialogProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(null);
    setHint(null);
    setError(null);
    pause(true);
    return () => {
      pause(false);
    };
  }, [open, pause]);

  const current = status?.accelerator ?? DEFAULT_ACCELERATOR;
  const failed = Boolean(status?.error);

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Leave plain Escape and Tab to the dialog so it stays closable and navigable.
    const bare = !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey;
    if (bare && (e.key === "Escape" || e.key === "Tab")) return;

    e.preventDefault();
    e.stopPropagation();
    const result = acceleratorFromEvent(e.nativeEvent);
    setError(null);
    if (result.kind === "ok") {
      setDraft(result.accelerator);
      setHint(null);
    } else if (result.kind === "invalid") {
      setHint(result.reason);
    }
  };

  const save = async (accelerator: string) => {
    setSaving(true);
    setError(null);
    try {
      await setAccelerator(accelerator);
      toast.success(`Global hotkey set to ${formatAccelerator(accelerator)}`);
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      toast.error("Could not set global hotkey", { description: message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-primary" />
            Global hotkey
          </DialogTitle>
          <DialogDescription>
            Shows Crystal OS and opens the command palette from any app. Press it again while Crystal OS is focused to hide it.
            Closing the window keeps Crystal OS in the tray so the hotkey still works; use Quit in the tray to exit.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div
            tabIndex={0}
            autoFocus
            role="textbox"
            aria-label="Press a new key combination"
            onKeyDown={onKeyDown}
            className={cn(
              "flex h-16 items-center justify-center rounded-lg border bg-background/40 text-lg font-medium outline-none",
              "focus:border-primary/60 focus:ring-2 focus:ring-primary/20",
              error ? "border-red-500/50" : "border-input",
            )}
          >
            {draft ? (
              formatAccelerator(draft)
            ) : (
              <span className="text-sm text-muted-foreground">Press a key combination…</span>
            )}
          </div>

          <p className={cn("text-xs min-h-4", error ? "text-red-400" : "text-muted-foreground")}>
            {error ?? hint ?? `Current: ${formatAccelerator(current)}${failed ? " (not registered)" : ""}`}
          </p>
        </div>

        {launchAtLogin !== null && (
          <label className="flex items-center justify-between gap-4 rounded-lg border border-input bg-background/40 px-3 py-2.5">
            <span className="space-y-0.5">
              <span className="block text-sm font-medium">Launch at login</span>
              <span className="block text-xs text-muted-foreground">
                Starts hidden in the tray so the hotkey works right after you sign in.
              </span>
            </span>
            <Switch checked={launchAtLogin} onCheckedChange={setLaunchAtLogin} />
          </label>
        )}

        <div className="flex justify-between gap-2">
          <Button
            variant="ghost"
            disabled={saving || (current === DEFAULT_ACCELERATOR && !failed)}
            onClick={() => save(DEFAULT_ACCELERATOR)}
          >
            Reset to {formatAccelerator(DEFAULT_ACCELERATOR)}
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={saving || !draft} onClick={() => draft && save(draft)}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
