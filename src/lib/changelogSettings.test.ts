import { beforeEach, describe, expect, it } from "vitest";
import { SHOW_CHANGELOG_KEY, changelogSettings, parseShowChangelog } from "./changelogSettings";

beforeEach(() => {
  localStorage.clear();
  changelogSettings._reset();
});

describe("changelogSettings", () => {
  it("is off by default", () => {
    expect(parseShowChangelog(null)).toBe(false);
    expect(parseShowChangelog("garbage")).toBe(false);
    expect(changelogSettings.getState()).toBe(false);
  });

  it("stays on once switched on", () => {
    changelogSettings.setEnabled(true);
    expect(localStorage.getItem(SHOW_CHANGELOG_KEY)).toBe("true");
    changelogSettings._reset();
    expect(changelogSettings.getState()).toBe(true);
  });

  it("notifies listeners only on a change", () => {
    let calls = 0;
    const off = changelogSettings.subscribe(() => calls++);
    changelogSettings.setEnabled(false);
    changelogSettings.setEnabled(true);
    off();
    expect(calls).toBe(1);
  });
});
