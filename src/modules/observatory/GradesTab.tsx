import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";
import { AlertTriangle, Plus, Save, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ThemedSelect } from "@/components/ui/field-controls";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Switch } from "@/components/ui/switch";
import { ActionButton } from "./ActionButton";
import { AnimatedNumber } from "@/components/ui/animated-number";
import { bestOf, computeGrades, neededFor, TARGETS, toGpa, type ItemGrade, type Needed } from "./grades";
import type { Course, Graded, Score } from "./model";
import { useObservatorySettings } from "./settings";
import { saveCourse } from "./store";

type Items = Pick<Course, "exams" | "assessments">;
type Kind = keyof Items;

const pct = (n: number) => `${+n.toFixed(1)}%`;

const Pct = ({ value }: { value: number }) => <AnimatedNumber value={value} format={pct} />;

function NeededText({ n }: { n: Needed }) {
  if (n.status === "secured") return <>Secured</>;
  if (n.status === "impossible") return n.average == null ? <>Impossible</> : <>Impossible (needs <Pct value={n.average} />)</>;
  return (
    <>
      <Pct value={n.average!} /> needed
    </>
  );
}

function ScoreRow({
  name,
  n,
  score,
  locked,
  dropped,
  onPatch,
  onAdd,
  onRemove,
}: {
  name: string;
  n: number;
  score?: Score;
  locked: boolean;
  dropped: boolean;
  onPatch: (patch: Partial<Score>) => void;
  onAdd: (value: number) => void;
  onRemove: () => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const value = text ?? (score ? String(score.score) : "");
  const label = `${name} score ${n}`;

  const change = (v: string) => {
    setText(v);
    const num = Number(v);
    if (v.trim() === "" || !Number.isFinite(num)) return;
    if (score) onPatch({ score: num });
    else onAdd(num);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className={`flex items-center gap-2 ${dropped ? "line-through opacity-60" : ""}`}>
        <Input aria-label={`${label} label`} className="h-8 w-32" placeholder={`#${n}`} disabled={!score} value={score?.label ?? ""} onChange={(e) => onPatch({ label: e.target.value })} />
        <NumberInput
          aria-label={label}
          className="h-8 w-20"
          inputMode="decimal"
          disabled={locked}
          value={value}
          onChange={(e) => change(e.target.value)}
          onBlur={() => {
            if (score && value.trim() === "") onRemove();
            setText(null);
          }}
        />
        <span className="text-muted-foreground">/</span>
        <NumberInput
          aria-label={`${label} max`}
          className="h-8 w-20"
          placeholder="100"
          disabled={!score}
          value={score?.max ?? ""}
          onChange={(e) => onPatch({ max: e.target.value === "" ? undefined : Number(e.target.value) })}
        />
      </div>
      {dropped && <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Dropped</span>}
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Switch aria-label={`${label} excused`} disabled={!score} checked={!!score?.excused} onCheckedChange={(v) => onPatch({ excused: v || undefined, ...(v && { missed: undefined }) })} />
        Excused
      </span>
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Switch aria-label={`${label} missed`} disabled={!score} checked={!!score?.missed} onCheckedChange={(v) => onPatch({ missed: v || undefined, ...(v && { excused: undefined }) })} />
        Missed
      </span>
      {score && (
        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Remove ${label}`} onClick={onRemove}>
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

export interface GradesHandle {
  dirty: () => boolean;
  save: () => Promise<boolean>;
  discard: () => void;
}

export const GradesTab = forwardRef<GradesHandle, { course: Course; onEdit: () => void }>(function GradesTab({ course, onEdit }, ref) {
  const { folder } = useObservatorySettings();
  const queryClient = useQueryClient();
  const [items, setItems] = useState<Items>({ exams: course.exams, assessments: course.assessments });
  const [adding, setAdding] = useState<Record<string, boolean>>({});
  const [custom, setCustom] = useState("");
  const [dirty, setDirty] = useState(false);
  const [s] = useState(() => ({ course, folder, items, dirty: false, saving: 0 }));
  s.course = course;
  s.folder = folder;

  useEffect(() => {
    if (s.dirty || s.saving) return;
    s.items = { exams: course.exams, assessments: course.assessments };
    setItems(s.items);
  }, [course, s]);

  const save = useCallback(async () => {
    if (!s.dirty) return true;
    const sent = s.items;
    s.saving++;
    try {
      await saveCourse(s.folder, { ...s.course, ...sent });
      if (s.items === sent) {
        s.dirty = false;
        setDirty(false);
      }
      await queryClient.invalidateQueries({ queryKey: ["vault"] });
      return true;
    } catch (err) {
      toast.error("Could not save grades", { description: err instanceof Error ? err.message : String(err) });
      return false;
    } finally {
      s.saving--;
    }
  }, [s, queryClient]);

  useImperativeHandle(
    ref,
    () => ({
      dirty: () => s.dirty,
      save,
      discard: () => {
        s.dirty = false;
        setDirty(false);
        s.items = { exams: s.course.exams, assessments: s.course.assessments };
        setItems(s.items);
      },
    }),
    [s, save],
  );

  const edit = (kind: Kind, i: number, patch: (x: Graded) => Partial<Graded>) => {
    s.items =
      kind === "exams"
        ? { ...s.items, exams: s.items.exams.map((x, j) => (j === i ? { ...x, ...patch(x) } : x)) }
        : { ...s.items, assessments: s.items.assessments.map((x, j) => (j === i ? { ...x, ...patch(x) } : x)) };
    s.dirty = true;
    setDirty(true);
    setItems(s.items);
  };
  const editScores = (kind: Kind, i: number, change: (scores: Score[]) => Score[]) => edit(kind, i, (x) => ({ scores: change(x.scores ?? []) }));

  const g = computeGrades(items);
  const list = [
    ...items.exams.map((x, i) => ({ kind: "exams" as const, i, x })),
    ...items.assessments.map((x, i) => ({ kind: "assessments" as const, i, x })),
  ];
  const names = list.map((l) => l.x.name);
  const customTarget = custom.trim() === "" ? null : Number(custom);

  if (!list.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No exams or assessments yet. Add them in{" "}
        <button type="button" className="text-primary hover:underline" onClick={onEdit}>
          Edit course
        </button>
        .
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-3">
        {dirty && <span className="text-xs text-muted-foreground">Unsaved changes</span>}
        <ActionButton size="sm" action={save} pending="Saving" done="Saved" disabled={!dirty}>
          <Save className="h-3.5 w-3.5 mr-1" /> Save grades
        </ActionButton>
      </div>
      <section className="glass-card p-4 space-y-3 text-sm">
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <dt className="text-xs text-muted-foreground">Current grade</dt>
            <dd className="text-lg font-semibold" data-testid="current-grade">
              {g.current == null ? (
                "No grades yet"
              ) : (
                <>
                  <Pct value={g.current} /> (<AnimatedNumber value={toGpa(g.current)} format={(n) => n.toFixed(1)} /> GPA)
                </>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Secured</dt>
            <dd className="text-lg font-semibold">
              <Pct value={g.secured} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Maximum</dt>
            <dd className="text-lg font-semibold">
              <Pct value={g.maximum} />
            </dd>
          </div>
        </dl>
        <div>
          <h3 className="text-xs text-muted-foreground mb-1">Average needed on remaining work</h3>
          <ul className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {TARGETS.map((t) => (
              <li key={t} className="rounded-md border border-border/60 px-2 py-1.5">
                <span className="font-medium">{t}%</span> <span className="text-muted-foreground">
                  <NeededText n={neededFor(g, t)} />
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <NumberInput aria-label="Custom target percent" className="h-8 w-24" placeholder="Target" value={custom} onChange={(e) => setCustom(e.target.value)} />
            {customTarget != null && Number.isFinite(customTarget) && (
              <span className="text-muted-foreground">
                <NeededText n={neededFor(g, customTarget)} />
              </span>
            )}
          </div>
        </div>
        {g.equalWeights ? (
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            The outline had no numeric weights, so every item counts equally. Set the weights in
            <Button variant="outline" size="sm" className="h-7" onClick={onEdit}>
              Edit course
            </Button>
          </p>
        ) : (
          Math.abs(g.weightTotal - 1) > 0.0005 && (
            <p className="flex items-center gap-2 text-xs text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Weights add up to {pct(g.weightTotal * 100)}, not 100%.
            </p>
          )
        )}
      </section>

      {list.map(({ kind, i, x }, at) => {
        const grade: ItemGrade = g.items[at]!;
        const scores = x.scores ?? [];
        const group = bestOf(x.name);
        const key = `${kind}-${i}`;
        const single = kind === "exams" && !group;
        const blanks = group ? Math.max(0, group.of - scores.length) : !scores.length || (adding[key] && !single) ? 1 : 0;
        const raw = x.weight * 100;
        const counts = grade.weight * 100;
        return (
          <section key={key} className="glass-card p-4 space-y-2 text-sm">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="font-medium">{x.name || "Untitled"}</h3>
              <span className="text-xs text-muted-foreground">
                {g.equalWeights ? "equal weight" : pct(raw)}
                {!g.equalWeights && Math.abs(counts - raw) > 0.05 && ` (counts ${pct(counts)})`}
              </span>
              {grade.average != null && <span className="ml-auto text-xs text-muted-foreground">
                  Average <Pct value={grade.average} />
                </span>}
            </div>
            {Array.from({ length: scores.length + blanks }, (_, idx) => (
              <ScoreRow
                key={idx}
                name={x.name}
                n={idx + 1}
                score={scores[idx]}
                locked={idx > scores.length}
                dropped={grade.dropped.includes(idx)}
                onPatch={(patch) => editScores(kind, i, (all) => all.map((sc, j) => (j === idx ? { ...sc, ...patch } : sc)))}
                onAdd={(value) => {
                  setAdding(({ [key]: _drop, ...rest }) => rest);
                  editScores(kind, i, (all) => [...all, { label: `#${all.length + 1}`, score: value }]);
                }}
                onRemove={() => editScores(kind, i, (all) => all.filter((_, j) => j !== idx))}
              />
            ))}
            {!group && !single && blanks === 0 && (
              <Button variant="ghost" size="sm" onClick={() => setAdding((a) => ({ ...a, [key]: true }))}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add score
              </Button>
            )}
            {scores.some((sc) => sc.excused) && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                Excused weight moves to
                <ThemedSelect
                  aria-label={`${x.name} excused weight target`}
                  className="h-8 w-56"
                  value={x.excused_to ?? ""}
                  options={[{ value: "", label: "Final exam (default)" }, ...names.filter((nm, j) => j !== at && nm && names.indexOf(nm) === j).map((nm) => ({ value: nm, label: nm }))]}
                  onChange={(v) => edit(kind, i, () => ({ excused_to: v || undefined }))}
                />
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
});
