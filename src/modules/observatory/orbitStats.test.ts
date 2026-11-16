import { describe, expect, it } from "vitest";
import { emptyProgress } from "./model";
import { orbitStudyStats } from "./orbitStats";

const range = { days: ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15"], today: "2026-10-14" };
const at = (d: string) => `${d}T12:00:00`;
const review = (d: string) => ({ kind: "review", card: "t/q", grade: 3, at: at(d), state: 2 });
const focus = (topic: string, seconds: number, d: string) => ({ kind: "focus", topic, seconds, at: at(d) });
const obs = (d: string) => ({ kind: "observation", topic: "t", at: at(d) });

describe("orbitStudyStats", () => {
  const p = {
    ...emptyProgress(),
    cards: { "t/a": { dueAt: "2026-11-01T00:00:00Z", stability: 30 }, "t/b": { dueAt: "2026-11-01T00:00:00Z", stability: 3 }, "t/c": "junk" },
    log: [review("2026-10-12"), review("2026-10-12"), review("2026-10-14"), review("2026-10-01"), obs("2026-10-13"), obs("2026-10-14"), obs("2026-10-14"), "junk", focus("a", 1800, "2026-10-13"), focus("b", 900, "2026-10-14"), focus("a", 600, "2026-10-01")],
      };
  const s = orbitStudyStats([{ code: "CS1", name: "Intro", progress: p }, { code: "MA2", name: "Math", progress: emptyProgress() }], range, 2);

  it("counts reviews inside the range per day", () => {
    expect(s.reviewsPerDay.map((d) => d.count)).toEqual([2, 0, 1, 0]);
    expect(s.totalReviews).toBe(3);
  });
  it("hit rate covers elapsed days only, streak ends today", () => {
    expect(s.goalDays).toBe(1);
    expect(s.goalHitRate).toBeCloseTo(1 / 3);
    expect(s.streak).toBe(2);
  });
  it("counts mastered cards and sums in-range focus per course", () => {
    expect(s.mastered).toBe(1);
    expect(s.minutesByCourse).toEqual([{ code: "CS1", name: "Intro", minutes: 45 }, { code: "MA2", name: "Math", minutes: 0 }]);
  });
});
