import { useCallback, useEffect, useRef, useState } from "react";

export type Phase = "idle" | "pending" | "done";

export const DONE_MS = 1200;

export function useActionPhase(): { phase: Phase; run: (task: () => Promise<boolean>) => Promise<void> } {
  const [phase, setPhase] = useState<Phase>("idle");
  const timer = useRef(0);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      window.clearTimeout(timer.current);
    };
  }, []);
  const run = useCallback(async (task: () => Promise<boolean>) => {
    setPhase("pending");
    const ok = await task().catch(() => false);
    if (!live.current) return;
    if (!ok) return setPhase("idle");
    setPhase("done");
    timer.current = window.setTimeout(() => setPhase("idle"), DONE_MS);
  }, []);
  return { phase, run };
}
