# The Observatory Phase 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An installable Observatory section where courses can be created, edited, archived, renamed and imported from a UW course outline, with every course stored as vault markdown (`_course.md`, `progress.md`, topic notes), plus desktop vault commands for PDFs.

**Architecture:** Pure modules (outline parser, vault model serialization) under `src/modules/observatory/` with unit tests; a thin store that writes through the existing vault functions in `src/hooks/useVault.ts`; a themed page wired into the registry, navigation, backdrops, keymaps, Settings and the command palette the same way The Engine and The Horizon are. Rust gets three sandboxed commands for binary files and moves.

**Tech Stack:** React 18, TypeScript, TanStack Query, Framer Motion (`m`), Radix-based `src/components/ui/*`, js-yaml, Vitest + jsdom, Tauri 2 (Rust).

**Spec:** `docs/observatory-spec.md` (Decisions section overrides the rest).

## Global Constraints

- Never use em dashes in code, comments, UI text or docs.
- No explanatory comments or docstrings except short ones for non-obvious edge cases. Concise idiomatic names.
- No redundant null checks or boilerplate try/catch where normal error propagation is fine.
- Do not commit or push. Leave all changes uncommitted.
- Verification is `npm run lint`, `npm run typecheck`, `npm test` (and `cargo test` for Rust). Do not run Playwright or visual checks.
- Follow the theme rule: reuse `src/components/ui/*`, theme tokens, `glass-card` classes, `useAppActivity().still` for motion. No hard-coded colours that exist as tokens.
- No new npm dependencies in Phase 1 (js-yaml is already installed; use `yaml.dump` / `yaml.load`).
- Vault folder default `Observatory`. Course code format after normalising (uppercase, spaces removed): `/^[A-Z]{2,6}\d{2,4}[A-Z]?$/`.

## Review Focus

1. A topic title that slugifies to an existing slug (two "Review" topics) must get `-2`, `-3`, not overwrite a note. Test in Task 2.
2. `progress.md` edited in Obsidian into invalid JSON must not be silently reset to empty (data loss). `parseProgress` throws `ProgressError`; Task 2 tests it, Task 5 surfaces it as a toast and refuses to write.
3. Creating a course whose folder already has a `_course.md` must fail with a clear "already exists" message, not overwrite. Test in Task 5.
4. A concurrent Obsidian edit during `updateProgress` gets one fresh re-read and retry, then a thrown conflict. Test in Task 5.
5. A non-UW or unrelated HTML file given to Import outline must show "Not a UW course outline", not create an empty course. Test in Task 1.

---

## File structure

```
src/modules/observatory/
  manifest.ts                 Task 4
  ObservatoryPage.tsx         Task 6
  CourseDialog.tsx            Task 6
  CoursePage.tsx              Task 6
  ObservatoryPage.test.tsx    Task 6
  ObservatorySettingsSection.tsx  Task 4
  settings.ts (+ .test.ts)    Task 4
  outline.ts (+ .test.ts)     Task 1
  model.ts (+ .test.ts)       Task 2
  store.ts (+ .test.ts)       Task 5
  useObservatory.ts           Task 5
  fixtures/math117-outline.html   exists (trimmed real outline, no staff info)
src/components/ui/color-picker.tsx  Task 6 (moved from HabitManager)
src/assets/observatory-backdrop.svg Task 4
src/lib/keymaps/observatory.ts      Task 4
src-tauri/src/vault.rs, lib.rs, build.rs, capabilities/default.json  Task 3
src/lib/vaultNative.ts (+ test)     Task 3
src/hooks/useVault.ts               Task 5 (two exports)
```

---

### Task 1: UW outline parser

**Files:**
- Create: `src/modules/observatory/outline.ts`
- Test: `src/modules/observatory/outline.test.ts`
- Uses fixture: `src/modules/observatory/fixtures/math117-outline.html`

**Interfaces:**
- Produces:
```ts
export interface Exam { name: string; date: string | null; weight: number; done?: boolean; event_id?: string }
export interface Assessment { name: string; weight: number }
export interface OutlineTopic { title: string; weeks: number[]; pages?: string; sections: string[]; tutorial?: number; objective: boolean }
export interface ParsedOutline { code: string; name: string; term: string; outcomes: string[]; topics: OutlineTopic[]; exams: Exam[]; assessments: Assessment[] }
export class OutlineError extends Error {}
export function parseUwOutline(html: string, today?: Date): ParsedOutline
```

Parsing rules (DOMParser, works in jsdom):
- Header: `.outline-courses` "MATH 117" → code `MATH117`; `.outline-title-full` → name; `.outline-term` "Fall 2026" → term `2026F` (Winter `W`, Spring `S`, Fall `F`). Collapse whitespace and `&nbsp;` everywhere.
- Throw `OutlineError("Not a UW course outline")` when `h2#learning_outcomes` or `h2#tentative_class_plan` is missing.
- Outcomes: each `td` text of the table after `h2#learning_outcomes`.
- Class plan: the `table` after `h2#tentative_class_plan`; skip the header row. Columns: week (`Week N: ...` → N), planned material (each non-empty `<p>` is one topic title), text sections (a `<p>` matching `/pp\.?\s*(\d+)\s*[-–]\s*(\d+)/` gives `pages` "a-b"; every other non-empty `<p>` goes to `sections` verbatim), notes (`Tutorial N: ...` lines).
- Skip titles matching `/reading week|wrap up/i`.
- Same exact title in several weeks → one topic, weeks concatenated, sections deduplicated, pages widened to min start and max end.
- Tutorial: a topic gets `tutorial = N` for the first `Tutorial N:` text that contains its title (case-insensitive substring).
- Objective: significant words of the title (lowercase letters, length ≥ 4, not in `functions function with and the intro rules problems values`), stem = first 5 letters; `objective` when any stem is the prefix of any word in any outcome.
- Assessments table after `h2#assessments_amp_activities`: columns name, date, location, weight. Weight "14%" → 0.14. Rows whose name matches `/exam|midterm|final|test|quiz/i` are exams, the rest assessments. Exam date = first `Month Day` in the date cell with the term's year as `YYYY-MM-DD`, else null. `done: true` when the date is before `today` (default `new Date()`).

- [ ] **Step 1: Write the failing tests** (`today = new Date(2026, 10, 15)`, fixture read with `fs.readFileSync`):

```ts
it("reads the header", () => expect(pick(o, ["code","name","term"])).toEqual({ code: "MATH117", name: "Calculus 1 for Engineering", term: "2026F" }));
it("reads 7 learning outcomes", () => { expect(o.outcomes).toHaveLength(7); expect(o.outcomes[2]).toBe("Demonstrate skill in evaluation of limits, derivatives and integrals"); });
it("splits exams and assessments", () => {
  expect(o.exams).toEqual([
    { name: "Midterm Exam", date: "2026-10-22", weight: 0.33, done: true },
    { name: "Final Exam", date: "2026-12-10", weight: 0.53, done: false },
  ]);
  expect(o.assessments).toEqual([{ name: "Tutorial Assignments (best 7 of 9)", weight: 0.14 }]);
});
it("makes one topic per plan item", () => {
  expect(o.topics).toHaveLength(32);
  expect(o.topics[0]).toEqual({ title: "Conic Sections", weeks: [1], pages: "2-9", sections: ["Guichard §1.2.3, 2.2, 2.4"], tutorial: 1, objective: false });
});
it("merges items listed in two weeks", () => {
  expect(byTitle("Sequences")).toMatchObject({ weeks: [3, 4], pages: "26-64", tutorial: 4 });
  expect(byTitle("Integration by Parts (IBP)").weeks).toEqual([10, 11]);
});
it("skips reading week and wrap up", () => expect(o.topics.some((t) => /reading week|wrap up/i.test(t.title))).toBe(false));
it("flags topics that match an outcome", () => {
  expect(byTitle("Partial Fractions").objective).toBe(true);
  expect(byTitle("IVT/EVT").objective).toBe(false);
  expect(byTitle("Sequences").objective).toBe(false);
});
it("rejects other html", () => expect(() => parseUwOutline("<html><body><h1>Hi</h1></body></html>")).toThrow("Not a UW course outline"));
```

If the count is not 32 after implementing, check the fixture's `<p>` structure by hand and report the real number and why, rather than tuning the parser to the number.

- [ ] **Step 2:** `npx vitest run src/modules/observatory/outline.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement `outline.ts` per the rules above.
- [ ] **Step 4:** Same command → PASS.

---

### Task 2: Vault model (paths, slugs, serialization, outline to course)

**Files:**
- Create: `src/modules/observatory/model.ts`
- Test: `src/modules/observatory/model.test.ts`

**Interfaces:**
- Consumes: `Exam`, `Assessment`, `ParsedOutline` from Task 1; `parseFrontmatter` from `src/lib/vaultNative.ts`.
- Produces:
```ts
export type Priority = "high" | "medium" | "low";
export interface Course { code: string; name: string; term: string; color: string; learn_url?: string; keywords: string[]; outcomes: string[]; exams: Exam[]; assessments: Assessment[]; archived: boolean }
export interface Topic { slug: string; course: string; title: string; priority: Priority; objective: boolean; weeks: number[]; pages?: string; sections: string[]; tutorial?: number; sources: string[]; learn_url?: string; tasks: string[]; events: string[]; body: string }
export interface Progress { version: 1; cards: Record<string, unknown>; mastery: Record<string, number>; log: unknown[] }
export class ProgressError extends Error {}
export const DEFAULT_FOLDER = "Observatory";
export const emptyProgress = (): Progress
export function normalizeCode(raw: string): string | null      // "math 117" -> "MATH117", invalid -> null
export function slugify(title: string, taken?: Set<string>): string  // "Chain rule" -> "chain-rule"; taken "chain-rule" -> "chain-rule-2"
export const coursePath = (folder: string, code: string) => `${folder}/${code}/_course.md`
export const progressPath = (folder: string, code: string) => `${folder}/${code}/progress.md`
export const topicPath = (folder: string, code: string, slug: string) => `${folder}/${code}/topics/${slug}.md`
export function serializeCourse(c: Course): string
export function parseCourse(raw: string): Course
export function serializeTopic(t: Topic): string
export function parseTopic(raw: string, slug: string): Topic
export function serializeProgress(p: Progress, summary: string): string
export function parseProgress(raw: string): Progress
export function outlineToCourse(o: ParsedOutline, color: string): { course: Course; topics: Topic[] }
```

Rules: notes are `---\n${yaml.dump(frontmatter, { lineWidth: -1 })}---\n` plus body. Frontmatter omits `slug` and `body`, and omits undefined optionals. `parseCourse` / `parseTopic` fill defaults for missing keys (empty arrays, `archived: false`, `priority: "medium"`). Progress file is `# Progress\n\n${summary}\n\n` followed by one fenced `json` block of `JSON.stringify(p, null, 2)`. `parseProgress` reads the last json block; an empty string or a file with no block returns `emptyProgress()`; a block that fails `JSON.parse` or lacks `version: 1` throws `ProgressError`. `outlineToCourse`: priority `high` when `objective`, else `medium`; topic body `""`; slugs unique within the course.

- [ ] **Step 1: Write the failing tests:**

```ts
it("normalizes codes", () => { expect(normalizeCode(" math 117 ")).toBe("MATH117"); expect(normalizeCode("ECE150")).toBe("ECE150"); expect(normalizeCode("../x")).toBeNull(); });
it("slugifies uniquely", () => { const taken = new Set(["review"]); expect(slugify("Review", taken)).toBe("review-2"); expect(slugify("FTC1 & FTC2")).toBe("ftc1-ftc2"); expect(slugify("L'Hopital's Rule (LHR)")).toBe("lhopitals-rule-lhr"); });
it("round-trips a course", () => expect(parseCourse(serializeCourse(course))).toEqual(course));
it("round-trips a topic with a body", () => expect(parseTopic(serializeTopic(topic), topic.slug)).toEqual(topic));
it("fills course defaults", () => expect(parseCourse("---\ncode: ECE105\nname: Mechanics\nterm: 2026F\ncolor: '#fff'\n---\n")).toMatchObject({ keywords: [], exams: [], archived: false }));
it("round-trips progress and keeps the summary readable", () => { const raw = serializeProgress(p, "No reviews yet."); expect(raw).toContain("No reviews yet."); expect(parseProgress(raw)).toEqual(p); });
it("treats an empty progress file as empty", () => expect(parseProgress("")).toEqual(emptyProgress()));
it("refuses corrupt progress instead of resetting it", () => expect(() => parseProgress("# Progress\n\n```json\n{ nope\n```\n")).toThrow(ProgressError));
it("builds a course from the outline", () => {
  const { course, topics } = outlineToCourse(parseUwOutline(html, today), "#7aa2ff");
  expect(course).toMatchObject({ code: "MATH117", term: "2026F", color: "#7aa2ff", archived: false });
  expect(course.exams).toHaveLength(2);
  expect(topics).toHaveLength(32);
  expect(new Set(topics.map((t) => t.slug)).size).toBe(32);
  expect(topics.find((t) => t.title === "Partial Fractions")?.priority).toBe("high");
});
```

- [ ] **Step 2:** `npx vitest run src/modules/observatory/model.test.ts` → FAIL.
- [ ] **Step 3:** Implement `model.ts`.
- [ ] **Step 4:** Same command → PASS.

---

### Task 3: Desktop vault commands for PDFs and moves

**Files:**
- Modify: `src-tauri/src/vault.rs` (new normaliser, core fns, commands, tests), `src-tauri/src/lib.rs:75-89` (`generate_handler!`), `src-tauri/build.rs` (`AppManifest` commands list), `src-tauri/capabilities/default.json` (allow entries next to lines 21-26)
- Modify: `src/lib/vaultNative.ts`, `src/lib/vaultNative.test.ts`

**Interfaces:**
- Produces (Rust commands, all using `active_root` + `blocking` like lines 529-550):
  - `read_vault_binary(path: String) -> tauri::ipc::Response` (raw bytes)
  - `write_vault_binary(path: String, data: String /* base64 */, overwrite: bool) -> VaultFile-like { path, mtime }`
  - `move_vault_path(from: String, to: String) -> { path }`
- Produces (TS, in `vaultNative.ts`):
```ts
export function readVaultBinary(path: string): Promise<ArrayBuffer>
export function writeVaultBinary(path: string, bytes: Uint8Array, overwrite: boolean): Promise<{ path: string; mtime: number }>
export function moveVaultPath(from: string, to: string): Promise<{ path: string }>
```

Rules:
- `normalize_binary(raw)`: same rejections as `normalize_relative` (`..`, `:`, leading `/`, control chars, `<>"|?*`, ignored dot folders) but requires a `.pdf` extension (case-insensitive) and does not append `.md`. Resolve with `ensure_inside`.
- `MAX_BINARY_BYTES = 100 * 1024 * 1024`; larger writes fail with the existing too-large style error.
- Write: existing file and `overwrite == false` → `ErrorCode::Conflict`; create parent dirs.
- Move: `from` and `to` are each a `.md` note, a `.pdf`, or a folder (no extension); both resolved inside the vault; `from` must exist; `to` must not exist (`Conflict`); refuse moving the vault root or a folder into itself; create `to`'s parent; `fs::rename`.
- This is a deliberate narrowing of Decision 8: the restriction is ".pdf inside the vault"; the Observatory folder is a frontend setting the backend does not know.
- `permissions/autogenerated/*.toml` regenerate on build; leave the generated files as the build writes them.

- [ ] **Step 1: Write failing Rust tests** in the existing `#[cfg(test)]` module (starts ~line 560), with a temp dir root:
  - `normalize_binary` accepts `Observatory/MATH117/resources/a.PDF`, rejects `a.md`, `a.exe`, `../a.pdf`, `C:/a.pdf`.
  - write then read returns the same bytes; second write without overwrite → Conflict; with overwrite succeeds.
  - move a folder `Observatory/MATH117` → `Observatory/MATH118` keeps its files; move onto an existing path → Conflict; move a folder into its own child → error.
- [ ] **Step 2:** `cargo test --manifest-path src-tauri/Cargo.toml vault` → new tests FAIL.
- [ ] **Step 3:** Implement Rust, register in `lib.rs`, `build.rs`, `capabilities/default.json`.
- [ ] **Step 4:** Same command → PASS; `cargo build --manifest-path src-tauri/Cargo.toml` succeeds.
- [ ] **Step 5: TS wrappers.** Add tests in `vaultNative.test.ts` using its fake `invoke`: `writeVaultBinary` sends base64 of the bytes and `overwrite`; `moveVaultPath` sends `{ from, to }`; a `conflict` error from invoke surfaces as `NativeVaultError` with code `conflict`. Implement with the file's `invoke` helper. `npx vitest run src/lib/vaultNative.test.ts` → PASS.

---

### Task 4: Module scaffold, theme, settings and wiring

**Files:**
- Create: `src/modules/observatory/manifest.ts` (copy `archive/manifest.ts`; `id: "observatory"`, `label: "The Observatory"`, `icon: Telescope`, `description: "Courses, study queue and spaced repetition."`, `phone: true`, no `bottom`, `load: () => import("./ObservatoryPage")`)
- Create: `src/modules/observatory/ObservatoryPage.tsx` stub exporting a default page (Task 6 fills it)
- Create: `src/assets/observatory-backdrop.svg` (1920×1080 with explicit `width`/`height`: deep indigo radial gradient, about 80 small pale stars, a few faint silver constellation lines)
- Create: `src/lib/keymaps/observatory.ts`: `OBSERVATORY_KEYS = [{ id: "observatory.newCourse", category: "observatory", title: "New course", defaultKey: "KeyN" }]`
- Create: `src/modules/observatory/settings.ts` (+ `settings.test.ts`), `ObservatorySettingsSection.tsx`
- Modify: `src/modules/registry.ts` (import + after `archive` in `MODULES`), `src/pages/Index.tsx` (`BACKDROP_TABS` line 40, `backdrop()` 74-99, body theme toggle 254-262, `rootClass` 279-301), `src/components/layout/Navigation.tsx` (`SidebarMode` 38, `activePillStyle` 45-95, white text list 123, `pageMode` 204-225, `sidebarClass` 228-248, `gradientClass` 249-268), `src/lib/backdropSettings.ts:12,14`, `src/lib/imageBackdrop.ts` (import + `IMAGES`), `src/components/views/SettingsPage.tsx` (`BACKDROP_LABELS` 421-429: "The Observatory"; new `Section` near orbit 1144-1150), `src/lib/settingsSections.ts` (new entry `{ id: "observatory", title: "The Observatory", hint: "Vault folder for courses", keywords: ["study", "courses", "flashcards", "fsrs"], module: "observatory" }`; add "observatory" to the backgrounds keywords line 35), `src/index.css` (copy the Engine blocks at 1748-1754, 1841-1886, 1923-1933 as `observatory-root` / `body.observatory-theme` / `.observatory-title` / `.sidebar-observatory` with an indigo hue around 235 and pale silver accents; add `.observatory-title` to the reset list at 4735), `src/lib/keymap.ts` (import, `KeymapCategory`, `KEYMAP_CATEGORY_LABELS` "The Observatory", `KEYMAP` spread), `src/components/CommandPalette.tsx` (copy the trades block ~1085-1097: "Open The Observatory"), `src/lib/navSettings.test.ts` (13 → 14 tabs and the other ordering assertions)

**Interfaces:**
- Produces:
```ts
export interface ObservatorySettings { folder: string }
export function useObservatorySettings(): ObservatorySettings
export function setObservatoryFolder(folder: string): void   // trims, strips leading/trailing slashes, empty -> "Observatory"
```
Storage: localStorage key `crystal-os-observatory`, `useSyncExternalStore`, same read/write guards as `backdropSettings.ts`. Later phases add fields to this store.
- Settings section renders on web too (`SettingsSearch.test.tsx` requires it): one `Row` with an `Input` for the folder, committed on blur or Enter.

- [ ] **Step 1:** Write `settings.test.ts`: default folder is `Observatory`; `setObservatoryFolder(" /Study/ ")` stores `Study`; `setObservatoryFolder("")` restores `Observatory`; corrupt stored JSON reads as default.
- [ ] **Step 2:** Run it → FAIL. Implement `settings.ts` → PASS.
- [ ] **Step 3:** Do all wiring edits above.
- [ ] **Step 4:** `npm run typecheck` passes (the `BACKDROP_LABELS` record and `KeymapCategory` force missing entries); `npx vitest run src/lib src/components` passes, including `navSettings.test.ts`, `keymapConflicts.test.ts`, `SettingsSearch.test.tsx`.

---

### Task 5: Course store

**Files:**
- Modify: `src/hooks/useVault.ts`: export `fetchRawNote` and add `export function saveVaultNote(input: SaveNoteInput)` (the body of `useSaveNote`'s `mutationFn`; `useSaveNote` calls it)
- Create: `src/modules/observatory/store.ts`, `src/modules/observatory/store.test.ts`, `src/modules/observatory/useObservatory.ts`

**Interfaces:**
- Consumes: Task 2 model; `createVaultNote`, `saveVaultNote`, `fetchRawNote`, `vaultErrorCode`, `useVaultNotes` from `useVault.ts`; `moveVaultPath` (Task 3); `isDesktop` from `@/lib/platform`.
- Produces (`store.ts`, plain async, no React):
```ts
export const STARTER_COURSES: Pick<Course, "code" | "name" | "term">[]  // MATH117 Calculus 1 for Engineering, MATH115 Linear Algebra for Engineering, ECE105 Classical Mechanics, ECE150 Fundamentals of Programming; all 2026F
export class CourseExistsError extends Error {}
export async function createCourse(folder: string, course: Course, topics?: Topic[]): Promise<void>
export async function saveCourse(folder: string, course: Course, expectedMtime: number): Promise<void>
export async function renameCourse(folder: string, oldCode: string, course: Course): Promise<void>  // desktop only
export async function updateProgress(folder: string, code: string, change: (p: Progress) => Progress, summary?: string): Promise<Progress>
```
- Produces (`useObservatory.ts`):
```ts
export interface CourseEntry { course: Course; path: string }
export function useCourses(): { courses: CourseEntry[]; loading: boolean; error: Error | null }   // archived included; callers filter
export function useTopics(code: string | null): { topics: Topic[]; loading: boolean }
```

Rules:
- `createCourse`: writes `_course.md` with `overwrite: false` first; a `conflict` becomes `CourseExistsError("MATH117 already exists")`. Then `progress.md` (`emptyProgress()`, summary "No reviews yet.") and each topic (`overwrite: false`).
- `renameCourse`: `moveVaultPath(folder/old, folder/new)`, then rewrite `_course.md` with the new code and each topic note's `course` field (read raw, save with its mtime). Throws on web (`isDesktop()` false); the UI hides the code field from editing there.
- `updateProgress`: read raw (missing file → empty), `parseProgress` (a `ProgressError` propagates and nothing is written), apply `change`, `saveVaultNote` with the read mtime; on a `conflict` re-read and retry once; a second conflict throws.
- `useCourses` / `useTopics` read `VaultNote.frontmatter` from `useVaultNotes({ limit: 10000 })` filtered to `${folder}/*/_course.md` and `${folder}/${code}/topics/*.md`, parsed through `parseCourse` / `parseTopic` on a rebuilt frontmatter string or a small `courseFromData` helper in `model.ts`. If the web server caps `limit`, add a `prefix` query param to `GET /api/obsidian/notes` in `server/obsidian/plugin.ts` and `vault.ts`, with a test in `server/obsidian/vault.test.ts`.
- Writes invalidate `["vault"]` queries (call `queryClient.invalidateQueries` from the hook-level wrappers in the page, or pass the client in).

- [ ] **Step 1: Write failing tests** (`vi.mock("@/hooks/useVault")` and `vi.mock("@/lib/vaultNative")` with in-memory maps):
  - `createCourse` writes `Observatory/MATH117/_course.md`, `progress.md` and one note per topic at `topicPath`.
  - `createCourse` on an existing course throws `CourseExistsError` and writes nothing else.
  - `updateProgress` applies the change and the saved file parses back to it.
  - `updateProgress` with one conflict retries and succeeds; with two conflicts throws a conflict.
  - `updateProgress` on corrupt progress throws `ProgressError` and calls no save.
  - `renameCourse` calls `moveVaultPath("Observatory/MATH117", "Observatory/MATH118")` then saves `_course.md` with `code: MATH118` and each topic with `course: MATH118`.
- [ ] **Step 2:** `npx vitest run src/modules/observatory/store.test.ts` → FAIL. Implement → PASS.

---

### Task 6: Page, course dialog, course page

**Files:**
- Create: `src/components/ui/color-picker.tsx` (move the `ColorPicker` from `src/modules/orbit/HabitManager.tsx:22-60`, export it, import it back in HabitManager)
- Modify: `src/modules/observatory/ObservatoryPage.tsx`; Create: `CourseDialog.tsx`, `CoursePage.tsx`, `ObservatoryPage.test.tsx`

**Interfaces:**
- Consumes: Tasks 1, 2, 4, 5.
- Produces: `CourseDialog({ initial?: Course; topics?: Topic[]; onClose(): void })` where `initial` without a path means create.

Behaviour:
- Header like `OrbitPage.tsx:771-782` with `<span className="observatory-title">The Observatory</span>`. Toolbar: New course, Import outline (hidden `<input type="file" accept=".html,.htm">`), Show archived toggle.
- Empty state (no courses): text plus New course, Import outline, and Add starter courses (creates the four `STARTER_COURSES` with default colours from the ColorPicker presets; skips ones that exist).
- Course grid: `glass-card-hover` cards with colour dot, code, name, term, topic count, and "Next exam in N days" from the first exam that is not done and has a date. Archived courses hidden unless toggled. Click opens `CoursePage`.
- CourseDialog (pattern `src/modules/trades/TradeDialog.tsx:149-253`): code, name, term, colour, learn URL, keywords (comma separated), exams list (name, `DateField`, weight %, done), archived switch on edit. Code validated with `normalizeCode`; invalid shows an inline error. On web the code field is read-only when editing. Save calls `createCourse`, `saveCourse` or `renameCourse`. `CourseExistsError`, `ProgressError` and conflict errors show as toasts with the message.
- Import outline: read the file text, `parseUwOutline`, `outlineToCourse` with the next unused preset colour, open `CourseDialog` prefilled with a line "32 topics, 7 outcomes and 3 assessments will be created". `OutlineError` → toast "Not a UW course outline".
- CoursePage: back button, course header with edit and archive actions, outcomes list (collapsible), assessments and exams with weights, topic list sorted by first week then title, each row showing title, weeks, pages, tutorial, an Objective badge and priority.
- Motion: `m.div` fade like TasksPage with `useAppActivity().still` disabling it.
- Shortcut: `useShortcut("observatory.newCourse", openNewCourse, !dialogOpen)`.

- [ ] **Step 1: Write failing tests** (mock `useObservatory`, `store`, `useAppActivity`, `useShortcut` like `OrbitPage.test.tsx:31-39`):
  - With no courses, the empty state shows New course, Import outline and Add starter courses; clicking Add starter courses calls `createCourse` four times with codes MATH117, MATH115, ECE105, ECE150.
  - Archived courses are hidden until Show archived is on.
  - Importing the fixture file opens the dialog prefilled with code MATH117 and the "32 topics" line; saving calls `createCourse` with 32 topics.
  - Importing `<html></html>` shows "Not a UW course outline" and opens no dialog.
  - An invalid code (`12AB`) shows the inline error and does not call `createCourse`.
- [ ] **Step 2:** `npx vitest run src/modules/observatory` → FAIL. Implement → PASS.

---

### Task 7: Verification and docs

- [ ] **Step 1:** `npm run lint`, `npm run typecheck`, `npm test` all pass; `cargo test --manifest-path src-tauri/Cargo.toml` passes.
- [ ] **Step 2:** Grep the diff for the em dash character; none allowed.
- [ ] **Step 3:** README feature table: a row for The Observatory (Phase 1 scope: courses, outline import, vault layout). CHANGELOG: an Unreleased entry in the file's existing style. TODO: an Observatory item listing Phases 2 to 5 as open.
