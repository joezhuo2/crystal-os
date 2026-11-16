import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const notes = [
  { path: "Observatory/MATH117/_course.md", frontmatter: { code: "MATH117" } },
  { path: "Observatory/Calc/_course.md", frontmatter: { code: "ECE105" } },
  { path: "Observatory/bad/_course.md", frontmatter: { code: "bad" } },
];

vi.mock("@/hooks/useVault", () => ({ useVaultNotes: () => ({ data: { notes }, isLoading: false, error: null }) }));

const { useCourses } = await import("./useObservatory");

describe("useCourses", () => {
  it("only accepts courses whose folder matches their code", () => {
    const { result } = renderHook(() => useCourses());
    expect(result.current.courses.map((e) => e.course.code)).toEqual(["MATH117"]);
  });
});
