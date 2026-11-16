import { describe, expect, it } from "vitest";
import { problemSheet } from "./fixtures/samples";
import { createPool, isEdited, mergePool, parsePool, poolItemId, serializePool, type PoolNote } from "./pool";
import { extractQuestions } from "./questions-extract";

const fresh = () => createPool("question-sheet", "Problem Set 1.pdf", extractQuestions(problemSheet, { sheet: true }), {
  topicOf: (q) => (q.number.startsWith("1") ? "conics" : null),
});
const find = (p: PoolNote, id: string) => p.items.find((i) => i.id === id)!;

describe("pool notes", () => {
  it("derives stable ids from source, chapter and number", () => {
    expect(poolItemId("Problem Set 1.pdf", "1(a)")).toBe("problem-set-1:1(a)");
    expect(poolItemId("stewart.pdf", "14", "3")).toBe("stewart:3/14");
    const p = fresh();
    expect(p.items.map((i) => i.id).slice(0, 2)).toEqual(["problem-set-1:1", "problem-set-1:1(a)"]);
    expect(p.items.every((i) => i.state === "pool" && !isEdited(i))).toBe(true);
    expect(find(p, "problem-set-1:1(a)").topic).toBe("conics");
    expect(find(p, "problem-set-1:2").topic).toBeUndefined();
  });

  it("suffixes duplicate numbers", () => {
    const q = extractQuestions(problemSheet, { sheet: true })[0]!;
    expect(createPool("question-sheet", "s.pdf", [q, q]).items.map((i) => i.id)).toEqual(["s:1", "s:1~2"]);
  });

  it("round-trips through markdown with frontmatter, keeping unknown keys and the body", () => {
    const p = { ...fresh(), meta: { title: "Problem Set 1" }, body: "# Notes\n\nmy notes\n" };
    p.items[1]!.state = "rejected";
    const raw = serializePool(p);
    expect(raw.startsWith("---\n")).toBe(true);
    expect(parsePool(raw)).toEqual(JSON.parse(JSON.stringify(p)));
  });

  it("throws on unreadable frontmatter instead of dropping item states", () => {
    expect(() => parsePool("no frontmatter")).toThrow();
    expect(() => parsePool("---\nitems: [\n---\n")).toThrow();
  });

  it("keeps states, topics and edits when reprocessing", () => {
    const old = fresh();
    find(old, "problem-set-1:1(a)").state = "rejected";
    find(old, "problem-set-1:2").state = "accepted";
    find(old, "problem-set-1:2").topic = "circles";
    const edited = find(old, "problem-set-1:5");
    edited.text = "Let f(x) = sqrt(x) with domain x in [-2, 2].";
    old.body = "kept body";
    const saved = parsePool(serializePool(old));

    const next = fresh();
    find(next, "problem-set-1:1(b)").text = "parser now reads this better";
    const merged = mergePool(saved, next);

    expect(find(merged, "problem-set-1:1(a)").state).toBe("rejected");
    expect(find(merged, "problem-set-1:2")).toMatchObject({ state: "accepted", topic: "circles" });
    expect(find(merged, "problem-set-1:5")).toMatchObject({ text: edited.text, state: "pool" });
    expect(find(merged, "problem-set-1:5").tags).not.toContain("needs-cleanup");
    expect(isEdited(find(merged, "problem-set-1:5"))).toBe(true);
    expect(find(merged, "problem-set-1:1(b)").text).toBe("parser now reads this better");
    expect(merged.body).toBe("kept body");
  });

  it("keeps rejected, accepted and edited items that disappear, and drops untouched ones", () => {
    const old = fresh();
    find(old, "problem-set-1:3").state = "rejected";
    find(old, "problem-set-1:4(b)").text = "hand fixed";
    const next = { ...fresh(), items: fresh().items.filter((i) => !["problem-set-1:3", "problem-set-1:4(a)", "problem-set-1:4(b)"].includes(i.id)) };
    const ids = mergePool(old, next).items.map((i) => i.id);
    expect(ids).toContain("problem-set-1:3");
    expect(ids).toContain("problem-set-1:4(b)");
    expect(ids).not.toContain("problem-set-1:4(a)");
  });

  it("returns the fresh pool when there is no note yet", () => expect(mergePool(null, fresh())).toEqual(fresh()));
});
