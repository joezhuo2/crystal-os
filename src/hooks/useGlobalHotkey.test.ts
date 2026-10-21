import { afterEach, describe, expect, it, vi } from "vitest";

const toast = vi.fn();
const notify = vi.fn();
vi.mock("sonner", () => ({ toast }));
vi.mock("@/lib/notifications", () => ({ notify }));

const { toggleDoNotDisturb } = await import("./useGlobalHotkey");
const { notifySettings } = await import("@/lib/notifySettings");

afterEach(() => {
  notifySettings.setFlag("doNotDisturb", false);
  vi.restoreAllMocks();
  toast.mockClear();
  notify.mockClear();
});

describe("toggleDoNotDisturb", () => {
  it("flips the switch and toasts while the window is focused", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    toggleDoNotDisturb();
    expect(notifySettings.getState().doNotDisturb).toBe(true);
    expect(toast).toHaveBeenCalledWith("Do Not Disturb on", { description: "Notifications are silenced." });
    toggleDoNotDisturb();
    expect(notifySettings.getState().doNotDisturb).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });

  it("confirms with a desktop notification, past DND, when another app has focus", () => {
    vi.spyOn(document, "hasFocus").mockReturnValue(false);
    toggleDoNotDisturb();
    expect(notify).toHaveBeenCalledWith({ title: "Do Not Disturb on", body: "Notifications are silenced." }, true);
    expect(toast).not.toHaveBeenCalled();
  });
});
