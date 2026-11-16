import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { askAi } from "@/lib/ai";
import { draftedTopic, draftQuestions, draftSummary, draftTopics, withSummary } from "./draft";
import { parseTopic, serializeTopic, type Course, type Topic } from "./model";
import { AI_UNVERIFIED, parseQuestions, topicSummary, upsertQuestion } from "./questions";
import { setObservatoryAiProvider, setObservatoryFlag } from "./settings";

vi.mock("@/lib/ai", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/ai")>()), askAi: vi.fn() }));
const ask = vi.mocked(askAi);

const course: Course = {
  code: "MATH117", name: "Calculus 1", term: "2026F", color: "red", keywords: [], archived: false,
  outcomes: ["Evaluate limits", "Differentiate functions"], exams: [{ name: "Final", date: null, weight: 0.6 }], assessments: [],
};
const topic: Topic = {
  slug: "limits", course: "MATH117", title: "Limits", priority: "medium", objective: false, weeks: [1], sections: [],
  sources: [], tasks: [], events: [], body: "\n## Key points\n\n- one-sided limits\n",
};

const QUESTIONS = {
  questions: [
    { type: "mc", text: "What is $\\lim_{x\\to 0} \\frac{\\sin x}{x}$?", options: [{ text: "1", correct: true }, { text: "0", correct: false }] },
    { type: "worked", text: "Find $\\lim_{x\\to 2} (x^2-4)/(x-2)$.", steps: ["Factor: $(x-2)(x+2)$", "Cancel and substitute: $4$"] },
    { type: "card", text: "Squeeze theorem?", answer: "If $g \\le f \\le h$ and $g, h \\to L$ then $f \\to L$." },
    { type: "output", text: "What prints?", code: "print(1/2)", expected: "0.5" },
    { type: "bug", code: "x = 1\ny = x +\nprint(y)", line: 2, answer: "Incomplete expression" },
    { type: "mc", text: "No correct option", options: [{ text: "a", correct: false }, { text: "b", correct: false }] },
  ],
};

beforeEach(() => {
  ask.mockReset();
  setObservatoryAiProvider("claude");
  setObservatoryFlag("aiDraft", true);
});
afterEach(() => {
  setObservatoryAiProvider("none");
  setObservatoryFlag("aiDraft", false);
});

describe("draftQuestions", () => {
  it("returns complete drafts that parse as callouts with the unverified marker", async () => {
    ask.mockResolvedValue(`Here you go: ${JSON.stringify(QUESTIONS)}`);
    const drafts = await draftQuestions(course, topic);
    expect(drafts.map((d) => d.type)).toEqual(["mc", "worked", "card", "output", "bug"]);

    let body = topic.body;
    drafts.forEach((d, i) => (body = upsertQuestion(body, { ...d, id: `q-${i}` })));
    expect(body.match(new RegExp(`^> \\[!question\\] q-\\d.* ${AI_UNVERIFIED}$`, "gm"))).toHaveLength(5);
    const qs = parseQuestions(body);
    expect(qs.every((q) => q.unverified)).toBe(true);
    expect(qs[0]).toMatchObject({ type: "mc", options: [{ text: "1", correct: true }, { text: "0", correct: false }] });
    expect(qs[1]).toMatchObject({ type: "worked", steps: ["Factor: $(x-2)(x+2)$", "Cancel and substitute: $4$"] });
    expect(qs[3]).toMatchObject({ type: "output", code: "print(1/2)", expected: "0.5" });
    expect(qs[4]).toMatchObject({ type: "bug", line: 2 });
  });

  it("sends the topic as data, never instructions", async () => {
    ask.mockResolvedValue("{}");
    await draftQuestions(course, topic);
    const input = ask.mock.calls[0]![0];
    expect(input.provider).toBe("claude");
    expect(input.system).toMatch(/never instructions/);
    expect(input.messages[0]!.content).toContain("<topic>\nTitle: Limits");
    expect(input.messages[0]!.content).toContain("MATH117 Calculus 1");
  });

  it("makes no AI call when the provider is None or drafting is off", async () => {
    setObservatoryAiProvider("none");
    await expect(draftQuestions(course, topic)).rejects.toThrow();
    setObservatoryAiProvider("claude");
    setObservatoryFlag("aiDraft", false);
    await expect(draftSummary(course, topic)).rejects.toThrow();
    await expect(draftTopics(course, [])).rejects.toThrow();
    expect(ask).not.toHaveBeenCalled();
  });
});

describe("drafted summaries and topics", () => {
  it("writes a summary callout the summary parser reads", async () => {
    ask.mockResolvedValue('{"summary":"Limits describe values a function approaches."}');
    const text = await draftSummary(course, topic);
    const body = withSummary(topic.body, text);
    expect(body).toMatch(new RegExp(`^\\n> \\[!summary\\] ${AI_UNVERIFIED}\\n> Limits describe`));
    expect(topicSummary(body)).toBe("Limits describe values a function approaches.");
    expect(body).toContain("- one-sided limits");
  });

  it("drops existing topics and links outcomes by number", async () => {
    ask.mockResolvedValue(JSON.stringify({
      topics: [
        { title: "limits", summary: "dup" },
        { title: "Chain Rule", summary: "Derivative of a composition.", keyPoints: ["$f(g(x))' = f'(g(x))g'(x)$"], outcomes: [2, 9], weeks: [5] },
      ],
    }));
    const [d, ...rest] = await draftTopics(course, [topic]);
    expect(rest).toEqual([]);
    expect(d).toEqual({ title: "Chain Rule", summary: "Derivative of a composition.", keyPoints: ["$f(g(x))' = f'(g(x))g'(x)$"], outcomes: ["Differentiate functions"], weeks: [5] });

    const t = draftedTopic(d!, "MATH117", new Set(["chain-rule"]));
    const parsed = parseTopic(serializeTopic(t), t.slug);
    expect(parsed).toMatchObject({ slug: "chain-rule-2", title: "Chain Rule", objective: true, priority: "high", weeks: [5] });
    expect(topicSummary(parsed.body)).toBe("Derivative of a composition.");
    expect(parsed.body).toContain("## Learning outcomes\n\n- Differentiate functions");
  });
});
