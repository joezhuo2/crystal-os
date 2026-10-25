import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initNotificationBridges } from "./notifications";
import { portal } from "./portalStore";

const { sendNotification, focus } = vi.hoisted(() => ({
  sendNotification: vi.fn(),
  focus: { handler: null as null | ((e: { payload: boolean }) => void) },
}));
vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: () => Promise.resolve(true),
  requestPermission: () => Promise.resolve("granted"),
  sendNotification,
}));
vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    onFocusChanged: (cb: (e: { payload: boolean }) => void) => {
      focus.handler = cb;
      return Promise.resolve(() => {
        focus.handler = null;
      });
    },
  }),
}));

const discord = { id: "discord", name: "Discord", url: "https://discord.com/app" };
const insta = { id: "instagram", name: "Instagram", url: "https://www.instagram.com/" };

async function flush() {
  await vi.dynamicImportSettled();
  await new Promise((r) => setTimeout(r, 0));
}

function toasted() {
  return sendNotification.mock.calls.map(([alert]) => (alert as { title: string }).title);
}

let stop: () => void;
let documentFocused = false;

beforeEach(async () => {
  localStorage.clear();
  portal._reset();
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  vi.spyOn(document, "hasFocus").mockImplementation(() => documentFocused);
  document.body.classList.add("portal-theme");
  portal.add(discord);
  portal.add(insta);
  portal.setTitle("discord", "Discord");
  portal.setTitle("instagram", "Instagram");
  stop = initNotificationBridges();
  await flush();
});

afterEach(() => {
  stop();
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  document.body.classList.remove("portal-theme");
  vi.restoreAllMocks();
  sendNotification.mockClear();
  documentFocused = false;
});

describe("Portal notification bridge", () => {
  it("announces every app while the window is not focused, even left on the Portal", async () => {
    focus.handler?.({ payload: false });
    portal.setTitle("instagram", "(1) Instagram");
    await flush();
    portal.setTitle("discord", "(1) Discord");
    await flush();
    expect(toasted()).toEqual(["Instagram", "Discord"]);
  });

  it("skips only the app being typed in", async () => {
    focus.handler?.({ payload: true });
    portal.setTitle("instagram", "(1) Instagram");
    await flush();
    portal.setTitle("discord", "(1) Discord");
    await flush();
    expect(toasted()).toEqual(["Discord"]);
  });

  it("stays quiet while Crystal OS itself has focus", async () => {
    focus.handler?.({ payload: true });
    documentFocused = true;
    portal.setTitle("discord", "(1) Discord");
    await flush();
    expect(toasted()).toEqual([]);
  });
});
