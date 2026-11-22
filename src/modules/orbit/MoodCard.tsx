import { useMemo } from "react";
import { Smile } from "lucide-react";
import { GlassTip } from "@/components/ui/glass-tooltip";
import { useRawNotes, useVaultNotes } from "@/hooks/useVault";
import { dailyNotePath, parseToday, pickDailyFolder, type TodayEntry } from "@/lib/dailyNote";
import { correlate, moodScore, pairDays, type Correlation } from "@/lib/moodCorrelation";
import { type Review } from "@/lib/orbitReview";
import { useOrbitStore } from "@/lib/orbitStore";

const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

/** The period's days, Monday first, each lit by its mood (1 to 5). */
function MoodGrid({ days, entries, wide }: { days: string[]; entries: Map<string, TodayEntry>; wide: boolean }) {
  const { moodLabels } = useOrbitStore();
  if (!days.length) return null;
  const pad = (new Date(`${days[0]}T12:00:00`).getDay() + 6) % 7;
  return (
    <div className={wide ? "orbit-habit-grid-week" : "orbit-habit-grid-month"}>
      <ol className="orbit-habit-grid" aria-label="Mood by day">
        {Array.from({ length: pad }, (_, i) => (
          <li key={`pad-${i}`} className="orbit-habit-cell orbit-habit-cell-pad" aria-hidden="true" />
        ))}
        {days.map((day) => {
          const entry = entries.get(day);
          const score = entry?.mood ? moodScore(entry.mood) : 0;
          const tags = entry?.moodTags?.join(", ");
          const label = `${dayLabel(day)}${entry?.mood ? ` · ${moodLabels[entry.mood]}` : ""}`;
          return (
            <GlassTip key={day} label={label} hint={entry?.mood ? tags : "No mood logged"} detail={entry?.moodNote} tone="orbit">
              <li
                tabIndex={0}
                aria-label={[label, tags, entry?.moodNote].filter(Boolean).join(": ")}
                className={`orbit-habit-cell ${score > 3 ? "orbit-habit-cell-bright" : ""}`}
                style={score ? ({ "--share": score / 5 } as React.CSSProperties) : undefined}
                data-done={score > 0 || undefined}
              >
                {Number(day.slice(8))}
              </li>
            </GlassTip>
          );
        })}
      </ol>
    </div>
  );
}

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
    const entries = new Map<string, TodayEntry>();
    const tagCounts = new Map<string, number>();
    paths.forEach((p, i) => {
      if (raw.contents[i] === null) return;
      const entry = parseToday(raw.contents[i] as string);
      if (!entry.mood) return;
      moods.set(p.day, moodScore(entry.mood));
      entries.set(p.day, entry);
      for (const tag of entry.moodTags ?? []) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    });
    const topTags = [...tagCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 4);
    const habits = correlate(pairDays(moods, review.habitsByDay.map((d) => ({ day: d.day, value: d.done }))));
    const focus = correlate(pairDays(moods, review.focusByDay.map((d) => ({ day: d.day, value: d.minutes }))));
    return { habits, focus, entries, topTags };
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
        <div className="space-y-4" role="status" aria-busy="true" aria-label="Reading daily notes">
          {[0, 1].map((i) => (
            <div key={i} aria-hidden="true">
              <div className="orbit-skeleton-bar w-32 mb-2" />
              <div className="orbit-skeleton-bar w-full h-8" />
            </div>
          ))}
          <span className="sr-only">Reading daily notes…</span>
        </div>
      ) : (
        <div className="space-y-4">
          <MoodGrid days={review.focusByDay.map((d) => d.day)} entries={result.entries} wide={review.period.kind === "weekly"} />
          {result.topTags.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Most tagged: {result.topTags.map(([tag, n]) => `${tag} ×${n}`).join(" · ")}
            </p>
          )}
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
