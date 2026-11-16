import { describe, expect, it, vi } from "vitest";

const saveTopic = vi.fn();
vi.mock("./store", () => ({ saveTopic: (...a: unknown[]) => saveTopic(...a) }));
vi.mock("@/hooks/useVault", () => ({ useVaultNotes: vi.fn() }));

import { buildTopicLinkIndex, setTopicLink } from "./topicLinkIndex";

const notes = [
  { path: "Observatory/MATH117/topics/chain-rule.md", title: "Chain rule", frontmatter: { tasks: ["t1"], events: ["e1"] } },
  { path: "Observatory/PHYS120/topics/waves.md", title: "Waves", frontmatter: { tasks: ["t1", "t2"] } },
  { path: "Observatory/MATH117/_course.md", title: "Math", frontmatter: { code: "MATH117" } },
  { path: "Other/MATH117/topics/x.md", title: "X", frontmatter: { tasks: ["t1"] } },
];

describe("topic link index", () => {
  const index = buildTopicLinkIndex(notes, "Observatory");

  it("maps task and event ids to their topics across courses", () => {
    expect(index.topics).toHaveLength(2);
    expect(index.tasks.get("t1")?.map((t) => `${t.course}/${t.slug}`)).toEqual(["MATH117/chain-rule", "PHYS120/waves"]);
    expect(index.tasks.get("t2")).toHaveLength(1);
    expect(index.events.get("e1")?.[0]?.title).toBe("Chain rule");
    expect(index.events.get("nope")).toBeUndefined();
  });

  it("writes the id into the topic note, and removes it again", async () => {
    const topic = index.tasks.get("t1")![0]!;
    await setTopicLink("Observatory", topic, "tasks", "t9", true);
    expect(saveTopic).toHaveBeenLastCalledWith("Observatory", "MATH117", "chain-rule", { tasks: ["t1", "t9"] });
    await setTopicLink("Observatory", topic, "tasks", "t1", false);
    expect(saveTopic).toHaveBeenLastCalledWith("Observatory", "MATH117", "chain-rule", { tasks: [] });
    await setTopicLink("Observatory", topic, "tasks", "t1", true);
    expect(saveTopic).toHaveBeenLastCalledWith("Observatory", "MATH117", "chain-rule", { tasks: ["t1"] });
  });
});
