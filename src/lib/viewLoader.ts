/**
 * The main views, each in its own chunk.
 *
 * Normally every chunk is fetched straight after startup, so switching tabs
 * never waits. In performance mode a view is only loaded the first time it is
 * opened, which keeps views you never visit out of memory. The Nebula,
 * Terminal, and Portal are not here: they are bundled with the app because
 * they keep work running in the background.
 */

import { lazy, type ComponentType } from "react";
import type { TabId } from "@/components/layout/Navigation";
import { perfSettings } from "@/lib/perfSettings";

export interface ViewProps {
  onNavigate?: (tab: TabId) => void;
}

type ViewModule = Promise<{ default: ComponentType<ViewProps> }>;

const loaders = {
  home: (): ViewModule => import("@/components/views/HomePage"),
  tasks: () => import("@/components/views/TasksPage"),
  calendar: (): ViewModule => import("@/components/views/CalendarPage"),
  financials: () => import("@/components/views/FinancialsPage"),
  weather: (): ViewModule => import("@/components/views/WeatherPage"),
  archive: (): ViewModule => import("@/components/views/ArchivePage"),
  settings: (): ViewModule => import("@/components/views/SettingsPage"),
};

export type LazyViewId = keyof typeof loaders;

export const lazyViews: Record<LazyViewId, ComponentType<ViewProps>> = {
  home: lazy(loaders.home),
  tasks: lazy(loaders.tasks),
  calendar: lazy(loaders.calendar),
  financials: lazy(loaders.financials),
  weather: lazy(loaders.weather),
  archive: lazy(loaders.archive),
  settings: lazy(loaders.settings),
};

/** The task editor and transaction drawer, which live in their views' chunks. */
export const LazyTaskForm = lazy(() => loaders.tasks().then((m) => ({ default: m.TaskForm })));
export const LazyTransactionDrawer = lazy(() => loaders.financials().then((m) => ({ default: m.TransactionDrawer })));

let preloaded = false;

/** Fetches every view chunk in the background, unless performance mode is on. */
export function preloadViews() {
  if (preloaded || perfSettings.getState().performanceMode) return;
  preloaded = true;
  const run = () => Object.values(loaders).forEach((load) => load().catch(() => undefined));
  if ("requestIdleCallback" in window) window.requestIdleCallback(run, { timeout: 2000 });
  else setTimeout(run, 200);
}
