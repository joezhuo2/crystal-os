import { useRef } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BUILT_IN, ambient, customSoundId, useAmbient } from "@/lib/ambient";

export function AmbientSoundSelect() {
  const { sound, custom } = useAmbient();
  return (
    <Select value={sound} onValueChange={ambient.setSound}>
      <SelectTrigger className="mt-3 h-8 w-44 text-xs" aria-label="Focus sound">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="off">No sound</SelectItem>
        {Object.entries(BUILT_IN).map(([id, label]) => (
          <SelectItem key={id} value={id}>
            {label}
          </SelectItem>
        ))}
        {custom.map((name) => (
          <SelectItem key={name} value={customSoundId(name)}>
            {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function AmbientSoundManager() {
  const { custom } = useAmbient();
  const input = useRef<HTMLInputElement>(null);
  const add = async (file: File | undefined) => {
    if (!file) return;
    try {
      const problem = await ambient.addSound(file);
      if (problem) toast.error(problem);
      else toast.success(`Added ${file.name}`);
    } catch (err) {
      toast.error("Could not save the sound", { description: err instanceof Error ? err.message : String(err) });
    }
  };
  return (
    <div className="flex flex-col items-end gap-1.5">
      <input
        ref={input}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => {
          void add(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <Button size="sm" variant="outline" onClick={() => input.current?.click()}>
        <Plus /> Add sound
      </Button>
      {custom.map((name) => (
        <span key={name} className="flex items-center gap-1 text-xs text-muted-foreground">
          {name}
          <button type="button" aria-label={`Remove ${name}`} onClick={() => void ambient.removeSound(name)} className="rounded p-0.5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}
