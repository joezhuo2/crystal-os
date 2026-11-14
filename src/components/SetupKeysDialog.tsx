import { useState } from "react";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SETUP_KEYS, writeEnv, type EnvStatus, type SetupKey } from "@/lib/setup";

interface Props {
  open: boolean;
  status: EnvStatus | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (status: EnvStatus) => void;
}

export default function SetupKeysDialog({ open, status, onOpenChange, onSaved }: Props) {
  const [values, setValues] = useState<Partial<Record<SetupKey, string>>>({});
  const [saving, setSaving] = useState(false);
  const filled = Object.values(values).some((v) => v?.trim());

  const save = async () => {
    setSaving(true);
    try {
      onSaved(await writeEnv(values));
      setValues({});
      toast.success("Keys saved", { description: "The local API restarts with them on its next request." });
      onOpenChange(false);
    } catch (err) {
      toast.error("Could not save the keys", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-primary" />
            Local API keys
          </DialogTitle>
          <DialogDescription>
            Saved to .env.local in the Crystal OS settings folder on this device. A field left empty keeps its saved value; saved values are never shown.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (filled) void save();
          }}
        >
          {SETUP_KEYS.map(({ key, label, placeholder, secret }) => (
            <div key={key} className="space-y-1">
              <Label htmlFor={`setup-${key}`}>
                {label}
                {status?.[key] && <span className="ml-2 text-xs font-normal text-muted-foreground">saved</span>}
              </Label>
              <Input
                id={`setup-${key}`}
                type={secret ? "password" : "text"}
                autoComplete="off"
                spellCheck={false}
                placeholder={status?.[key] ? "Leave empty to keep" : placeholder}
                value={values[key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
              />
            </div>
          ))}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" disabled={saving} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!filled || saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
