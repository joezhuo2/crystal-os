import type { Course, Graded, Score } from "./model";

export const TARGETS = [50, 60, 70, 80, 90];
export const GPA_TABLE: [percent: number, gpa: number][] = [
  [90, 4.0], [85, 3.9], [80, 3.7], [77, 3.3], [73, 3.0], [70, 2.7], [67, 2.3], [63, 2.0], [60, 1.7], [57, 1.3], [53, 1.0], [50, 0.7],
];

export const toGpa = (percent: number): number => GPA_TABLE.find(([min]) => percent >= min)?.[1] ?? 0;

export function bestOf(name: string): { keep: number; of: number } | null {
  const m = /best\s+(\d+)\s+(?:out\s+)?of\s+(\d+)/i.exec(name);
  const keep = Number(m?.[1]);
  const of = Number(m?.[2]);
  return m && keep >= 1 && keep <= of ? { keep, of } : null;
}

export interface ItemGrade {
  name: string;
  kind: "exam" | "assessment";
  weight: number;
  gradedWeight: number;
  remainingWeight: number;
  average: number | null;
  slots: number;
  counted: number[];
  dropped: number[];
}

export interface GradeSummary {
  items: ItemGrade[];
  current: number | null;
  projected: number | null;
  secured: number;
  maximum: number;
  gradedWeight: number;
  remainingWeight: number;
  weightTotal: number;
  equalWeights: boolean;
}

export type Needed = { status: "secured" | "impossible" | "possible"; average: number | null };

type Item = Graded & { name: string; weight: number; kind: ItemGrade["kind"] };

const ratio = (s: Score): number | null => {
  if (s.missed) return 0;
  const r = Number(s.score) / Number(s.max ?? 100);
  return Number.isFinite(r) ? r : null;
};

function targetOf(item: Item, items: Item[]): Item | undefined {
  const named = item.excused_to?.toLowerCase();
  const target = named
    ? items.find((x) => x.name.toLowerCase() === named)
    : (items.find((x) => x.kind === "exam" && /final/i.test(x.name)) ?? items.find((x) => /final/i.test(x.name)));
  return target === item ? undefined : target;
}

export function computeGrades(course: Pick<Course, "exams" | "assessments">): GradeSummary {
  const items: Item[] = [
    ...course.exams.map((x) => ({ ...x, kind: "exam" as const })),
    ...course.assessments.map((x) => ({ ...x, kind: "assessment" as const })),
  ];
  const raw = items.map((x) => (Number.isFinite(x.weight) && x.weight > 0 ? x.weight : 0));
  const equalWeights = items.length > 0 && raw.every((w) => w === 0);
  const base = raw.map((w) => (equalWeights ? 1 : w));

  const shape = items.map((x, i) => {
    const scores = x.scores ?? [];
    const group = bestOf(x.name) ?? { keep: Math.max(1, scores.length), of: Math.max(1, scores.length) };
    const keep = Math.min(group.keep, Math.max(0, group.of - scores.filter((s) => s.excused).length));
    return { scores, keep, out: (base[i]! * (group.keep - keep)) / group.keep };
  });
  const weights = shape.map((s, i) => base[i]! - s.out);
  shape.forEach((s, i) => {
    const t = s.out > 0 ? targetOf(items[i]!, items) : undefined;
    const j = t ? items.indexOf(t) : -1;
    if (j >= 0 && shape[j]!.keep > 0) weights[j]! += s.out;
  });
  const total = weights.reduce((a, b) => a + b, 0);

  let earned = 0;
  const grades = items.map((x, i): ItemGrade => {
    const { scores, keep } = shape[i]!;
    const scored = scores
      .map((s, idx) => ({ idx, r: s.excused ? null : ratio(s) }))
      .filter((s): s is { idx: number; r: number } => s.r !== null)
      .sort((a, b) => b.r - a.r);
    const counted = scored.slice(0, keep);
    const share = total > 0 && keep > 0 ? weights[i]! / total / keep : 0;
    const sum = counted.reduce((a, s) => a + s.r, 0);
    earned += sum * share;
    return {
      name: x.name,
      kind: x.kind,
      weight: total > 0 ? weights[i]! / total : 0,
      gradedWeight: counted.length * share,
      remainingWeight: (keep - counted.length) * share,
      average: counted.length ? (sum / counted.length) * 100 : null,
      slots: keep,
      counted: counted.map((s) => s.idx),
      dropped: scored.slice(keep).map((s) => s.idx),
    };
  });

  const gradedWeight = grades.reduce((a, g) => a + g.gradedWeight, 0);
  const remainingWeight = grades.reduce((a, g) => a + g.remainingWeight, 0);
  const current = gradedWeight > 0 ? (earned / gradedWeight) * 100 : null;
  return {
    items: grades,
    current,
    projected: current,
    secured: earned * 100,
    maximum: (earned + remainingWeight) * 100,
    gradedWeight,
    remainingWeight,
    weightTotal: raw.reduce((a, b) => a + b, 0),
    equalWeights,
  };
}

const EPS = 1e-9;

export function neededFor(g: GradeSummary, target: number): Needed {
  if (g.remainingWeight <= EPS) return { status: g.secured >= target - EPS && g.gradedWeight > 0 ? "secured" : "impossible", average: null };
  const average = (target - g.secured) / g.remainingWeight;
  return { status: average <= EPS ? "secured" : average > 100 + EPS ? "impossible" : "possible", average };
}
