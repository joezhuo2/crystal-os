import { useEffect, useRef, useState, type ComponentPropsWithoutRef } from "react";
import { appActivity } from "@/lib/appActivity";
import { cn } from "@/lib/utils";

export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export const interpolate = (from: number, to: number, t: number) => from + (to - from) * easeOut(Math.min(Math.max(t, 0), 1));

export type AnimatedNumberProps = Omit<ComponentPropsWithoutRef<"span">, "children"> & {
  value: number;
  duration?: number;
  format?: (value: number) => string;
};

const defaultFormat = (value: number) => Math.round(value).toLocaleString();

// Copied from crystal-design (packages/animated-number); "still" here also covers the app's own reduce-transitions switch.
export function AnimatedNumber({ value, duration = 600, format = defaultFormat, className, ...rest }: AnimatedNumberProps) {
  const [shown, setShown] = useState(value);
  const current = useRef(value);
  const formatRef = useRef(format);
  formatRef.current = format;

  useEffect(() => {
    if (current.current === value) return;
    if (appActivity.getState().still || duration <= 0) {
      current.current = value;
      setShown(value);
      return;
    }
    const from = current.current;
    const start = performance.now();
    let frame = 0;
    let text = formatRef.current(from);
    const tick = (now: number) => {
      const t = (now - start) / duration;
      current.current = interpolate(from, value, t);
      const next = formatRef.current(current.current);
      if (next !== text || t >= 1) {
        text = next;
        setShown(current.current);
      }
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return (
    <span className={cn("relative tabular-nums", className)} {...rest}>
      <span className="sr-only">{format(value)}</span>
      <span aria-hidden="true">{format(shown)}</span>
    </span>
  );
}
