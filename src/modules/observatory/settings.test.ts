import { beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "crystal-os-observatory";

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

describe("observatory settings", () => {
  it("defaults the folder to Observatory", async () => {
    const { readObservatorySettings } = await import("./settings");
    expect(readObservatorySettings().folder).toBe("Observatory");
  });

  it("trims and strips slashes", async () => {
    const { setObservatoryFolder, readObservatorySettings } = await import("./settings");
    setObservatoryFolder(" /Study/ ");
    expect(readObservatorySettings().folder).toBe("Study");
    expect(JSON.parse(localStorage.getItem(KEY)!).folder).toBe("Study");
  });

  it("turns backslashes into slashes", async () => {
    const { setObservatoryFolder, readObservatorySettings } = await import("./settings");
    setObservatoryFolder("\\School\\Observatory\\");
    expect(readObservatorySettings().folder).toBe("School/Observatory");
  });

  it("restores the default for an empty folder", async () => {
    const { setObservatoryFolder, readObservatorySettings } = await import("./settings");
    setObservatoryFolder("Study");
    setObservatoryFolder("");
    expect(readObservatorySettings().folder).toBe("Observatory");
  });

  it("defaults the study settings", async () => {
    const { readObservatorySettings } = await import("./settings");
    expect(readObservatorySettings()).toMatchObject({ retention: 0.9, newPerDay: 10, dailyGoal: 3 });
  });

  it("saves and clamps the study settings", async () => {
    const s = await import("./settings");
    s.setObservatoryRetention(0.854);
    s.setObservatoryNewPerDay(12.4);
    s.setObservatoryDailyGoal(0);
    expect(s.readObservatorySettings()).toMatchObject({ folder: "Observatory", retention: 0.85, newPerDay: 12, dailyGoal: 1 });
    expect(JSON.parse(localStorage.getItem(KEY)!)).toMatchObject({ retention: 0.85, newPerDay: 12, dailyGoal: 1 });
    s.setObservatoryRetention(2);
    s.setObservatoryNewPerDay(-3);
    expect(s.readObservatorySettings()).toMatchObject({ retention: 0.99, newPerDay: 0 });
  });

  it("reads stored study settings and replaces invalid ones with defaults", async () => {
    localStorage.setItem(KEY, JSON.stringify({ folder: "Study", retention: 0.8, newPerDay: "x", dailyGoal: 5, focusAsk: false, idleMinutes: 0, reminderTime: "25:00" }));
    const { readObservatorySettings } = await import("./settings");
    expect(readObservatorySettings()).toEqual({
      folder: "Study", retention: 0.8, newPerDay: 10, dailyGoal: 5, keywordSort: true,
      focusOnTopic: true, focusOnResource: true, focusOnAnswer: true, focusAsk: false, focusAutoStop: true, idleMinutes: 1,
      reminder: false, reminderTime: "19:00",
      aiProvider: "none", aiModel: "", aiSort: false, aiThreshold: 0.75, aiDraft: false, aiExtract: false,
      deepSkyProjects: false, deepSkyFolders: [], deepSkyRandom: false, deepSkyFillHome: false,
    });
  });

  it("keeps AI off by default and reads stored AI settings, replacing invalid ones", async () => {
    let s = await import("./settings");
    expect(s.observatoryAi()).toBeNull();
    localStorage.setItem(KEY, JSON.stringify({
      aiProvider: "gpt", aiModel: "bad model", aiSort: "yes", aiThreshold: 0.2, deepSkyFolders: [" /Projects/ ", "Projects", "../Secrets", "", 5, "Code\\Apps"],
    }));
    vi.resetModules();
    s = await import("./settings");
    expect(s.readObservatorySettings()).toMatchObject({ aiProvider: "none", aiModel: "", aiSort: false, aiThreshold: 0.5, deepSkyFolders: ["Projects", "Code/Apps"] });
  });

  it("saves the AI provider, model, threshold and Deep Sky folders", async () => {
    const s = await import("./settings");
    s.setObservatoryAiProvider("nim");
    s.setObservatoryAiModel(" moonshotai/kimi-k3 ");
    s.setObservatoryAiThreshold(0.999);
    s.setObservatoryDeepSkyFolders(["Projects/", "Projects"]);
    s.setObservatoryFlag("aiSort", true);
    expect(s.observatoryAi()).toEqual({ provider: "nim", model: "moonshotai/kimi-k3" });
    expect(JSON.parse(localStorage.getItem(KEY)!)).toMatchObject({ aiProvider: "nim", aiThreshold: 0.95, deepSkyFolders: ["Projects"], aiSort: true });
    s.setObservatoryAiProvider("none");
    expect(s.observatoryAi()).toBeNull();
  });

  it("keeps keyword sorting on by default and saves it", async () => {
    localStorage.setItem(KEY, JSON.stringify({ keywordSort: "no" }));
    const s = await import("./settings");
    expect(s.readObservatorySettings().keywordSort).toBe(true);
    s.setObservatoryKeywordSort(false);
    expect(s.readObservatorySettings().keywordSort).toBe(false);
    expect(JSON.parse(localStorage.getItem(KEY)!).keywordSort).toBe(false);
  });

  it("reads corrupt stored JSON as the default", async () => {
    localStorage.setItem(KEY, "{nope");
    const { readObservatorySettings } = await import("./settings");
    expect(readObservatorySettings().folder).toBe("Observatory");
  });
});
