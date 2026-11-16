export type QuestionType = "mc" | "worked" | "output" | "bug" | "card";

export interface Solution { text: string; unverified?: boolean }
export interface QuestionDraft { id: string; type: QuestionType; prompt: string; answer: string; unverified?: boolean; solution?: Solution }

export const AI_UNVERIFIED = "ai-unverified";
export const isUnverifiedMark = (s?: string) => s === AI_UNVERIFIED || s === "claude-unverified";

export type Question = QuestionDraft &
  (
    | { type: "mc"; stem: string; options: { text: string; correct: boolean }[] }
    | { type: "worked"; steps: string[] }
    | { type: "output"; code: string; expected: string }
    | { type: "bug"; code: string; line: number | null }
    | { type: "card" }
  );

const TYPES: QuestionType[] = ["mc", "worked", "output", "bug", "card"];
const QUESTION = /^>\s*\[!question\][-+]?(.*)$/i;
const ANSWER = /^>\s*\[!answer\][-+]?/i;
const SUMMARY = /^>\s*\[!summary\][-+]?(.*)$/i;
const SOLUTION = /^>\s*\[!solution\][-+]?(.*)$/i;
const OPTION = /^\s*[-*] \[( |x|X)\]\s+(.*)$/;
const STEP = /^\s*\d+[.)]\s+(.*)$/;
const FENCE = /^(`{3,}|~{3,})[^\n]*\n([\s\S]*?)\n\1\s*$/m;

const unquote = (line: string) => line.replace(/^> ?/, "");
const isQuoted = (line: string) => line.startsWith(">");
const trimBlank = (lines: string[]) => lines.join("\n").replace(/^\s*\n|\s+$/g, "");

interface Block { id: string; type: QuestionType; prompt: string; answer: string; unverified: boolean; solution?: Solution; start: number; end: number }

function blockEnd(lines: string[], from: number) {
  let i = from;
  while (i < lines.length && isQuoted(lines[i]!) && !ANSWER.test(lines[i]!) && !QUESTION.test(lines[i]!)) i++;
  return i;
}

function findBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  for (let i = 0; i < lines.length; i++) {
    const head = QUESTION.exec(lines[i]!);
    if (!head) continue;
    const end = blockEnd(lines, i + 1);
    const inner = lines.slice(i + 1, end).map(unquote);
    const at = inner.findIndex((l) => ANSWER.test(l));
    const prompt = at < 0 ? inner : inner.slice(0, at);
    let answer: string[] = [];
    let solution: Solution | undefined;
    let stop = end;
    if (at >= 0) {
      const after = inner.slice(at + 1);
      const sol = after.findIndex((l) => SOLUTION.test(l));
      answer = (sol < 0 ? after : after.slice(0, sol)).filter(isQuoted).map(unquote);
      if (sol >= 0) {
        const unverified = SOLUTION.exec(after[sol]!)![1]!.trim().split(/\s+/).some(isUnverifiedMark);
        solution = { text: trimBlank(after.slice(sol + 1).filter(isQuoted).map(unquote)), ...(unverified && { unverified }) };
      }
    } else {
      let next = end;
      while (next < lines.length && lines[next]!.trim() === "") next++;
      if (next < lines.length && ANSWER.test(lines[next]!)) {
        stop = blockEnd(lines, next + 1);
        answer = lines.slice(next + 1, stop).map(unquote);
      }
    }
    const [id, ...rest] = head[1]!.trim().split(/\s+/);
    const type = /(?:^|\s)type=(\w+)/.exec(rest.join(" "))?.[1] as QuestionType | undefined;
    if (id && !id.includes("=")) {
      const unverified = rest.some(isUnverifiedMark);
      blocks.push({ id, type: type && TYPES.includes(type) ? type : "card", prompt: trimBlank(prompt), answer: trimBlank(answer), unverified, ...(solution && { solution }), start: i, end: stop });
    }
    i = stop - 1;
  }
  return blocks;
}

const firstCode = (md: string) => FENCE.exec(md)?.[2] ?? "";

function steps(answer: string): string[] {
  const out: string[] = [];
  for (const line of answer.split("\n")) {
    const m = STEP.exec(line);
    if (m) out.push(m[1]!);
    else if (out.length) out[out.length - 1] += `\n${line}`;
    else if (line.trim()) out.push(line);
  }
  return out.map((s) => s.trim()).filter(Boolean);
}

export function toQuestion(d: QuestionDraft): Question {
  switch (d.type) {
    case "mc": {
      const lines = d.prompt.split("\n");
      const options = lines.flatMap((l) => {
        const m = OPTION.exec(l);
        return m ? [{ text: m[2]!.trim(), correct: m[1] !== " " }] : [];
      });
      return { ...d, type: "mc", stem: trimBlank(lines.filter((l) => !OPTION.test(l))), options };
    }
    case "worked":
      return { ...d, type: "worked", steps: steps(d.answer) };
    case "output":
      return { ...d, type: "output", code: firstCode(d.prompt), expected: (FENCE.test(d.answer) ? firstCode(d.answer) : d.answer).trim() };
    case "bug": {
      const line = /^\s*line:\s*(\d+)\s*$/im.exec(d.answer);
      return { ...d, type: "bug", code: firstCode(d.prompt), line: line ? Number(line[1]) : null };
    }
    default:
      return { ...d, type: "card" };
  }
}

const splitLines = (body: string) => body.replace(/\r\n/g, "\n").split("\n");

export const parseQuestions = (body: string): Question[] =>
  findBlocks(splitLines(body)).map(({ id, type, prompt, answer, unverified, solution }) =>
    toQuestion({ id, type, prompt, answer, ...(unverified && { unverified }), ...(solution && { solution }) }));

export function formatQuestion({ id, type, prompt, answer, unverified, solution }: QuestionDraft): string {
  const quote = (text: string, mark: string) => text.split("\n").map((l) => (l ? `${mark} ${l}` : mark));
  const solved = solution?.text.trim()
    ? [">", `>> [!solution]- AI solution${solution.unverified ? ` ${AI_UNVERIFIED}` : ""}`, ...quote(solution.text.trim(), ">>")]
    : [];
  return [
    `> [!question] ${id}${type === "card" ? "" : ` type=${type}`}${unverified ? ` ${AI_UNVERIFIED}` : ""}`,
    ...quote(prompt.trim(), ">"),
    ">> [!answer]-",
    ...quote(answer.trim(), ">>"),
    ...solved,
  ].join("\n");
}

export const draftOf = ({ id, type, prompt, answer, unverified, solution }: Question): QuestionDraft =>
  ({ id, type, prompt, answer, ...(unverified && { unverified }), ...(solution && { solution }) });

export function withSolution(body: string, id: string, text: string): string {
  const q = parseQuestions(body).find((x) => x.id === id);
  if (!q) throw new Error(`Question ${id} is no longer in the topic note`);
  return upsertQuestion(body, { ...draftOf(q), solution: { text, unverified: true } });
}

export function upsertQuestion(body: string, draft: QuestionDraft): string {
  const eol = body.includes("\r\n") ? "\r\n" : "\n";
  const lines = splitLines(body);
  const callout = formatQuestion(draft).split("\n");
  const found = findBlocks(lines).find((b) => b.id === draft.id);
  if (found) lines.splice(found.start, found.end - found.start, ...callout);
  else {
    while (lines.length && lines[lines.length - 1]!.trim() === "") lines.pop();
    lines.push(...(lines.length ? [""] : []), ...callout, "");
  }
  return lines.join(eol);
}

export function newQuestionId(body: string, random: () => number = Math.random): string {
  const taken = new Set(findBlocks(splitLines(body)).map((b) => b.id));
  for (;;) {
    const id = `q-${Math.floor(random() * 36 ** 4).toString(36).padStart(4, "0")}`;
    if (!taken.has(id)) return id;
  }
}

export function topicSummary(body: string): string | null {
  const lines = splitLines(body);
  const at = lines.findIndex((l) => SUMMARY.test(l));
  if (at >= 0) {
    const text = trimBlank(lines.slice(at + 1, blockEnd(lines, at + 1)).map(unquote));
    return text || SUMMARY.exec(lines[at]!)![1]!.trim() || null;
  }
  let fenced = false;
  const para: string[] = [];
  for (const line of lines) {
    if (/^(`{3,}|~{3,})/.test(line)) fenced = !fenced;
    const plain = !fenced && line.trim() !== "" && !/^\s*(#|>|`{3,}|~{3,})/.test(line);
    if (plain) para.push(line);
    else if (para.length) break;
  }
  return para.length ? para.join("\n").trim() : null;
}

export interface QuestionSource { body: string; tail: string; image?: string; pdf?: string; page?: number; region?: { x: number; y: number; w: number; h: number } }

const EMBED_LINE = /^!\[\[([^\]|#]+\.(?:png|jpe?g|webp|gif))(?:\|[^\]]*)?\]\]\s*$/i;
const SOURCE_LINE = /^Source:\s*\[\[([^\]|#]+\.pdf)(?:#([^\]|]*))?(?:\|[^\]]*)?\]\]\s*$/i;

export function questionSource(prompt: string): QuestionSource {
  const lines = splitLines(prompt);
  const out: QuestionSource = { body: "", tail: "" };
  const tail: string[] = [];
  const body = lines.filter((line) => {
    const embed = EMBED_LINE.exec(line.trim());
    const source = SOURCE_LINE.exec(line.trim());
    if (embed) out.image ??= embed[1]!.trim();
    else if (source) {
      out.pdf ??= source[1]!.trim();
      const params = new URLSearchParams(source[2] ?? "");
      const page = Number(params.get("page"));
      if (page > 0) out.page ??= page;
      const [x, y, w, h] = (params.get("region") ?? "").split(",").map(Number);
      if (w! > 0 && h! > 0) out.region ??= { x: x!, y: y!, w: w!, h: h! };
    } else return true;
    tail.push(line.trim());
    return false;
  });
  return { ...out, body: trimBlank(body), tail: tail.join("\n\n") };
}
