import { describe, expect, it } from "vitest";
import { MAX_IMAGE_BYTES, MAX_IMAGE_SIDE, blurImage, blurRadius, checkImage, fitWithin } from "./atmosphereImage";

describe("checkImage", () => {
  it("accepts PNG and JPEG", () => {
    expect(checkImage({ type: "image/png", size: 1000 })).toBeNull();
    expect(checkImage({ type: "image/jpeg", size: 1000 })).toBeNull();
  });

  it("refuses other types, empty files and files over the limit", () => {
    expect(checkImage({ type: "image/gif", size: 1000 })).toMatch(/PNG or JPEG/);
    expect(checkImage({ type: "image/webp", size: 1000 })).toMatch(/PNG or JPEG/);
    expect(checkImage({ type: "", size: 1000 })).toMatch(/PNG or JPEG/);
    expect(checkImage({ type: "image/png", size: 0 })).toMatch(/empty/);
    expect(checkImage({ type: "image/png", size: MAX_IMAGE_BYTES })).toBeNull();
    expect(checkImage({ type: "image/png", size: MAX_IMAGE_BYTES + 1 })).toMatch(/25 MB/);
  });
});

describe("fitWithin", () => {
  it("keeps images that already fit", () => {
    expect(fitWithin(1920, 1080)).toEqual({ width: 1920, height: 1080 });
    expect(fitWithin(MAX_IMAGE_SIDE, 10)).toEqual({ width: MAX_IMAGE_SIDE, height: 10 });
  });

  it("scales the longest side down and keeps the aspect ratio", () => {
    expect(fitWithin(5120, 2880)).toEqual({ width: 2560, height: 1440 });
    expect(fitWithin(3000, 6000)).toEqual({ width: 1280, height: 2560 });
  });

  it("never rounds a side to zero", () => {
    expect(fitWithin(100000, 10)).toEqual({ width: 2560, height: 1 });
  });
});

describe("blur", () => {
  it("maps the 0–100 setting onto a 0–40 px radius, clamped", () => {
    expect(blurRadius(0)).toBe(0);
    expect(blurRadius(50)).toBe(20);
    expect(blurRadius(100)).toBe(40);
    expect(blurRadius(-10)).toBe(0);
    expect(blurRadius(400)).toBe(40);
  });

  it("returns the source untouched at 0 blur", async () => {
    const blob = new Blob(["x"], { type: "image/png" });
    expect(await blurImage(blob, 0)).toBe(blob);
  });
});
