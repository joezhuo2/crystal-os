import { describe, expect, it } from "vitest";
import { correlate, describeCorrelation, moodScore, pairDays, pearson } from "./moodCorrelation";

const pairs = (moods: number[], values: number[]) =>
  pairDays(
    new Map(moods.map((m, i) => [`d${i}`, m])),
    values.map((value, i) => ({ day: `d${i}`, value })),
  );

describe("moodCorrelation", () => {
  it("scores moods 1 to 5", () => {
    expect(moodScore("rough")).toBe(1);
    expect(moodScore("great")).toBe(5);
  });

  it("computes pearson", () => {
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(pearson([1, 2, 3], [6, 4, 2])).toBeCloseTo(-1);
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
  });

  it("labels strength", () => {
    expect(describeCorrelation(0.85)).toBe("strong positive");
    expect(describeCorrelation(-0.5)).toBe("moderate negative");
    expect(describeCorrelation(0.3)).toBe("weak positive");
    expect(describeCorrelation(0.05)).toBe("none");
    expect(describeCorrelation(null)).toBe("none");
  });

  it("pairs only days with a mood", () => {
    expect(pairs([3, 4], [1, 2, 3])).toHaveLength(2);
  });

  it("needs five paired days", () => {
    expect(correlate(pairs([1, 2, 3, 4], [1, 2, 3, 4])).label).toBe("not enough days");
  });

  it("splits mood around the median", () => {
    const c = correlate(pairs([1, 2, 3, 4, 5], [10, 20, 30, 40, 50]));
    expect(c.label).toBe("strong positive");
    expect(c.lowMood).toBeCloseTo(2);
    expect(c.highMood).toBeCloseTo(4.5);
  });
});
