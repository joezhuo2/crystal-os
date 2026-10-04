import { describe, expect, it } from "vitest";
import { arcPath, areaPath, labelIndexes, linear, monotonePath, nearestIndex, niceTicks, pieAngles } from "./chartGeometry";

describe("niceTicks", () => {
  it("covers the range with round steps", () => {
    expect(niceTicks(0, 940)).toEqual([0, 200, 400, 600, 800, 1000]);
    expect(niceTicks(-400, 4000)).toEqual([-1000, 0, 1000, 2000, 3000, 4000]);
  });

  it("keeps decimals clean", () => {
    expect(niceTicks(0, 0.3)).toEqual([0, 0.1, 0.2, 0.3]);
  });

  it("gives a flat or empty range some height", () => {
    expect(niceTicks(0, 0)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    const ticks = niceTicks(50, 50);
    expect(ticks[0]).toBeLessThan(50);
    expect(ticks[ticks.length - 1]).toBeGreaterThan(50);
  });
});

describe("linear", () => {
  it("maps and inverts the range", () => {
    const y = linear(0, 100, 200, 0);
    expect(y(0)).toBe(200);
    expect(y(50)).toBe(100);
    expect(y(100)).toBe(0);
  });
});

describe("monotonePath", () => {
  it("draws nothing, a point, or a straight line for short series", () => {
    expect(monotonePath([])).toBe("");
    expect(monotonePath([{ x: 1, y: 2 }])).toBe("M1,2");
    expect(monotonePath([{ x: 0, y: 0 }, { x: 10, y: 5 }])).toBe("M0,0L10,5");
  });

  it("never overshoots a flat stretch", () => {
    const d = monotonePath([
      { x: 0, y: 10 },
      { x: 10, y: 10 },
      { x: 20, y: 0 },
    ]);
    // The control points of the flat first segment stay at y = 10.
    expect(d.startsWith("M0,10C3.33,10,6.67,10,10,10")).toBe(true);
  });

  it("closes an area down to the baseline", () => {
    expect(areaPath([{ x: 0, y: 0 }, { x: 10, y: 5 }], 20)).toBe("M0,0L10,5L10,20L0,20Z");
  });
});

describe("labelIndexes", () => {
  it("keeps every label when there is room", () => {
    expect(labelIndexes(6, 500, 44)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("thins crowded labels and always keeps the last", () => {
    const picked = labelIndexes(30, 300, 44);
    expect(picked[picked.length - 1]).toBe(29);
    for (let i = 1; i < picked.length; i++) expect((picked[i] - picked[i - 1]) * (300 / 29)).toBeGreaterThanOrEqual(44);
  });
});

describe("nearestIndex", () => {
  it("snaps to the closest point and clamps at the edges", () => {
    expect(nearestIndex(0, 100, 5)).toBe(0);
    expect(nearestIndex(30, 100, 5)).toBe(1);
    expect(nearestIndex(140, 100, 5)).toBe(4);
    expect(nearestIndex(-5, 100, 5)).toBe(0);
  });
});

describe("pieAngles and arcPath", () => {
  it("splits the ring by share", () => {
    const [a, b] = pieAngles([1, 3]);
    expect(a.start).toBe(0);
    expect(a.end).toBeCloseTo(Math.PI / 2);
    expect(b.end).toBeCloseTo(Math.PI * 2);
  });

  it("gives empty totals no sweep", () => {
    expect(pieAngles([0, 0])).toEqual([
      { start: 0, end: 0 },
      { start: 0, end: 0 },
    ]);
  });

  it("starts at twelve o'clock and draws a full ring as one arc", () => {
    expect(arcPath(100, 100, 50, 80, 0, Math.PI / 2)).toBe("M100,20A80,80 0 0 1 180,100L150,100A50,50 0 0 0 100,50Z");
    expect(arcPath(100, 100, 50, 80, 0, Math.PI * 2)).toContain("A80,80 0 1 1");
  });
});
