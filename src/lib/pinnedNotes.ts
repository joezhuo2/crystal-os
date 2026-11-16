const KEY = "crystal-os-pinned-notes";

export function parsePinned(raw: string | null): string[] {
  try {
    const data: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(data) ? [...new Set(data.filter((p): p is string => typeof p === "string"))] : [];
  } catch {
    return [];
  }
}

export const togglePinned = (list: string[], path: string) => (list.includes(path) ? list.filter((p) => p !== path) : [...list, path]);

export function readPinned(): string[] {
  try {
    return parsePinned(localStorage.getItem(KEY));
  } catch {
    return [];
  }
}

export function writePinned(list: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore localStorage errors */
  }
}
