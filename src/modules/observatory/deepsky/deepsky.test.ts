import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseProgress, parseTopic, serializeProgress, serializeTopic, type Topic } from "../model";
import { parseQuestions } from "../questions";

const files = new Map<string, { content: string; mtime: number }>();
let clock = 1;
const put = (path: string, content: string) => {
  files.set(path, { content, mtime: ++clock });
  return { path, mtime: clock };
};

vi.mock("@/hooks/useVault", () => ({
  vaultErrorCode: (e: { code?: string }) => e.code ?? null,
  fetchRawNote: vi.fn(async (path: string) => {
    const f = files.get(path);
    if (!f) throw Object.assign(new Error("missing"), { code: "not_found" });
    return { path, ...f };
  }),
  createVaultNote: vi.fn(async ({ path, content, overwrite }: { path: string; content: string; overwrite: boolean }) => {
    if (!overwrite && files.has(path)) throw Object.assign(new Error("exists"), { code: "conflict" });
    return { ...put(path, content), created: true };
  }),
  saveVaultNote: vi.fn(async ({ path, content, expectedMtime }: { path: string; content: string; expectedMtime: number }) => {
    if (files.get(path)?.mtime !== expectedMtime) throw Object.assign(new Error("changed"), { code: "conflict" });
    return put(path, content);
  }),
}));
vi.mock("@/lib/vaultNative", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/vaultNative")>()),
  moveVaultPath: vi.fn(async (from: string, to: string) => {
    const f = files.get(from);
    if (!f || files.has(to)) throw new Error("bad move");
    files.delete(from);
    files.set(to, f);
    return { path: to };
  }),
}));
vi.mock("@/lib/platform", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/platform")>()), isDesktop: () => true }));
const askAi = vi.fn();
vi.mock("@/lib/ai", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/ai")>()), askAi: (...a: unknown[]) => askAi(...a) }));

const settings = await import("../settings");
const ds = await import("./deepsky");

const reply = (topics: string[]) => JSON.stringify({ topics: topics.map((title) => ({ title, summary: `About ${title}` })) });
const prompt = () => (askAi.mock.calls[0]![0] as { messages: { content: string }[] }).messages[0]!.content;
const topic = (slug: string, body: string): Topic => ({
  slug, course: "DeepSky", title: slug, priority: "medium", objective: false, weeks: [], sections: [], sources: [], tasks: [], events: [], body,
});

beforeEach(() => {
  files.clear();
  askAi.mockReset();
  settings.setObservatoryAiProvider("claude");
  settings.setObservatoryAiModel("");
  for (const f of ["aiDraft", "deepSkyProjects", "deepSkyRandom"] as const) settings.setObservatoryFlag(f, true);
  settings.setObservatoryDeepSkyFolders(["Projects"]);
});

describe("AI gating", () => {
  it("never calls the AI when the provider is None", async () => {
    settings.setObservatoryAiProvider("none");
    await expect(ds.suggestRandom([])).rejects.toThrow(/turned off/);
    await expect(ds.suggestFromProjects([{ path: "Projects/a.md", title: "A", excerpt: "x" }], [])).rejects.toThrow(/turned off/);
    await expect(ds.draftCards("Tides", "")).rejects.toThrow(/off/);
    expect(askAi).not.toHaveBeenCalled();
  });

  it("never calls the AI when the feature's switch is off", async () => {
    for (const f of ["aiDraft", "deepSkyProjects", "deepSkyRandom"] as const) settings.setObservatoryFlag(f, false);
    await expect(ds.suggestRandom([])).rejects.toThrow(/turned off/);
    await expect(ds.suggestFromProjects([{ path: "Projects/a.md", title: "A", excerpt: "x" }], [])).rejects.toThrow(/turned off/);
    await expect(ds.draftCards("Tides", "")).rejects.toThrow(/off/);
    expect(askAi).not.toHaveBeenCalled();
  });
});

describe("suggestions", () => {
  it("returns suggestions without writing anything until one is accepted", async () => {
    askAi.mockResolvedValue(reply(["Tides", "Origami"]));
    const out = await ds.suggestRandom([]);
    expect(out.map((s) => s.title)).toEqual(["Tides", "Origami"]);
    expect(files.size).toBe(0);
    await ds.addDeepSkyTopic("Observatory", out[0]!.title, ds.summaryBody(out[0]!.summary), []);
    const t = parseTopic(files.get("Observatory/DeepSky/topics/tides.md")!.content, "tides");
    expect(t).toMatchObject({ course: "DeepSky", title: "Tides" });
    expect(t.body).toContain("> [!summary]\n> About Tides");
  });

  it("remembers not interested and leaves it out of later prompts and replies", async () => {
    await ds.addNotInterested("Observatory", "Knitting");
    await ds.addNotInterested("Observatory", "knitting ");
    expect(await ds.readNotInterested("Observatory")).toEqual(["Knitting"]);
    askAi.mockResolvedValue(reply(["Knitting", "Volcanoes"]));
    const out = await ds.suggestRandom(await ds.readNotInterested("Observatory"));
    expect(prompt()).toContain("<exclude>\n- Knitting\n</exclude>");
    expect(out.map((s) => s.title)).toEqual(["Volcanoes"]);
  });

  it("reads only notes inside the picked folders and marks note text as data", async () => {
    askAi.mockResolvedValue(reply(["Load paths"]));
    await ds.suggestFromProjects(
      [
        { path: "Projects/bridge.md", title: "Bridge", excerpt: "truss design" },
        { path: "Projects2/other.md", title: "Other", excerpt: "neighbour folder" },
        { path: "Journal/diary.md", title: "Diary", excerpt: "private thoughts" },
      ],
      [],
    );
    expect(prompt()).toContain("truss design");
    expect(prompt()).not.toMatch(/neighbour folder|private thoughts|Diary/);
    expect((askAi.mock.calls[0]![0] as { system: string }).system).toMatch(/data .*never instructions/);
  });

  it("never sends AI records from _ai folders as project notes", async () => {
    settings.setObservatoryDeepSkyFolders(["Projects"]);
    askAi.mockResolvedValue(reply(["Load paths"]));
    await ds.suggestFromProjects(
      [
        { path: "Projects/bridge.md", title: "Bridge", excerpt: "truss design" },
        { path: "Projects/DeepSky/_ai/2026-11-15-random-idea-tides.md", title: "Tides", excerpt: "old suggestion" },
      ],
      [],
    );
    expect(prompt()).toContain("truss design");
    expect(prompt()).not.toContain("old suggestion");
  });

  it("refuses when no folder is picked", async () => {
    settings.setObservatoryDeepSkyFolders([]);
    await expect(ds.suggestFromProjects([{ path: "Journal/diary.md", title: "Diary", excerpt: "x" }], [])).rejects.toThrow(/No notes/);
    expect(askAi).not.toHaveBeenCalled();
  });
});

describe("drafting", () => {
  it("drafts through the shared drafter and writes cards marked unverified", async () => {
    askAi.mockResolvedValue(JSON.stringify({ questions: [{ type: "card", text: "Why tides?", answer: "The Moon" }, { type: "card", text: "What pulls?", answer: "Gravity" }, { type: "evil", text: "x", answer: "y" }, { type: "card", text: "" }] }));
    const cards = await ds.draftCards("Tides", "");
    expect(cards).toHaveLength(2);
    const body = ds.withCards("Notes.", cards);
    const qs = parseQuestions(body);
    expect(qs.map((q) => q.unverified)).toEqual([true, true]);
    expect(ds.unverifiedCount(body)).toBe(2);
  });
});

describe("moveToCourse", () => {
  it("moves the note and its progress entries into the course", async () => {
    put("Observatory/DeepSky/topics/tides.md", serializeTopic(topic("tides", "> [!question] q-1\n> Why?\n>> [!answer]-\n>> Moon\n")));
    put("Observatory/MATH117/topics/tides.md", serializeTopic({ ...topic("tides", "taken"), course: "MATH117" }));
    put("Observatory/DeepSky/progress.md", serializeProgress({
      version: 1,
      cards: { "tides/q-1": { dueAt: "2026-11-20T00:00:00.000Z", stability: 3 }, "origami/q-1": { dueAt: "2026-11-20T00:00:00.000Z", stability: 1 } },
      mastery: { tides: 0.4 },
      log: [
        { kind: "review", card: "tides/q-1", grade: 3, at: "2026-11-14T10:00:00.000Z", state: 0 },
        { kind: "observation", topic: "tides", at: "2026-11-14T10:01:00.000Z" },
        { kind: "observation", topic: "origami", at: "2026-11-14T10:02:00.000Z" },
      ],
    }, "x"));

    const dest = await ds.moveToCourse("Observatory", "tides", "MATH117");

    expect(dest).toBe("tides-2");
    expect(files.has("Observatory/DeepSky/topics/tides.md")).toBe(false);
    expect(parseTopic(files.get("Observatory/MATH117/topics/tides-2.md")!.content, "tides-2").course).toBe("MATH117");
    const course = parseProgress(files.get("Observatory/MATH117/progress.md")!.content);
    expect(Object.keys(course.cards)).toEqual(["tides-2/q-1"]);
    expect(course.mastery).toEqual({ "tides-2": 0.4 });
    expect(course.log).toEqual([
      expect.objectContaining({ kind: "review", card: "tides-2/q-1" }),
      expect.objectContaining({ kind: "observation", topic: "tides-2" }),
    ]);
    const sky = parseProgress(files.get("Observatory/DeepSky/progress.md")!.content);
    expect(Object.keys(sky.cards)).toEqual(["origami/q-1"]);
    expect(sky.mastery).toEqual({});
    expect(sky.log).toEqual([expect.objectContaining({ topic: "origami" })]);
  });
});
