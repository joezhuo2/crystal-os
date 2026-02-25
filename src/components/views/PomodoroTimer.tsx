import { useState, useEffect, useCallback } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";

const WORK_DURATION = 25 * 60;
const BREAK_DURATION = 5 * 60;

export default function PomodoroTimer() {
  const [seconds, setSeconds] = useState(WORK_DURATION);
  const [running, setRunning] = useState(false);
  const [isBreak, setIsBreak] = useState(false);

  const total = isBreak ? BREAK_DURATION : WORK_DURATION;
  const progress = (total - seconds) / total;
  const radius = 90;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          setRunning(false);
          setIsBreak((b) => !b);
          return isBreak ? WORK_DURATION : BREAK_DURATION;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [running, isBreak]);

  const reset = useCallback(() => {
    setRunning(false);
    setSeconds(isBreak ? BREAK_DURATION : WORK_DURATION);
  }, [isBreak]);

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const strokeColor = isBreak ? "hsl(160 84% 39%)" : "hsl(239 84% 67%)";

  return (
    <div className="glass-card p-5 flex flex-col items-center">
      <p className="text-xs text-muted-foreground uppercase tracking-widest mb-4">
        {isBreak ? "Break Time" : "Pomodoro"}
      </p>
      <div className="relative w-48 h-48">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r={radius} fill="none" stroke="hsl(217 33% 20%)" strokeWidth="6" />
          <circle
            cx="100" cy="100" r={radius} fill="none"
            stroke={strokeColor} strokeWidth="6" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
            className="transition-all duration-1000 ease-linear"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold tabular-nums">
            {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
          </span>
          <span className="text-[10px] text-muted-foreground mt-1">{isBreak ? "Relax" : "Focus"}</span>
        </div>
      </div>
      <div className="flex gap-3 mt-4">
        <button
          onClick={() => setRunning(!running)}
          className="p-2.5 rounded-full bg-primary/15 hover:bg-primary/25 text-primary transition-colors"
        >
          {running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
        <button onClick={reset} className="p-2.5 rounded-full bg-secondary hover:bg-secondary/80 text-muted-foreground transition-colors">
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
