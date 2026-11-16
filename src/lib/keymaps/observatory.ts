import type { KeymapAction } from "@/lib/keymap";

export const OBSERVATORY_KEYS: KeymapAction[] = [
  { id: "observatory.newCourse", category: "observatory", title: "New course", defaultKey: "KeyN" },
  { id: "observatory.review", category: "observatory", title: "Start review", defaultKey: "KeyR" },
  { id: "observatory.reveal", category: "observatory", title: "Reveal the answer or next step, or continue", defaultKey: "Space" },
  { id: "observatory.grade1", category: "observatory", title: "Grade Again", defaultKey: "Digit1" },
  { id: "observatory.grade2", category: "observatory", title: "Grade Hard", defaultKey: "Digit2" },
  { id: "observatory.grade3", category: "observatory", title: "Grade Good", defaultKey: "Digit3" },
  { id: "observatory.grade4", category: "observatory", title: "Grade Easy", defaultKey: "Digit4" },
];
