import { useMemo } from "react";
import { createVaultNote, fetchRawNote, saveVaultNote, useVaultNotes, vaultErrorCode } from "@/hooks/useVault";
import { moveVaultPath, restoreVaultPath, trashVaultPath, writeVaultBinary } from "@/lib/vaultNative";
import { toLocalDateStr } from "@/lib/utils";
import { patchNote, type Course } from "../model";
import { readObservatorySettings, useObservatorySettings } from "../settings";
import { aiSortPdf, type AiSort, type CourseSuggestion } from "./ai";
import { recordAi } from "./aiRecord";
import { detectType } from "./detect";
import { INBOX, RESOURCE_DIRS, inboxDir, pdfStem, resourceDir, sidecarPath, textbookDir } from "./paths";
import { readPdf } from "./pdf";
import { sortByKeywords } from "./sort";
import type { PdfDoc, ResourceType } from "./types";

export interface DroppedPdf { name: string; bytes: Uint8Array }
export interface Analysis { file: DroppedPdf; title: string; type: ResourceType; ranked: string[]; suggested?: string; aiLog?: string }
export interface Filed { code: string | null; type: ResourceType; pdf: string; sidecar: string }
export interface Resource { sidecar: string; pdf: string; name: string; title: string; type: ResourceType; added: string | null; processed: boolean; suggestions?: CourseSuggestion[] }

const MAX_NAMES = 100;

const isType = (v: unknown): v is ResourceType => typeof v === "string" && v in RESOURCE_DIRS;
const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

export const pdfFor = (sidecar: string) => (sidecar.endsWith("/_book.md") ? sidecar.replace(/_book\.md$/, "book.pdf") : sidecar.replace(/\.md$/, ".pdf"));

export const filedTitle = (name: string, { code, type }: Pick<Filed, "code" | "type">) =>
  `Filed ${name} to ${code ? `${code} / ${RESOURCE_DIRS[type]}` : INBOX}`;

function target(folder: string, code: string | null, type: ResourceType, stem: string, n: number) {
  const s = n > 1 ? `${stem}-${n}` : stem;
  if (code && type === "textbook") {
    const dir = textbookDir(folder, code, s);
    return { pdf: `${dir}/book.pdf`, sidecar: `${dir}/_book.md` };
  }
  const pdf = `${code ? resourceDir(folder, code, type) : inboxDir(folder)}/${s}.pdf`;
  return { pdf, sidecar: sidecarPath(pdf) };
}

interface Placement {
  putPdf: (to: string) => Promise<unknown>;
  putSidecar: (to: { pdf: string; sidecar: string }) => Promise<unknown>;
  undoPdf: (to: string) => Promise<unknown>;
}

async function place(code: string | null, type: ResourceType, stem: string, p: Placement): Promise<Filed> {
  const { folder } = readObservatorySettings();
  for (let n = 1; n <= MAX_NAMES; n++) {
    const to = target(folder, code, type, stem, n);
    try {
      await p.putPdf(to.pdf);
    } catch (err) {
      if (vaultErrorCode(err) === "conflict") continue;
      throw err;
    }
    try {
      await p.putSidecar(to);
    } catch (err) {
      await p.undoPdf(to.pdf);
      if (vaultErrorCode(err) === "conflict") continue;
      throw err;
    }
    return { code, type, ...to };
  }
  throw new Error(`No free file name for ${stem}.pdf`);
}

const sidecarNote = (type: ResourceType, pdf: string, title: string) =>
  patchNote("", { type, source: `[[${pdf}]]`, title, added: toLocalDateStr(), processed: false });

export function fileTo(analysis: Pick<Analysis, "file" | "title">, code: string | null, type: ResourceType): Promise<Filed> {
  const { file, title } = analysis;
  return place(code, type, pdfStem(file.name), {
    putPdf: (to) => writeVaultBinary(to, file.bytes, false),
    putSidecar: (to) => createVaultNote({ path: to.sidecar, content: sidecarNote(type, to.pdf, title), overwrite: false }),
    undoPdf: (to) => trashVaultPath(to),
  });
}

export async function fileDrop(
  file: DroppedPdf,
  courses: Course[],
  { courseHint, typeHint }: { courseHint?: string; typeHint?: ResourceType } = {},
): Promise<{ analysis: Analysis; filed: Filed | null }> {
  let doc: PdfDoc | null = null;
  try {
    doc = await readPdf(file.bytes);
  } catch {
    doc = null;
  }
  const settings = readObservatorySettings();
  const sorted = sortByKeywords(courses, file.name, doc?.pages[0]?.text ?? "");
  const analysis: Analysis = {
    file, title: doc?.title ?? file.name.replace(/\.pdf$/i, ""), type: typeHint ?? (doc ? detectType(doc, file.name).type : "other"), ranked: sorted.candidates.map((c) => c.code),
  };
  let code = courseHint ?? (settings.keywordSort ? sorted.match : null);
  let verdict: AiSort | null = null;
  if (!code && doc) {
    const ai = await aiSortPdf(courses, file.name, doc.pages.slice(0, 2).map((p) => p.text).join("\n\n")).catch(() => null);
    verdict = ai;
    if (ai?.course) {
      analysis.ranked = [ai.course, ...analysis.ranked.filter((c) => c !== ai.course)];
      analysis.suggested = ai.course;
      if (!typeHint) analysis.type = ai.type;
      if (ai.confidence >= settings.aiThreshold) code = ai.course;
    }
  }
  const filed = code ? await fileTo(analysis, code, analysis.type) : null;
  if (verdict) {
    const auto = !!filed && code === verdict.course;
    analysis.aiLog = await recordAi({
      code: verdict.course ?? INBOX,
      kind: "sort",
      title: `Sort ${file.name}`,
      markdown: [`- Course: ${verdict.course ?? "none"}`, `- Type: ${verdict.type}`, `- Confidence: ${Math.round(verdict.confidence * 100)}%`, `- ${auto ? `Filed automatically to ${verdict.course}` : "Left for you to choose in the sort popup"}`].join("\n"),
      source: filed?.pdf ?? file.name,
      status: auto ? "applied" : "pending",
    });
  }
  return { analysis, filed };
}

export async function moveResource(sidecar: string, code: string | null, type: ResourceType): Promise<Filed> {
  const from = pdfFor(sidecar);
  const textbook = sidecar.endsWith("/_book.md");
  const stem = textbook ? baseName(sidecar.slice(0, -"/_book.md".length)) : baseName(from).replace(/\.pdf$/, "");
  const filed =
    target(readObservatorySettings().folder, code, type, stem, 1).pdf === from
      ? { code, type, pdf: from, sidecar }
      : await place(code, type, stem, {
          putPdf: (to) => moveVaultPath(from, to),
          putSidecar: (to) => moveVaultPath(sidecar, to.sidecar),
          undoPdf: (to) => moveVaultPath(to, from),
        });
  const raw = await fetchRawNote(filed.sidecar);
  await saveVaultNote({ path: filed.sidecar, content: patchNote(raw.content, { type, source: `[[${filed.pdf}]]` }), expectedMtime: raw.mtime });
  return filed;
}

export async function undoFile(filed: Pick<Filed, "pdf" | "sidecar">): Promise<void> {
  await trashVaultPath(filed.sidecar);
  await trashVaultPath(filed.pdf);
}

const resourceName = (sidecar: string) => (sidecar.endsWith("/_book.md") ? `${baseName(sidecar.slice(0, -"/_book.md".length))}.pdf` : baseName(pdfFor(sidecar)));
const isResource = (n: { path: string; frontmatter: Record<string, unknown> }) => !n.path.includes("/_ai/") && isType(n.frontmatter.type) && typeof n.frontmatter.source === "string";

const toResource = (n: { path: string; title: string; frontmatter: Record<string, unknown> }): Resource => ({
  sidecar: n.path,
  pdf: pdfFor(n.path),
  name: resourceName(n.path),
  title: n.title,
  type: n.frontmatter.type as ResourceType,
  added: typeof n.frontmatter.added === "string" ? n.frontmatter.added : null,
  processed: n.frontmatter.processed === true,
  ...(Array.isArray(n.frontmatter.suggestions) && n.frontmatter.suggestions.length && { suggestions: n.frontmatter.suggestions as CourseSuggestion[] }),
});

export interface Trashed { from: string; path: string }

export async function deleteResource(r: Pick<Resource, "sidecar" | "pdf">): Promise<Trashed[]> {
  const book = r.sidecar.endsWith("/_book.md") ? r.sidecar.slice(0, -"/_book.md".length) : null;
  const out: Trashed[] = [];
  for (const from of book ? [book] : [r.pdf, r.sidecar]) out.push({ from, path: (await trashVaultPath(from)).path });
  return out;
}

export async function restoreResource(trashed: Trashed[]): Promise<void> {
  for (const t of trashed) await restoreVaultPath(t.path, t.from);
}

export function useFiledNames(): Set<string> {
  const { folder } = useObservatorySettings();
  const { data } = useVaultNotes({ limit: 10000 });
  return useMemo(() => new Set((data?.notes ?? []).filter((n) => n.path.startsWith(`${folder}/`) && isResource(n)).map((n) => resourceName(n.path))), [data, folder]);
}

export function useCourseResources(codes: string[]): (Resource & { code: string })[] {
  const { folder } = useObservatorySettings();
  const { data } = useVaultNotes({ limit: 10000 });
  const key = codes.join(",");
  return useMemo(() => {
    const wanted = new Set(key.split(","));
    return (data?.notes ?? []).flatMap((n) => {
      const code = n.path.startsWith(`${folder}/`) ? /^([^/]+)\/resources\//.exec(n.path.slice(folder.length + 1))?.[1] : undefined;
      return code && wanted.has(code) && isResource(n) ? [{ ...toResource(n), code }] : [];
    });
  }, [data, folder, key]);
}

export function useResources(code: string | null): { resources: Resource[]; loading: boolean } {
  const { folder } = useObservatorySettings();
  const { data, isLoading } = useVaultNotes({ limit: 10000 });
  const resources = useMemo(() => {
    const prefix = code ? `${folder}/${code}/resources/` : `${inboxDir(folder)}/`;
    return (data?.notes ?? [])
      .filter((n) => n.path.startsWith(prefix) && isResource(n) && (code || !n.path.slice(prefix.length).includes("/")))
      .map(toResource)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data, folder, code]);
  return { resources, loading: isLoading };
}
