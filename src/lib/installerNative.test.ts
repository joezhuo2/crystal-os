import { describe, expect, it } from "vitest";
import { compareVersions, formatBytes, releaseStanding, type Release } from "./installerNative";

function release(version: string, extra: Partial<Release> = {}): Release {
  return {
    tag: `v${version}`,
    version,
    name: `v${version}`,
    publishedAt: "2026-09-17T12:00:00Z",
    prerelease: false,
    notes: null,
    asset: { name: "setup.exe", size: 1024, url: "https://github.com/o/r/releases/download/v1/setup.exe" },
    ...extra,
  };
}

describe("compareVersions", () => {
  it("orders segments numerically, not as text", () => {
    expect(compareVersions("0.6.10", "0.6.9")).toBe(1);
    expect(compareVersions("0.6.9", "0.6.10")).toBe(-1);
    expect(compareVersions("1.0.0", "0.99.99")).toBe(1);
  });

  it("treats a missing segment as zero", () => {
    expect(compareVersions("0.7", "0.7.0")).toBe(0);
    expect(compareVersions("0.7", "0.7.1")).toBe(-1);
  });

  it("counts a non-numeric segment as zero rather than throwing", () => {
    expect(compareVersions("0.6.5-beta", "0.6.5")).toBe(0);
    expect(compareVersions("next", "0.0.0")).toBe(0);
  });
});

describe("releaseStanding", () => {
  it("names a release against the running build", () => {
    expect(releaseStanding(release("0.6.5"), "0.6.5")).toBe("current");
    expect(releaseStanding(release("0.6.6"), "0.6.5")).toBe("newer");
    expect(releaseStanding(release("0.6.4"), "0.6.5")).toBe("older");
  });
});

describe("formatBytes", () => {
  it("scales to the largest whole unit", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(120 * 1024 * 1024)).toBe("120 MB");
  });

  it("shows an em dash when the size is unknown", () => {
    expect(formatBytes(0)).toBe("—");
    expect(formatBytes(-1)).toBe("—");
    expect(formatBytes(Number.NaN)).toBe("—");
  });
});
