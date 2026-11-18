import { quickTask } from "@/lib/quickCommand";
import { invoke } from "@/lib/setup";

export type GitHubList = "reviews" | "issues";

export interface GitHubItem {
  number: number;
  title: string;
  url: string;
  /** "owner/name" */
  repo: string;
  updatedAt: string;
}

export type GitHubInbox = Record<GitHubList, GitHubItem[]>;

export const GITHUB_LISTS: Record<GitHubList, { label: string; hint: string; empty: string }> = {
  reviews: { label: "My review requests", hint: "Open pull requests waiting on your review", empty: "No pull requests are waiting on your review." },
  issues: { label: "My assigned issues", hint: "Open issues assigned to you", empty: "No open issues are assigned to you." },
};

function parseItems(raw: unknown): GitHubItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r: Record<string, unknown>) => {
    const repo = (r?.repository as { nameWithOwner?: unknown } | undefined)?.nameWithOwner;
    const url = r?.url;
    if (typeof repo !== "string" || typeof url !== "string" || !url.startsWith("https://github.com/")) return [];
    return [{ number: Number(r.number), title: String(r.title ?? ""), url, repo, updatedAt: String(r.updatedAt ?? "") }];
  });
}

export function parseInbox(raw: unknown): GitHubInbox {
  const data = (raw ?? {}) as Record<string, unknown>;
  return { reviews: parseItems(data.reviews), issues: parseItems(data.issues) };
}

export const fetchInbox = async () => parseInbox(await invoke("github_inbox"));

export const itemRef = (item: GitHubItem) => `${item.repo}#${item.number}`;

// shortcut: matches on folder name only, so two owners' repos with one name collide; read the git remote if that bites
export function matchProject<T extends { path: string }>(item: GitHubItem, projects: T[]): T | undefined {
  const name = item.repo.split("/").pop()!.toLowerCase();
  return projects.find((p) => p.path.replace(/[\\/]+$/, "").split(/[\\/]/).pop()?.toLowerCase() === name);
}

export function githubTask(item: GitHubItem, list: GitHubList, categoryId: string, today: string) {
  const name = `${list === "reviews" ? "Review " : ""}${itemRef(item)}: ${item.title}`;
  return { ...quickTask(name, categoryId, today), notes: item.url };
}

export function linkedTask<T extends { completed: boolean; notes?: string }>(tasks: T[], item: GitHubItem): T | undefined {
  return tasks.find((t) => !t.completed && t.notes?.split(/\s+/).includes(item.url));
}
