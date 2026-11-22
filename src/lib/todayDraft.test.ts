import { beforeEach, describe, expect, it } from "vitest";
import { pastDrafts, readDrafts, writeDraft } from "./todayDraft";

const draft = (path: string) => ({ path, entry: { focus: path, mood: null, reflection: "" } });

describe("todayDraft", () => {
  beforeEach(() => localStorage.clear());

  it("keeps one draft per day, clears it, and drops ones older than two weeks", () => {
    const now = new Date("2026-11-22T12:00:00Z");
    writeDraft("2026-11-01", draft("old"), new Date("2026-11-01T12:00:00Z"));
    writeDraft("2026-11-21", draft("a"), now);
    writeDraft("2026-11-22", draft("b"), now);
    expect(Object.keys(readDrafts())).toEqual(["2026-11-21", "2026-11-22"]);
    expect(pastDrafts(readDrafts(), "2026-11-22").map(([d]) => d)).toEqual(["2026-11-21"]);
    writeDraft("2026-11-21", null, now);
    expect(Object.keys(readDrafts())).toEqual(["2026-11-22"]);
  });
});
