import { useMemo, useSyncExternalStore } from "react";
import type { AiChoice, AiProvider } from "@/lib/ai";

export interface ObservatorySettings {
  folder: string;
  retention: number;
  newPerDay: number;
  dailyGoal: number;
  keywordSort: boolean;
  focusOnTopic: boolean;
  focusOnResource: boolean;
  focusOnAnswer: boolean;
  focusAsk: boolean;
  focusAutoStop: boolean;
  idleMinutes: number;
  reminder: boolean;
  reminderTime: string;
  aiProvider: AiChoice;
  aiModel: string;
  aiSort: boolean;
  aiThreshold: number;
  aiDraft: boolean;
  aiExtract: boolean;
  aiCaptureAsk: boolean;
  deepSkyProjects: boolean;
  deepSkyFolders: string[];
  deepSkyRandom: boolean;
  deepSkyFillHome: boolean;
}

type Flag =
  | "keywordSort" | "focusOnTopic" | "focusOnResource" | "focusOnAnswer" | "focusAsk" | "focusAutoStop" | "reminder"
  | "aiSort" | "aiDraft" | "aiExtract" | "aiCaptureAsk" | "deepSkyProjects" | "deepSkyRandom" | "deepSkyFillHome";
const FLAGS: Flag[] = [
  "keywordSort", "focusOnTopic", "focusOnResource", "focusOnAnswer", "focusAsk", "focusAutoStop", "reminder",
  "aiSort", "aiDraft", "aiExtract", "aiCaptureAsk", "deepSkyProjects", "deepSkyRandom", "deepSkyFillHome",
];
const AI_CHOICES: readonly AiChoice[] = ["none", "claude", "nim", "omniroute"];

const KEY = "crystal-os-observatory";
const DEFAULTS: ObservatorySettings = {
  folder: "Observatory", retention: 0.9, newPerDay: 10, dailyGoal: 3, keywordSort: true,
  focusOnTopic: true, focusOnResource: true, focusOnAnswer: true, focusAsk: true, focusAutoStop: true, idleMinutes: 5,
  reminder: false, reminderTime: "19:00",
  aiProvider: "none", aiModel: "", aiSort: false, aiThreshold: 0.75, aiDraft: false, aiExtract: false, aiCaptureAsk: false,
  deepSkyProjects: false, deepSkyFolders: [], deepSkyRandom: false, deepSkyFillHome: false,
};

const normFolder = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "") : "");
const cleanFolder = (v: unknown) => normFolder(v) || DEFAULTS.folder;
const clamp = (v: unknown, min: number, max: number, fallback: number, step = 1) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v / step) * step)) : fallback;
const cleanRetention = (v: unknown) => +clamp(v, 0.7, 0.99, DEFAULTS.retention, 0.01).toFixed(2);
const cleanNewPerDay = (v: unknown) => clamp(v, 0, 100, DEFAULTS.newPerDay);
const cleanDailyGoal = (v: unknown) => clamp(v, 1, 20, DEFAULTS.dailyGoal);
const cleanIdle = (v: unknown) => clamp(v, 1, 60, DEFAULTS.idleMinutes);
const cleanTime = (v: unknown) => (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : DEFAULTS.reminderTime);
const cleanThreshold = (v: unknown) => +clamp(v, 0.5, 0.95, DEFAULTS.aiThreshold, 0.01).toFixed(2);
const cleanProvider = (v: unknown): AiChoice => (AI_CHOICES.includes(v as AiChoice) ? (v as AiChoice) : DEFAULTS.aiProvider);
const cleanModel = (v: unknown) => (typeof v === "string" && /^[\w.:/-]{0,120}$/.test(v.trim()) ? v.trim() : DEFAULTS.aiModel);
const cleanFolders = (v: unknown) =>
  Array.isArray(v)
    ? [...new Set(v.map(normFolder).filter((f) => f && !f.split("/").includes("..")))].slice(0, 20)
    : DEFAULTS.deepSkyFolders;

function load(): ObservatorySettings {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    const s = (parsed && typeof parsed === "object" ? parsed : {}) as Partial<Record<keyof ObservatorySettings, unknown>>;
    return {
      folder: cleanFolder(s.folder),
      retention: cleanRetention(s.retention),
      newPerDay: cleanNewPerDay(s.newPerDay),
      dailyGoal: cleanDailyGoal(s.dailyGoal),
      ...(Object.fromEntries(FLAGS.map((f) => [f, typeof s[f] === "boolean" ? s[f] : DEFAULTS[f]])) as Record<Flag, boolean>),
      idleMinutes: cleanIdle(s.idleMinutes),
      reminderTime: cleanTime(s.reminderTime),
      aiProvider: cleanProvider(s.aiProvider),
      aiModel: cleanModel(s.aiModel),
      aiThreshold: cleanThreshold(s.aiThreshold),
      deepSkyFolders: cleanFolders(s.deepSkyFolders),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

let state = load();
const listeners = new Set<() => void>();

export const readObservatorySettings = () => state;

function update(patch: Partial<ObservatorySettings>) {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage blocked: the change still applies for this session.
  }
  listeners.forEach((l) => l());
}

export const setObservatoryFolder = (folder: string) => update({ folder: cleanFolder(folder) });
export const setObservatoryRetention = (retention: number) => update({ retention: cleanRetention(retention) });
export const setObservatoryNewPerDay = (newPerDay: number) => update({ newPerDay: cleanNewPerDay(newPerDay) });
export const setObservatoryDailyGoal = (dailyGoal: number) => update({ dailyGoal: cleanDailyGoal(dailyGoal) });
export const setObservatoryKeywordSort = (keywordSort: boolean) => update({ keywordSort });
export const setObservatoryFlag = (flag: Flag, on: boolean) => update({ [flag]: on });
export const setObservatoryIdleMinutes = (idleMinutes: number) => update({ idleMinutes: cleanIdle(idleMinutes) });
export const setObservatoryReminderTime = (reminderTime: string) => update({ reminderTime: cleanTime(reminderTime) });
export const setObservatoryAiProvider = (aiProvider: AiChoice) => update({ aiProvider: cleanProvider(aiProvider) });
export const setObservatoryAiModel = (aiModel: string) => update({ aiModel: cleanModel(aiModel) });
export const setObservatoryAiThreshold = (aiThreshold: number) => update({ aiThreshold: cleanThreshold(aiThreshold) });
export const setObservatoryDeepSkyFolders = (folders: string[]) => update({ deepSkyFolders: cleanFolders(folders) });

const toAi = (aiProvider: AiChoice, model: string): { provider: AiProvider; model: string } | null =>
  aiProvider === "none" ? null : { provider: aiProvider, model };

export const observatoryAi = () => toAi(state.aiProvider, state.aiModel);

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useObservatorySettings(): ObservatorySettings {
  return useSyncExternalStore(subscribe, readObservatorySettings);
}

export function useObservatoryAi(): { provider: AiProvider; model: string } | null {
  const { aiProvider, aiModel } = useObservatorySettings();
  return useMemo(() => toAi(aiProvider, aiModel), [aiProvider, aiModel]);
}
