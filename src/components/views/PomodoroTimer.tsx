import { useState, useRef } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";
import { pomodoro } from "@/lib/pomodoro";
import { usePomodoro } from "@/hooks/usePomodoro";

export default function PomodoroTimer() {
  // Timer state lives in a shared store so it survives leaving this page and
  // the desktop tray can start, pause, and reset it.
  const { workDuration, breakDuration, remaining: seconds, running, phase } = usePomodoro();
  const isBreak = phase === "break";
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const total = isBreak ? breakDuration : workDuration;
  const progress = (total - seconds) / total;
  const radius = 90;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const strokeColor = isBreak ? "hsl(160 84% 39%)" : "hsl(239 84% 67%)";

  const handleTimeClick = () => {
    if (running) return;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    setEditValue(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const commitEdit = () => {
    const match = editValue.match(/^(\d{1,2}):(\d{2})$/);
    if (match) {
      const h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        const newDuration = h * 3600 + m * 60;
        pomodoro.setDuration(newDuration);
      }
    }
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") commitEdit();
    if (e.key === "Escape") setEditing(false);
  };

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
          {editing ? (
            <input
              ref={inputRef}
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleKeyDown}
              className="w-28 text-center text-3xl font-bold tabular-nums bg-transparent border-b border-primary outline-none"
              placeholder="HH:MM"
              maxLength={5}
            />
          ) : (
            <span
              className={`text-3xl font-bold tabular-nums ${!running ? "cursor-pointer hover:text-primary transition-colors" : ""}`}
              onClick={handleTimeClick}
              title={!running ? "Click to edit time" : undefined}
            >
              {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
            </span>
          )}
          <span className="text-[10px] text-muted-foreground mt-1">{isBreak ? "Relax" : "Focus"}</span>
        </div>
      </div>
      <div className="flex gap-3 mt-4">
        <button
          onClick={pomodoro.toggle}
          className="p-2.5 rounded-full bg-primary/15 hover:bg-primary/25 text-primary transition-colors"
        >
          {running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
        <button onClick={pomodoro.reset}className="p-2.5 rounded-full bg-secondary hover:bg-secondary/80 text-muted-foreground transition-colors">
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
