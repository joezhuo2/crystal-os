/**
 * The Settings page's sections, for the command palette to search and jump
 * to. Ids match `<Section id>` in SettingsPage.tsx (`data-settings-section`);
 * keywords are the section's row titles plus words people search for.
 */

import type { TabId } from "@/modules/registry";

export interface SettingsSectionEntry {
  id: string;
  title: string;
  /** Shown under the title in the palette. */
  hint: string;
  keywords: string[];
  /** Only rendered in the desktop app. */
  desktopOnly?: boolean;
  /** Only rendered while this module is installed. */
  module?: TabId;
}

export const SETTINGS_SECTIONS: readonly SettingsSectionEntry[] = [
  { id: "shortcuts", title: "Keyboard shortcuts", hint: "Global hotkeys, search bar", keywords: ["hotkey", "keybinding", "show hide", "open search bar", "go to home", "do not disturb", "dnd", "ctrl k"] },
  { id: "modules", title: "Packages", hint: "Install or uninstall sections", keywords: ["packages", "modules", "install", "uninstall", "add-ons", "addons", "sections", "pages"] },
  { id: "navbar", title: "Navigation", hint: "Sidebar order, hidden pages, top or bottom", keywords: ["navbar", "sidebar", "navigation", "reorder", "hide pages", "pin to bottom", "menu"] },
  { id: "keymap", title: "In-app shortcuts", hint: "Single-key shortcuts, rebind keys", keywords: ["keyboard shortcuts", "keybinding", "rebind", "hotkey", "keymap", "reset shortcuts"] },
  { id: "startup", title: "Startup", hint: "Launch at login", keywords: ["launch at login", "autostart", "boot"], desktopOnly: true },
  { id: "vault", title: "Vault", hint: "Obsidian vault folder", keywords: ["obsidian", "vault folder", "notes", "archive"], desktopOnly: true, module: "archive" },
  { id: "nebula", title: "The Nebula", hint: "API keys, models, projects folder", keywords: ["nvidia", "nim", "omniroute", "api key", "model", "claude", "projects folder", "coding agent", "mcp"], desktopOnly: true, module: "nebula" },
  { id: "engine", title: "The Engine", hint: "Work day hours", keywords: ["tasks", "work day starts", "work day ends", "capacity", "fits today"], module: "tasks" },
  { id: "notifications", title: "Notifications", hint: "Do Not Disturb, reminders", keywords: ["do not disturb", "dnd", "scheduled do not disturb", "quiet hours", "quiet from", "quiet until", "task due times", "task reminders", "deadline", "calendar reminders", "remind before events", "pulse", "leave by", "travel time", "pomodoro", "portal messages", "orbit reviews", "habit reminders", "startup", "test", "what's new", "changelog", "release notes"] },
  { id: "orbit", title: "The Orbit", hint: "Auto-export reviews", keywords: ["auto-export reviews", "weekly", "monthly", "yearly", "review"], module: "orbit" },
  { id: "mail", title: "The Courier", hint: "Claude key, model and mail cache", keywords: ["mail", "cache", "fetch window", "retention", "email", "gmail", "bills", "job applications", "orders", "security alerts", "claude", "anthropic", "api key", "model", "ai"], module: "mail" },
  { id: "atmosphere", title: "The Atmosphere", hint: "Weather effects, aurora, background", keywords: ["weather effects", "aurora", "background image", "image blur", "sky"], module: "weather" },
  { id: "theme", title: "Theme", hint: "Default or Orbit, Flux Lines background", keywords: ["appearance", "default theme", "orbit theme", "black and white", "monochrome", "flux lines", "animated background", "dark", "colours", "colors"] },
  { id: "backgrounds", title: "Backgrounds", hint: "Page and Home box images, blur, opacity", keywords: ["background image", "backdrop", "wallpaper", "blur", "opacity", "home widgets", "home box", "horizon", "engine", "orbit", "portal", "archive"] },
  { id: "privacy", title: "Privacy", hint: "Privacy mode", keywords: ["privacy mode", "blur", "hide money", "amounts", "screen share", "archive notes"] },
  { id: "performance", title: "Performance", hint: "Performance mode", keywords: ["performance mode", "animations", "transitions", "backdrops", "cache", "lazy load", "portal unload delay", "speed"] },
  { id: "install", title: "Install & update", hint: "Version, updates", keywords: ["update", "version", "installer", "upgrade"], desktopOnly: true },
  { id: "diagnostics", title: "Diagnostics", hint: "Error report", keywords: ["error report", "copy diagnostics", "debug", "bug"] },
];

/** The text cmdk matches the palette query against. */
export function settingsSectionValue(entry: SettingsSectionEntry): string {
  return `settings-section-${entry.id} ${entry.title} ${entry.keywords.join(" ")}`;
}
