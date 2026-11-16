import { GraduationCap } from "lucide-react";
import { formatMinutes, type Review } from "@/lib/orbitReview";
import { Bars } from "@/modules/orbit/OrbitCharts";
import { useOrbitStudy } from "@/modules/orbit/useOrbitStudy";

const WEEKDAY_INITIAL = ["S", "M", "T", "W", "T", "F", "S"];
const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
const count = (n: number) => `${n} review${n === 1 ? "" : "s"}`;

function Stat({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone?: "mauve";
}) {
  return (
    <div>
      <div
        className={`orbit-stat ${tone === "mauve" ? "orbit-stat-mauve" : ""}`}
      >
        {value}
      </div>
      <div className="orbit-stat-label">{label}</div>
    </div>
  );
}

export function StudyCard({ review }: { review: Review }) {
  const { stats, loading, hasCourses } = useOrbitStudy(review.period, true);
  if (!loading && !hasCourses) return null;
  const monthly = review.period.kind !== "weekly";
  return (
    <section className="orbit-card" aria-labelledby="orbit-study">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="orbit-card-title">
          <GraduationCap className="w-3.5 h-3.5" aria-hidden="true" />
          <span id="orbit-study">Study</span>
        </h2>
      </div>
      {loading || !stats ? (
        <div
          className="orbit-skeleton"
          role="status"
          aria-busy="true"
          aria-label="Loading study stats"
        >
          <div className="orbit-skeleton-bar w-16 h-7 mb-3" />
          <div className="orbit-skeleton-bar w-full h-16" />
        </div>
      ) : (
        <>
          <div className="flex gap-6 mb-3 flex-wrap">
            <Stat value={String(stats.totalReviews)} label="reviews" />
            <Stat
              value={String(stats.streak)}
              label="day streak"
              tone="mauve"
            />
            <Stat
              value={`${Math.round(stats.goalHitRate * 100)}%`}
              label="goal hit"
              tone="mauve"
            />
            <Stat value={String(stats.mastered)} label="mastered" />
          </div>
          {review.period.kind !== "yearly" && (
            <Bars
              bars={stats.reviewsPerDay.map((d) => {
                const date = new Date(`${d.day}T12:00:00`);
                const tick = !monthly
                  ? WEEKDAY_INITIAL[date.getDay()]
                  : date.getDate() === 1 || date.getDay() === 1
                    ? String(date.getDate())
                    : null;
                return {
                  key: d.day,
                  label: dayLabel(d.day),
                  tick,
                  minutes: d.count,
                };
              })}
              gap={monthly ? 2 : 6}
              ariaLabel="Reviews per day"
              format={count}
            />
          )}
          {stats.minutesByCourse.some((c) => c.minutes > 0) && (
            <>
              <p className="orbit-stat-label mt-3">Focus per course</p>
              <ul className="orbit-pie-legend mt-1">
                {stats.minutesByCourse.map((c) => (
                  <li key={c.code}>
                    <span className="min-w-0 flex-1 truncate" data-private>
                      {c.code} {c.name}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatMinutes(c.minutes)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
