import { beforeEach, describe, expect, it, vi } from "vitest";
import { APPS_KEY, ACTIVE_KEY, DEFAULT_PORTAL_THEME, THEME_KEY, portal, selectBadgeTotal } from "./portalStore";

const discord = { id: "discord", name: "Discord", url: "https://discord.com/app" };
const insta = { id: "instagram", name: "Instagram", url: "https://www.instagram.com/" };
const x = { id: "x", name: "X", url: "https://x.com/" };

function saved() {
  return JSON.parse(localStorage.getItem(APPS_KEY) ?? "null");
}

beforeEach(() => {
  localStorage.clear();
  portal._reset();
});

describe("portal store", () => {
  it("starts empty with the default theme", () => {
    const s = portal.getState();
    expect(s.apps).toEqual([]);
    expect(s.activeId).toBeNull();
    expect(s.theme).toBe(DEFAULT_PORTAL_THEME);
    expect(s.occluders).toBe(0);
  });

  it("falls back to no apps when storage holds corrupt JSON", () => {
    localStorage.setItem(APPS_KEY, "{oops");
    localStorage.setItem(THEME_KEY, "neon");
    portal._reset();
    expect(portal.getState().apps).toEqual([]);
    expect(portal.getState().theme).toBe(DEFAULT_PORTAL_THEME);
  });

  it("adds apps, activates the new one, and persists", () => {
    portal.add(discord);
    portal.add(insta);
    portal.add(discord);
    expect(portal.getState().apps.map((a) => a.id)).toEqual(["discord", "instagram"]);
    expect(portal.getState().activeId).toBe("instagram");
    expect(saved()).toEqual([discord, insta]);
    expect(localStorage.getItem(ACTIVE_KEY)).toBe("instagram");

    portal._reset();
    expect(portal.getState().apps).toEqual([discord, insta]);
    expect(portal.getState().activeId).toBe("instagram");
  });

  it("stores keepLive only while it is on, and survives a reload", () => {
    portal.add(discord);
    portal.add(insta);
    // Off by default, and stored exactly as apps were before the setting.
    expect(saved()).toEqual([discord, insta]);

    portal.setKeepLive("discord", true);
    expect(portal.getState().apps[0].keepLive).toBe(true);
    expect(saved()).toEqual([{ ...discord, keepLive: true }, insta]);

    portal._reset();
    expect(portal.getState().apps[0].keepLive).toBe(true);

    portal.setKeepLive("discord", false);
    expect(saved()).toEqual([discord, insta]);
  });

  it("ignores keepLive for an app that is not connected", () => {
    portal.add(discord);
    portal.setKeepLive("nope", true);
    expect(saved()).toEqual([discord]);
  });

  it("moves the active app to a neighbour on remove", () => {
    [discord, insta, x].forEach((app) => portal.add(app));
    portal.setActive("instagram");
    portal.setTitle("instagram", "(2) Instagram");
    portal.remove("instagram");
    expect(portal.getState().activeId).toBe("x");
    expect(portal.getState().badges).toEqual({});
    portal.remove("x");
    expect(portal.getState().activeId).toBe("discord");
    portal.remove("discord");
    expect(portal.getState().activeId).toBeNull();
    expect(saved()).toEqual([]);
  });

  it("reorders only with the exact same apps", () => {
    [discord, insta, x].forEach((app) => portal.add(app));
    portal.reorder(["x", "discord", "instagram"]);
    expect(saved().map((a: { id: string }) => a.id)).toEqual(["x", "discord", "instagram"]);
    portal.reorder(["x", "discord"]);
    portal.reorder(["x", "x", "discord"]);
    portal.reorder(["x", "discord", "nope"]);
    expect(portal.getState().apps.map((a) => a.id)).toEqual(["x", "discord", "instagram"]);
  });

  it("tracks badges from titles and totals them", () => {
    portal.add(discord);
    portal.add(insta);
    portal.setTitle("discord", "(3) Discord");
    portal.setTitle("instagram", "• Instagram");
    portal.setTitle("unknown", "(9) Other");
    expect(selectBadgeTotal(portal.getState())).toBe(3);
    portal.setTitle("discord", "Discord");
    expect(selectBadgeTotal(portal.getState())).toBe("dot");
    portal.setTitle("instagram", "Instagram");
    expect(selectBadgeTotal(portal.getState())).toBeNull();
  });

  it("does not notify when a title leaves the badge unchanged", () => {
    portal.add(discord);
    portal.setTitle("discord", "(1) Discord");
    const listener = vi.fn();
    const unsubscribe = portal.subscribe(listener);
    portal.setTitle("discord", "(1) Discord | #general");
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("persists the theme and ignores unknown values", () => {
    portal.setTheme("stargate");
    expect(localStorage.getItem(THEME_KEY)).toBe("stargate");
    portal.setTheme("neon" as never);
    expect(portal.getState().theme).toBe("stargate");
  });

  it("counts occluders and releases each once", () => {
    const a = portal.occlude();
    const b = portal.occlude();
    expect(portal.getState().occluders).toBe(2);
    a();
    a();
    expect(portal.getState().occluders).toBe(1);
    b();
    expect(portal.getState().occluders).toBe(0);
  });
});
