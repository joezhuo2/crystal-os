import { useSyncExternalStore } from "react";
import { pomodoro, selectFocusMuted } from "@/lib/pomodoro";

/** Subscribe a component to the shared Pomodoro store. */
export function usePomodoro() {
  return useSyncExternalStore(pomodoro.subscribe, pomodoro.getState);
}

const focusMuted = () => selectFocusMuted(pomodoro.getState());

/** True while focus is running. Re-renders only when that flips, not every second. */
export function useFocusMuted(): boolean {
  return useSyncExternalStore(pomodoro.subscribe, focusMuted);
}
