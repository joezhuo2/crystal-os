import type { Course } from "../model";

export interface SortCandidate { code: string; score: number; reasons: string[] }
export interface SortResult { match: string | null; candidates: SortCandidate[] }

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function codePattern(code: string): RegExp {
  const m = /^([A-Z]+)(\d+[A-Z]?)$/i.exec(code.replace(/\s+/g, ""));
  const body = m ? `${m[1]}[\\s_-]*${m[2]}` : escape(code);
  return new RegExp(`(?<![A-Za-z])${body}(?![0-9])`, "i");
}

const keywordPattern = (k: string) => new RegExp(`(?<![A-Za-z0-9])${escape(k.trim())}(?![A-Za-z0-9])`, "i");

export function sortByKeywords(courses: Course[], fileName: string, firstPageText: string): SortResult {
  const scored = courses
    .filter((c) => !c.archived)
    .map((c) => {
      const reasons: string[] = [];
      let score = 0;
      let code = false;
      const pattern = codePattern(c.code);
      if (pattern.test(fileName)) { score += 3; code = true; reasons.push("course code in file name"); }
      if (pattern.test(firstPageText)) { score += 3; code = true; reasons.push("course code on first page"); }
      const hits = c.keywords.filter((k) => k.trim() && keywordPattern(k).test(`${fileName}\n${firstPageText}`));
      score += hits.length;
      if (hits.length) reasons.push(`keywords: ${hits.join(", ")}`);
      return { code: c.code, score, reasons, byCode: code };
    })
    .sort((a, b) => b.score - a.score || a.code.localeCompare(b.code));

  const byCode = scored.filter((c) => c.byCode);
  const [best, second] = scored;
  let match: string | null = null;
  if (byCode.length === 1) match = byCode[0]!.code;
  else if (!byCode.length && best && best.score >= 2 && best.score > 2 * (second?.score ?? 0)) match = best.code;

  return { match, candidates: scored.map(({ byCode: _b, ...c }) => c) };
}
