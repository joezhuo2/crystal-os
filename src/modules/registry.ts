import home from "./home/manifest";
import orbit from "./orbit/manifest";
import tasks from "./tasks/manifest";
import calendar from "./calendar/manifest";
import financials from "./financials/manifest";
import weather from "./weather/manifest";
import archive from "./archive/manifest";
import nebula from "./nebula/manifest";
import portal from "./portal/manifest";
import terminal from "./terminal/manifest";
import settings from "./settings/manifest";
import type { ModuleManifest } from "./types";

/** Every module, in the default sidebar order. */
export const MODULES = [home, orbit, tasks, calendar, financials, weather, archive, nebula, portal, terminal, settings] as const;

export type TabId = (typeof MODULES)[number]["id"];

const list: readonly ModuleManifest<TabId>[] = MODULES;

export const MODULE_IDS: readonly TabId[] = list.map((m) => m.id);

export const moduleById = Object.fromEntries(list.map((m) => [m.id, m])) as Record<TabId, ModuleManifest<TabId>>;

export const isModuleId = (v: unknown): v is TabId => typeof v === "string" && v in moduleById;
