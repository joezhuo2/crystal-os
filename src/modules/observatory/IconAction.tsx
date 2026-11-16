import { forwardRef, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, m } from "framer-motion";
import { Check, RefreshCw, RotateCw, type LucideIcon } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { GlassTip } from "@/components/ui/glass-tooltip";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAppActivity } from "@/lib/appActivity";
import { cn } from "@/lib/utils";
import { DONE_MS, type Phase } from "./useActionPhase";

const SPINS = new Set<LucideIcon>([RefreshCw, RotateCw]);

export function PhaseIcon({ phase, icon: Icon }: { phase: Phase; icon: LucideIcon }) {
  const { still } = useAppActivity();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.span
        key={phase}
        className="inline-flex"
        initial={still ? false : { opacity: 0, scale: 0.5, rotate: -45 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        exit={still ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.5 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
      >
        {phase === "pending" ? (
          <Icon className={`h-4 w-4 text-primary ${still ? "" : SPINS.has(Icon) ? "motion-safe:animate-spin" : "motion-safe:animate-pulse"}`} aria-hidden="true" />
        ) : phase === "done" ? (
          <Check className="h-4 w-4 text-emerald-400" aria-hidden="true" />
        ) : (
          <Icon className="h-4 w-4" aria-hidden="true" />
        )}
      </m.span>
    </AnimatePresence>
  );
}

type Props = Omit<ButtonProps, "onClick" | "children"> & {
  icon: LucideIcon;
  label: string;
  hint?: string;
  /** Runs on click. Resolving false (or throwing) skips the done tick. */
  action?: () => unknown;
  /** Work started elsewhere (a file picker, a batch): spins while true, ticks when it ends. */
  busy?: boolean;
  badge?: ReactNode;
};

export const IconAction = forwardRef<HTMLButtonElement, Props>(function IconAction({ icon, label, hint, action, busy, badge, className, disabled, variant = "ghost", ...props }, ref) {
  const [phase, setPhase] = useState<Phase>("idle");
  const timer = useRef(0);
  const wasBusy = useRef(false);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const flash = () => {
    setPhase("done");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPhase("idle"), DONE_MS);
  };

  useEffect(() => {
    if (busy) setPhase("pending");
    else if (wasBusy.current) flash();
    wasBusy.current = !!busy;
  }, [busy]);

  const click = async () => {
    if (!action || phase === "pending") return;
    setPhase("pending");
    let ok = false;
    try {
      ok = (await action()) !== false;
    } catch {
      ok = false;
    }
    if (busy) return;
    if (ok) flash();
    else setPhase("idle");
  };

  return (
    <TooltipProvider delayDuration={250}>
    <GlassTip label={label} hint={hint}>
      <Button
        ref={ref}
        type="button"
        variant={variant}
        size="icon"
        aria-label={label}
        aria-live="polite"
        disabled={disabled}
        className={cn("relative h-8 w-8", className)}
        onClick={() => void click()}
        {...props}
      >
        <PhaseIcon phase={phase} icon={icon} />
        {badge}
      </Button>
    </GlassTip>
    </TooltipProvider>
  );
});
