import { useSyncExternalStore } from "react";
import { pomodoro } from "@/lib/pomodoro";

/** Subscribe a component to the shared Pomodoro store. */
export function usePomodoro() {
  return useSyncExternalStore(pomodoro.subscribe, pomodoro.getState);
}
