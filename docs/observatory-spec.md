# The Observatory: CrystalOS study section spec

Nov 15, 2026. Status: spec approved, Phase 1 in progress.

## Overview

The Observatory is a new CrystalOS section that turns scattered course material into a ranked, bite-size study queue, so the time spent scrolling while an agent works goes into studying or casual learning instead. Each course is a constellation and each topic is a star that brightens as it is mastered.

Goals:

- Add and edit courses at any time, each with its own folder and progress file in the Obsidian vault
- Import a course outline and pull out its most important information (learning outcomes, weekly plan, assessments and weights)
- Drop PDFs in and have them sorted into the right course folder automatically, with a manual fallback
- Review with FSRS spaced repetition in 5-minute chunks, reachable in one tap from a Home widget
- Link topics to Engine tasks and Horizon events, and let exam dates drive review priority
- Start and stop the focus timer automatically while studying
- Offer casual learning (Deep Sky) from your own topics, project-based suggestions or random ideas, with Claude features off by default

## Decisions (2026-11-15)

These settle the questions raised against the samples (MATH 117 outline HTML, Problem Set 1, Conic Sections notes, MATH 117 Course Notes) and override anything below that disagrees.

1. Outline import ships in Phase 1. An "Import outline" action (New course dialog and course page) parses the saved outline.uwaterloo.ca HTML locally. It fills `_course.md` (name, term, learning outcomes, assessments with weights and dates) and creates one topic note per weekly plan item with its week(s), course notes page range, text sections and tutorial number. Topics whose title matches a learning outcome get `objective: true`. Only the UW outline template is parsed locally; other formats go through Claude in Phase 5.
2. One topic per plan item (about 35 for MATH 117). An item listed in two weeks (Sequences, IBP, Related Rates, Integration of Rational Functions) is one topic with both weeks. Non-topic rows (Reading Week, Wrap Up / Review) are skipped.
3. Exams: an assessment whose date is in the past is stored with `done: true`. An exam with only a window (Final: December 10 to 23) uses the window start as its date until a Horizon event is linked.
4. The class schedule (lecture and tutorial sections) is ignored.
5. Garbled math in PDF text layers: pool items keep the extracted text plus a cropped page image of the question region, so they read correctly with Claude off. Items with suspect text get a "needs cleanup" tag until edited or until the Claude pass runs.
6. Question sheets with inline answers ("Answer: ..." after each question) are supported: answers are split by sub-part and saved with `answer_source: sheet`.
7. PDFs with no outline and no "Chapter N" headings (course notes) are split by numbered section headings, and topics link to them through the outline's page ranges.
8. The vault only handles `.md` today. New binary read, write and move commands are added that only accept `.pdf` paths inside the Observatory folder. PDF filing is desktop only in v1; review and progress work wherever `.md` writes work.
9. New dependencies approved: `ts-fsrs`, `katex`, `remark-math`, `rehype-katex` (Phase 2), `pdfjs-dist` (Phase 3). KaTeX is not in the Archive pipeline today.
10. Starter courses are created only when the user clicks "Add starter courses": MATH 117 Calculus 1 for Engineering, MATH 115 Linear Algebra for Engineering, ECE 105 Classical Mechanics, ECE 150 Fundamentals of Programming, all term 2026F.
11. Navigation: after The Archive, lucide `Telescope` icon, shown in the phone bar.
12. Until the backdrop PNG is uploaded, a bundled placeholder image (deep indigo sky with stars) stands in.
14. Every parser (outline, textbook, question sheet, slides, scanned and handwritten pages) works fully without Claude and displays what it extracted. Claude only improves results. Every extracted item carries a confidence: text-layer items are lowered by signs of garbling (replacement characters, lost math symbols, broken numbering), and OCR items use the OCR engine's word confidences. Low-confidence items show an "Unclear" badge with the source image beside them and never become FSRS cards without review. Pages with no text layer are OCR'd locally (proposed: tesseract.js with the English model bundled in the app, so no network call). The library choice is confirmed before Phase 3.
15. Importing an outline for a course that already exists merges instead of failing: `_course.md` details (name, term, outcomes, exams, assessments) are replaced from the outline while colour, keywords, learn URL, archived and exam event links are kept; outline topics missing from the course are added; existing topics get their weeks, pages, sections, tutorial and objective updated while their body, questions, priority and links are kept; topics not in the outline are left alone; `progress.md` is never touched. A confirmation screen lists every change (fields changed, topics added, topics updated) before anything is written.
16. Delete course (desktop): a confirmation dialog names the course and its topic count, then the course folder moves into the vault's `.trash/` folder (Obsidian's own trash) with a 5 s Undo toast that moves it back. Nothing is permanently deleted. Hidden on web, like rename.
17. Phase 2 decisions (2026-11-15):
    - Questions are written in an in-app "Add question" editor on each topic (type picker, live preview) that writes callouts into the topic note; hand-written callouts in Obsidian work too.
    - Callout header: `> [!question] <id> type=mc|worked|output|bug|card` (no type means card). Multiple choice options are `- [ ]` / `- [x]` lines in the question; worked problems have numbered steps in `[!answer]`, revealed one at a time; predict the output has a code block in the question and the expected output as the answer; spot the bug has a code block and `line: N` in the answer; flashcards are front (question) and back (answer).
    - Auto grading: multiple choice right is Good, wrong is Again; predict the output exact match after trimming is Good, else Again, with an "I was right" override; spot the bug right line is Good, else Again; worked problems and flashcards are self-graded 1 to 4.
    - Observation summary card: an optional `> [!summary]` callout in the topic note, else the first paragraph, else no card.
    - Priority score until Phase 3 signals exist: base high 3, medium 2, low 1, times (1 + 0.5 if objective + 0.25 if a tutorial covers it). Exam urgency joins in Phase 4.
    - Streak and daily goal are computed from the review logs in every course's progress.md (no global file). A day counts once any observation is finished; days roll over at 4 am.
    - Review lives in a Review view on the page with a course filter (All or one course), opened with R; 1 to 4 grade and Space reveals. The priority map lives on each course page.
    - Settings added: FSRS target retention 0.9, new cards per day per course 10, daily goal 3 observations.
18. Grade calculator (Phase 2): a Grades tab on each course page. Grades are stored per item in `_course.md`: each assessment and exam gets `scores` entries (`{ label, score, max, excused?, missed? }`, max defaults to 100). Grouped items read "best N of M" from the name (for example "Tutorial Assignments (best 7 of 9)" gives 9 slots and drops the lowest 2 scored). Shows: current grade (weighted average over graded work), projected final (current average carried over everything left), what is needed on the remaining work to reach a target (50, 60, 70, 80 or custom), and a 4.0 scale conversion next to the percentage (90+ 4.0, 85 3.9, 80 3.7, 77 3.3, 73 3.0, 70 2.7, 67 2.3, 63 2.0, 60 1.7, 57 1.3, 53 1.0, 50 0.7, below 50 0.0). An item can be marked excused, which moves its weight to another item (default: the final exam); work marked missed counts as 0, and ungraded work is left out of the current grade.
13. Lecture slide decks are a resource type (`slides`, filed under `resources/lectures/`) with their own extraction (see Slide decks). Local extraction ships in Phase 3, the Claude summary in Phase 5. Details are confirmed before Phase 3.

## Fit with CrystalOS

The Observatory is a regular installable package, built from pieces CrystalOS already has.

Theme rule: everything in the tab follows the current CrystalOS theme system rather than introducing new styles. That covers the page, dialogs, the drop zone and popup, toasts, the Home widget, settings controls, skeletons and empty states. Reuse the existing glassmorphism components in src/components/ui/ (glass tooltip, themed select/date/time field controls, dashboard skeletons, dialog, switch, slider), the light/dark mode tokens, privacy blur, performance mode and reduced motion, and the Settings → Backgrounds hooks. Like every other section, it gets its own black hole backdrop and palette, built the same way as the Orbit, Engine and Horizon ones (a deep indigo sky with a slow star field and pale silver constellation lines), and it shows up in Settings → Backgrounds so the image, blur and opacity can be swapped. Do not hard-code colours that already exist as theme tokens.

| Piece | Where it lives today | How The Observatory uses it |
|---|---|---|
| Packages | src/modules/<id>/manifest.ts, Settings → Packages | New module src/modules/observatory/, installable and uninstallable like the rest |
| Navigation | Sidebar, phone bar, J/K order, Settings → Navigation | New page entry, reorderable |
| Archive (vault) | Obsidian vault read/write, refuses overwrites of notes changed on disk | All course content and progress are vault markdown |
| Engine | Tasks with estimates, categories, subtasks | Topic ↔ task links, "create task from topic" |
| Horizon | Google Calendar events | Topic ↔ event links, exam events set deadlines |
| Pomodoro | "Focusing on" picker, focus logged per task | Auto start and stop on study activity, focus logged per topic |
| Orbit | Weekly/monthly/yearly reviews, habits | Study minutes and topics mastered per period (later phase) |
| Pulse (Home grid) | Draggable, themed widgets | New Observatory widget |
| Command palette | Global search, quick actions | Search topics and courses, "Start review" action |
| Notifications | Per-kind switches, Do Not Disturb | Review-due reminder (optional) |
| Privacy mode | Blurs names on Home cards | Blur course and topic names on the widget |

The module follows the repo's conventions: tests next to components (Vitest), Playwright e2e for main flows, Framer Motion transitions that go instant in performance mode or with reduced motion, rebindable single-key shortcuts in Settings → In-app shortcuts, and a CHANGELOG entry.

## Courses and vault layout

Every course is a folder in the vault with a course note, topic notes, sorted resources and one progress file. Topic notes hold content and questions and are rarely rewritten; all review state goes into the course's progress.md, so answering a question never touches a topic note.

```
Observatory/
  _inbox/                    PDFs waiting for a course
  MATH117/
    _course.md               course info, outcomes, exams, weights
    progress.md              FSRS state + stats for this course only
    topics/
      limits.md
      derivatives-chain-rule.md
    resources/
      lectures/
      assignments/
      past-exams/
      textbooks/
      question-sheets/
      other/
  DeepSky/
    progress.md
    topics/
```

### Adding and editing courses

- "New course" dialog: code (MATH117), full name, term, colour, and optional exam dates. Creates the folder, _course.md and an empty progress.md. The dialog can also start from an imported outline.
- Every field is editable later from the course page. Renaming the code renames the folder and fixes links in its notes.
- Archiving a course hides it from the queue and widget but keeps its files.

### _course.md frontmatter

```yaml
---
code: MATH117
name: Calculus 1 for Engineering
term: 2026F
color: "#7aa2ff"
learn_url: https://learn.uwaterloo.ca/...
keywords: [derivative, integral, limit]
outcomes:
  - Demonstrate skill in evaluation of limits, derivatives and integrals
exams:
  - name: Midterm
    date: 2026-10-22
    weight: 0.33
    done: true
  - name: Final
    date: 2026-12-10
    weight: 0.53
    event_id: <horizon event id>
assessments:
  - name: Tutorial Assignments (best 7 of 9)
    weight: 0.14
archived: false
---
```

### Topic note frontmatter

```yaml
---
course: MATH117
title: Chain rule
priority: high            # high | medium | low, editable
objective: true           # matched a learning outcome
weeks: [5]
pages: "65-82"            # course notes page range from the outline
sections: ["Guichard Chapter 4", "3.7"]
tutorial: 4
sources: ["[[resources/lectures/L07.pdf]]"]
learn_url: https://learn.uwaterloo.ca/...
tasks: [<engine task id>]
events: [<horizon event id>]
---
```

Questions sit in the topic body as callouts with stable ids, so progress can point at them:

```
> [!question] q-chain-01
> Differentiate sin(x^2).
>> [!answer]-
>> 2x cos(x^2)
```

### progress.md (one per course)

A short human-readable summary at the top (streak, cards due today, mastery per topic), then one fenced json block with machine state that the app owns: per-card FSRS fields (due, stability, difficulty, reps, lapses, last review), per-topic mastery, and a review log. The app writes it through the Archive's guarded write, so an edit made in Obsidian at the same time is never silently overwritten.

## PDF drop area and sorting

Dropping a PDF anywhere on The Observatory (or on a course page, or the Home widget) files it into <course>/resources/<type>/, trying each enabled sorter in turn and asking only when none of them is confident. Where it ends up can always be changed later.

Sorting order on drop:

1. Dropped on a course page → that course is used, and only the resource type is worked out.
2. Claude sorter (only when "Sort with Claude" is on and a Claude API key is set) → sends the first pages of extracted text plus the course list, and gets back course, resource type (textbook, question sheet, lecture, assignment, past exam, other), suggested topics and a confidence score. Accepted at or above the threshold (default 0.75).
3. Keyword sorter (only when "Sort by keywords" is on) → matches the course code and per-course keywords against the file name and the first page of text. Accepted on a single clear match.
4. Manual popup → shown when both sorters are off, when both fail, or when the sorters disagree. Lists the courses (most likely first), the resource type, and "New course…". Skip leaves the file in _inbox/.

After filing:

- A toast says "Filed L07.pdf to MATH117 / lectures" with Change and Undo (5 s), using the Engine's undo toast pattern.
- Every resource has a Move to… action on its course page, and an _inbox view lists anything unsorted.
- Multiple files can be dropped at once; each is sorted on its own.
- With Claude on, an optional "Draft topics and questions" button on a filed PDF creates topic notes with question callouts, all marked draft: true until accepted.

## Textbooks and question sheets

Textbooks are split into chapters, with each chapter's practice questions and answers pulled into a review pool. Question sheets work the same way. Nothing becomes an FSRS card until accepted.

Detecting the type on drop:

- Textbook: a long PDF with a table of contents, "Chapter N" headings, or numbered section headings (see Decision 7).
- Question sheet: mostly numbered problems, or headings such as Problem Set, Practice, Worksheet or Tutorial.
- Course pages also have Upload textbook and Upload question sheet buttons that force the type.

Vault layout additions:

```
MATH117/resources/
  textbooks/
    stewart-calculus/
      book.pdf
      _book.md             title, chapters with page ranges
      chapters/
        ch03.md            extracted question pool for chapter 3
  question-sheets/
    problem-set-4.pdf
    problem-set-4.md       extracted question pool
```

Extraction (local first, Claude if enabled):

1. Chapters: read the PDF's outline (bookmarks). If none, detect "Chapter N" or numbered section headings with pdf.js. Page ranges are editable in _book.md or from the reader.
2. Practice questions: find sections such as Exercises, Problems, Practice Problems or Review Questions (or the whole document for a question sheet), then split by numbering (1., 3.14, (a), (b)). Sub-parts stay grouped under their parent.
3. Answers: match "Answers to odd-numbered exercises" or "Selected answers" sections by chapter and number (`answer_source: book`), or inline "Answer:" lines split by sub-part (`answer_source: sheet`).
4. Each pool item stores a cropped page image of its region alongside the text (Decision 5).
5. Claude pass (only with the Claude switch on): fixes bad splits, turns math into LaTeX, reads scanned pages, and drafts missing answers (`answer_source: claude-unverified`, warning badge until checked).
6. Large books run chapter by chapter in the background with a progress bar, results are cached, and a scanned book is OCR'd locally page by page, with low-confidence pages marked "Unclear" (Decision 14).

Review pool:

- Each chapter and question sheet has a pool view: question, answer (or "no answer"), source page, matched topic.
- Accept copies the question into the matched topic note as a question callout with a source reference, and creates its FSRS card in progress.md. Accept all, Reject and Change topic work per item or in bulk.
- Pool items keep their state (pool, accepted, rejected) in the chapter or sheet note, so rejected questions don't come back after reprocessing.

Auto-linking: by chapter (`chapters: [3]` in topic frontmatter), by page range (`pages`), then keywords, or Claude when on. Unmatched questions go to an Unsorted group.

Textbook reader: in-app pdf.js reader with a chapter dropdown and a Questions side panel. Opening it counts as opening a resource for focus auto start.

## Slide decks

Lecture slides (samples: ECE 150 "1.01 Hello world!", 19 slides; ECE 105 "Lecture 1", 16 slides) are added like any PDF and the most important information is pulled out of them.

Detecting: landscape pages, little text per page, and a header or footer line repeated on most pages (the deck title, page numbers). Upload slides on a course page forces the type.

Handouts (several slides per page, sample: ECE 150 "1.36 C-style strings", 4 slides per portrait page in a 2 by 2 grid, 5 pages): the plain text stream interleaves the slides (it reads 5, 7, 6, 8), so extraction works from pdf.js text positions instead. The per-slide footer (deck title plus slide number) repeating 2, 4 or 6 times per page gives the grid; text items are assigned to grid cells, slides are ordered by their slide numbers, page-level lines (the handout date, the page number) are dropped, and each slide's cropped image comes from its cell. Code on slides is rebuilt line by line from item positions so indentation survives (the raw stream collapses `int main() { ... }` onto one line). Fixtures: one single-slide deck and this 4-up handout.

Handwritten or scanned pages (sample: ECE 105 "Lecture2_supplementary", one page, no text layer, just an image): read locally with OCR (see Decision 14), shown next to the page image with a confidence indicator. Handwriting usually comes out low confidence, so the image stays the primary view and the OCR text is marked "Unclear". With Claude on, Claude can re-read those pages and replace the text (key points, math as LaTeX, drafted questions marked `claude-unverified`).

Local extraction (Claude off):

1. Per slide: title (first line) and bullets, with repeated header and footer lines and page numbers removed. Consecutive slides with the same title are merged.
2. Deck goals from an outline or overview slide ("In this presentation, we will:", "Overview").
3. Definitions ("A programming language is ...", "X is a / are ...") become draft flashcards in the deck's review pool, with a cropped image of their slide.
4. The result is a lecture note `resources/lectures/<deck>.md` (title, goals, slide-by-slide key points, page refs) linked to the topics it matches by keywords or by the outline's weekly plan.

With Claude on (Phase 5): a short summary and key points per deck, drafted questions of the right types (for example Predict the output for ECE 150 code slides), math as LaTeX, and course logistics found in slides (grading weights, exam dates) offered as suggested `_course.md` changes to accept or dismiss. These are suggestions because slides can disagree with the outline (the ECE 105 deck lists both "Midterm week: Oct 19 to 23" and "Midterm (October 27th)").

## Study queue, priority map and FSRS

The queue serves 5-minute "observations": a short summary card for one topic, then 1 to 3 due questions.

Priority map (per course): a ranked list of topics. Score signals from frontmatter: matched a learning outcome, appeared on a past exam, covered by an assignment or tutorial, emphasised in announcements, plus manual priority. Each row shows mastery star, cards due, linked tasks and events, and its Learn link. Manual priority overrides the computed score.

FSRS: ts-fsrs (FSRS-5 or newer), default parameters, target retention 0.9 (editable). Grades Again, Hard, Good, Easy. Multiple choice maps wrong to Again and right to Good; worked problems are self-graded after reveal. New cards per day per course default 10. Optional later: optimize parameters from the review log.

Queue order: due cards first, sorted by priority score × exam urgency × overdue ratio; then new cards from the highest priority topics. Cards from the same topic stay together.

| Type | Best for | Interaction |
|---|---|---|
| Multiple choice | Linear algebra concepts, definitions | Pick an option, instant feedback |
| Worked problem | Calculus, physics | Try on paper, reveal steps one at a time, self-grade |
| Predict the output | ECE 150 (C++) | Code block, type or pick the output |
| Spot the bug | ECE 150 | Click the line with the bug |
| Flashcard | Formulas, units | Flip, self-grade |

Math renders through the Archive markdown pipeline with KaTeX added; code with the existing syntax highlighting.

Gamification: study streak, a star per topic that brightens with mastery, a constellation that fills in when every topic in a course is mastered, and a daily goal ring (default 3 observations).

## Links to the Engine and the Horizon

- From a topic: Link task and Link event pickers (same style as the Pomodoro "Focusing on" picker); ids saved in the topic's tasks and events frontmatter.
- From a task or event: Link topic picker; the link is written to the topic note, and the task or event shows a star chip that opens the topic.
- Unlinking works from either side. Deleted task or event ids are pruned on next load.
- Linking an event as an exam makes it the deadline for its topics. Exam urgency is flat until 21 days out, then rises steeply over the last 7, pulling cards forward and capping FSRS intervals at the exam date.
- Course pages and the Home widget show a countdown to the next exam.
- Create task from topic: "Review: Chain rule (MATH117)", course as category, estimate about 1 minute per due card rounded up to 15m, due before the linked exam, link preset. Starting its Pomodoro opens the topic's review.

## Focus timer

Auto start triggers (each switchable): opening a topic or starting a session; opening a PDF or note from The Observatory; answering the first question of a session. Ask first (default on) shows "Start focus on Chain rule?" with Start and Not now; with it off the timer starts silently with an Undo toast. If another focus phase is running, the toast offers Switch to this topic.

Auto stop triggers: finishing or closing the session or leaving The Observatory; closing the resource that started it; no study activity for the idle timeout (default 5 minutes). Auto stop pauses and keeps logged time, and only stops a timer The Observatory started.

Logging: the "Focusing on" picker accepts topics. Focus minutes go to the course's progress.md per topic, and to the linked task when there is one.

## Home widget

Shows the next observation, streak, daily goal ring and next exam countdown. Inline review in the card. Drop target for PDFs. Empty state offers Deep Sky or "Get ahead" on the next exam's top topic. Regular draggable, resizable (1 to 3 columns), hideable widget with its own skeleton, themed, respects privacy blur.

## Deep Sky (casual learning)

A second tab using the same observation format and FSRS, with its own DeepSky/progress.md.

| Source | How it works | Needs Claude |
|---|---|---|
| Added by you | Type a topic, optionally attach notes or a PDF; write cards yourself or let Claude draft them | No (drafting needs it) |
| Suggested from your projects | Claude reads only the vault folders picked in Settings and proposes related topics | Yes |
| Random ideas | Claude proposes unrelated topics; "not interested" tunes later picks | Yes |

Suggestions are accepted or dismissed; nothing is added without acceptance. A setting lets Deep Sky cards fill the Home widget once course cards are done. Accepted topics can move into a course.

## Settings → The Observatory

| Setting | Default | Notes |
|---|---|---|
| Claude features (master switch) | Off | Every Claude feature stays disabled until on |
| Claude API key | Empty | Stored like the Nebula keys; Test button |
| Claude model | Latest Sonnet | Dropdown |
| Sort PDFs with Claude | Off | Needs master switch |
| Claude confidence threshold | 0.75 | Slider |
| Sort PDFs by keywords | On | |
| Draft topics and questions with Claude | Off | Needs master switch |
| Deep Sky: suggest from my projects | Off | Needs master switch, plus folder picker |
| Deep Sky: random ideas | Off | Needs master switch |
| Auto start focus: open topic, open resource, first answer | All on | One switch each |
| Ask before starting focus | On | |
| Auto stop focus, idle timeout | On, 5 min | |
| FSRS target retention | 0.9 | |
| New cards per day per course | 10 | |
| Daily goal | 3 observations | |
| Review reminder notification | Off | Uses Notifications switches and Do Not Disturb |
| Observatory folder | Observatory/ | Inside the configured vault |

In-app shortcuts (rebindable): R start review, 1 to 4 grade, Space reveal, N new course.

## Build plan

1. Foundation: module scaffold and manifest, Packages entry, navigation, themed page and backdrop, Settings section, vault layout, New/Edit/Archive course, outline import, topic notes, progress.md read and write, binary PDF vault commands.
2. Study loop: question callout parser, FSRS with ts-fsrs, queue order, all question types, priority map, streak and daily goal.
3. Resources: drop zone, keyword sorter, manual popup, _inbox, Move to, Change/Undo toasts, textbook and question sheet extraction (local, including inline answers and cropped images), slide deck extraction (local), review pool, textbook reader.
4. Integrations: Engine and Horizon links, exam urgency, create task from topic, focus auto start and stop, Home widget, command palette entries.
5. Claude features: master switch and key, Claude sorter, drafting, Deep Sky suggestions, Claude extraction pass, Claude slide summaries and suggested course changes, non-UW outline import. Orbit study stats last.

## Acceptance checks

- [ ] Uninstalling the package removes it from the sidebar, Home, search and Settings and stops its background work; reinstalling brings everything back with no data lost
- [ ] With the Claude master switch off, no network call to Anthropic is ever made
- [ ] Answering a card changes only that course's progress.md, and an edit made in Obsidian at the same time is not overwritten
- [ ] A PDF dropped with both sorters off always shows the popup; a misfiled file can be moved in two clicks
- [ ] Auto stop never stops a hand-started Pomodoro; a textbook with a built-in outline gets its chapters and odd-numbered answers with Claude off; rejected pool questions stay rejected after reprocessing
- [ ] Importing the MATH 117 outline creates the course with its outcomes, three assessments and their weights, and one topic per plan item
- [ ] Every surface matches the current theme in light and dark mode, performance mode and reduced motion, with privacy mode on and off
- [ ] Unit tests for the outline parser, callout parser, FSRS wrapper, queue order, sorters, chapter detection, question splitting and answer matching (with small fixtures); a Playwright e2e test for add course → drop PDF → review → progress saved

## Open questions (later phases)

- Should the popup also confirm auto-sorted files, or is the Change toast enough? (Phase 3)
- What time should the review reminder fire by default? (Phase 4) Decided 2026-11-15: 7:00 PM.
- Requested 2026-11-15 (Phase 5): drop in your own graded work (past midterms, tutorials, practice attempts, including handwriting). Claude (model set in the shared AI settings) or local handwriting analysis explains why answers were wrong and recommends topics to study. Needs: a `my-work` resource type, where analyses are stored, and how recommendations feed the priority map.
- Requested 2026-11-15 (Phase 5): one AI settings area for every module, with a provider switch Off / Claude / NVIDIA NIM.
