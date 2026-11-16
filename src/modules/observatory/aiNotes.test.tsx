import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const note = (path: string, frontmatter: Record<string, unknown> = {}) => ({ path, title: path.split("/").pop()!.replace(/\.md$/, ""), frontmatter });
const aiMeta = { kind: "questions", title: "Questions in ps1.pdf", status: "pending", source: "Observatory/MATH117/resources/question-sheets/ps1.pdf", tags: ["ai-unverified"] };
const notes = [
  note("Observatory/MATH117/_course.md", { code: "MATH117", name: "Calculus", term: "2026F" }),
  note("Observatory/MATH117/topics/limits.md", { title: "Limits" }),
  note("Observatory/MATH117/resources/question-sheets/ps1.md", { type: "question-sheet", source: "[[ps1.pdf]]" }),
  note("Observatory/MATH117/_ai/2026-11-15-questions-questions-in-ps1-pdf.md", aiMeta),
  note("Observatory/MATH117/_ai/2026-11-15-sort-sort-x-pdf.md", { ...aiMeta, type: "question-sheet", source: "[[x.pdf]]" }),
  note("Observatory/MATH117/resources/question-sheets/_ai/stray.md", { type: "question-sheet", source: "[[stray.pdf]]" }),
  note("Observatory/_inbox/_ai/2026-11-15-sort-sort-y-pdf.md", { ...aiMeta, type: "other", source: "[[y.pdf]]" }),
  note("Observatory/_inbox/loose.md", { type: "other", source: "[[loose.pdf]]" }),
];

vi.mock("@/hooks/useVault", () => ({
  useVaultNotes: () => ({ data: { notes }, isLoading: false, error: null }),
  fetchRawNote: vi.fn(),
  createVaultNote: vi.fn(),
  saveVaultNote: vi.fn(),
  vaultErrorCode: () => null,
}));

const { useCourseResources, useFiledNames, useResources } = await import("./resources/ingest");
const { useCourses, useCoursesTopics, useTopics } = await import("./useObservatory");

describe("_ai notes", () => {
  it("are never picked up as resources", () => {
    expect([...renderHook(() => useFiledNames()).result.current]).toEqual(["ps1.pdf", "loose.pdf"]);
    expect(renderHook(() => useResources("MATH117")).result.current.resources.map((r) => r.sidecar)).toEqual(["Observatory/MATH117/resources/question-sheets/ps1.md"]);
    expect(renderHook(() => useResources(null)).result.current.resources.map((r) => r.name)).toEqual(["loose.pdf"]);
    expect(renderHook(() => useCourseResources(["MATH117"])).result.current.map((r) => r.name)).toEqual(["ps1.pdf"]);
  });

  it("are never picked up as courses or topics", () => {
    expect(renderHook(() => useCourses()).result.current.courses.map((c) => c.path)).toEqual(["Observatory/MATH117/_course.md"]);
    expect(renderHook(() => useTopics("MATH117")).result.current.topics.map((t) => t.slug)).toEqual(["limits"]);
    expect(renderHook(() => useCoursesTopics(["MATH117"])).result.current.topics.map((t) => t.slug)).toEqual(["limits"]);
  });
});
