import { beforeEach, describe, expect, it } from "vitest";
import { LAST_VERSION_KEY, changelogSince, compareVersions, takeUpdatedFrom } from "./changelog";

const MD = `# Changelog

Intro.

## [v0.11.16] - 2026-10-20 - C.

- c

## [v0.11.15] - 2026-10-20 - B.

- b

## [v0.11.9] - 2026-10-01 - A.

- a
`;

describe("compareVersions", () => {
  it("compares numerically, not as text", () => {
    expect(compareVersions("0.11.10", "0.11.9")).toBeGreaterThan(0);
    expect(compareVersions("v1.0.0", "1.0")).toBe(0);
    expect(compareVersions("0.9.0", "0.11.0")).toBeLessThan(0);
  });
});

describe("changelogSince", () => {
  it("keeps sections newer than from up to and including to", () => {
    const out = changelogSince(MD, "0.11.9", "0.11.16");
    expect(out).toContain("[v0.11.16]");
    expect(out).toContain("- b");
    expect(out).not.toContain("- a");
    expect(out).not.toContain("Intro");
  });

  it("is empty when no section matches", () => {
    expect(changelogSince(MD, "0.11.16", "0.11.16")).toBe("");
  });
});

describe("takeUpdatedFrom", () => {
  beforeEach(() => localStorage.clear());

  it("records the version on first launch without reporting an update", () => {
    expect(takeUpdatedFrom("0.11.16")).toBeNull();
    expect(localStorage.getItem(LAST_VERSION_KEY)).toBe("0.11.16");
  });

  it("reports the previous version once after an upgrade", () => {
    localStorage.setItem(LAST_VERSION_KEY, "0.11.15");
    expect(takeUpdatedFrom("0.11.16")).toBe("0.11.15");
    expect(takeUpdatedFrom("0.11.16")).toBeNull();
  });

  it("stays quiet after a downgrade", () => {
    localStorage.setItem(LAST_VERSION_KEY, "0.12.0");
    expect(takeUpdatedFrom("0.11.16")).toBeNull();
  });
});
