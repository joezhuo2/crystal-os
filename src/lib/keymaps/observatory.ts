import type { KeymapAction } from "@/lib/keymap";

export const OBSERVATORY_KEYS: KeymapAction[] = [
  { id: "observatory.newCourse", category: "observatory", title: "New course", defaultKey: "KeyN" },
  { id: "observatory.review", category: "observatory", title: "Start review", defaultKey: "KeyR" },
  { id: "observatory.back", category: "observatory", title: "Back", defaultKey: "Backspace" },
  { id: "observatory.cycleTab", category: "observatory", title: "Cycle Overview, Topics, Resources and Grades", defaultKey: "KeyV" },
  { id: "observatory.editCourse", category: "observatory", title: "Edit course", defaultKey: "KeyE" },
  { id: "observatory.archiveCourse", category: "observatory", title: "Archive or unarchive course", defaultKey: "KeyA" },
  { id: "observatory.deleteCourse", category: "observatory", title: "Delete course", defaultKey: "Delete" },
  { id: "observatory.processAll", category: "observatory", title: "Process or reprocess all PDFs", defaultKey: "KeyP" },
  { id: "observatory.fullScreen", category: "observatory", title: "Full screen or exit full screen in the reader", defaultKey: "KeyF" },
  { id: "observatory.reveal", category: "observatory", title: "Reveal the answer or next step, or continue", defaultKey: "Space" },
  { id: "observatory.grade1", category: "observatory", title: "Grade Again", defaultKey: "Digit1" },
  { id: "observatory.grade2", category: "observatory", title: "Grade Hard", defaultKey: "Digit2" },
  { id: "observatory.grade3", category: "observatory", title: "Grade Good", defaultKey: "Digit3" },
  { id: "observatory.grade4", category: "observatory", title: "Grade Easy", defaultKey: "Digit4" },
];
