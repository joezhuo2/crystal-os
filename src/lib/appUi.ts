/**
 * Transient UI state shared across views: which form or dialog is open, what
 * it is editing, and what the Archive should open. Never persisted.
 *
 * It used to live in AppContext beside the tasks and transactions, so typing
 * in Quick Add or opening a form re-rendered every `useApp()` consumer. Here
 * each component subscribes to the one field it reads (`useAppUi`), and the
 * setters are plain module functions, so calling one re-renders nothing that
 * does not read the field it changes.
 */

import { useSyncExternalStore } from "react";
import type { Task, Transaction } from "@/contexts/AppContext";

export interface AppUiState {
  showTaskForm: boolean;
  editingTask: Task | null;
  showTransactionForm: boolean;
  editingTransaction: Transaction | null;
  /** Vault note the Archive page should open. */
  selectedNotePath: string | null;
  showQuickAdd: boolean;
  /** Seeds the Quick Add dialog, e.g. with whatever was typed in the palette. */
  quickAddDraft: string;
  /** Requests that the Horizon open its "New Event" form. */
  showEventForm: boolean;
  /** Requests that the Horizon open this event's edit form, on its date. */
  openEvent: { id: string; calendarId: string; date: string } | null;
  /** Requests that Settings unfold, scroll to and flash this section. */
  settingsSection: string | null;
}

const initialState: AppUiState = {
  showTaskForm: false,
  editingTask: null,
  showTransactionForm: false,
  editingTransaction: null,
  selectedNotePath: null,
  showQuickAdd: false,
  quickAddDraft: "",
  showEventForm: false,
  openEvent: null,
  settingsSection: null,
};

let state: AppUiState = initialState;
const listeners = new Set<() => void>();

function set<K extends keyof AppUiState>(key: K, value: AppUiState[K]) {
  if (Object.is(state[key], value)) return;
  state = { ...state, [key]: value };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const appUi = {
  getState: () => state,
  subscribe,

  setShowTaskForm: (show: boolean) => set("showTaskForm", show),
  setEditingTask: (task: Task | null) => set("editingTask", task),
  setShowTransactionForm: (show: boolean) => set("showTransactionForm", show),
  setEditingTransaction: (tx: Transaction | null) => set("editingTransaction", tx),
  setSelectedNotePath: (path: string | null) => set("selectedNotePath", path),
  setShowQuickAdd: (show: boolean) => set("showQuickAdd", show),
  setQuickAddDraft: (text: string) => set("quickAddDraft", text),
  setShowEventForm: (show: boolean) => set("showEventForm", show),
  setOpenEvent: (target: AppUiState["openEvent"]) => set("openEvent", target),
  setSettingsSection: (id: string | null) => set("settingsSection", id),

  /** Back to nothing open. AppProvider calls it on sign-out. */
  reset() {
    if (state === initialState) return;
    state = initialState;
    listeners.forEach((l) => l());
  },
};

/**
 * Reads one slice of the UI state. The component re-renders only when the
 * selected value changes, so select a field (or a primitive derived from
 * one), not a new object.
 */
export function useAppUi<T>(selector: (s: AppUiState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}
