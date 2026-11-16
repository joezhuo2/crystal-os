import { useState } from "react";
import { HABIT_COLORS } from "@/lib/habits";

const HEX = /^#[0-9a-fA-F]{6}$/;

/** The Orbit presets, plus a hex field for anything else. */
export function ColorPicker({ value, onChange, label }: { value: string; onChange: (color: string) => void; label: string }) {
  const [hex, setHex] = useState(HEX.test(value) ? value : "");
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {HABIT_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={value === c}
            aria-label={c}
            onClick={() => {
              onChange(c);
              setHex("");
            }}
            className={`orbit-swatch-pick ${value === c ? "orbit-swatch-pick-on" : ""}`}
            style={{ background: c }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <label className="relative shrink-0">
          <span className="sr-only">Pick any colour</span>
          <input
            type="color"
            value={HEX.test(value) ? value : "#a5e9fb"}
            onChange={(e) => {
              onChange(e.target.value);
              setHex(e.target.value);
            }}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <span className="orbit-swatch-pick block" style={{ background: value }} aria-hidden="true" />
        </label>
        <input
          value={hex}
          onChange={(e) => {
            setHex(e.target.value);
            if (HEX.test(e.target.value)) onChange(e.target.value);
          }}
          placeholder="#a5e9fb"
          aria-label="Hex colour"
          className="orbit-textarea py-1.5 font-mono text-xs"
        />
        <span className="text-[10px] text-muted-foreground shrink-0">Hex</span>
      </div>
    </div>
  );
}
