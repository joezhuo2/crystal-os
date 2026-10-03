import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PortalApp } from "./portalApps";
import { createPortalUnloader } from "./portalLifecycle";

const discord: PortalApp = { id: "discord", name: "Discord", url: "https://discord.com/app" };
const insta: PortalApp = { id: "instagram", name: "Instagram", url: "https://www.instagram.com/" };

function setup(initial: PortalApp[], delay = 60) {
  let apps = initial;
  let seconds = delay;
  const unload = vi.fn(async (_id: string) => true);
  const onUnloaded = vi.fn();
  const unloader = createPortalUnloader({ getApps: () => apps, getDelay: () => seconds, unload, onUnloaded });
  return {
    unloader,
    unload,
    onUnloaded,
    setApps(next: PortalApp[]) {
      apps = next;
      unloader.sync();
    },
    setDelay(next: number) {
      seconds = next;
      unloader.restart();
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("portal unloader", () => {
  it("never unloads an app with Keep loaded on (the default)", async () => {
    const t = setup([discord]);
    t.unloader.markLoaded("discord");
    t.unloader.setViewing(null);
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(t.unload).not.toHaveBeenCalled();
  });

  it("unloads a hidden app after the delay and drops its badge", async () => {
    const t = setup([{ ...discord, keepLoaded: false }], 30);
    t.unloader.setViewing("discord");
    t.unloader.markLoaded("discord");
    t.unloader.setViewing(null);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(t.unload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(t.unload).toHaveBeenCalledWith("discord");
    expect(t.onUnloaded).toHaveBeenCalledWith("discord");
    expect(t.unloader._loaded()).toEqual([]);
  });

  it("never counts down for the app on screen", async () => {
    const t = setup([{ ...discord, keepLoaded: false }], 0);
    t.unloader.setViewing("discord");
    t.unloader.markLoaded("discord");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(t.unload).not.toHaveBeenCalled();
  });

  it("cancels the countdown when the app is reopened in time", async () => {
    const t = setup([{ ...discord, keepLoaded: false }], 60);
    t.unloader.markLoaded("discord");
    t.unloader.setViewing("instagram");
    await vi.advanceTimersByTimeAsync(59_000);
    t.unloader.setViewing("discord");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(t.unload).not.toHaveBeenCalled();
    expect(t.unloader._pending()).toEqual([]);
  });

  it("starts counting down at once when Keep loaded is turned off for a hidden app", async () => {
    const t = setup([discord, insta], 5);
    t.unloader.markLoaded("discord");
    t.unloader.setViewing("instagram");
    expect(t.unloader._pending()).toEqual([]);
    t.setApps([{ ...discord, keepLoaded: false }, insta]);
    expect(t.unloader._pending()).toEqual(["discord"]);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(t.unload).toHaveBeenCalledWith("discord");
  });

  it("stops the countdown when Keep loaded is turned back on", async () => {
    const t = setup([{ ...discord, keepLoaded: false }], 5);
    t.unloader.markLoaded("discord");
    t.setApps([discord]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(t.unload).not.toHaveBeenCalled();
  });

  it("forgets a removed app", async () => {
    const t = setup([{ ...discord, keepLoaded: false }], 5);
    t.unloader.markLoaded("discord");
    t.setApps([]);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(t.unload).not.toHaveBeenCalled();
    expect(t.unloader._loaded()).toEqual([]);
  });

  it("restarts countdowns with the new delay", async () => {
    const t = setup([{ ...discord, keepLoaded: false }], 60);
    t.unloader.markLoaded("discord");
    await vi.advanceTimersByTimeAsync(50_000);
    t.setDelay(20);
    await vi.advanceTimersByTimeAsync(19_000);
    expect(t.unload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(t.unload).toHaveBeenCalledTimes(1);
  });

  it("keeps an app marked loaded when Rust refused because it was reopened", async () => {
    const t = setup([{ ...discord, keepLoaded: false }], 1);
    t.unload.mockResolvedValueOnce(false);
    t.unloader.markLoaded("discord");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(t.onUnloaded).not.toHaveBeenCalled();
    expect(t.unloader._loaded()).toEqual(["discord"]);
  });

  it("keeps an app marked loaded when it was reopened while the close was in flight", async () => {
    const t = setup([{ ...discord, keepLoaded: false }], 1);
    let finish: (closed: boolean) => void = () => undefined;
    t.unload.mockImplementationOnce(() => new Promise<boolean>((resolve) => (finish = resolve)));
    t.unloader.markLoaded("discord");
    await vi.advanceTimersByTimeAsync(1_000);
    // The user opens it; the show is queued after the close and rebuilds it.
    t.unloader.setViewing("discord");
    finish(true);
    await vi.advanceTimersByTimeAsync(0);
    t.unloader.markLoaded("discord");
    expect(t.unloader._loaded()).toEqual(["discord"]);
    expect(t.unloader._pending()).toEqual([]);
  });
});
