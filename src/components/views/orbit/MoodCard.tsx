import { useMemo } from "react";
import { Smile } from "lucide-react";
import { GlassTip } from "@/components/ui/glass-tooltip";
import { useRawNotes, useVaultNotes } from "@/hooks/useVault";
import { dailyNotePath, parseToday, pickDailyFolder } from "@/lib/dailyNote";
import { correlate, moodScore, pairDays, type Correlation } from "@/lib/moodCorrelation";
import { type Review } from "@/lib/orbitReview";

function Split({ title, c, low, high }: { title: string; c: Correlation; low: string; high: string }) {
  const rows = [
    { label: low, mood: c.lowMood },
    { label: high, mood: c.highMood },
  ];
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs">{title}</span>
        <GlassTip label={c.r === null ? "No correlation yet" : `r = ${c.r.toFixed(2)}`} hint={`${c.paired} days with a mood`} tone="orbit">
          <span className="orbit-stat orbit-stat-sm" tabIndex={0}>
            {c.label}
          </span>
        </GlassTip>
      </div>
      {c.lowMood !== null && c.highMood !== null && (
        <svg
          viewBox="0 0 280 40"
          className="orbit-chart w-full h-auto"
          role="img"
          aria-label={`Average mood: ${rows.map((r) => `${r.label} ${(r.mood ?? 0).toFixed(1)} of 5`).join(", ")}`}
        >
          {rows.map((r, i) => (
            <g key={r.label}>
              <rect x={0} y={i * 20} width={280} height={14} rx={3} className="orbit-chart-track" />
              <rect x={0} y={i * 20} width={((r.mood ?? 0) / 5) * 280} height={14} rx={3} fill="hsl(var(--orbit-ice))" fillOpacity={i ? 0.95 : 0.55} />
              <text x={6} y={i * 20 + 10.5} className="orbit-chart-label">
                {r.label} · {(r.mood ?? 0).toFixed(1)}
              </text>
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}

export function MoodCard({ review }: { review: Review }) {
  const notes = useVaultNotes({ limit: 1_000_000 });
  const folder = notes.data ? pickDailyFolder(notes.data.notes.map((n) => n.path)) : null;
  const paths = useMemo(() => {
    if (folder === null || !notes.data) return [];
    const have = new Set(notes.data.notes.map((n) => n.path));
    return review.focusByDay.map((d) => ({ day: d.day, path: dailyNotePath(folder, d.day) })).filter((d) => have.has(d.path));
  }, [folder, notes.data, review.focusByDay]);
  const raw = useRawNotes(useMemo(() => paths.map((p) => p.path), [paths]));

  const result = useMemo(() => {
    const moods = new Map<string, number>();
    paths.forEach((p, i) => {
      const mood = raw.contents[i] === null ? null : parseToday(raw.contents[i] as string).mood;
      if (mood) moods.set(p.day, moodScore(mood));
    });
    const habits = correlate(pairDays(moods, review.habitsByDay.map((d) => ({ day: d.day, value: d.done }))));
    const focus = correlate(pairDays(moods, review.focusByDay.map((d) => ({ day: d.day, value: d.minutes }))));
    return { habits, focus };
  }, [paths, raw.contents, review.habitsByDay, review.focusByDay]);

  if (review.period.kind === "yearly" || notes.isError) return null;

  return (
    <section className="orbit-card" aria-labelledby="orbit-mood">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="orbit-card-title">
          <Smile className="w-3.5 h-3.5" aria-hidden="true" />
          <span id="orbit-mood">Mood</span>
        </h2>
      </div>
      {raw.loading ? (
        <p className="orbit-empty">Reading daily notes…</p>
      ) : (
        <div className="space-y-4">
          <Split title="Mood vs habits done" c={result.habits} low="Fewer habits" high="More habits" />
          <Split title="Mood vs focus time" c={result.focus} low="Less focus" high="More focus" />
          {result.habits.r === null && result.focus.r === null && (
            <p className="orbit-empty">Log a mood in Today on at least 5 days to see how it moves with habits and focus.</p>
          )}
        </div>
      )}
    </section>
  );
}
