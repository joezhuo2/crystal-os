import { beforeEach, describe, expect, it } from "vitest";
import { PRIVACY_MODE_KEY, parsePrivacyMode, privacySettings } from "./privacySettings";

beforeEach(() => {
  localStorage.clear();
  privacySettings._reset();
});

describe("privacySettings", () => {
  it("is on by default", () => {
    expect(parsePrivacyMode(null)).toBe(true);
    expect(parsePrivacyMode("garbage")).toBe(true);
    expect(privacySettings.getState()).toBe(true);
  });

  it("stays off once switched off", () => {
    privacySettings.setEnabled(false);
    expect(localStorage.getItem(PRIVACY_MODE_KEY)).toBe("false");
    privacySettings._reset();
    expect(privacySettings.getState()).toBe(false);
  });

  it("notifies listeners only on a change", () => {
    let calls = 0;
    const off = privacySettings.subscribe(() => calls++);
    privacySettings.setEnabled(true);
    privacySettings.setEnabled(false);
    off();
    expect(calls).toBe(1);
  });
});
