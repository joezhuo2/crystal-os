import { describe, expect, it } from "vitest";
import {
  PRESETS,
  badgeLabel,
  badgeTotal,
  createCustomApp,
  faviconUrl,
  isValidId,
  makeId,
  normalizeUrl,
  parseBadge,
  parseStoredApps,
} from "./portalApps";

describe("normalizeUrl", () => {
  it("adds https:// when the scheme is missing", () => {
    expect(normalizeUrl("github.com")).toBe("https://github.com/");
    expect(normalizeUrl("  app.example.com/inbox ")).toBe("https://app.example.com/inbox");
    expect(normalizeUrl("example.com:8443/x")).toBe("https://example.com:8443/x");
  });

  it("keeps https addresses", () => {
    expect(normalizeUrl("https://discord.com/app")).toBe("https://discord.com/app");
  });

  it("rejects anything that is not https with a real host", () => {
    expect(normalizeUrl("")).toBeNull();
    expect(normalizeUrl("http://example.com")).toBeNull();
    expect(normalizeUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeUrl("file:///C:/Windows")).toBeNull();
    expect(normalizeUrl("localhost")).toBeNull();
    expect(normalizeUrl("https://user:pass@example.com")).toBeNull();
    expect(normalizeUrl("not a url")).toBeNull();
  });
});

describe("makeId", () => {
  it("slugs the name", () => {
    expect(makeId("My Cool App!", [])).toBe("my-cool-app");
    expect(makeId("   ", [])).toBe("app");
  });

  it("stays unique", () => {
    expect(makeId("Discord", ["discord", "discord-2"])).toBe("discord-3");
  });

  it("produces ids Rust accepts", () => {
    expect(isValidId(makeId("x".repeat(80), []))).toBe(true);
    expect(isValidId(makeId("Ünïcode ☃ name", []))).toBe(true);
  });
});

describe("createCustomApp", () => {
  it("builds an app from valid input", () => {
    const result = createCustomApp(" GitHub ", "github.com", PRESETS.slice(0, 1));
    expect(result).toEqual({ ok: true, app: { id: "github", name: "GitHub", url: "https://github.com/" } });
  });

  it("explains what is wrong", () => {
    expect(createCustomApp("", "github.com", [])).toMatchObject({ ok: false });
    expect(createCustomApp("GitHub", "http://github.com", [])).toMatchObject({ ok: false });
  });
});

describe("parseStoredApps", () => {
  it("returns an empty list for missing or corrupt data", () => {
    expect(parseStoredApps(null)).toEqual([]);
    expect(parseStoredApps("{not json")).toEqual([]);
    expect(parseStoredApps('{"id":"x"}')).toEqual([]);
  });

  it("reads keepLive only when it is stored as true", () => {
    const raw = JSON.stringify([
      { id: "discord", name: "Discord", url: "https://discord.com/app", keepLive: true },
      { id: "insta", name: "Instagram", url: "https://www.instagram.com/", keepLive: false },
      { id: "reddit", name: "Reddit", url: "https://www.reddit.com/" },
      { id: "slack", name: "Slack", url: "https://app.slack.com/client", keepLive: "yes" },
    ]);
    const apps = parseStoredApps(raw);
    expect(apps[0].keepLive).toBe(true);
    // Off is absent rather than false, so apps stored before the setting
    // existed parse to exactly the object they used to.
    expect(apps[1]).toEqual({ id: "insta", name: "Instagram", url: "https://www.instagram.com/" });
    expect(apps[2]).toEqual({ id: "reddit", name: "Reddit", url: "https://www.reddit.com/" });
    expect(apps[3].keepLive).toBeUndefined();
  });

  it("reads keepLoaded only when it is stored as false", () => {
    const raw = JSON.stringify([
      { id: "discord", name: "Discord", url: "https://discord.com/app", keepLoaded: false },
      { id: "insta", name: "Instagram", url: "https://www.instagram.com/", keepLoaded: true },
      { id: "slack", name: "Slack", url: "https://app.slack.com/client", keepLoaded: "no" },
    ]);
    const apps = parseStoredApps(raw);
    expect(apps[0].keepLoaded).toBe(false);
    // On is the default and is absent.
    expect(apps[1]).toEqual({ id: "insta", name: "Instagram", url: "https://www.instagram.com/" });
    expect(apps[2].keepLoaded).toBeUndefined();
  });

  it("drops malformed, unsafe, and duplicate entries", () => {
    const raw = JSON.stringify([
      { id: "discord", name: "Discord", url: "https://discord.com/app" },
      { id: "discord", name: "Again", url: "https://discord.com/app" },
      { id: "../evil", name: "Evil", url: "https://evil.com" },
      { id: "plain", name: "Plain", url: "http://insecure.com" },
      { id: "noname", name: " ", url: "https://a.com" },
      42,
    ]);
    expect(parseStoredApps(raw)).toEqual([{ id: "discord", name: "Discord", url: "https://discord.com/app" }]);
  });
});

describe("parseBadge", () => {
  it("reads counts", () => {
    expect(parseBadge("(3) Discord | #general")).toBe(3);
    expect(parseBadge("(12) Outlook")).toBe(12);
    expect(parseBadge("(99+) Inbox")).toBe(99);
  });

  it("reads unread markers as a dot", () => {
    expect(parseBadge("• Discord")).toBe("dot");
    expect(parseBadge("* Slack | general")).toBe("dot");
    expect(parseBadge("! Slack | general")).toBe("dot");
  });

  it("returns null when nothing is unread", () => {
    expect(parseBadge("Discord")).toBeNull();
    expect(parseBadge("(0) Discord")).toBeNull();
    expect(parseBadge("Instagram (2)")).toBeNull();
    expect(parseBadge("")).toBeNull();
  });
});

describe("badgeTotal", () => {
  it("sums counts, falls back to a dot, or null", () => {
    expect(badgeTotal({ a: 2, b: "dot", c: 5 })).toBe(7);
    expect(badgeTotal({ a: "dot" })).toBe("dot");
    expect(badgeTotal({})).toBeNull();
  });

  it("labels large counts", () => {
    expect(badgeLabel(7)).toBe("7");
    expect(badgeLabel(250)).toBe("99+");
    expect(badgeLabel("dot")).toBe("");
  });
});

describe("presets", () => {
  it("all have valid ids, https urls, and favicons", () => {
    for (const preset of PRESETS) {
      expect(isValidId(preset.id)).toBe(true);
      expect(normalizeUrl(preset.url)).toBe(preset.url);
      expect(faviconUrl(preset.url)).toMatch(/^https:\/\/[^/]+\/favicon\.ico$/);
    }
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
  });
});
