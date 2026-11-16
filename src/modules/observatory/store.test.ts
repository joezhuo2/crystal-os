import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  emptyProgress,
  parseCourse,
  parseProgress,
  parseTopic,
  ProgressError,
  serializeCourse,
  serializeProgress,
  serializeTopic,
  type Course,
  type Topic,
} from "./model";

const files = new Map<string, { content: string; mtime: number }>();
let clock = 1;
let conflicts = 0;
const calls: string[] = [];

class Conflict extends Error {
  code = "conflict";
}

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
    calls.push(`create ${path}`);
    if (!overwrite && files.has(path)) throw new Conflict("exists");
    return { ...put(path, content), created: true };
  }),
  saveVaultNote: vi.fn(async ({ path, content, expectedMtime }: { path: string; content: string; expectedMtime: number }) => {
    calls.push(`save ${path}`);
    if (conflicts > 0) {
      conflicts--;
      throw new Conflict("changed");
    }
    if (files.get(path)?.mtime !== expectedMtime) throw new Conflict("changed");
    return put(path, content);
  }),
}));

const moveVaultPath = vi.fn(async (from: string, to: string) => {
  calls.push(`move ${from} ${to}`);
  for (const [p, f] of [...files]) {
    if (p.startsWith(`${from}/`)) {
      files.delete(p);
      files.set(p.replace(from, to), f);
    }
  }
  return { path: to };
});

vi.mock("@/lib/vaultNative", async (orig) => ({
  ...(await orig<typeof import("@/lib/vaultNative")>()),
  moveVaultPath: (from: string, to: string) => moveVaultPath(from, to),
  listNotesNative: vi.fn(async () => [...files.keys()].map((path) => ({ path }))),
  trashVaultPath: vi.fn(async (path: string) => ({ path: `.trash/${path.split("/").pop()}` })),
  restoreVaultPath: vi.fn(async (_trash: string, to: string) => ({ path: to })),
}));

let desktop = true;
vi.mock("@/lib/platform", () => ({ isDesktop: () => desktop }));

import { parseFrontmatter, restoreVaultPath, trashVaultPath } from "@/lib/vaultNative";
import { mergeOutline } from "./model";
import type { ParsedOutline } from "./outline";
import {
  applyOutlineMerge,
  CourseExistsError,
  createCourse,
  deleteCourse,
  renameCourse,
  restoreCourse,
  saveCourse,
  saveQuestion,
  saveTopic,
  STARTER_COURSES,
  updateProgress,
} from "./store";

const course: Course = {
  code: "MATH117", name: "Calculus 1", term: "2026F", color: "#fff",
  keywords: [], outcomes: [], exams: [], assessments: [], archived: false,
};
const topic = (slug: string): Topic => ({
  slug, course: "MATH117", title: slug, priority: "medium", objective: false, weeks: [1],
  sections: [], sources: [], tasks: [], events: [], body: "Body",
});

beforeEach(() => {
  files.clear();
  calls.length = 0;
  conflicts = 0;
  desktop = true;
});

describe("createCourse", () => {
  it("writes course, progress and topics", async () => {
    await createCourse("Observatory", course, [topic("limits"), topic("derivatives")]);
    expect([...files.keys()].sort()).toEqual([
      "Observatory/MATH117/_course.md",
      "Observatory/MATH117/progress.md",
      "Observatory/MATH117/topics/derivatives.md",
      "Observatory/MATH117/topics/limits.md",
    ]);
    expect(parseCourse(files.get("Observatory/MATH117/_course.md")!.content)).toEqual(course);
  });

  it("throws CourseExistsError and writes nothing else", async () => {
    put("Observatory/MATH117/_course.md", serializeCourse(course));
    calls.length = 0;
    await expect(createCourse("Observatory", course, [topic("limits")])).rejects.toThrow(CourseExistsError);
    expect(files.size).toBe(1);
  });

  it("refuses an invalid code", async () => {
    await expect(createCourse("Observatory", { ...course, code: "" })).rejects.toThrow();
    expect(files.size).toBe(0);
  });

  it("writes the course code into topics", async () => {
    await createCourse("Observatory", course, [{ ...topic("limits"), course: "MATH 117" }]);
    expect(parseTopic(files.get("Observatory/MATH117/topics/limits.md")!.content, "limits").course).toBe("MATH117");
  });
});

describe("saveCourse", () => {
  const path = "Observatory/MATH117/_course.md";

  it("refuses an invalid code", async () => {
    await expect(saveCourse("Observatory", { ...course, code: "" })).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  it("saves the change", async () => {
    put(path, serializeCourse(course));
    await saveCourse("Observatory", { ...course, name: "Calc" });
    expect(parseCourse(files.get(path)!.content).name).toBe("Calc");
  });

  it("keeps tags, unknown keys and the body, and clears a removed learn URL", async () => {
    put(path, "---\ncode: MATH117\ntags: [x]\ndate: 2026-11-15\nmine: 1\nlearn_url: https://old\n---\n# Notes\n\nProse.\n");
    await saveCourse("Observatory", { ...course, name: "Calc" });
    const { data, content } = parseFrontmatter(files.get(path)!.content);
    expect(data).toMatchObject({ tags: ["x"], mine: 1, date: "2026-11-15", name: "Calc" });
    expect(data).not.toHaveProperty("learn_url");
    expect(content).toBe("# Notes\n\nProse.\n");
  });

  it("refuses to overwrite a file changed in between", async () => {
    put(path, serializeCourse(course));
    conflicts = 1;
    await expect(saveCourse("Observatory", course)).rejects.toMatchObject({ code: "conflict" });
  });
});

describe("saveTopic", () => {
  const path = "Observatory/MATH117/topics/limits.md";

  it("patches frontmatter and keeps unknown keys and the body", async () => {
    put(path, "---\ncourse: MATH117\ntitle: Limits\npriority: medium\nmine: 1\n---\n# Limits\n\nProse.\n");
    await saveTopic("Observatory", "MATH117", "limits", { priority: "low" });
    const { data, content } = parseFrontmatter(files.get(path)!.content);
    expect(data).toMatchObject({ priority: "low", mine: 1, title: "Limits" });
    expect(content).toBe("# Limits\n\nProse.\n");
  });

  it("surfaces a conflict and leaves the file alone", async () => {
    put(path, serializeTopic(topic("limits")));
    const before = files.get(path);
    conflicts = 1;
    await expect(saveTopic("Observatory", "MATH117", "limits", { priority: "high" })).rejects.toMatchObject({ code: "conflict" });
    expect(files.get(path)).toBe(before);
  });
});

describe("saveQuestion", () => {
  const path = "Observatory/MATH117/topics/limits.md";
  const head = "---\ncourse: MATH117\n# keep me\ntitle: Limits\n---\n";

  it("appends a callout with a new id and keeps the frontmatter text", async () => {
    put(path, `${head}Intro.\n`);
    const id = await saveQuestion("Observatory", "MATH117", "limits", { type: "card", prompt: "Front", answer: "Back" });
    expect(id).toMatch(/^q-[0-9a-z]{4}$/);
    expect(files.get(path)!.content).toBe(`${head}Intro.\n\n> [!question] ${id}\n> Front\n>> [!answer]-\n>> Back\n`);
  });

  it("replaces the question with the same id", async () => {
    put(path, `${head}> [!question] q-1 type=output\n> old\n>> [!answer]-\n>> x\n\nAfter.\n`);
    await saveQuestion("Observatory", "MATH117", "limits", { id: "q-1", type: "card", prompt: "New", answer: "y" });
    expect(files.get(path)!.content).toBe(`${head}> [!question] q-1\n> New\n>> [!answer]-\n>> y\n\nAfter.\n`);
  });

  it("surfaces a conflict", async () => {
    put(path, head);
    conflicts = 1;
    await expect(saveQuestion("Observatory", "MATH117", "limits", { type: "card", prompt: "a", answer: "b" })).rejects.toMatchObject({ code: "conflict" });
    expect(files.get(path)!.content).toBe(head);
  });
});

describe("updateProgress", () => {
  const path = "Observatory/MATH117/progress.md";
  const change = (p: ReturnType<typeof emptyProgress>) => ({ ...p, mastery: { ...p.mastery, limits: 0.5 } });

  it("applies the change and the file parses back to it", async () => {
    put(path, serializeProgress(emptyProgress(), "No reviews yet."));
    const result = await updateProgress("Observatory", "MATH117", change);
    expect(result.mastery).toEqual({ limits: 0.5 });
    expect(parseProgress(files.get(path)!.content).mastery).toEqual({ limits: 0.5 });
  });

  it("creates a missing file", async () => {
    await updateProgress("Observatory", "MATH117", change);
    expect(parseProgress(files.get(path)!.content).mastery).toEqual({ limits: 0.5 });
  });

  it("retries once on a conflict", async () => {
    put(path, serializeProgress(emptyProgress(), "x"));
    conflicts = 1;
    await updateProgress("Observatory", "MATH117", change);
    expect(parseProgress(files.get(path)!.content).mastery).toEqual({ limits: 0.5 });
  });

  it("throws after two conflicts", async () => {
    put(path, serializeProgress(emptyProgress(), "x"));
    conflicts = 2;
    await expect(updateProgress("Observatory", "MATH117", change)).rejects.toMatchObject({ code: "conflict" });
  });

  it("builds the summary from the saved progress when given a function", async () => {
    await updateProgress("Observatory", "MATH117", change, (p) => `${Object.keys(p.mastery).length} topics`);
    expect(files.get(path)!.content).toContain("\n1 topics\n");
  });

  it("throws ProgressError on corrupt progress and saves nothing", async () => {
    put(path, "```json\n{oops\n```");
    await expect(updateProgress("Observatory", "MATH117", change)).rejects.toThrow(ProgressError);
    expect(calls).toEqual([]);
  });
});

describe("renameCourse", () => {
  it("moves the folder then rewrites the course and topics", async () => {
    put("Observatory/MATH117/_course.md", serializeCourse(course));
    put("Observatory/MATH117/topics/limits.md", serializeTopic(topic("limits")));
    put("Observatory/MATH117/progress.md", "p");
    await renameCourse("Observatory", "MATH117", { ...course, code: "MATH118" });
    expect(calls[0]).toBe("move Observatory/MATH117 Observatory/MATH118");
    expect(parseCourse(files.get("Observatory/MATH118/_course.md")!.content).code).toBe("MATH118");
    const t = parseTopic(files.get("Observatory/MATH118/topics/limits.md")!.content, "limits");
    expect(t.course).toBe("MATH118");
    expect(t.body).toBe("Body");
  });

  it("keeps unknown keys and bodies, and skips topics whose YAML is broken", async () => {
    put("Observatory/MATH117/_course.md", "---\ncode: MATH117\nmine: 1\n---\nCourse prose\n");
    put("Observatory/MATH117/topics/limits.md", "---\ncourse: MATH117\ntitle: Limits\nextra: [a]\n---\nTopic prose\n");
    const broken = "---\ncourse: MATH117\ntitle: [oops\n---\nKeep me\n";
    put("Observatory/MATH117/topics/broken.md", broken);
    const skipped = await renameCourse("Observatory", "MATH117", { ...course, code: "MATH118" });
    expect(skipped).toEqual(["Observatory/MATH118/topics/broken.md"]);
    expect(files.get("Observatory/MATH118/topics/broken.md")!.content).toBe(broken);
    expect(parseFrontmatter(files.get("Observatory/MATH118/_course.md")!.content)).toMatchObject({
      data: { code: "MATH118", mine: 1 },
      content: "Course prose\n",
    });
    expect(parseFrontmatter(files.get("Observatory/MATH118/topics/limits.md")!.content)).toMatchObject({
      data: { course: "MATH118", title: "Limits", extra: ["a"] },
      content: "Topic prose\n",
    });
  });

  it("refuses on web and for an invalid code", async () => {
    desktop = false;
    await expect(renameCourse("Observatory", "MATH117", { ...course, code: "MATH118" })).rejects.toThrow();
    desktop = true;
    await expect(renameCourse("Observatory", "MATH117", { ...course, code: "" })).rejects.toThrow();
    expect(calls).toEqual([]);
  });
});

describe("applyOutlineMerge", () => {
  const outline: ParsedOutline = {
    code: "MATH117", name: "Calculus 1 for Engineering", term: "2026F", outcomes: ["New"], exams: [], assessments: [],
    topics: [
      { title: "limits", weeks: [2, 3], sections: ["S1"], objective: false },
      { title: "Series", weeks: [9], pages: "1-2", sections: [], objective: true },
    ],
  };

  it("rewrites the course, adds and updates topics, and leaves progress and other topics alone", async () => {
    put("Observatory/MATH117/_course.md", "---\ncode: MATH117\nmine: 1\n---\nCourse prose\n");
    put("Observatory/MATH117/topics/limits.md", "---\ncourse: MATH117\ntitle: limits\npriority: low\npages: 4-5\nextra: 1\nweeks: [1]\n---\nMy notes\n");
    put("Observatory/MATH117/topics/other.md", "---\ntitle: other\n---\nOther\n");
    put("Observatory/MATH117/progress.md", "p");
    const other = files.get("Observatory/MATH117/topics/other.md")!;
    const topics = [parseTopic(files.get("Observatory/MATH117/topics/limits.md")!.content, "limits"), parseTopic(other.content, "other")];
    calls.length = 0;

    expect(await applyOutlineMerge("Observatory", "MATH117", mergeOutline({ ...course, color: "#abc" }, topics, outline))).toEqual([]);

    expect(parseFrontmatter(files.get("Observatory/MATH117/_course.md")!.content)).toMatchObject({
      data: { mine: 1, name: "Calculus 1 for Engineering", outcomes: ["New"], color: "#abc" },
      content: "Course prose\n",
    });
    const limits = parseFrontmatter(files.get("Observatory/MATH117/topics/limits.md")!.content);
    expect(limits.content).toBe("My notes\n");
    expect(limits.data).toMatchObject({ weeks: [2, 3], sections: ["S1"], priority: "low", extra: 1 });
    expect(limits.data).not.toHaveProperty("pages");
    expect(parseTopic(files.get("Observatory/MATH117/topics/series.md")!.content, "series")).toMatchObject({ priority: "high", pages: "1-2" });
    expect(files.get("Observatory/MATH117/topics/other.md")).toBe(other);
    expect(calls.some((c) => c.includes("progress.md"))).toBe(false);
  });
});

describe("deleteCourse", () => {
  it("moves the folder to the trash and restores it", async () => {
    expect(await deleteCourse("Observatory", "MATH117")).toBe(".trash/MATH117");
    expect(trashVaultPath).toHaveBeenCalledWith("Observatory/MATH117");
    await restoreCourse(".trash/MATH117", "Observatory", "MATH117");
    expect(restoreVaultPath).toHaveBeenCalledWith(".trash/MATH117", "Observatory/MATH117");
  });

  it("refuses on web", async () => {
    desktop = false;
    await expect(deleteCourse("Observatory", "MATH117")).rejects.toThrow();
    await expect(restoreCourse(".trash/MATH117", "Observatory", "MATH117")).rejects.toThrow();
  });
});

describe("STARTER_COURSES", () => {
  it("lists the four starters", () => {
    expect(STARTER_COURSES.map((c) => c.code)).toEqual(["MATH117", "MATH115", "ECE105", "ECE150"]);
  });
});
