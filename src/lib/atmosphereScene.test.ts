import { describe, expect, it } from "vitest";
import {
  TWILIGHT_MINUTES,
  auroraStrength,
  isWaxing,
  moonPath,
  pineRidge,
  skyPhase,
  skyWeather,
  starVisibility,
} from "./atmosphereScene";

/** A local time today as a Date, and as the ISO string the feed would send. */
const at = (h: number, m = 0) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
};
const iso = (h: number, m = 0) => at(h, m).toISOString();

describe("skyPhase", () => {
  const rise = iso(6, 45);
  const set = iso(19, 10);

  it("reads day, night, dawn and dusk from sunrise and sunset", () => {
    expect(skyPhase(at(12), rise, set)).toBe("day");
    expect(skyPhase(at(2), rise, set)).toBe("night");
    expect(skyPhase(at(23, 30), rise, set)).toBe("night");
    expect(skyPhase(at(6, 30), rise, set)).toBe("dawn");
    expect(skyPhase(at(19, 40), rise, set)).toBe("dusk");
  });

  it("includes the twilight edges", () => {
    expect(skyPhase(at(6, 45 - TWILIGHT_MINUTES), rise, set)).toBe("dawn");
    expect(skyPhase(at(6, 45 - TWILIGHT_MINUTES - 1), rise, set)).toBe("night");
    expect(skyPhase(at(19, 10 + TWILIGHT_MINUTES), rise, set)).toBe("dusk");
    expect(skyPhase(at(19, 10 + TWILIGHT_MINUTES + 1), rise, set)).toBe("night");
  });

  it("uses only the time of day from yesterday's feed", () => {
    const stale = (h: number, m: number) => {
      const d = at(h, m);
      d.setDate(d.getDate() - 1);
      return d.toISOString();
    };
    expect(skyPhase(at(12), stale(6, 45), stale(19, 10))).toBe("day");
    expect(skyPhase(at(22), stale(6, 45), stale(19, 10))).toBe("night");
  });

  it("falls back to 6:30 and 19:30 without usable times", () => {
    expect(skyPhase(at(12), "", "")).toBe("day");
    expect(skyPhase(at(12), null, undefined)).toBe("day");
    expect(skyPhase(at(6, 30), "garbage", set)).toBe("dawn");
    expect(skyPhase(at(19, 30), set, rise)).toBe("dusk");
    expect(skyPhase(at(3), undefined, undefined)).toBe("night");
  });
});

describe("skyWeather", () => {
  it("reads clear and cloudy skies", () => {
    expect(skyWeather(0)).toEqual({ cloud: 0, precip: "none", intensity: 0, fog: false, lightning: false });
    expect(skyWeather(30).cloud).toBe(0);
    expect(skyWeather(10).cloud).toBe(1);
    expect(skyWeather(2).precip).toBe("none");
  });

  it("reads rain, snow and mixed precipitation", () => {
    expect(skyWeather(12)).toMatchObject({ precip: "rain", intensity: 0.7 });
    expect(skyWeather(28)).toMatchObject({ precip: "rain", intensity: 0.25 });
    expect(skyWeather(18)).toMatchObject({ precip: "snow", intensity: 1 });
    expect(skyWeather(38)).toMatchObject({ precip: "snow" });
    expect(skyWeather(15)).toMatchObject({ precip: "sleet" });
  });

  it("adds lightning to thunderstorms", () => {
    for (const code of [9, 19, 39, 46]) {
      expect(skyWeather(code)).toMatchObject({ precip: "rain", lightning: true });
    }
    expect(skyWeather(12).lightning).toBe(false);
  });

  it("reads fog, haze and smoke", () => {
    for (const code of [23, 24, 44]) expect(skyWeather(code).fog).toBe(true);
    expect(skyWeather(0).fog).toBe(false);
  });

  it("treats unknown codes as partly cloudy", () => {
    expect(skyWeather(99)).toEqual(skyWeather(null));
    expect(skyWeather(undefined)).toMatchObject({ cloud: 0.4, precip: "none" });
  });

  it("never gives intensity without precipitation", () => {
    for (let code = 0; code <= 48; code++) {
      const w = skyWeather(code);
      if (w.precip === "none") expect(w.intensity).toBe(0);
      else expect(w.intensity).toBeGreaterThan(0);
    }
  });
});

describe("auroraStrength and starVisibility", () => {
  it("is strongest at night and faint by day, never off", () => {
    expect(auroraStrength("night")).toBe(1);
    expect(auroraStrength("day")).toBeGreaterThan(0);
    expect(auroraStrength("day")).toBeLessThan(auroraStrength("dusk"));
    expect(auroraStrength("dawn")).toBe(auroraStrength("dusk"));
  });

  it("hides stars by day and behind cloud", () => {
    expect(starVisibility("day")).toBe(0);
    expect(starVisibility("night")).toBe(1);
    expect(starVisibility("night", 1)).toBeCloseTo(0.15);
    expect(starVisibility("dusk", 0)).toBeGreaterThan(0);
    expect(starVisibility("night", 5)).toBeCloseTo(0.15);
  });
});

describe("moonPath", () => {
  it("draws a full disc at full moon and nothing at new moon", () => {
    expect(moonPath(100, true)).toBe("M 50 10 A 40 40 0 0 1 50 90 A 40 40 0 0 1 50 10 Z");
    expect(moonPath(0, true)).toBe("M 50 10 A 40 40 0 0 1 50 90 A 40 40 0 0 0 50 10 Z");
  });

  it("draws a straight terminator at the quarters", () => {
    expect(moonPath(50, true)).toContain("A 0 40");
    expect(moonPath(50, false)).toContain("A 0 40");
  });

  it("mirrors waxing and waning", () => {
    expect(moonPath(25, true)).toBe("M 50 10 A 40 40 0 0 1 50 90 A 20 40 0 0 0 50 10 Z");
    expect(moonPath(25, false)).toBe("M 50 10 A 40 40 0 0 0 50 90 A 20 40 0 0 1 50 10 Z");
    expect(moonPath(75, true)).toBe("M 50 10 A 40 40 0 0 1 50 90 A 20 40 0 0 1 50 10 Z");
  });

  it("clamps illumination", () => {
    expect(moonPath(140, true)).toBe(moonPath(100, true));
    expect(moonPath(-5, true)).toBe(moonPath(0, true));
  });

  it("knows which phases are waxing", () => {
    expect(isWaxing("Waxing Crescent")).toBe(true);
    expect(isWaxing("First Quarter")).toBe(true);
    expect(isWaxing("Full Moon")).toBe(false);
    expect(isWaxing("Waning Gibbous")).toBe(false);
  });
});

describe("pineRidge", () => {
  it("is the same for the same seed and differs by seed", () => {
    expect(pineRidge(7)).toBe(pineRidge(7));
    expect(pineRidge(7)).not.toBe(pineRidge(8));
  });

  it("stays inside its box and closes along the bottom", () => {
    const path = pineRidge(3, 1000, 40);
    expect(path.startsWith("M 0 100")).toBe(true);
    expect(path.endsWith("L 1000 100 Z")).toBe(true);
    const ys = [...path.matchAll(/L (-?[\d.]+) (-?[\d.]+)/g)].map((m) => Number(m[2]));
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(8);
    expect(Math.max(...ys)).toBeLessThanOrEqual(100);
  });
});
