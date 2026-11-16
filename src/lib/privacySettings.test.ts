import { beforeEach, describe, expect, it } from "vitest";
import { PEEK_HOLD_MS, PRIVACY_MODE_KEY, createPrivacyKey, parsePrivacyMode, privacySettings } from "./privacySettings";

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

describe("createPrivacyKey", () => {
  it("toggles on a tap", () => {
    let t = 0;
    const key = createPrivacyKey(() => t);
    key.down();
    expect(privacySettings.blurred()).toBe(false);
    t = PEEK_HOLD_MS - 1;
    key.up();
    expect(privacySettings.getState()).toBe(false);
    key.down();
    key.up();
    expect(privacySettings.getState()).toBe(true);
    expect(privacySettings.blurred()).toBe(true);
  });

  it("peeks while held and blurs again on release", () => {
    let t = 0;
    const key = createPrivacyKey(() => t);
    key.down();
    expect(privacySettings.blurred()).toBe(false);
    t = PEEK_HOLD_MS;
    key.up();
    expect(privacySettings.getState()).toBe(true);
    expect(privacySettings.blurred()).toBe(true);
  });

  it("ends a peek without toggling when the window loses focus", () => {
    const key = createPrivacyKey(() => 0);
    key.down();
    key.cancel();
    key.up();
    expect(privacySettings.getState()).toBe(true);
    expect(privacySettings.blurred()).toBe(true);
  });
});
