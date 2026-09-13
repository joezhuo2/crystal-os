import { afterEach, describe, expect, it, vi } from "vitest";
import { SIDECAR_ORIGIN, apiUrl, isDesktop, openExternal } from "./platform";

const { openUrl } = vi.hoisted(() => ({ openUrl: vi.fn() }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl }));

function setDesktop(on: boolean) {
  const w = window as unknown as Record<string, unknown>;
  if (on) w.__TAURI_INTERNALS__ = {};
  else delete w.__TAURI_INTERNALS__;
}

afterEach(() => {
  setDesktop(false);
  openUrl.mockReset();
});

describe("isDesktop", () => {
  it("is false in a plain browser", () => {
    expect(isDesktop()).toBe(false);
  });

  it("is true inside the Tauri webview", () => {
    setDesktop(true);
    expect(isDesktop()).toBe(true);
  });
});

describe("apiUrl", () => {
  it("keeps paths relative on the web, dev or prod", () => {
    expect(apiUrl("/api/obsidian/notes", true)).toBe("/api/obsidian/notes");
    expect(apiUrl("/api/obsidian/notes", false)).toBe("/api/obsidian/notes");
  });

  it("keeps paths relative in dev:desktop, where Vite serves the API", () => {
    setDesktop(true);
    expect(apiUrl("/api/calendar/status", true)).toBe("/api/calendar/status");
  });

  it("targets the sidecar in the packaged desktop app", () => {
    setDesktop(true);
    expect(apiUrl("/api/calendar/status", false)).toBe(`${SIDECAR_ORIGIN}/api/calendar/status`);
  });
});

describe("openExternal", () => {
  it("opens the system browser on desktop", async () => {
    setDesktop(true);
    await openExternal("https://accounts.google.com/o/oauth2/auth");
    expect(openUrl).toHaveBeenCalledWith("https://accounts.google.com/o/oauth2/auth");
  });

  it("navigates the page on the web", async () => {
    const original = window.location;
    const location = { href: "" } as Location;
    Object.defineProperty(window, "location", { configurable: true, value: location });
    try {
      await openExternal("https://accounts.google.com/o/oauth2/auth");
      expect(location.href).toBe("https://accounts.google.com/o/oauth2/auth");
      expect(openUrl).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: original });
    }
  });
});
