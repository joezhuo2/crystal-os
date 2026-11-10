/**
 * The animated parts of checking off a task card (v0.10.0): the checkbox,
 * whose fill pops and whose check draws in, and the strikethrough that sweeps
 * across the name. Both undo in reverse, faster. When `still` (performance
 * mode or reduced motion) they switch at once.
 */
import { m } from "framer-motion";

const DRAW = { duration: 0.25, ease: "easeOut" } as const;
const UNDRAW = { duration: 0.15, ease: "easeIn" } as const;
const INSTANT = { duration: 0 } as const;

export function CompletionCheck({ done, still, label, onToggle }: { done: boolean; still: boolean; label: string; onToggle: () => void }) {
  return (
    <m.button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-pressed={done}
      initial={false}
      animate={{ scale: still ? 1 : done ? [1, 0.85, 1.12, 1] : [1, 0.9, 1] }}
      transition={still ? INSTANT : { duration: done ? 0.35 : 0.2, ease: "easeOut" }}
      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
        still ? "duration-0" : "duration-200"
      } ${done ? "bg-accent border-accent" : "border-muted-foreground/40 hover:border-primary"}`}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden
        className="w-3 h-3 text-accent-foreground"
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <m.path
          d="M20 6 9 17l-5-5"
          initial={false}
          animate={{ pathLength: done ? 1 : 0, opacity: done ? 1 : 0 }}
          transition={still ? INSTANT : done ? { ...DRAW, delay: 0.08 } : UNDRAW}
        />
      </svg>
    </m.button>
  );
}

/** A task name with a strikethrough that draws left to right when done, and back. */
export function StrikeText({ done, still, children }: { done: boolean; still: boolean; children: React.ReactNode }) {
  return (
    <span className="relative">
      {children}
      <m.span
        aria-hidden
        initial={false}
        animate={{ scaleX: done ? 1 : 0 }}
        transition={still ? INSTANT : done ? DRAW : UNDRAW}
        style={{ originX: 0 }}
        className="pointer-events-none absolute left-0 top-1/2 h-px w-full bg-current"
      />
    </span>
  );
}
