import { describe, expect, it } from "vitest";
import { fillNoise, soundLabel, wantedSound } from "./ambient";

function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

const roughness = (data: Float32Array) => data.reduce((sum, v, i) => (i ? sum + Math.abs(v - data[i - 1]) : 0), 0) / data.length;

describe("ambient sounds", () => {
  it("plays only while a focus phase is running and a sound is picked", () => {
    expect(wantedSound({ running: true, phase: "focus" }, "brown")).toBe("brown");
    expect(wantedSound({ running: true, phase: "break" }, "brown")).toBeNull();
    expect(wantedSound({ running: false, phase: "focus" }, "brown")).toBeNull();
    expect(wantedSound({ running: true, phase: "focus" }, "off")).toBeNull();
  });

  it("generates noise in range, with brown the smoothest and white the roughest", () => {
    const make = (kind: "brown" | "pink" | "white") => {
      const data = new Float32Array(20_000);
      fillNoise(kind, data, seeded());
      expect(data.every((v) => v >= -1 && v <= 1)).toBe(true);
      return roughness(data);
    };
    const [brown, pink, white] = [make("brown"), make("pink"), make("white")];
    expect(brown).toBeLessThan(pink);
    expect(pink).toBeLessThan(white);
  });

  it("names built-in and added sounds", () => {
    expect(soundLabel("rain")).toBe("Rain");
    expect(soundLabel("file:Cafe")).toBe("Cafe");
    expect(soundLabel("off")).toBe("Off");
  });
});
