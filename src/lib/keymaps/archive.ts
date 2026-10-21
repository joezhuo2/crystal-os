import type { KeymapAction } from "@/lib/keymap";

export const ARCHIVE_KEYS: KeymapAction[] = [
  { id: "archive.newNote", category: "archive", title: "New note", defaultKey: "KeyN" },
  { id: "archive.search", category: "archive", title: "Search the vault", defaultKey: "Slash" },
];
