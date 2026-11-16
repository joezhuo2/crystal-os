import { describe, expect, it } from "vitest";
import { formatQuestion, newQuestionId, parseQuestions, questionSource, topicSummary, upsertQuestion, withSolution, type QuestionDraft } from "./questions";
import { fromQuestion, keepSolution, toDraft } from "./questionFields";

describe("AI-unverified questions and their source", () => {
  it("round-trips the ai-unverified marker and reads the spec's claude-unverified too", () => {
    const draft: QuestionDraft = { id: "q-1", type: "worked", prompt: "P", answer: "1. A", unverified: true };
    expect(formatQuestion(draft).split("\n")[0]).toBe("> [!question] q-1 type=worked ai-unverified");
    expect(parseQuestions(formatQuestion(draft))[0]).toMatchObject({ id: "q-1", type: "worked", unverified: true });
    expect(parseQuestions("> [!question] q-2 claude-unverified\n> P\n>> [!answer]-\n>> A")[0]).toMatchObject({ type: "card", unverified: true });
    expect(parseQuestions("> [!question] q-3\n> P")[0]!.unverified).toBeUndefined();
  });

  it("splits the image embed and Source link off the prompt", () => {
    const src = questionSource("Show that $x$.\n\n![[Observatory/M/resources/images/ps1-1.png]]\n\nSource: [[Observatory/M/ps1.pdf#page=3&region=10,20,300,40]]");
    expect(src).toEqual({
      body: "Show that $x$.",
      tail: "![[Observatory/M/resources/images/ps1-1.png]]\n\nSource: [[Observatory/M/ps1.pdf#page=3&region=10,20,300,40]]",
      image: "Observatory/M/resources/images/ps1-1.png",
      pdf: "Observatory/M/ps1.pdf",
      page: 3,
      region: { x: 10, y: 20, w: 300, h: 40 },
    });
    expect(questionSource("Plain")).toEqual({ body: "Plain", tail: "" });
  });
});

const body = [
  "Intro paragraph about the chain rule.",
  "Second line of it.",
  "",
  "> [!question] q-chain-01",
  "> Differentiate sin(x^2).",
  ">> [!answer]-",
  ">> 2x cos(x^2)",
  "",
  "> [!question] q-mc type=mc",
  "> Which are vector spaces?",
  "> - [ ] The integers",
  "> - [x] R^2",
  "> - [X] Polynomials",
  ">> [!answer]",
  ">> Closed under scaling.",
  "",
  "> [!question] q-w type=worked",
  "> Integrate x e^x.",
  "",
  "> [!answer]",
  "> 1. Let u = x.",
  "> $$dv = e^x dx$$",
  "> 2. Integrate by parts.",
  "",
  "> [!question] q-out type=output",
  "> ```cpp",
  "> std::cout << 1 + 2;",
  "> ```",
  ">> [!answer]",
  ">> ```",
  ">> 3",
  ">> ```",
  "> [!question] q-bug type=bug",
  "> ```cpp",
  "> int main() {",
  ">   return 0",
  "> }",
  "> ```",
  ">> [!answer]",
  ">> line: 2",
  ">> Missing semicolon.",
  "",
  "Closing text.",
].join("\n");

describe("parseQuestions", () => {
  const qs = parseQuestions(body);

  it("finds every question in order", () => {
    expect(qs.map((q) => [q.id, q.type])).toEqual([
      ["q-chain-01", "card"],
      ["q-mc", "mc"],
      ["q-w", "worked"],
      ["q-out", "output"],
      ["q-bug", "bug"],
    ]);
  });

  it("parses a card", () => {
    expect(qs[0]).toMatchObject({ prompt: "Differentiate sin(x^2).", answer: "2x cos(x^2)" });
  });

  it("parses multiple choice options", () => {
    const q = qs[1]!;
    if (q.type !== "mc") throw new Error("not mc");
    expect(q.stem).toBe("Which are vector spaces?");
    expect(q.options).toEqual([
      { text: "The integers", correct: false },
      { text: "R^2", correct: true },
      { text: "Polynomials", correct: true },
    ]);
    expect(q.answer).toBe("Closed under scaling.");
  });

  it("parses worked steps from a sibling answer callout", () => {
    const q = qs[2]!;
    if (q.type !== "worked") throw new Error("not worked");
    expect(q.steps).toEqual(["Let u = x.\n$$dv = e^x dx$$", "Integrate by parts."]);
  });

  it("parses predict the output", () => {
    const q = qs[3]!;
    if (q.type !== "output") throw new Error("not output");
    expect(q.code).toBe("std::cout << 1 + 2;");
    expect(q.expected).toBe("3");
  });

  it("parses spot the bug and keeps indentation", () => {
    const q = qs[4]!;
    if (q.type !== "bug") throw new Error("not bug");
    expect(q.code).toBe("int main() {\n  return 0\n}");
    expect(q.line).toBe(2);
  });

  it("ignores callouts without an id and unknown types become cards", () => {
    expect(parseQuestions("> [!question]\n> no id\n\n> [!question] q-x type=essay\n> hi")).toMatchObject([{ id: "q-x", type: "card" }]);
  });

  it("reads CRLF bodies", () => {
    expect(parseQuestions(body.replace(/\n/g, "\r\n")).map((q) => q.id)).toHaveLength(5);
  });
});

describe("formatQuestion and upsertQuestion", () => {
  const drafts: QuestionDraft[] = [
    { id: "q-a", type: "card", prompt: "Front\n\nmore", answer: "Back" },
    { id: "q-b", type: "mc", prompt: "Pick\n- [ ] one\n- [x] two", answer: "" },
    { id: "q-c", type: "worked", prompt: "Solve", answer: "1. a\n2. b" },
    { id: "q-d", type: "output", prompt: "```\n  x\n\ny\n```", answer: "out" },
    { id: "q-e", type: "bug", prompt: "```\na\n```", answer: "line: 1" },
  ];

  it("round-trips every type", () => {
    for (const d of drafts) {
      expect(parseQuestions(formatQuestion(d))).toMatchObject([d]);
    }
  });

  it("appends a new question without disturbing the rest", () => {
    const next = upsertQuestion(body, drafts[0]!);
    expect(next.startsWith(`${body}\n\n> [!question] q-a\n`)).toBe(true);
    expect(parseQuestions(next).map((q) => q.id)).toEqual(["q-chain-01", "q-mc", "q-w", "q-out", "q-bug", "q-a"]);
  });

  it("appends to an empty body", () => {
    expect(upsertQuestion("", drafts[0]!)).toBe(`${formatQuestion(drafts[0]!)}\n`);
  });

  it("replaces a question by id, including a sibling answer, and keeps the rest", () => {
    const draft: QuestionDraft = { id: "q-w", type: "card", prompt: "New front", answer: "New back" };
    const next = upsertQuestion(body, draft);
    const qs = parseQuestions(next);
    expect(qs.map((q) => q.id)).toEqual(["q-chain-01", "q-mc", "q-w", "q-out", "q-bug"]);
    expect(qs[2]).toMatchObject(draft);
    expect(next).toContain("Intro paragraph about the chain rule.");
    expect(next).toContain("\nClosing text.");
    expect(next).not.toContain("Integrate by parts.");
    expect(upsertQuestion(next, { id: "q-w", type: "worked", prompt: "Integrate x e^x.", answer: "1. Let u = x.\n$$dv = e^x dx$$\n2. Integrate by parts." })).toBe(
      body.replace("> Integrate x e^x.\n\n> [!answer]\n> 1. Let u = x.\n> $$dv = e^x dx$$\n> 2. Integrate by parts.", () => "> Integrate x e^x.\n>> [!answer]-\n>> 1. Let u = x.\n>> $$dv = e^x dx$$\n>> 2. Integrate by parts."),
    );
  });

  it("keeps CRLF line endings", () => {
    const crlf = body.replace(/\n/g, "\r\n");
    const next = upsertQuestion(crlf, { id: "q-chain-01", type: "card", prompt: "P", answer: "A" });
    expect(next.replace(/\r\n/g, "")).not.toContain("\n");
    expect(next).toContain("Closing text.");
  });
});

describe("newQuestionId", () => {
  it("makes a short id that is not taken", () => {
    const rolls = [0, 0, 0.5];
    const id = newQuestionId("> [!question] q-0000\n> x", () => rolls.shift()!);
    expect(id).toMatch(/^q-[0-9a-z]{4}$/);
    expect(id).not.toBe("q-0000");
  });
});

describe("topicSummary", () => {
  it("prefers the summary callout", () => {
    expect(topicSummary("First para.\n\n> [!summary]\n> The key idea.\n> Second line.")).toBe("The key idea.\nSecond line.");
  });

  it("uses the summary title when the callout is empty", () => {
    expect(topicSummary("> [!summary] Short version")).toBe("Short version");
  });

  it("falls back to the first paragraph, skipping headings, callouts and code", () => {
    expect(topicSummary("# Title\n\n```\ncode\n```\n> [!question] q-1\n> x\n\nReal text\nmore\n\nLater")).toBe("Real text\nmore");
    expect(topicSummary(body)).toBe("Intro paragraph about the chain rule.\nSecond line of it.");
  });

  it("returns null when there is nothing", () => {
    expect(topicSummary("# Only a heading\n\n> [!question] q-1\n> x")).toBeNull();
  });
});

describe("AI solution section", () => {
  const solved: QuestionDraft = { id: "q-s", type: "worked", prompt: "Find $x$.", answer: "1. $x = 2$", solution: { text: "1. Subtract.\n\n> a quote\n2. **$x = 2$**", unverified: true } };

  it("round-trips through format and parse, under the answer", () => {
    const text = formatQuestion(solved);
    expect(text).toContain(">> 1. $x = 2$\n>\n>> [!solution]- AI solution ai-unverified\n>> 1. Subtract.\n>>\n>> > a quote");
    const [q] = parseQuestions(text);
    expect(q).toMatchObject({ id: "q-s", answer: "1. $x = 2$", steps: ["$x = 2$"], solution: solved.solution });
    expect(formatQuestion(q!)).toBe(text);
    expect(upsertQuestion(text, q!)).toBe(text);
  });

  it("leaves callouts without a solution unchanged and respects a removed mark", () => {
    const plain = "> [!question] q-1\n> P\n>> [!answer]-\n>> A";
    expect(parseQuestions(plain)[0]!.solution).toBeUndefined();
    expect(formatQuestion(parseQuestions(plain)[0]!)).toBe(plain);
    expect(parseQuestions(`${plain}\n>\n>> [!solution]- AI solution\n>> S`)[0]).toMatchObject({ answer: "A", solution: { text: "S" } });
    expect(parseQuestions(`${plain}\n>\n>> [!solution]- AI solution\n>> S`)[0]!.solution!.unverified).toBeUndefined();
  });

  it("withSolution replaces the solution of one question and keeps the others", () => {
    const body = `Intro\n\n${formatQuestion({ id: "q-1", type: "card", prompt: "P", answer: "A" })}\n\n${formatQuestion(solved)}\n`;
    const next = withSolution(withSolution(body, "q-s", "New steps"), "q-1", "Card steps");
    const qs = parseQuestions(next);
    expect(qs.map((q) => [q.id, q.solution])).toEqual([["q-1", { text: "Card steps", unverified: true }], ["q-s", { text: "New steps", unverified: true }]]);
    expect(next.startsWith("Intro\n\n")).toBe(true);
    expect(() => withSolution(body, "q-gone", "x")).toThrow(/no longer/);
  });

  it("editing keeps the solution while the question text is unchanged and drops it otherwise", () => {
    const q = parseQuestions(formatQuestion(solved))[0]!;
    const same = toDraft(fromQuestion(q));
    expect(keepSolution(q, { ...same, answer: "1. $x = 3$" }).solution).toEqual(solved.solution);
    expect(keepSolution(q, { ...same, prompt: "Find $y$." }).solution).toBeUndefined();
    expect(keepSolution(undefined, same).solution).toBeUndefined();
  });
});
