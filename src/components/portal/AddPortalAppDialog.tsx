import { useEffect, useState } from "react";
import { Check, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AppIcon } from "@/components/portal/PortalNavbar";
import { PRESETS, createCustomApp, type PortalApp } from "@/lib/portalApps";

interface AddPortalAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apps: PortalApp[];
  onAdd: (app: PortalApp) => void;
}

/** Connect a preset app, or any https site by name and address. */
export default function AddPortalAppDialog({ open, onOpenChange, apps, onAdd }: AddPortalAppDialogProps) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setUrl("");
      setError(null);
    }
  }, [open]);

  const connected = new Set(apps.map((a) => a.id));

  const add = (app: PortalApp) => {
    onAdd(app);
    onOpenChange(false);
  };

  const submitCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const result = createCustomApp(name, url, apps);
    // `in` narrows even without strictNullChecks, which this project leaves off.
    if ("error" in result) setError(result.error);
    else add(result.app);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Connect an app</DialogTitle>
          <DialogDescription>
            Each app opens as its own signed-in web page and stays separate from the others.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {PRESETS.map((preset) => {
            const added = connected.has(preset.id);
            return (
              <button
                key={preset.id}
                type="button"
                disabled={added}
                onClick={() => add({ id: preset.id, name: preset.name, url: preset.url })}
                className="relative flex flex-col items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-3 text-xs font-medium transition-colors hover:bg-white/[0.08] hover:border-white/20 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-white/[0.03]"
              >
                <AppIcon app={preset} size={28} />
                {preset.name}
                {added && <Check className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-emerald-400" aria-label="Connected" />}
              </button>
            );
          })}
        </div>

        <form onSubmit={submitCustom} className="space-y-2 border-t border-white/[0.06] pt-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Custom app</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder="Name"
              aria-label="App name"
              className="bg-background/40 sm:w-36"
            />
            <Input
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(null);
              }}
              placeholder="https://example.com"
              aria-label="App address"
              inputMode="url"
              className="bg-background/40 flex-1"
            />
            <Button type="submit" disabled={!name.trim() || !url.trim()}>
              <Plus className="w-4 h-4 mr-1" />
              Add
            </Button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <p className="text-xs text-muted-foreground/60">
            Google sites block sign-in inside apps like this, so open those in your browser instead.
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
