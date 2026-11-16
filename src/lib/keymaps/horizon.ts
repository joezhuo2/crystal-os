import type { KeymapAction } from "@/lib/keymap";

export const HORIZON_KEYS: KeymapAction[] = [
  { id: "horizon.previous", category: "horizon", title: "Previous month, week or day", defaultKey: "KeyA" },
  { id: "horizon.next", category: "horizon", title: "Next month, week or day", defaultKey: "KeyD" },
  { id: "horizon.cycleView", category: "horizon", title: "Cycle view (month, week, day, agenda)", defaultKey: "KeyV" },
  { id: "horizon.newEvent", category: "horizon", title: "New event", defaultKey: "KeyN" },
  { id: "horizon.signOut", category: "horizon", title: "Disconnect Google Calendar", defaultKey: "Shift+KeyQ" },
  { id: "horizon.openToday", category: "horizon", title: "Go to today", defaultKey: "KeyT" },
  { id: "horizon.previousArrow", category: "horizon", title: "Previous month, week or day (arrow)", defaultKey: "ArrowLeft" },
  { id: "horizon.nextArrow", category: "horizon", title: "Next month, week or day (arrow)", defaultKey: "ArrowRight" },
  { id: "horizon.viewMonth", category: "horizon", title: "Month view", defaultKey: "Digit1" },
  { id: "horizon.viewWeek", category: "horizon", title: "Week view", defaultKey: "Digit2" },
  { id: "horizon.viewDay", category: "horizon", title: "Day view", defaultKey: "Digit3" },
  { id: "horizon.viewAgenda", category: "horizon", title: "Agenda view", defaultKey: "Digit4" },
];
