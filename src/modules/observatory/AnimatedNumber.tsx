import { useEffect, useRef } from "react";
import { animate, useReducedMotion } from "framer-motion";
import { useAppActivity } from "@/lib/appActivity";

export function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  const { still } = useAppActivity();
  const reduced = useReducedMotion();
  const fmt = useRef(format);
  fmt.current = format;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (still || reduced || shown.current === value) {
      shown.current = value;
      el.textContent = fmt.current(value);
      return;
    }
    const controls = animate(shown.current, value, {
      duration: 0.45,
      ease: "easeOut",
      onUpdate: (v) => {
        shown.current = v;
        el.textContent = fmt.current(v);
      },
    });
    return () => controls.stop();
  }, [value, still, reduced]);

  return <span ref={ref}>{format(shown.current)}</span>;
}
