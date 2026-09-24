import { describe, expect, it } from "vitest";
import {
  BASE_MARGIN,
  CRYSTALS,
  CRYSTAL_SHAPES,
  clipPolygon,
  crystalAxes,
  crystalLight,
  edgeCrystals,
  makeSparkles,
  seededRandom,
  svgPoints,
} from "./obsidianScene";

// A 40×80 crystal centred at (120, 240).
const upright = { cx: 120, cy: 240, width: 40, height: 80, angle: 0 };

describe("crystalLight", () => {
  it("is fully lit over the crystal's centre", () => {
    expect(crystalLight(upright, 120, 240)).toEqual({ lit: 1, x: 20, y: 40 });
  });

  it("is fully lit anywhere inside the fitted ellipse", () => {
    expect(crystalLight(upright, 120, 201).lit).toBe(1);
    expect(crystalLight(upright, 139, 240).lit).toBe(1);
  });

  it("fades between the ellipse and the reach", () => {
    // 1.3 box-radii out along the x axis, halfway through the default reach.
    expect(crystalLight(upright, 120 + 20 * 1.3, 240).lit).toBe(0.5);
  });

  it("is dark beyond the reach", () => {
    expect(crystalLight(upright, 120 + 20 * 1.6, 240).lit).toBe(0);
    expect(crystalLight(upright, -9999, -9999).lit).toBe(0);
  });

  it("reports the cursor relative to the crystal's top-left", () => {
    const light = crystalLight(upright, 100, 200);
    expect(light.x).toBe(0);
    expect(light.y).toBe(0);
  });

  it("measures along a rotated crystal's own axes", () => {
    const sideways = { ...upright, angle: 90 };
    // 30px right of centre is along the length of a crystal pointing right.
    expect(crystalLight(sideways, 150, 240)).toEqual({ lit: 1, x: 20, y: 10 });
    // 30px below centre is across its width: past the ellipse.
    const across = crystalLight(sideways, 120, 270);
    expect(across.lit).toBeGreaterThan(0);
    expect(across.lit).toBeLessThan(1);
    expect(across.x).toBe(50);
    expect(across.y).toBe(40);
  });

  it("stays dark for an unmeasured box", () => {
    expect(crystalLight({ cx: 0, cy: 0, width: 0, height: 0, angle: 0 }, 0, 0).lit).toBe(0);
  });
});

describe("makeSparkles", () => {
  it("stays in range", () => {
    const sparkles = makeSparkles(50, seededRandom(7), [3, 9], { x: [40, 60], y: [0, 20] });
    expect(sparkles).toHaveLength(50);
    for (const s of sparkles) {
      expect(s.x).toBeGreaterThanOrEqual(40);
      expect(s.x).toBeLessThanOrEqual(60);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(20);
      expect(s.size).toBeGreaterThanOrEqual(3);
      expect(s.size).toBeLessThanOrEqual(9);
      expect(s.peak).toBeGreaterThanOrEqual(0.45);
      expect(s.peak).toBeLessThanOrEqual(1);
      expect(s.delay).toBeLessThanOrEqual(0);
    }
  });
});

describe("edgeCrystals", () => {
  it("is the same layout every time", () => {
    expect(edgeCrystals()).toEqual(edgeCrystals());
    expect(CRYSTALS).toEqual(edgeCrystals());
  });

  it("roots every crystal at a corner or screen edge", () => {
    expect(CRYSTALS.length).toBeGreaterThanOrEqual(44);
    for (const c of CRYSTALS) {
      expect([c.x, c.y].some((v) => v === 0 || v === 100)).toBe(true);
    }
  });

  it("lines every border with crystals", () => {
    const count = (test: (c: (typeof CRYSTALS)[number]) => boolean) => CRYSTALS.filter(test).length;
    expect(count((c) => c.y === 0)).toBeGreaterThanOrEqual(10);
    expect(count((c) => c.y === 100)).toBeGreaterThanOrEqual(10);
    expect(count((c) => c.x === 0)).toBeGreaterThanOrEqual(10);
    expect(count((c) => c.x === 100)).toBeGreaterThanOrEqual(10);
  });

  it.each([
    [1600, 900],
    [1280, 720],
    [900, 1400],
    [2560, 1080],
  ])("hides every flat base past one screen edge at %ix%i", (width, height) => {
    const vmin = Math.min(width, height) / 100;
    const clearance = (BASE_MARGIN - 0.5) * vmin;
    for (const c of CRYSTALS) {
      const { across } = crystalAxes(c.angle);
      const baseX = (c.x / 100) * width + c.ox * vmin;
      const baseY = (c.y / 100) * height + c.oy * vmin;
      const half = (c.w / 2) * vmin;
      const ends = [
        [baseX + across[0] * half, baseY + across[1] * half],
        [baseX - across[0] * half, baseY - across[1] * half],
      ];
      const pastLeft = ends.every(([x]) => x <= -clearance);
      const pastRight = ends.every(([x]) => x >= width + clearance);
      const pastTop = ends.every(([, y]) => y <= -clearance);
      const pastBottom = ends.every(([, y]) => y >= height + clearance);
      expect(pastLeft || pastRight || pastTop || pastBottom).toBe(true);
    }
  });

  it("points every crystal into the screen", () => {
    for (const c of CRYSTALS) {
      const rad = (c.angle * Math.PI) / 180;
      // Direction of the tip, in screen coordinates (y down).
      const tipX = Math.sin(rad);
      const tipY = -Math.cos(rad);
      const towardCentre = (50 - c.x) * tipX + (50 - c.y) * tipY;
      expect(towardCentre).toBeGreaterThan(0);
    }
  });

  it("keeps opacity between 0.3 and 0.9 and uses known shapes", () => {
    for (const c of CRYSTALS) {
      expect(c.opacity).toBeGreaterThanOrEqual(0.3);
      expect(c.opacity).toBeLessThanOrEqual(0.9);
      expect(CRYSTAL_SHAPES[c.shape]).toBeDefined();
    }
  });
});

describe("outline formatting", () => {
  it("formats outlines for clip-path and SVG", () => {
    const outline = [[50, 0], [100, 100], [0, 100]] as const;
    expect(clipPolygon(outline)).toBe("polygon(50% 0%, 100% 100%, 0% 100%)");
    expect(svgPoints(outline)).toBe("50,0 100,100 0,100");
  });
});
