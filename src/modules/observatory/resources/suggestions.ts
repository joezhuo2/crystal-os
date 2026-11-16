import { fetchRawNote, saveVaultNote } from "@/hooks/useVault";
import { parseFrontmatter } from "@/lib/vaultNative";
import { coursePath, parseCourse, patchNote } from "../model";
import type { CourseSuggestion } from "./ai";
import { markAi } from "./aiRecord";

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function applySuggestion(courseRaw: string, s: CourseSuggestion): string {
  const course = parseCourse(courseRaw);
  if (s.kind === "exam") {
    const found = course.exams.some((e) => same(e.name, s.name));
    const exams = found
      ? course.exams.map((e) => (same(e.name, s.name) ? { ...e, ...(s.weight !== undefined && { weight: s.weight }), ...(s.date && { date: s.date }) } : e))
      : [...course.exams, { name: s.name, date: s.date ?? null, weight: s.weight ?? 0 }];
    return patchNote(courseRaw, { exams });
  }
  const found = course.assessments.some((a) => same(a.name, s.name));
  const assessments = found
    ? course.assessments.map((a) => (same(a.name, s.name) && s.weight !== undefined ? { ...a, weight: s.weight } : a))
    : [...course.assessments, { name: s.name, weight: s.weight ?? 0 }];
  return patchNote(courseRaw, { assessments });
}

async function settle(sidecar: string, id: string): Promise<{ found: CourseSuggestion; rest: CourseSuggestion[] }> {
  const raw = await fetchRawNote(sidecar);
  const { data } = parseFrontmatter(raw.content);
  const list = (Array.isArray(data.suggestions) ? data.suggestions : []) as CourseSuggestion[];
  const found = list.find((s) => s.id === id);
  if (!found) throw new Error("That suggestion is no longer there");
  const done = Array.isArray(data.suggestions_done) ? data.suggestions_done.map(String) : [];
  const rest = list.filter((s) => s.id !== id);
  await saveVaultNote({
    path: sidecar,
    content: patchNote(raw.content, { suggestions: rest, suggestions_done: [...new Set([...done, id])] }),
    expectedMtime: raw.mtime,
  });
  return { found, rest };
}

export async function acceptSuggestion(folder: string, code: string, sidecar: string, s: CourseSuggestion): Promise<void> {
  const path = coursePath(folder, code);
  const raw = await fetchRawNote(path);
  await saveVaultNote({ path, content: applySuggestion(raw.content, s), expectedMtime: raw.mtime });
  const { found } = await settle(sidecar, s.id);
  await markAi(found.log, "applied");
}

export async function dismissSuggestion(sidecar: string, id: string): Promise<void> {
  const { found, rest } = await settle(sidecar, id);
  if (found.log && !rest.some((s) => s.log === found.log)) await markAi(found.log, "dismissed", ["applied", "accepted"]);
}
