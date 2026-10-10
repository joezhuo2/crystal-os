/**
 * The Settings page's sections, for the command palette to search and jump
 * to. Ids match `<Section id>` in SettingsPage.tsx (`data-settings-section`);
 * keywords are the section's row titles plus words people search for.
 */

export interface SettingsSectionEntry {
  id: string;
  title: string;
  /** Shown under the title in the palette. */
  hint: string;
  keywords: string[];
  /** Only rendered in the desktop app. */
  desktopOnly?: boolean;
}

export const SETTINGS_SECTIONS: readonly SettingsSectionEntry[] = [
  { id: "shortcuts", title: "Keyboard shortcuts", hint: "Global hotkeys, search bar", keywords: ["hotkey", "keybinding", "show hide", "open search bar", "go to home", "ctrl k"] },
  { id: "startup", title: "Startup", hint: "Launch at login", keywords: ["launch at login", "autostart", "boot"], desktopOnly: true },
  { id: "vault", title: "Vault", hint: "Obsidian vault folder", keywords: ["obsidian", "vault folder", "notes", "archive"], desktopOnly: true },
  { id: "nebula", title: "The Nebula", hint: "API keys, models, projects folder", keywords: ["nvidia", "nim", "omniroute", "api key", "model", "claude", "projects folder", "coding agent", "mcp"], desktopOnly: true },
  { id: "engine", title: "The Engine", hint: "Work day hours", keywords: ["tasks", "work day starts", "work day ends", "capacity", "fits today"] },
  { id: "notifications", title: "Notifications", hint: "Do Not Disturb, reminders", keywords: ["do not disturb", "dnd", "task due times", "calendar reminders", "remind before events", "pomodoro", "portal messages", "orbit reviews", "test"] },
  { id: "orbit", title: "The Orbit", hint: "Auto-export reviews", keywords: ["auto-export reviews", "weekly", "monthly", "yearly", "review"] },
  { id: "portal", title: "The Portal", hint: "Theme, web apps", keywords: ["theme", "web apps", "discord", "instagram"] },
  { id: "atmosphere", title: "The Atmosphere", hint: "Weather effects, aurora, background", keywords: ["weather effects", "aurora", "background image", "image blur", "sky"] },
  { id: "performance", title: "Performance", hint: "Performance mode", keywords: ["performance mode", "animations", "portal unload delay", "speed"] },
  { id: "install", title: "Install & update", hint: "Version, updates", keywords: ["update", "version", "installer", "upgrade"], desktopOnly: true },
  { id: "diagnostics", title: "Diagnostics", hint: "Error report", keywords: ["error report", "copy diagnostics", "debug", "bug"] },
];

/** The text cmdk matches the palette query against. */
export function settingsSectionValue(entry: SettingsSectionEntry): string {
  return `settings-section-${entry.id} ${entry.title} ${entry.keywords.join(" ")}`;
}
