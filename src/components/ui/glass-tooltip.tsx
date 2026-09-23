import type { CSSProperties, ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type GlassTipTone = "indigo" | "emerald";

/**
 * Written out in full so Tailwind's content scan keeps the rules in
 * index.css: a class built with a template string is purged.
 */
const TONE_CLASS: Record<GlassTipTone, string> = {
  indigo: "glass-tooltip-indigo",
  emerald: "glass-tooltip-emerald",
};

/**
 * A small glass card with a gradient border, used in place of the browser's
 * `title` tooltip. `colors` overrides the tone's two gradient stops, for
 * widgets themed by the user (the Portal's theme, the Nebula's palette).
 */
export function GlassTip({
  label,
  hint,
  tone = "indigo",
  colors,
  side = "top",
  children,
}: {
  label: string;
  hint?: string;
  tone?: GlassTipTone;
  colors?: [string, string];
  side?: "top" | "bottom" | "left" | "right";
  children: ReactNode;
}) {
  const style = colors ? ({ "--tip-a": colors[0], "--tip-b": colors[1] } as CSSProperties) : undefined;
  return (
    <Tooltip delayDuration={250}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} sideOffset={8} className={`glass-tooltip ${TONE_CLASS[tone]}`} style={style}>
        <span className="glass-tooltip-label">{label}</span>
        {hint && <span className="glass-tooltip-hint">{hint}</span>}
      </TooltipContent>
    </Tooltip>
  );
}
