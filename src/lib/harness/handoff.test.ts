import { describe, expect, it } from "vitest";
import { buildHandoff, HANDOFF_MAX_CHARS, HANDOFF_PREAMBLE } from "./handoff";
import type { ChatMessage } from "./types";

let n = 0;
const msg = (role: ChatMessage["role"], text: string, engine?: ChatMessage["engine"], extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id: String(n++),
  role,
  engine,
  blocks: [{ kind: "text", text }],
  createdAt: n,
  ...extra,
});

describe("buildHandoff", () => {
  it("returns null when there is nothing to hand over", () => {
    expect(buildHandoff([], "claude")).toBeNull();
  });

  it("starts with the fixed preamble and summarises tools", () => {
    const messages: ChatMessage[] = [
      msg("user", "Fix the tests"),
      { ...msg("assistant", "Running them", "dsh", { model: "Kimi K3" }), blocks: [{ kind: "text", text: "Running them" }, { kind: "tool", id: "t", title: "npm test", status: "completed", output: "lots of output" }] },
    ];
    const text = buildHandoff(messages, "claude")!;
    expect(text.startsWith(HANDOFF_PREAMBLE)).toBe(true);
    expect(text).toContain("User:\nFix the tests");
    expect(text).toContain("Assistant (DeepSeek Harness, Kimi K3)");
    expect(text).toContain("[tool completed] npm test");
    expect(text).not.toContain("lots of output");
  });

  it("only includes turns since the target engine last answered", () => {
    const messages = [msg("user", "old question"), msg("assistant", "old claude answer", "claude"), msg("user", "new question"), msg("assistant", "dsh answer", "dsh")];
    const text = buildHandoff(messages, "claude")!;
    expect(text).not.toContain("old question");
    expect(text).toContain("new question");
  });

  it("keeps the newest turns within the size budget", () => {
    const messages = Array.from({ length: 30 }, (_, i) => msg(i % 2 ? "assistant" : "user", `turn ${i} ${"x".repeat(900)}`, i % 2 ? "dsh" : undefined));
    const text = buildHandoff(messages, "claude")!;
    expect(text.length).toBeLessThanOrEqual(HANDOFF_MAX_CHARS + 100);
    expect(text).toContain("turn 29");
    expect(text).not.toContain("turn 0 ");
    expect(text).toMatch(/earlier turns omitted/);
  });
});
