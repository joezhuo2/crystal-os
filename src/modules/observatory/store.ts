import { createVaultNote, fetchRawNote, saveVaultNote, vaultErrorCode } from "@/hooks/useVault";
import { isDesktop } from "@/lib/platform";
import { listNotesNative, moveVaultPath, parseFrontmatter, restoreVaultPath, trashVaultPath } from "@/lib/vaultNative";
import {
  coursePath,
  emptyProgress,
  normalizeCode,
  outlineFields,
  parseProgress,
  patchNote,
  progressPath,
  serializeCourse,
  serializeProgress,
  serializeTopic,
  topicPath,
  type Course,
  type OutlineMerge,
  type Progress,
  type Topic,
} from "./model";
import { newQuestionId, upsertQuestion, type QuestionDraft } from "./questions";

export const STARTER_COURSES: Pick<Course, "code" | "name" | "term">[] = [
  { code: "MATH117", name: "Calculus 1 for Engineering", term: "2026F" },
  { code: "MATH115", name: "Linear Algebra for Engineering", term: "2026F" },
  { code: "ECE105", name: "Classical Mechanics", term: "2026F" },
  { code: "ECE150", name: "Fundamentals of Programming", term: "2026F" },
];

export class CourseExistsError extends Error {}

const assertCode = (code: string) => {
  if (normalizeCode(code) !== code) throw new Error(`Invalid course code "${code}"`);
};

const readOrNull = async (path: string) => {
  try {
    return await fetchRawNote(path);
  } catch (err) {
    if (vaultErrorCode(err) === "not_found") return null;
    throw err;
  }
};

export async function createCourse(folder: string, course: Course, topics: Topic[] = []): Promise<void> {
  assertCode(course.code);
  try {
    await createVaultNote({ path: coursePath(folder, course.code), content: serializeCourse(course), overwrite: false });
  } catch (err) {
    if (vaultErrorCode(err) === "conflict") throw new CourseExistsError(`${course.code} already exists`);
    throw err;
  }
  await createVaultNote({
    path: progressPath(folder, course.code),
    content: serializeProgress(emptyProgress(), "No reviews yet."),
    overwrite: false,
  });
  for (const t of topics) {
    await createVaultNote({ path: topicPath(folder, course.code, t.slug), content: serializeTopic({ ...t, course: course.code }), overwrite: false });
  }
}

// Returns the paths it skipped because their frontmatter does not parse
async function patchNotes(edits: [path: string, fields: object][]): Promise<string[]> {
  const skipped: string[] = [];
  for (const [path, fields] of edits) {
    const raw = await fetchRawNote(path);
    let content: string;
    try {
      content = patchNote(raw.content, fields);
    } catch {
      skipped.push(path);
      continue;
    }
    await saveVaultNote({ path, content, expectedMtime: raw.mtime });
  }
  return skipped;
}

export async function saveCourse(folder: string, course: Course): Promise<void> {
  assertCode(course.code);
  const path = coursePath(folder, course.code);
  const raw = await fetchRawNote(path);
  // learn_url: undefined clears a removed URL instead of keeping the old one
  await saveVaultNote({ path, content: patchNote(raw.content, { learn_url: undefined, ...course }), expectedMtime: raw.mtime });
}

export async function saveTopic(folder: string, code: string, slug: string, fields: Partial<Omit<Topic, "slug" | "body">>): Promise<void> {
  const path = topicPath(folder, code, slug);
  const raw = await fetchRawNote(path);
  await saveVaultNote({ path, content: patchNote(raw.content, fields), expectedMtime: raw.mtime });
}

export async function saveQuestion(
  folder: string,
  code: string,
  slug: string,
  draft: Omit<QuestionDraft, "id"> & { id?: string },
): Promise<string> {
  const path = topicPath(folder, code, slug);
  const raw = await fetchRawNote(path);
  const body = parseFrontmatter(raw.content).content;
  const id = draft.id || newQuestionId(body);
  const head = raw.content.slice(0, raw.content.length - body.length);
  await saveVaultNote({ path, content: head + upsertQuestion(body, { ...draft, id }), expectedMtime: raw.mtime });
  return id;
}

export async function editTopicBody(folder: string, code: string, slug: string, edit: (body: string) => string): Promise<void> {
  const path = topicPath(folder, code, slug);
  const raw = await fetchRawNote(path);
  const body = parseFrontmatter(raw.content).content;
  const head = raw.content.slice(0, raw.content.length - body.length);
  await saveVaultNote({ path, content: head + edit(body), expectedMtime: raw.mtime });
}

export async function createTopic(folder: string, code: string, topic: Topic, extra: object = {}): Promise<void> {
  const content = patchNote(serializeTopic({ ...topic, course: code }), extra);
  await createVaultNote({ path: topicPath(folder, code, topic.slug), content, overwrite: false });
}

export async function renameCourse(folder: string, oldCode: string, course: Course): Promise<string[]> {
  if (!isDesktop()) throw new Error("Renaming a course needs the desktop app");
  assertCode(course.code);
  await moveVaultPath(`${folder}/${oldCode}`, `${folder}/${course.code}`);
  await saveCourse(folder, course);

  const prefix = `${folder}/${course.code}/topics/`;
  const notes = await listNotesNative();
  const topics = notes.filter((n) => n.path.startsWith(prefix) && n.path.endsWith(".md"));
  return patchNotes(topics.map((n) => [n.path, { course: course.code }]));
}

export async function applyOutlineMerge(folder: string, code: string, { course, added, updated }: OutlineMerge): Promise<string[]> {
  await saveCourse(folder, { ...course, code });
  for (const t of added) {
    await createVaultNote({ path: topicPath(folder, code, t.slug), content: serializeTopic({ ...t, course: code }), overwrite: false });
  }
  return patchNotes(updated.map((t) => [topicPath(folder, code, t.slug), outlineFields(t)]));
}

const desktopOnly = () => {
  if (!isDesktop()) throw new Error("Deleting a course needs the desktop app");
};

export async function deleteCourse(folder: string, code: string): Promise<string> {
  desktopOnly();
  return (await trashVaultPath(`${folder}/${code}`)).path;
}

export async function restoreCourse(trashPath: string, folder: string, code: string): Promise<void> {
  desktopOnly();
  await restoreVaultPath(trashPath, `${folder}/${code}`);
}

export async function updateProgress(
  folder: string,
  code: string,
  change: (p: Progress) => Progress,
  summary?: string | ((p: Progress) => string),
): Promise<Progress> {
  const path = progressPath(folder, code);
  for (let attempt = 0; ; attempt++) {
    const raw = await readOrNull(path);
    const next = change(raw ? parseProgress(raw.content) : emptyProgress());
    const text = typeof summary === "function" ? summary(next) : summary;
    const content = serializeProgress(next, text ?? (next.log.length ? `${next.log.length} reviews logged.` : "No reviews yet."));
    try {
      if (raw) await saveVaultNote({ path, content, expectedMtime: raw.mtime });
      else await createVaultNote({ path, content, overwrite: false });
      return next;
    } catch (err) {
      if (attempt > 0 || vaultErrorCode(err) !== "conflict") throw err;
    }
  }
}
