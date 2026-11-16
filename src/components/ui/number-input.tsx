import * as React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { cn } from "@/lib/utils";

const HOUSE =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

type NumberInputProps = Omit<React.ComponentProps<"input">, "type" | "min" | "max" | "step"> & {
  min?: number | string;
  max?: number | string;
  step?: number | string;
  unstyled?: boolean;
  containerClassName?: string;
};

const setNativeValue = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

const decimals = (n: number) => (String(n).split(".")[1] ?? "").length;

const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  ({ className, containerClassName, unstyled, min = 0, max, step, value, disabled, onChange, onKeyDown, ...props }, ref) => {
    const inner = React.useRef<HTMLInputElement>(null);
    React.useImperativeHandle(ref, () => inner.current as HTMLInputElement);

    const lo = Number(min);
    const hi = max === undefined || max === "" ? Infinity : Number(max);
    const inc = step === undefined || step === "any" || !(Number(step) > 0) ? 1 : Number(step);
    const current = value === undefined || value === "" || value === null ? NaN : Number(value);

    const nudge = (dir: 1 | -1) => {
      const input = inner.current;
      if (!input || disabled) return;
      const base = input.value === "" ? NaN : Number(input.value);
      const raw = Number.isFinite(base) ? base + dir * inc : dir > 0 ? Math.max(lo, 0) : lo;
      const next = Math.min(hi, Math.max(lo, raw));
      setNativeValue(input, String(+next.toFixed(Math.max(decimals(inc), decimals(lo)))));
    };

    return (
      <div className={cn("relative", containerClassName)}>
        <input
          ref={inner}
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          className={cn(
            unstyled ? undefined : HOUSE,
            className,
            "pr-7 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
          )}
          onKeyDown={(e) => {
            onKeyDown?.(e);
            if (e.defaultPrevented) return;
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              nudge(e.key === "ArrowUp" ? 1 : -1);
            } else if (e.key === "-" && lo >= 0) {
              e.preventDefault();
            }
          }}
          onChange={(e) => {
            const n = e.target.value === "" ? NaN : Number(e.target.value);
            if (n < 0 && n < lo) e.target.value = String(lo);
            else if (n > hi) e.target.value = String(hi);
            onChange?.(e);
          }}
          {...props}
        />
        <div className="absolute inset-y-1 right-1 flex w-5 flex-col">
          {([1, -1] as const).map((dir) => {
            const Icon = dir > 0 ? ChevronUp : ChevronDown;
            const atEdge = dir > 0 ? current >= hi : current <= lo;
            return (
              <button
                key={dir}
                type="button"
                tabIndex={-1}
                aria-label={dir > 0 ? "Increase" : "Decrease"}
                disabled={disabled || atEdge}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  inner.current?.focus();
                  nudge(dir);
                }}
                className="flex flex-1 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              >
                <Icon className="h-3 w-3" />
              </button>
            );
          })}
        </div>
      </div>
    );
  },
);
NumberInput.displayName = "NumberInput";

export { NumberInput };
