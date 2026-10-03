import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  BookOpen,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Download,
  Flame,
  ListChecks,
  Loader2,
  Minus,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FocusBars, MoneyBars, TaskOrbit } from "@/components/views/orbit/OrbitCharts";
import { TodayCard } from "@/components/views/orbit/TodayCard";
import { OrbitHistoryError, useNow, useOrbitReview, type OrbitReviewResult } from "@/hooks/useOrbitReview";
import { useCreateNote, vaultErrorCode } from "@/hooks/useVault";
import { useAppActivity } from "@/lib/appActivity";
import {
  REFLECTION_PROMPTS,
  TREND_WINDOW,
  agendaDayLabel,
  exportPath,
  formatClockTime,
  formatMinutes,
  formatMoney,
  formatTrendValue,
  inProgressPeriod,
  latestReadyPeriod,
  periodLabel,
  promptLabel,
  shiftPeriod,
  toMarkdown,
  unitOf,
  weekOfPeriod,
  type AgendaItem,
  type Reflection,
  type ReflectionPrompt,
  type Review,
  type ReviewKind,
  type ReviewPeriod,
  type Trend,
} from "@/lib/orbitReview";
import { orbitStore, useOrbitStore } from "@/lib/orbitStore";

/** Length of each half of the Weekly/Monthly fade: out, then in. Matches .orbit-view in index.css. */
const VIEW_FADE_MS = 150;

/** Names shown before the "+N more" button. */
const NAMES_SHOWN = 5;

interface Target {
  kind: ReviewKind;
  /** 0 is the newest ready review; -1 the one before; 1 the period still in progress. */
  offset: number;
}

interface Shown {
  kind: ReviewKind;
  period: ReviewPeriod;
  result: OrbitReviewResult;
}

/* ------------------------------------------------------------------ *
 * Small pieces
 * ------------------------------------------------------------------ */

function CardTitle({ icon: Icon, children, aside }: { icon: React.ElementType; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-3">
      <h2 className="orbit-card-title">
        <Icon className="w-3.5 h-3.5" aria-hidden="true" />
        {children}
      </h2>
      {aside}
    </div>
  );
}

/** A list of names, the first few shown and the rest behind "+N more". */
function NameList({ names, empty }: { names: string[]; empty: string }) {
  const [open, setOpen] = useState(false);
  if (!names.length) return <p className="orbit-empty">{empty}</p>;
  const shown = open ? names : names.slice(0, NAMES_SHOWN);
  const hidden = names.length - NAMES_SHOWN;
  return (
    <ul className="orbit-names">
      {shown.map((name, i) => (
        <li key={`${name}-${i}`} className="truncate" title={name}>
          {name}
        </li>
      ))}
      {hidden > 0 && (
        <li>
          <button type="button" className="orbit-more" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            {open ? "Show less" : `+${hidden} more`}
          </button>
        </li>
      )}
    </ul>
  );
}

function Stat({ value, label, tone }: { value: string; label: string; tone?: "ice" | "mauve" }) {
  return (
    <div>
      <div className={`orbit-stat ${tone === "mauve" ? "orbit-stat-mauve" : ""}`}>{value}</div>
      <div className="orbit-stat-label">{label}</div>
    </div>
  );
}

/** ▲/▼ with the change, coloured by whether the change is good news. */
function Delta({ trend, against, unit }: { trend: Trend; against: number; unit: string }) {
  const diff = trend.value - against;
  const good = diff === 0 ? null : diff > 0 === trend.higherIsBetter;
  const Icon = diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus;
  return (
    <span className={`orbit-delta ${good === null ? "" : good ? "orbit-delta-good" : "orbit-delta-bad"}`} title={`vs ${unit}: ${formatTrendValue(trend, against)}`}>
      <Icon className="w-3 h-3" aria-hidden="true" />
      {diff === 0 ? "same" : formatTrendValue(trend, Math.abs(diff))}
      <span className="sr-only"> {diff > 0 ? "up" : diff < 0 ? "down" : ""} vs {unit}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Cards
 * ------------------------------------------------------------------ */

function TasksCard({ review }: { review: Review }) {
  const { stats } = review;
  return (
    <section className="orbit-card md:col-span-2" aria-labelledby="orbit-tasks">
      <CardTitle icon={ListChecks}>
        <span id="orbit-tasks">Tasks</span>
      </CardTitle>
      <div className="flex items-center gap-5 mb-4">
        <TaskOrbit done={stats.done} added={stats.added} />
        <div className="flex gap-8">
          <Stat value={String(stats.done)} label="completed" />
          <Stat value={String(stats.added)} label="added" tone="mauve" />
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <h3 className="orbit-subhead orbit-subhead-ice">Completed</h3>
          <NameList names={review.completedTitles} empty="Nothing ticked off." />
        </div>
        <div>
          <h3 className="orbit-subhead orbit-subhead-mauve">Added</h3>
          <NameList names={review.addedTitles} empty="No new tasks." />
        </div>
      </div>
    </section>
  );
}

function FocusCard({ review }: { review: Review }) {
  const monthly = review.period.kind === "monthly";
  return (
    <section className="orbit-card" aria-labelledby="orbit-focus">
      <CardTitle icon={Flame}>
        <span id="orbit-focus">Focus</span>
      </CardTitle>
      <div className="flex gap-6 mb-3 flex-wrap">
        <Stat value={formatMinutes(review.stats.focusMinutes)} label="total" />
        <Stat value={formatMinutes(review.focusPerDay)} label="per day" tone="mauve" />
        {monthly && <Stat value={formatMinutes(review.focusPerWeek)} label="per week" tone="mauve" />}
      </div>
      <FocusBars days={review.focusByDay} />
    </section>
  );
}

function MoneyCard({ review }: { review: Review }) {
  const { stats, previous } = review;
  const unit = unitOf(review.period.kind);
  const net = stats.income - stats.expenses;
  const spendDiff = stats.expenses - previous.expenses;
  return (
    <section className="orbit-card" aria-labelledby="orbit-money">
      <CardTitle icon={Wallet}>
        <span id="orbit-money">Money</span>
      </CardTitle>
      <div className="flex items-baseline gap-2 mb-1">
        <span className={`orbit-stat ${net < 0 ? "orbit-stat-rust" : ""}`}>
          {net >= 0 ? "+" : "−"}
          {formatMoney(Math.abs(net))}
        </span>
        <span className="orbit-stat-label">net</span>
      </div>
      <p className="text-xs text-muted-foreground mb-2 tabular-nums">
        {formatMoney(stats.income)} in · {formatMoney(stats.expenses)} out ·{" "}
        <span className={spendDiff > 0 ? "orbit-text-rust" : spendDiff < 0 ? "orbit-text-ice" : ""}>
          spending {spendDiff === 0 ? "level" : `${spendDiff > 0 ? "up" : "down"} ${formatMoney(Math.abs(spendDiff))}`} vs last {unit}
        </span>
      </p>
      <MoneyBars income={stats.income} expenses={stats.expenses} prevIncome={previous.income} prevExpenses={previous.expenses} unit={unit} />
      <div className="orbit-legend" aria-hidden="true">
        <span><i className="orbit-swatch orbit-swatch-prev" /> last {unit}</span>
        <span><i className="orbit-swatch" /> this {unit}</span>
      </div>
    </section>
  );
}

function TrendsCard({ review }: { review: Review }) {
  const kind = review.period.kind;
  const unit = unitOf(kind);
  return (
    <section className="orbit-card" aria-labelledby="orbit-trends">
      <CardTitle icon={Sparkles}>
        <span id="orbit-trends">Trends</span>
      </CardTitle>
      <div className="orbit-trend-head" aria-hidden="true">
        <span />
        <span>vs last {unit}</span>
        <span>vs {TREND_WINDOW[kind]}-{unit} avg</span>
      </div>
      <ul className="orbit-trends">
        {review.trends.map((t) => (
          <li key={t.id}>
            <span className="min-w-0">
              <span className="block text-xs text-muted-foreground truncate">{t.label}</span>
              <span className="block text-sm font-semibold tabular-nums">{formatTrendValue(t, t.value)}</span>
            </span>
            <Delta trend={t} against={t.previous} unit={`last ${unit}`} />
            <Delta trend={t} against={t.average} unit={`${TREND_WINDOW[kind]}-${unit} average`} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function VaultCard({ review, unavailable }: { review: Review; unavailable: boolean }) {
  return (
    <section className="orbit-card" aria-labelledby="orbit-vault">
      <CardTitle icon={BookOpen}>
        <span id="orbit-vault">Vault notes</span>
      </CardTitle>
      {unavailable ? (
        <p className="orbit-empty">The vault isn't connected, so new notes can't be counted. Set it up in Settings.</p>
      ) : (
        <>
          <Stat value={String(review.stats.notes)} label={`${review.stats.notes === 1 ? "note" : "notes"} added`} />
          <div className="mt-3">
            <NameList names={review.noteTitles} empty="No new notes." />
          </div>
        </>
      )}
    </section>
  );
}

function AgendaRow({ item }: { item: AgendaItem }) {
  return (
    <li className="orbit-agenda-row">
      <span className={`orbit-agenda-dot ${item.kind === "task" ? "orbit-agenda-dot-task" : ""}`} aria-hidden="true" />
      <span className="orbit-agenda-time">{item.time ? formatClockTime(item.time) : item.kind === "task" ? "Task" : "All day"}</span>
      <span className="truncate" title={item.title}>
        {item.title}
        {item.repeats && <span className="orbit-agenda-tag">repeats</span>}
      </span>
    </li>
  );
}

/** A group of agenda rows, the first few shown and the rest behind "+N more". */
function AgendaGroup({ label, items, cap }: { label: string; items: AgendaItem[]; cap: number }) {
  const [open, setOpen] = useState(false);
  const shown = open ? items : items.slice(0, cap);
  const hidden = items.length - cap;
  return (
    <div className="orbit-agenda-group">
      <h3 className="orbit-subhead">{label}</h3>
      {items.length ? (
        <ul className="space-y-1">
          {shown.map((item, i) => (
            <AgendaRow key={`${item.day}-${item.title}-${i}`} item={item} />
          ))}
          {hidden > 0 && (
            <li>
              <button type="button" className="orbit-more" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
                {open ? "Show less" : `+${hidden} more`}
              </button>
            </li>
          )}
        </ul>
      ) : (
        <p className="orbit-empty">Clear.</p>
      )}
    </div>
  );
}

function AgendaCard({ review, calendarConnected, wide }: { review: Review; calendarConnected: boolean; wide?: boolean }) {
  const unit = unitOf(review.period.kind);
  const monthly = review.period.kind === "monthly";
  const groups = useMemo(() => {
    const map = new Map<string, AgendaItem[]>();
    for (const item of review.agenda) {
      const key = monthly ? `Week ${weekOfPeriod(review.next, item.day)}` : agendaDayLabel(item.day);
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return [...map.entries()];
  }, [review.agenda, review.next, monthly]);

  return (
    <section className={`orbit-card ${wide ? "md:col-span-3" : "md:col-span-2"}`} aria-labelledby="orbit-agenda">
      <CardTitle
        icon={CalendarRange}
        aside={<span className="text-xs text-muted-foreground">{periodLabel(review.next)}</span>}
      >
        <span id="orbit-agenda">Next {unit}</span>
      </CardTitle>
      {!calendarConnected && (
        <p className="orbit-empty mb-2">Google Calendar isn't connected, so only tasks are listed.</p>
      )}
      {groups.length ? (
        <div className={`grid gap-4 ${monthly ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2"}`}>
          {groups.map(([label, items]) => (
            <AgendaGroup key={label} label={label} items={items} cap={monthly ? 4 : 3} />
          ))}
        </div>
      ) : (
        <p className="orbit-empty">Nothing scheduled yet. Open skies.</p>
      )}
    </section>
  );
}

function ReflectionCard({ review }: { review: Review }) {
  const [prompt, setPrompt] = useState<ReflectionPrompt | null>(null);
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  const create = useCreateNote();
  const path = exportPath(review.period);
  const kind = review.period.kind;

  const write = (overwrite: boolean) => {
    const reflection: Reflection = { prompt, note };
    create.mutate(
      { path, content: toMarkdown(review, reflection), overwrite },
      {
        onSuccess: (res) => {
          setConfirm(false);
          toast.success(res.created ? "Review exported" : "Review replaced", { description: res.path });
        },
        onError: (err) => {
          if (!overwrite && vaultErrorCode(err) === "conflict") {
            setConfirm(true);
            return;
          }
          setConfirm(false);
          toast.error("Could not export the review", { description: err.message });
        },
      },
    );
  };

  return (
    <section className="orbit-card flex flex-col" aria-labelledby="orbit-reflect">
      <CardTitle icon={Sparkles}>
        <span id="orbit-reflect">Reflect &amp; export</span>
      </CardTitle>
      <p className="text-xs text-muted-foreground mb-2">Optional. Pick a prompt, add a note, or skip both.</p>
      <div className="flex flex-wrap gap-1.5 mb-2" role="radiogroup" aria-label="Reflection prompt">
        {REFLECTION_PROMPTS.map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={prompt === p}
            onClick={() => setPrompt((cur) => (cur === p ? null : p))}
            className={`orbit-chip ${prompt === p ? "orbit-chip-on" : ""}`}
          >
            {promptLabel(p, kind)}
          </button>
        ))}
      </div>
      <label className="sr-only" htmlFor="orbit-note">
        Reflection note
      </label>
      <textarea
        id="orbit-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder={prompt ? `${promptLabel(prompt, kind)}…` : "A small note…"}
        className="orbit-textarea flex-1 min-h-[72px]"
      />
      <button type="button" className="orbit-button mt-3" onClick={() => write(false)} disabled={create.isPending}>
        {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Download className="w-4 h-4" aria-hidden="true" />}
        Export to vault
      </button>
      <p className="mt-1.5 text-[11px] text-muted-foreground truncate" title={path}>
        {path}
      </p>

      <AlertDialog open={confirm} onOpenChange={(open) => !create.isPending && setConfirm(open)}>
        <AlertDialogContent className="orbit-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Replace the existing review?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="orbit-path">{path}</span> is already in your vault. Overwriting replaces the whole note, including anything you
              added to it in Obsidian.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="orbit-button-ghost" disabled={create.isPending}>
              Keep it
            </AlertDialogCancel>
            <AlertDialogAction
              className="orbit-button orbit-button-danger"
              disabled={create.isPending}
              onClick={(e) => {
                e.preventDefault();
                write(true);
              }}
            >
              {create.isPending && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              Overwrite
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function OrbitSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-3" role="status" aria-label="Loading the review">
      {[2, 1, 1, 1, 1, 2, 1].map((span, i) => (
        <div key={i} className={`orbit-card orbit-skeleton ${span === 2 ? "md:col-span-2" : ""}`}>
          <div className="orbit-skeleton-bar w-24 mb-4" />
          <div className="orbit-skeleton-bar w-16 h-7 mb-3" />
          <div className="orbit-skeleton-bar w-full h-16" />
        </div>
      ))}
    </div>
  );
}

function HistoryBanner({ error }: { error: Error }) {
  const missing = error instanceof OrbitHistoryError && error.missingTables;
  return (
    <div className="orbit-card orbit-banner" role="alert">
      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
      <div className="text-sm">
        {missing ? (
          <>
            <p className="font-medium">The Orbit's history tables aren't set up yet.</p>
            <p className="text-muted-foreground mt-0.5">
              Run <code className="orbit-path">supabase/migrations/0003_orbit_review.sql</code> in the Supabase SQL Editor, then reload. Tasks
              ticked off and focus runs are recorded from then on.
            </p>
          </>
        ) : (
          <>
            <p className="font-medium">Couldn't load completions and focus time.</p>
            <p className="text-muted-foreground mt-0.5">{error.message}</p>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */

export default function OrbitPage() {
  const store = useOrbitStore();
  const { still } = useAppActivity();
  const now = useNow();
  // The Home card asks for this week so far, or for the Today card. Read once,
  // then cleared so a later visit opens normally.
  const [landing] = useState(() => store.landing);
  useEffect(() => orbitStore.land(null), []);

  // One step past the newest ready review is the period still running, until
  // it is ready itself.
  const runningWeek = inProgressPeriod("weekly", now);
  const runningMonth = inProgressPeriod("monthly", now);
  const maxOffset: Record<ReviewKind, number> = { weekly: runningWeek ? 1 : 0, monthly: runningMonth ? 1 : 0 };

  const [target, setTarget] = useState<Target>(() =>
    landing === "current" ? { kind: "weekly", offset: maxOffset.weekly } : { kind: store.view, offset: 0 },
  );
  const [offsets, setOffsets] = useState<Record<ReviewKind, number>>(() => ({
    weekly: landing === "current" ? maxOffset.weekly : 0,
    monthly: 0,
  }));

  // Once a running period's review turns ready it is offset 0, so a view one
  // step past it would be the future: clamp.
  const weeklyOffset = Math.min(offsets.weekly, maxOffset.weekly);
  const monthlyOffset = Math.min(offsets.monthly, maxOffset.monthly);
  const latestWeek = latestReadyPeriod("weekly", now);
  const latestMonth = latestReadyPeriod("monthly", now);
  const weeklyPeriod = useMemo(() => shiftPeriod(latestWeek, weeklyOffset), [latestWeek.key, weeklyOffset]); // eslint-disable-line react-hooks/exhaustive-deps
  const monthlyPeriod = useMemo(() => shiftPeriod(latestMonth, monthlyOffset), [latestMonth.key, monthlyOffset]); // eslint-disable-line react-hooks/exhaustive-deps

  // Both kinds load together, so the switch has its numbers ready.
  const weekly = useOrbitReview(weeklyPeriod);
  const monthly = useOrbitReview(monthlyPeriod);
  const live: Shown =
    target.kind === "weekly"
      ? { kind: "weekly", period: weeklyPeriod, result: weekly }
      : { kind: "monthly", period: monthlyPeriod, result: monthly };

  // While switching, the old review stays on screen (fading out) until the
  // new one has its data, then fades in. It never fades in empty and pops.
  const [frozen, setFrozen] = useState<Shown | null>(null);
  const [fade, setFade] = useState<"out" | "in" | null>(null);
  const [outDone, setOutDone] = useState(true);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const go = (next: Target) => {
    if (next.kind === target.kind && next.offset === target.offset) return;
    if (next.kind !== target.kind) orbitStore.setView(next.kind);
    setFrozen((cur) => cur ?? live);
    setTarget(next);
    setOffsets((o) => ({ ...o, [next.kind]: next.offset }));
    window.clearTimeout(timer.current);
    if (still) {
      setFade(null);
      setOutDone(true);
      return;
    }
    setFade("out");
    setOutDone(false);
    timer.current = window.setTimeout(() => setOutDone(true), VIEW_FADE_MS);
  };

  const liveReady = !live.result.loading && (!!live.result.review || !!live.result.historyError);
  useEffect(() => {
    if (!frozen || !outDone || !liveReady) return;
    setFrozen(null);
    if (still) {
      setFade(null);
      return;
    }
    setFade("in");
    timer.current = window.setTimeout(() => setFade(null), VIEW_FADE_MS);
  }, [frozen, outDone, liveReady, still]);

  const shown = frozen ?? live;
  const { review, loading, historyError, vaultUnavailable, calendarConnected } = shown.result;

  // Seeing the newest review clears its ready badge.
  const latestKey = shown.kind === "weekly" ? latestWeek.key : latestMonth.key;
  useEffect(() => {
    if (!frozen && review && shown.period.key === latestKey) orbitStore.markSeen(shown.kind, latestKey);
  }, [frozen, review, shown.kind, shown.period.key, latestKey]);

  const unit = unitOf(shown.kind);
  const atReady = Math.min(target.offset, maxOffset[target.kind]) === 0;
  const atNewest = target.offset >= maxOffset[target.kind];
  const runningKey = (shown.kind === "weekly" ? runningWeek : runningMonth)?.key;
  const inProgress = shown.period.key === runningKey;
  const empty = review && review.stats.done === 0 && review.stats.focusMinutes === 0;

  return (
    <div className="orbit-page space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            <span className="orbit-title">The Orbit</span>
          </h1>
          <div className={`orbit-view flex items-center gap-2 mt-1`} data-fade={fade ?? undefined}>
            <p className="text-sm text-muted-foreground" data-fade-unit aria-live="polite">
              {shown.kind === "weekly" ? "Weekly" : "Monthly"} review · <span className="text-foreground/90">{periodLabel(shown.period)}</span>
              {inProgress && <span className="orbit-so-far"> · so far</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="orbit-stepper" role="group" aria-label={`Browse ${unit}s`}>
            <button
              type="button"
              className="orbit-icon-button"
              onClick={() => go({ kind: target.kind, offset: target.offset - 1 })}
              aria-label={`Previous ${unitOf(target.kind)}`}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              className="orbit-icon-button"
              onClick={() => go({ kind: target.kind, offset: 0 })}
              disabled={atReady}
              aria-label="Latest review"
              title="Latest review"
            >
              <span className="text-xs font-medium px-1">Latest</span>
            </button>
            <button
              type="button"
              className="orbit-icon-button"
              onClick={() => go({ kind: target.kind, offset: target.offset + 1 })}
              disabled={atNewest}
              aria-label={`Next ${unitOf(target.kind)}`}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="orbit-switch" role="tablist" aria-label="Review length">
            {(["weekly", "monthly"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={target.kind === k}
                onClick={() => go({ kind: k, offset: offsets[k] })}
                className={`orbit-switch-option ${target.kind === k ? "orbit-switch-on" : ""}`}
              >
                {k === "weekly" ? "Weekly" : "Monthly"}
              </button>
            ))}
          </div>
        </div>
      </header>

      <TodayCard focusOnMount={landing === "today"} />

      <div className="orbit-view space-y-4" data-fade={fade ?? undefined}>
        {historyError && <HistoryBanner error={historyError} />}
        {loading && !review ? (
          <OrbitSkeleton />
        ) : review ? (
          <>
            {empty && !historyError && (
              <p className="orbit-hint" data-fade-unit>
                {inProgress
                  ? `Nothing logged yet this ${unit}. Tasks you tick and focus runs show up here as they happen.`
                  : `No completions or focus time logged this ${unit}. The Orbit records them from v0.8.0 onward.`}
              </p>
            )}
            <div className="grid gap-4 md:grid-cols-3">
              <TasksCard review={review} />
              <FocusCard review={review} />
              <MoneyCard review={review} />
              <TrendsCard review={review} />
              <VaultCard review={review} unavailable={vaultUnavailable} />
              {/* With no Reflect card, the agenda fills its row. */}
              <AgendaCard review={review} calendarConnected={calendarConnected} wide={inProgress} />
              {!inProgress && <ReflectionCard key={`${review.period.kind}-${review.period.key}`} review={review} />}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
