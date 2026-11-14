export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const core = await import("@tauri-apps/api/core");
  return core.invoke<T>(cmd, args);
}

export const SETUP_KEYS = [
  { key: "VITE_SUPABASE_URL", label: "Supabase URL", placeholder: "https://xxxx.supabase.co", secret: false },
  { key: "VITE_SUPABASE_ANON_KEY", label: "Supabase anon key", placeholder: "eyJ…", secret: true },
  { key: "GOOGLE_CLIENT_ID", label: "Google client ID", placeholder: "xxxx.apps.googleusercontent.com", secret: false },
  { key: "GOOGLE_CLIENT_SECRET", label: "Google client secret", placeholder: "GOCSPX-…", secret: true },
] as const;

export type SetupKey = (typeof SETUP_KEYS)[number]["key"];
export type EnvStatus = Record<SetupKey, boolean>;

export const getEnvStatus = () => invoke<EnvStatus>("setup_env_status");
export const writeEnv = (values: Partial<Record<SetupKey, string>>) => invoke<EnvStatus>("setup_write_env", { values });

const DISMISSED_KEY = "crystal-os-onboarding-dismissed";

export function onboardingDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissOnboarding() {
  try {
    localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // Storage blocked: the card comes back next launch.
  }
}

export type ChecklistId = "keys" | "vault" | "calendar" | "nim" | "login";

export interface ChecklistItem {
  id: ChecklistId;
  title: string;
  detail: string;
  action: string;
  done: boolean;
}

export interface ChecklistState {
  env: EnvStatus | null;
  vaultChosen: boolean;
  calendarConnected: boolean;
  nimKey: boolean | null;
  launchAtLogin: boolean | null;
  installed: (module: "archive" | "calendar" | "nebula") => boolean;
}

export function checklist(state: ChecklistState): ChecklistItem[] {
  const supabase = Boolean(state.env?.VITE_SUPABASE_URL && state.env?.VITE_SUPABASE_ANON_KEY);
  const google = Boolean(state.env?.GOOGLE_CLIENT_ID && state.env?.GOOGLE_CLIENT_SECRET);
  const items: (ChecklistItem | false)[] = [
    {
      id: "keys",
      title: "Local API keys",
      detail: !supabase
        ? "Supabase keys are missing, so the calendar and mail cannot connect."
        : google
          ? "Supabase and Google keys are saved."
          : "Google keys are missing, so the calendar cannot connect.",
      action: "Enter keys",
      done: supabase && google,
    },
    state.installed("archive") && {
      id: "vault",
      title: "Obsidian vault folder",
      detail: "Pick the folder The Archive and Quick Add read and write.",
      action: "Choose folder",
      done: state.vaultChosen,
    },
    state.installed("calendar") && {
      id: "calendar",
      title: "Google Calendar",
      detail: google ? "Connect your calendar in The Horizon." : "Needs the Google keys first.",
      action: "Open The Horizon",
      done: state.calendarConnected,
    },
    state.installed("nebula") && {
      id: "nim",
      title: "NIM key",
      detail: "Add an NVIDIA NIM key for The Nebula's Medium tier.",
      action: "Open Settings",
      done: state.nimKey === true,
    },
    {
      id: "login",
      title: "Launch at login",
      detail: "Start hidden in the tray so the hotkeys always work.",
      action: "Turn on",
      done: state.launchAtLogin === true,
    },
  ];
  return items.filter((item): item is ChecklistItem => item !== false);
}
