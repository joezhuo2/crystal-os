import { describe, expect, it } from "vitest";
import { emptyProgress, type Progress } from "./model";
import { cardMastery, dayKey, studyStats, topicMastery } from "./stats";

const local = (d: number, h: number) => new Date(2026, 10, d, h, 30);
const obs = (...dates: Date[]): Progress => ({
  ...emptyProgress(),
  log: dates.map((at) => ({ kind: "observation", topic: "t", at: at.toISOString() })),
});

describe("dayKey", () => {
  it("rolls days over at 4 am local", () => {
    expect(dayKey(local(15, 3))).toBe("2026-11-14");
    expect(dayKey(local(15, 4))).toBe("2026-11-15");
    expect(dayKey(local(1, 2))).toBe("2026-10-31");
  });
});

describe("studyStats", () => {
  it("counts a streak across courses and today's observations", () => {
    const a = obs(local(13, 10), local(15, 9), local(15, 11));
    const b = obs(local(14, 23), local(15, 2));
    expect(studyStats([a, b], 3, local(15, 20))).toEqual({ streak: 3, today: 2, goal: 3, met: false });
  });

  it("keeps yesterday's streak alive before today's first observation", () => {
    expect(studyStats([obs(local(13, 10), local(14, 10))], 3, local(15, 3)).streak).toBe(2);
    expect(studyStats([obs(local(13, 10), local(14, 10))], 3, local(15, 9)).streak).toBe(2);
  });

  it("breaks on a missed day and ignores reviews", () => {
    const p: Progress = { ...obs(local(12, 10)), log: [...obs(local(12, 10)).log, { kind: "review", card: "t/q", grade: 3, at: local(14, 10).toISOString(), state: 0 }] };
    expect(studyStats([p], 1, local(15, 9))).toEqual({ streak: 0, today: 0, goal: 1, met: false });
  });

  it("meets the goal", () => {
    expect(studyStats([obs(local(15, 9))], 1, local(15, 10)).met).toBe(true);
  });
});

describe("mastery", () => {
  it("caps a card at 21 days of stability", () => {
    expect(cardMastery(10.5)).toBe(0.5);
    expect(cardMastery(40)).toBe(1);
  });

  it("averages over every question, new ones counting as 0", () => {
    const p = { ...emptyProgress(), cards: { "t/a": { dueAt: "2026-11-20T00:00:00Z", stability: 21 }, "t/b": { dueAt: "2026-11-20T00:00:00Z", stability: 10.5 } } };
    expect(topicMastery(p, "t", ["a", "b", "c", "d"])).toBe(0.375);
    expect(topicMastery(p, "t", [])).toBe(0);
  });
});
