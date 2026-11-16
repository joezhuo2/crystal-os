import { useState, type ReactNode } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { m } from "framer-motion";
import { Button, type ButtonProps } from "@/components/ui/button";
import { useAppActivity } from "@/lib/appActivity";
import { useActionPhase, type Phase } from "./useActionPhase";

export function PhaseLabel({ phase, pending, done, children }: { phase: Phase; pending: string; done: string; children: ReactNode }) {
  const { still } = useAppActivity();
  if (phase === "pending")
    return (
      <>
        <Loader2 className={`h-3.5 w-3.5 mr-1 ${still ? "" : "motion-safe:animate-spin"}`} aria-hidden="true" /> {pending}
      </>
    );
  if (phase === "done")
    return (
      <m.span
        className="inline-flex items-center"
        initial={still ? false : { opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
      >
        <CheckCircle2 className="h-3.5 w-3.5 mr-1" aria-hidden="true" /> {done}
      </m.span>
    );
  return <>{children}</>;
}

export function ActionButton({
  action,
  pending,
  done,
  children,
  disabled,
  ...props
}: Omit<ButtonProps, "onClick"> & { action: () => Promise<boolean>; pending: string; done: string }) {
  const { phase, run } = useActionPhase();
  const [labels, setLabels] = useState({ pending, done });
  const start = () => {
    setLabels({ pending, done });
    void run(action);
  };
  return (
    <Button {...props} disabled={disabled || phase === "pending"} aria-live="polite" onClick={() => phase === "idle" && start()}>
      <PhaseLabel phase={phase} pending={labels.pending} done={labels.done}>
        {children}
      </PhaseLabel>
    </Button>
  );
}
