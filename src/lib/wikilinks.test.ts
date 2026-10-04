import { describe, expect, it } from "vitest";
import { buildLinkTargets, resolveWikilinks } from "./wikilinks";

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
