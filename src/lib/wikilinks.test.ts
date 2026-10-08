import { describe, expect, it } from "vitest";
import {
  buildLinkTargets,
  noteCategories,
  noteConnections,
  relatedByCategory,
  resolveWikilinks,
} from "./wikilinks";
import { extractWikilinks } from "./vaultCore";

const notes = [
  { path: "Projects/Anamnesis.md", title: "Anamnesis" },
  { path: "Daily/2026-10-04.md", title: "Sunday" },
  { path: "Archive/Projects/Anamnesis.md", title: "Old Anamnesis" },
];

describe("resolveWikilinks", () => {
  const targets = buildLinkTargets(notes);

  it("matches by title, full path or a trailing part of the path, case-insensitively", () => {
    expect(resolveWikilinks("[[anamnesis]]", targets)).toBe(
      "[anamnesis](#vault/Projects%2FAnamnesis.md)",
    );
    expect(resolveWikilinks("[[Daily/2026-10-04|today]]", targets)).toBe(
      "[today](#vault/Daily%2F2026-10-04.md)",
    );
    expect(resolveWikilinks("[[2026-10-04]]", targets)).toBe(
      "[2026-10-04](#vault/Daily%2F2026-10-04.md)",
    );
    expect(resolveWikilinks("[[archive/projects/anamnesis]]", targets)).toBe(
      "[archive/projects/anamnesis](#vault/Archive%2FProjects%2FAnamnesis.md)",
    );
  });

  it("prefers the first note in list order, like a linear search", () => {
    expect(resolveWikilinks("[[Projects/Anamnesis]]", targets)).toContain("#vault/Projects%2FAnamnesis.md");
  });

  it("leaves unresolved links as plain text", () => {
    expect(resolveWikilinks("see [[Nowhere|there]]", targets)).toBe("see there");
  });
});

describe("extractWikilinks", () => {
  it("collects lowercased targets once, without aliases or headings", () => {
    expect(extractWikilinks("[[Alpha]] and [[alpha|A]], [[Beta#Intro]], ![[Gamma]], [[#Local]]")).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
  });
});

describe("noteConnections", () => {
  const vault = [
    { path: "A.md", title: "A", links: ["b", "missing", "a"] },
    { path: "B.md", title: "B", links: ["c"] },
    { path: "C.md", title: "C", links: ["a", "b"] },
    { path: "Old.md", title: "Old" },
  ];
  const linkTargets = buildLinkTargets(vault);

  it("resolves outgoing links and backlinks, skipping self and unresolved", () => {
    const { outgoing, backlinks } = noteConnections("A.md", vault[0].links, vault, linkTargets);
    expect(outgoing.map((n) => n.path)).toEqual(["B.md"]);
    expect(backlinks.map((n) => n.path)).toEqual(["C.md"]);
  });

  it("tolerates notes listed without links", () => {
    const { backlinks } = noteConnections("B.md", ["c"], vault, linkTargets);
    expect(backlinks.map((n) => n.path)).toEqual(["A.md", "C.md"]);
  });
});

describe("noteCategories", () => {
  it("merges tags with categories frontmatter, unwrapping wikilinks", () => {
    expect(
      noteCategories({ tags: ["Books", "#reading"], frontmatter: { categories: ["[[Books]]", "[[People|Folk]]"], category: "Ideas" } }),
    ).toEqual(["books", "reading", "people", "ideas"]);
  });
});

describe("relatedByCategory", () => {
  const vault = [
    { path: "A.md", tags: ["books"], frontmatter: {} },
    { path: "B.md", tags: ["books", "fiction"], frontmatter: {} },
    { path: "C.md", tags: [], frontmatter: { categories: ["[[Books]]"] } },
    { path: "D.md", tags: ["cooking"], frontmatter: {} },
  ];

  it("lists other notes sharing a category, most overlap first", () => {
    const current = { path: "X.md", tags: ["fiction"], frontmatter: { categories: "[[Books]]" } };
    expect(relatedByCategory(current, vault).map((r) => [r.note.path, r.shared])).toEqual([
      ["B.md", ["books", "fiction"]],
      ["A.md", ["books"]],
      ["C.md", ["books"]],
    ]);
  });

  it("returns nothing for an uncategorised note and skips itself", () => {
    expect(relatedByCategory({ path: "D.md", tags: [], frontmatter: {} }, vault)).toEqual([]);
    expect(relatedByCategory(vault[3], vault)).toEqual([]);
  });
});
