import { describe, expect, it } from "vitest";
import { chatNotePath, chatToMarkdown } from "./chatExport";
import type { ChatMessage, ChatMeta } from "./types";

const chat: ChatMeta = {
  id: "0123456789abcdef",
  projectId: "p1",
  title: "Fix the build: CI/CD?",
  createdAt: new Date(2026, 9, 20, 9, 0).getTime(),
  updatedAt: new Date(2026, 9, 21, 9, 0).getTime(),
  pinned: false,
  tier: "high",
  effort: "medium",
  mode: "manual",
};

const at = new Date(2026, 9, 21, 10, 0).getTime();
const messages: ChatMessage[] = [
  { id: "m1", role: "user", blocks: [{ kind: "text", text: "Why does CI fail?" }], createdAt: at },
  {
    id: "m2",
    role: "assistant",
    engine: "claude",
    model: "opus",
    createdAt: at,
    blocks: [
      { kind: "thought", text: "Check the logs\nthen the config" },
      { kind: "tool", id: "t1", title: "Read ci.yml", status: "completed" },
      { kind: "text", text: "The cache key is stale." },
    ],
  },
  { id: "m3", role: "assistant", engine: "dsh", createdAt: at, blocks: [{ kind: "text", text: "  " }] },
  { id: "m4", role: "system", createdAt: at, blocks: [{ kind: "notice", tone: "warning", text: "Rate limited" }] },
];

describe("chatNotePath", () => {
  it("files the chat under its project, with names the vault accepts", () => {
    expect(chatNotePath(chat, "crystal/os")).toBe("Nebula/crystal os/Fix the build CI CD (01234567).md");
    expect(chatNotePath({ ...chat, title: "???" }, "")).toBe("Nebula/Project/Chat (01234567).md");
  });
});

describe("chatToMarkdown", () => {
  const md = chatToMarkdown({ chat, messages, projectName: "Crystal", projectPath: "C:/code/crystal" }, new Date(2026, 9, 21, 12, 0));

  it("writes frontmatter, the title and the project folder", () => {
    expect(md).toMatch(/^---\ntype: nebula-chat\nchat: 0123456789abcdef\nproject: "Crystal"\ncreated: 2026-10-20\nsaved: 2026-10-21\ntags: \[nebula\]\n---\n\n# Fix the build: CI\/CD\?\n\nProject: `C:\/code\/crystal`\n/);
  });

  it("puts each turn under its speaker, with thinking folded and tools on one line", () => {
    expect(md).toContain("## You\n");
    expect(md).toContain("Why does CI fail?");
    expect(md).toContain("## Claude Code · opus\n");
    expect(md).toContain("> [!note]- Thinking\n> Check the logs\n> then the config\n");
    expect(md).toContain("- Tool (completed): Read ci.yml\n\nThe cache key is stale.");
    expect(md).toContain("## Nebula\n");
    expect(md).toContain("> [!warning] Rate limited");
    expect(md).not.toContain("## DeepSeek Harness");
    expect(md.endsWith("Rate limited\n")).toBe(true);
  });
});
