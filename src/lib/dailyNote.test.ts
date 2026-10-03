import { describe, expect, it } from "vitest";
import { dailyNotePath, mergeToday, parseToday, pickDailyFolder, type TodayEntry } from "./dailyNote";

const entry: TodayEntry = { focus: "Ship the Orbit", mood: "good", reflection: "" };

describe("pickDailyFolder", () => {
  it("uses the folder of the newest existing daily note", () => {
    expect(pickDailyFolder(["Notes/a.md", "Journal/2026-09-01.md", "Old/2025-01-01.md", "Journal/2026-10-02.md"])).toBe("Journal");
  });

  it("keeps daily notes at the vault root when that is where they are", () => {
    expect(pickDailyFolder(["2026-10-01.md", "Ideas.md"])).toBe("");
  });

  it("falls back to Daily when the vault has no daily notes", () => {
    expect(pickDailyFolder(["Ideas.md", "Reviews/Weekly/2026-W39.md"])).toBe("Daily");
  });
});

describe("dailyNotePath", () => {
  it("joins the folder and the day", () => {
    expect(dailyNotePath("Daily", "2026-10-03")).toBe("Daily/2026-10-03.md");
    expect(dailyNotePath("", "2026-10-03")).toBe("2026-10-03.md");
  });
});

describe("mergeToday", () => {
  it("creates a tagged note when there is none", () => {
    const out = mergeToday(null, entry);
    expect(out).toMatch(/^---\ntags: \[daily\]\n---\n/);
    expect(out).toContain("**Focus:** Ship the Orbit");
    expect(out).toContain("**Mood:** good");
    expect(out).not.toContain("Reflection");
  });

  it("appends the block and the tag to an existing note, leaving the rest alone", () => {
    const raw = "---\ntags: [journal]\naliases: [x]\n---\n# Saturday\n\nWent for a walk.\n";
    const out = mergeToday(raw, { ...entry, reflection: "Good day" });
    expect(out).toContain("tags: [journal, daily]");
    expect(out).toContain("aliases: [x]");
    expect(out).toContain("# Saturday\n\nWent for a walk.\n");
    expect(out.indexOf("Went for a walk")).toBeLessThan(out.indexOf("<!-- crystal-os:today -->"));
    expect(out).toContain("**Reflection:** Good day");
  });

  it("replaces only its own block on a second save", () => {
    const first = mergeToday("# Notes\n\nBefore.\n", entry);
    const edited = first + "\nAdded in Obsidian.\n";
    const second = mergeToday(edited, { focus: "Rest", mood: "great", reflection: "" });
    expect(second.match(/<!-- crystal-os:today -->/g)).toHaveLength(1);
    expect(second).toContain("**Focus:** Rest");
    expect(second).not.toContain("Ship the Orbit");
    expect(second).toContain("Before.");
    expect(second).toContain("Added in Obsidian.");
    expect(second.match(/daily/g)).toHaveLength(1);
  });

  it("keeps each field on one line", () => {
    const out = mergeToday(null, { focus: "a\nb", mood: null, reflection: "c\r\nd" });
    expect(out).toContain("**Focus:** a b");
    expect(out).toContain("**Reflection:** c d");
    expect(out).not.toContain("Mood");
  });
});

describe("parseToday", () => {
  it("round-trips what mergeToday wrote", () => {
    const full = { focus: "Ship it", mood: "rough" as const, reflection: "Long one" };
    expect(parseToday(mergeToday("# Hi\n", full))).toEqual(full);
  });

  it("returns an empty entry for a note without the block", () => {
    expect(parseToday("# Just notes\n")).toEqual({ focus: "", mood: null, reflection: "" });
  });

  it("ignores an unknown mood", () => {
    const raw = "<!-- crystal-os:today -->\n**Mood:** ecstatic\n<!-- /crystal-os:today -->\n";
    expect(parseToday(raw).mood).toBeNull();
  });
});
