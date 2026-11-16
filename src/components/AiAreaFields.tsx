import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AI_PROVIDER_LABELS, useAiStatus, type AiChoice } from "@/lib/ai";

const CHOICES = Object.keys(AI_PROVIDER_LABELS) as AiChoice[];

export function AiProviderSelect({ value, onChange, disabled, label = "AI provider" }: { value: AiChoice | undefined; onChange: (value: AiChoice) => void; disabled?: boolean; label?: string }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as AiChoice)} disabled={disabled}>
      <SelectTrigger className="h-8 w-36" aria-label={label}>
        <SelectValue placeholder="Loading..." />
      </SelectTrigger>
      <SelectContent>
        {CHOICES.map((choice) => (
          <SelectItem key={choice} value={choice}>
            {AI_PROVIDER_LABELS[choice]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function CommitInput({ value, onCommit, label, placeholder, disabled, className = "h-8 w-56" }: { value: string; onCommit: (value: string) => void; label: string; placeholder?: string; disabled?: boolean; className?: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  return (
    <Input
      className={className}
      aria-label={label}
      placeholder={placeholder}
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const next = draft.trim();
        if (next !== value) onCommit(next);
        setDraft(value);
      }}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}

export function AiModelInput({ provider, value, onCommit, disabled, label = "AI model" }: { provider: AiChoice | undefined; value: string; onCommit: (value: string) => void; disabled?: boolean; label?: string }) {
  const status = useAiStatus();
  const master = provider && provider !== "none" ? status.data?.[provider].model : undefined;
  return (
    <CommitInput
      value={value}
      onCommit={onCommit}
      label={label}
      placeholder={master ? `Default: ${master}` : "Default model"}
      disabled={disabled || !provider || provider === "none"}
    />
  );
}
