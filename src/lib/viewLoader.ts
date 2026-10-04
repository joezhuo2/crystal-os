/**
 * Every main view, each in its own chunk.
 *
 * The Nebula, Terminal and Portal used to be bundled with the app because they
 * keep work running in the background. That work lives in their stores and in
 * Rust (useHarness, terminalNative, portalStore), which Index still imports
 * eagerly; only the pages are split out here.
 *
 * After startup only the views you open most are fetched ahead of time, one
 * after another once the browser is idle, so they never compete with the first
 * render. In performance mode nothing is fetched ahead: a view loads the first
 * time it is opened.
 */

import { lazy, type ComponentType } from "react";
import type { TabId } from "@/components/layout/Navigation";
import { perfSettings } from "@/lib/perfSettings";

export interface ViewProps {
  onNavigate?: (tab: TabId) => void;
}

type ViewModule = Promise<{ default: ComponentType<ViewProps> }>;

const loaders: Record<TabId, () => ViewModule> = {
  home: () => import("@/components/views/HomePage"),
  orbit: () => import("@/components/views/OrbitPage"),
  tasks: () => import("@/components/views/TasksPage"),
  calendar: () => import("@/components/views/CalendarPage"),
  financials: () => import("@/components/views/FinancialsPage"),
  weather: () => import("@/components/views/WeatherPage"),
  archive: () => import("@/components/views/ArchivePage"),
  settings: () => import("@/components/views/SettingsPage"),
  portal: () => import("@/components/views/PortalPage"),
  nebula: () => import("@/components/views/NebulaPage"),
  terminal: () => import("@/components/views/TerminalPage"),
};

export const lazyViews = Object.fromEntries(
  Object.entries(loaders).map(([id, load]) => [id, lazy(load)]),
) as unknown as Record<TabId, ComponentType<ViewProps>>;

/** The task editor and transaction drawer, which live in their views' chunks. */
export const LazyTaskForm = lazy(() => import("@/components/views/TasksPage").then((m) => ({ default: m.TaskForm })));
export const LazyTransactionDrawer = lazy(() =>
  import("@/components/views/FinancialsPage").then((m) => ({ default: m.TransactionDrawer })),
);

/* ── Visit counts ── */

const VISITS_KEY = "crystal-os:tab-visits";

/** How many views are fetched ahead after startup. */
export const PRELOAD_COUNT = 3;

/** Fetched ahead when there is no history yet (a fresh install). */
const DEFAULT_PRELOAD: TabId[] = ["tasks", "calendar"];

/** Wait this long after mount before even asking for an idle moment. */
const SETTLE_MS = 1500;

function readVisits(): Partial<Record<TabId, number>> {
  try {
    const raw = localStorage.getItem(VISITS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Counts an opened tab, so the next startup fetches the views used most. */
export function recordVisit(tab: TabId) {
  if (!(tab in loaders)) return;
  const visits = readVisits();
  visits[tab] = (visits[tab] ?? 0) + 1;
  try {
    localStorage.setItem(VISITS_KEY, JSON.stringify(visits));
  } catch {
    /* storage full or blocked: preload falls back to the defaults */
  }
}

/** The views to fetch ahead: the most visited first, never `current`. */
export function preloadOrder(current: TabId, visits = readVisits(), count = PRELOAD_COUNT): TabId[] {
  const ranked = (Object.keys(visits) as TabId[])
    .filter((tab) => tab in loaders && tab !== current && (visits[tab] ?? 0) > 0)
    .sort((a, b) => (visits[b] ?? 0) - (visits[a] ?? 0));
  const picked = ranked.length ? ranked : DEFAULT_PRELOAD.filter((tab) => tab !== current);
  return picked.slice(0, count);
}

let preloaded = false;

/**
 * Fetches the most visited views' chunks in the background, one at a time,
 * at the first idle moment after the current view has settled. Skipped in
 * performance mode.
 */
export function preloadViews(current: TabId) {
  if (preloaded || perfSettings.getState().performanceMode) return;
  preloaded = true;
  const order = preloadOrder(current);
  const run = async () => {
    for (const tab of order) await loaders[tab]().catch(() => undefined);
  };
  const idle = () => {
    if ("requestIdleCallback" in window) window.requestIdleCallback(() => void run(), { timeout: 5000 });
    else void run();
  };
  window.setTimeout(idle, SETTLE_MS);
}
