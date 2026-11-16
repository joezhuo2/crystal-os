import type { Question, QuestionDraft, QuestionType } from "./questions";

export interface Fields {
  type: QuestionType;
  text: string;
  answer: string;
  options: { text: string; correct: boolean }[];
  steps: string[];
  code: string;
  expected: string;
  line: string;
}

export const BLANK: Fields = {
  type: "card",
  text: "",
  answer: "",
  options: [{ text: "", correct: true }, { text: "", correct: false }],
  steps: [""],
  code: "",
  expected: "",
  line: "",
};

const FENCE = /^(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\1[ \t]*$/m;
const LINE = /^\s*line:\s*\d+\s*$/im;
const join = (...parts: string[]) => parts.map((p) => p.trim()).filter(Boolean).join("\n\n");
const fence = (code: string) => {
  const mark = code.includes("```") ? "~~~" : "```";
  return code.trim() ? `${mark}\n${code.replace(/\s+$/, "")}\n${mark}` : "";
};

export function fromQuestion(q: Question): Fields {
  const base = { ...BLANK, type: q.type, text: q.prompt, answer: q.answer };
  switch (q.type) {
    case "mc":
      return { ...base, text: q.stem, options: q.options.length ? q.options : BLANK.options };
    case "worked":
      return { ...base, answer: "", steps: q.steps.length ? q.steps : [""] };
    case "output":
      return { ...base, text: q.prompt.replace(FENCE, "").trim(), answer: "", code: q.code, expected: q.expected };
    case "bug":
      return { ...base, text: q.prompt.replace(FENCE, "").trim(), answer: q.answer.replace(LINE, "").trim(), code: q.code, line: q.line == null ? "" : String(q.line) };
    default:
      return base;
  }
}

export function toDraft(f: Fields): Omit<QuestionDraft, "id"> {
  switch (f.type) {
    case "mc": {
      const options = f.options.filter((o) => o.text.trim()).map((o) => `- [${o.correct ? "x" : " "}] ${o.text.trim()}`);
      return { type: "mc", prompt: join(f.text, options.join("\n")), answer: f.answer.trim() };
    }
    case "worked":
      return { type: "worked", prompt: f.text.trim(), answer: f.steps.filter((s) => s.trim()).map((s, i) => `${i + 1}. ${s.trim()}`).join("\n") };
    case "output":
      return { type: "output", prompt: join(f.text, fence(f.code)), answer: fence(f.expected) };
    case "bug":
      return { type: "bug", prompt: join(f.text, fence(f.code)), answer: join(f.line.trim() && `line: ${f.line.trim()}`, f.answer) };
    default:
      return { type: "card", prompt: f.text.trim(), answer: f.answer.trim() };
  }
}

export function isComplete(f: Fields): boolean {
  switch (f.type) {
    case "mc": {
      const filled = f.options.filter((o) => o.text.trim());
      return !!f.text.trim() && filled.length >= 2 && filled.some((o) => o.correct);
    }
    case "worked":
      return !!f.text.trim() && f.steps.some((s) => s.trim());
    case "output":
      return !!f.code.trim() && !!f.expected.trim();
    case "bug":
      return !!f.code.trim() && Number(f.line) >= 1;
    default:
      return !!f.text.trim() && !!f.answer.trim();
  }
}

// The AI solution solves the question text, so it survives edits that leave that text alone.
export function keepSolution(initial: Question | undefined, draft: Omit<QuestionDraft, "id">): Omit<QuestionDraft, "id"> {
  return initial?.solution && draft.prompt === toDraft(fromQuestion(initial)).prompt ? { ...draft, solution: initial.solution } : draft;
}
