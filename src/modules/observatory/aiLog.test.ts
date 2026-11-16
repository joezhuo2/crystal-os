import { describe, expect, it } from "vitest";
import { aiOutputPath, serializeAiOutput } from "./aiLog";

const at = new Date("2026-11-15T12:00:00Z");

describe("aiLog", () => {
  it("files outputs under the course _ai folder by date and kind", () => {
    expect(aiOutputPath("Observatory", "MATH117", "draft questions", "Chain rule", at)).toBe("Observatory/MATH117/_ai/2026-11-15-draft-questions-chain-rule.md");
  });

  it("writes provider, status and the unverified tag as frontmatter", () => {
    const md = serializeAiOutput({ folder: "Observatory", code: "MATH117", kind: "summary", title: "Deck 1", markdown: "Key points", provider: "claude", model: "" }, at);
    expect(md).toContain("provider: claude");
    expect(md).toContain("status: pending");
    expect(md).toContain("ai-unverified");
    expect(md).toContain("# Deck 1\n\nKey points");
  });
});
