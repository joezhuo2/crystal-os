import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, m } from "framer-motion";
import { ArrowLeft, Check, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Markdown } from "@/components/Markdown";
import { Button } from "@/components/ui/button";
import { SkeletonLines } from "@/components/ui/dashboard-skeletons";
import { ThemedSelect } from "@/components/ui/field-controls";
import { useShortcut } from "@/hooks/useShortcut";
import { useAppActivity } from "@/lib/appActivity";
import { emptyProgress, type Course } from "./model";
import { CardSource } from "./CardSource";
import { questionSource, toQuestion, type Question } from "./questions";
import { buildObservations, buildQueue, type Observation, type QueueItem } from "./queue";
import { CheckWork, SolutionDetails, SolutionStrip } from "./ReviewAi";
import { useObservatoryAi, useObservatorySettings } from "./settings";
import { releaseFocus, requestFocus } from "./focus";
import { gradeBug, gradeMc, gradeOutput, recordObservation, recordReview, type Grade } from "./srs";
import { useCoursesTopics, useProgress, useTopicBodies } from "./useObservatory";

const PROSE = "prose prose-invert prose-sm max-w-none prose-headings:tracking-tight prose-a:text-primary";
const GRADES: { grade: Grade; label: string }[] = [
  { grade: 1, label: "Again" },
  { grade: 2, label: "Hard" },
  { grade: 3, label: "Good" },
  { grade: 4, label: "Easy" },
];
const FIRST_FENCE = /(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\1[^\n]*/;

const firstStep = (o: Observation | undefined) => (o?.summary ? -1 : 0);
const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

function Prose({ children }: { children: string }) {
  return children.trim() ? (
    <div className={PROSE}>
      <Markdown>{children}</Markdown>
    </div>
  ) : null;
}

function Appear({ still, children }: { still: boolean; children: ReactNode }) {
  return (
    <m.div initial={still ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: still ? 0 : 0.18 }}>
      {children}
    </m.div>
  );
}

type Mode = "mc" | "output" | "bug" | "worked" | "card";

const modeOf = (q: Question): Mode =>
  (q.type === "mc" && !q.options.length) || (q.type === "bug" && q.line == null) ? "card" : q.type;

function QuestionCard({ item, busy, keys, onGrade }: { item: QueueItem; busy: boolean; keys: boolean; onGrade: (g: Grade) => void }) {
  const { still } = useAppActivity();
  const ai = useObservatoryAi();
  const [hint, setHint] = useState<Grade | null>(null);
  const [override, setOverride] = useState<Question | null>(null);
  const q = override ?? item.question;
  const mode = modeOf(q);
  const steps = q.type === "worked" && q.steps.length ? q.steps : [q.answer];
  const [revealed, setRevealed] = useState(0);
  const [picked, setPicked] = useState<number[]>([]);
  const [typed, setTyped] = useState("");
  const [auto, setAuto] = useState<Grade | null>(null);
  const selfGrade = (mode === "card" || mode === "worked") && revealed >= steps.length;

  const reveal = () => {
    if (busy) return;
    if (auto !== null) onGrade(auto);
    else if ((mode === "card" || mode === "worked") && revealed < steps.length) setRevealed(revealed + 1);
  };
  useShortcut("observatory.reveal", reveal, !busy && keys);
  useShortcut("observatory.grade1", () => onGrade(1), selfGrade && !busy && keys);
  useShortcut("observatory.grade2", () => onGrade(2), selfGrade && !busy && keys);
  useShortcut("observatory.grade3", () => onGrade(3), selfGrade && !busy && keys);
  useShortcut("observatory.grade4", () => onGrade(4), selfGrade && !busy && keys);

  const multi = q.type === "mc" && q.options.filter((o) => o.correct).length > 1;
  const pickOption = (i: number) => {
    if (q.type !== "mc" || auto !== null) return;
    if (!multi) {
      setPicked([i]);
      setAuto(gradeMc(q, [i]));
    } else setPicked(picked.includes(i) ? picked.filter((p) => p !== i) : [...picked, i]);
  };

  const prompt = q.type === "mc" ? q.stem : q.type === "bug" && mode === "bug" ? q.prompt.replace(FIRST_FENCE, "") : q.prompt;
  const src = useMemo(() => questionSource(prompt), [prompt]);
  const right = auto === 3;
  const answered = selfGrade || auto !== null;

  return (
    <div className="space-y-4">
      <Prose>{src.body}</Prose>
      <CardSource code={item.course} slug={item.topic.slug} question={q} src={src} onChange={(d) => setOverride(toQuestion(d))} />

      {q.type === "mc" && mode === "mc" && (
        <div className="space-y-2">
          {q.options.map((o, i) => {
            const chosen = picked.includes(i);
            const tone =
              auto === null
                ? chosen
                  ? "border-primary/70 bg-primary/10"
                  : "border-border/60"
                : o.correct
                  ? "border-emerald-400/70 bg-emerald-400/10"
                  : chosen
                    ? "border-destructive/70 bg-destructive/10"
                    : "border-border/40 opacity-60";
            return (
              <button
                key={i}
                type="button"
                aria-pressed={chosen}
                disabled={auto !== null || busy}
                onClick={() => pickOption(i)}
                className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:bg-secondary/50 disabled:cursor-default ${tone}`}
              >
                <Markdown>{o.text}</Markdown>
              </button>
            );
          })}
          {multi && auto === null && (
            <Button size="sm" disabled={!picked.length} onClick={() => setAuto(gradeMc(q, picked))}>
              Check
            </Button>
          )}
        </div>
      )}

      {q.type === "output" && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (auto === null) setAuto(gradeOutput(q, typed));
          }}
        >
          <textarea
            aria-label="Your answer"
            rows={Math.max(1, typed.split("\n").length)}
            value={typed}
            disabled={auto !== null}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70"
            placeholder="What does it print?"
          />
          {auto === null && (
            <Button type="submit" size="sm">
              Check
            </Button>
          )}
        </form>
      )}

      {q.type === "bug" && mode === "bug" && (
        <pre className="font-mono text-sm rounded-lg border border-border/60 bg-background/60 p-2 overflow-x-auto">
          {q.code.split("\n").map((text, i) => {
            const line = i + 1;
            const tone =
              auto === null ? "hover:bg-secondary/60" : line === q.line ? "bg-emerald-400/15" : picked.includes(line) ? "bg-destructive/15" : "";
            return (
              <button
                key={i}
                type="button"
                aria-label={`Line ${line}`}
                disabled={auto !== null || busy}
                onClick={() => {
                  setPicked([line]);
                  setAuto(gradeBug(q, line));
                }}
                className={`flex w-full gap-3 rounded px-2 text-left disabled:cursor-default ${tone}`}
              >
                <span className="w-6 shrink-0 text-right text-muted-foreground select-none">{line}</span>
                <span className="whitespace-pre">{text || " "}</span>
              </button>
            );
          })}
        </pre>
      )}

      {(mode === "card" || mode === "worked") && (
        <AnimatePresence initial={false}>
          {steps.slice(0, revealed).map((s, i) => (
            <m.div
              key={i}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              transition={{ duration: still ? 0 : 0.2 }}
              className="overflow-hidden"
            >
              <div className="border-t border-border/40 pt-3">
                {mode === "worked" && steps.length > 1 && <p className="text-xs text-muted-foreground mb-1">Step {i + 1}</p>}
                <Prose>{s || "_No answer written._"}</Prose>
              </div>
            </m.div>
          ))}
        </AnimatePresence>
      )}

      {auto !== null && (
        <Appear still={still}>
          <div className="space-y-3 border-t border-border/40 pt-3">
            <p className={`flex items-center gap-1.5 text-sm font-medium ${right ? "text-emerald-300" : "text-destructive"}`} role="status">
              {right ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
              {right ? "Correct" : "Not quite"}
            </p>
            {q.type === "output" ? (
              <pre className="font-mono text-sm rounded-lg border border-border/60 bg-background/60 p-3 whitespace-pre-wrap">{q.expected}</pre>
            ) : q.type === "bug" ? (
              <Prose>{q.answer.replace(/^\s*line:\s*\d+\s*$/im, "")}</Prose>
            ) : (
              <Prose>{q.answer}</Prose>
            )}
          </div>
        </Appear>
      )}

      {answered && q.solution?.text && <SolutionDetails text={q.solution.text} />}
      {answered && ai && <CheckWork item={item} question={q} onHint={setHint} />}

      <div className="flex flex-wrap items-center gap-2">
        {auto !== null ? (
          <>
            <Button size="sm" disabled={busy} onClick={() => onGrade(auto)}>
              Continue
            </Button>
            {q.type === "output" && !right && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onGrade(3)}>
                I was right
              </Button>
            )}
          </>
        ) : selfGrade ? (
          GRADES.map(({ grade, label }) => (
            <Button key={grade} size="sm" variant={hint === grade ? "secondary" : "outline"} title={hint === grade ? "Suggested by the AI check" : undefined} disabled={busy} onClick={() => onGrade(grade)}>
              <span className="text-muted-foreground mr-1.5">{grade}</span>
              {label}
            </Button>
          ))
        ) : mode === "card" || mode === "worked" ? (
          <Button size="sm" onClick={reveal}>
            {mode === "card" ? "Show answer" : revealed ? "Next step" : "Show first step"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function ReviewView({ courses, onClose, initialFilter, compact, source }: { courses: Course[]; onClose: () => void; initialFilter?: string; compact?: boolean; source?: string }) {
  const { still } = useAppActivity();
  const { folder, retention, newPerDay } = useObservatorySettings();
  const queryClient = useQueryClient();
  const ai = useObservatoryAi();
  const [graded, setGraded] = useState<{ item: QueueItem; grade: Grade } | null>(null);
  const [filter, setFilter] = useState(initialFilter ?? "all");
  const studied = useMemo(() => courses.filter((c) => !c.archived && (filter === "all" || c.code === filter)), [courses, filter]);
  const codes = useMemo(() => studied.map((c) => c.code), [studied]);
  const { topics: listed, loading: listing } = useCoursesTopics(codes);
  const { topics, loading: reading } = useTopicBodies(listed);
  const { progress, loading: loadingProgress } = useProgress(codes);
  const loading = listing || reading || loadingProgress;

  const [session, setSession] = useState<Observation[] | null>(null);
  const [pos, setPos] = useState({ obs: 0, item: 0 });
  const [busy, setBusy] = useState(false);
  const [inside, setInside] = useState(true);
  const root = useRef<HTMLDivElement>(null);
  const keys = !compact || inside;

  useEffect(() => {
    if (compact) root.current?.focus();
  }, [compact]);

  useEffect(() => {
    if (session || loading) return;
    const studies = studied.map((course) => ({
      course,
      topics: topics.filter((t) => t.course === course.code),
      progress: progress[course.code] ?? emptyProgress(),
    }));
    const next = buildObservations(buildQueue(studies, { newPerDay }));
    setSession(next);
    setPos({ obs: 0, item: firstStep(next[0]) });
  }, [session, loading, studied, topics, progress, newPerDay]);

  useEffect(() => () => releaseFocus(), []);

  const restart = () => {
    setGraded(null);
    void queryClient.invalidateQueries({ queryKey: ["vault"] }).finally(() => setSession(null));
  };
  const observation = session?.[pos.obs];
  const onSummary = !!observation && pos.item < 0;
  const finished = !!session && session.length > 0 && !observation;

  useShortcut("observatory.reveal", () => setPos({ obs: pos.obs, item: 0 }), onSummary && keys);

  const nextObservation = () => setPos({ obs: pos.obs + 1, item: firstStep(session?.[pos.obs + 1]) });

  const grade = async (g: Grade) => {
    const item = observation?.items[pos.item];
    if (!observation || !item || busy) return;
    setBusy(true);
    try {
      await recordReview(folder, item.course, item.topic.slug, item.question.id, g, { retention, deadline: item.deadline });
      requestFocus("answer", { code: item.course, slug: item.topic.slug, title: item.topic.title, taskId: item.topic.tasks[0] });
    } catch (err) {
      toast.error("Could not save the review", { description: errText(err) });
      setBusy(false);
      return;
    }
    setGraded({ item, grade: g });
    if (pos.item + 1 < observation.items.length) setPos({ obs: pos.obs, item: pos.item + 1 });
    else {
      try {
        await recordObservation(folder, observation.course, observation.topic.slug);
      } catch (err) {
        toast.error("Could not log the observation", { description: errText(err) });
      }
      nextObservation();
    }
    setBusy(false);
    void queryClient.invalidateQueries({ queryKey: ["vault"] });
  };

  const total = session?.reduce((n, o) => n + o.items.length, 0) ?? 0;
  const answered = (session?.slice(0, pos.obs).reduce((n, o) => n + o.items.length, 0) ?? 0) + Math.max(0, observation ? pos.item : 0);
  const options = [{ value: "all", label: "All courses" }, ...courses.filter((c) => !c.archived).map((c) => ({ value: c.code, label: c.code, color: c.color }))];

  return (
    <div
      ref={root}
      tabIndex={compact ? -1 : undefined}
      data-testid={compact ? "review-compact" : undefined}
      onFocus={compact ? () => setInside(true) : undefined}
      onBlur={compact ? (e) => !e.currentTarget.contains(e.relatedTarget) && setInside(false) : undefined}
      className={`space-y-4 outline-none ${compact ? "text-sm" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1" /> {compact ? "Back" : source ?? "Courses"}
        </Button>
        {!compact && <h2 className="text-lg font-semibold">Review</h2>}
        {!compact && !source && <ThemedSelect
          className="w-44 ml-auto"
          aria-label="Course filter"
          value={filter}
          options={options}
          onChange={(v) => {
            setFilter(v);
            restart();
          }}
        />}
      </div>

      {session && session.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{finished ? "Session complete" : `Observation ${pos.obs + 1} of ${session.length}`}</span>
            <span>
              {answered} of {total} questions
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-secondary/60 overflow-hidden" role="progressbar" aria-label="Session progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={answered}>
            <m.div className="h-full w-full origin-left bg-primary" initial={false} animate={{ scaleX: total ? answered / total : 0 }} transition={{ duration: still ? 0 : 0.3 }} />
          </div>
        </div>
      )}

      {graded && <SolutionStrip key={graded.item.key} item={graded.item} grade={graded.grade} canAi={!!ai} />}

      {!session ? (
        <div role="status" aria-label="Loading review" className="glass-card p-6">
          <SkeletonLines count={4} />
        </div>
      ) : session.length === 0 ? (
        <div className="glass-card p-8 text-center space-y-2">
          <p className="font-semibold">All caught up</p>
          <p className="text-sm text-muted-foreground">
            Nothing is due right now. Add questions to a topic note with the Add question editor on a course page, or write a callout like{" "}
            <code className="font-mono text-xs">&gt; [!question] q-1 type=mc</code> in Obsidian.
          </p>
        </div>
      ) : finished ? (
        <div className="glass-card p-8 text-center space-y-4">
          <p className="font-semibold">Session complete</p>
          <p className="text-sm text-muted-foreground">
            {session.length} observation{session.length === 1 ? "" : "s"} finished.
          </p>
          <div className="flex justify-center gap-2">
            <Button onClick={restart}>Check for more</Button>
            <Button variant="outline" onClick={onClose}>
              {compact ? "Done" : source ? `Back to ${source}` : "Back to courses"}
            </Button>
          </div>
        </div>
      ) : (
        observation && (
          <m.div
            key={`${pos.obs}-${pos.item}`}
            initial={still ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className={compact ? "space-y-3" : "glass-card p-5 space-y-4"}
          >
            <div className="flex flex-wrap items-baseline gap-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{observation.course}</span>
              <span>{observation.topic.title}</span>
              {!onSummary && (
                <span className="ml-auto">
                  Question {pos.item + 1} of {observation.items.length}
                </span>
              )}
            </div>
            {onSummary ? (
              <div className="space-y-4">
                <Prose>{observation.summary ?? ""}</Prose>
                <Button size="sm" onClick={() => setPos({ obs: pos.obs, item: 0 })}>
                  Start questions
                </Button>
              </div>
            ) : (
              <QuestionCard key={observation.items[pos.item]!.key} item={observation.items[pos.item]!} busy={busy} keys={keys} onGrade={(g) => void grade(g)} />
            )}
          </m.div>
        )
      )}
    </div>
  );
}
