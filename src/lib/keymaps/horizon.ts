import type { KeymapAction } from "@/lib/keymap";

export const HORIZON_KEYS: KeymapAction[] = [
  { id: "horizon.cycleView", category: "horizon", title: "Cycle view (month, week, day, agenda)", defaultKey: "KeyV" },
  { id: "horizon.newEvent", category: "horizon", title: "New event", defaultKey: "KeyN" },
];
