import { describe, expect, it } from "vitest";
import { githubTask, linkedTask, matchProject, parseInbox, type GitHubItem } from "./github";

const item: GitHubItem = { number: 14, title: "Fix the timer", url: "https://github.com/acme/Crystal-OS/issues/14", repo: "acme/Crystal-OS", updatedAt: "2026-11-01T00:00:00Z" };

describe("github", () => {
  it("reads gh search output and drops rows it cannot use", () => {
    const inbox = parseInbox({
      reviews: [{ number: 3, title: "Add x", url: "https://github.com/acme/app/pull/3", repository: { name: "app", nameWithOwner: "acme/app" }, updatedAt: "2026-11-02T00:00:00Z" }],
      issues: [{ number: 1, title: "No repo", url: "https://github.com/acme/app/issues/1" }, { number: 2, title: "Odd host", url: "https://example.com/x", repository: { nameWithOwner: "acme/app" } }],
    });
    expect(inbox.reviews).toEqual([{ number: 3, title: "Add x", url: "https://github.com/acme/app/pull/3", repo: "acme/app", updatedAt: "2026-11-02T00:00:00Z" }]);
    expect(inbox.issues).toEqual([]);
    expect(parseInbox(null)).toEqual({ reviews: [], issues: [] });
  });

  it("matches a Nebula project by folder name, whatever the case or slashes", () => {
    const projects = [{ path: "C:\\code\\other" }, { path: "C:\\code\\crystal-os\\" }, { path: "/home/me/crystal-os-fork" }];
    expect(matchProject(item, projects)).toBe(projects[1]);
    expect(matchProject({ ...item, repo: "acme/missing" }, projects)).toBeUndefined();
  });

  it("builds a task that carries the link, and finds it again by exact URL", () => {
    const task = githubTask(item, "reviews", "c1", "2026-11-18");
    expect(task.name).toBe("Review acme/Crystal-OS#14: Fix the timer");
    expect(task.notes).toBe(item.url);
    expect(githubTask(item, "issues", "c1", "2026-11-18").name).toBe("acme/Crystal-OS#14: Fix the timer");
    expect(linkedTask([task], item)).toBe(task);
    expect(linkedTask([{ ...task, completed: true }], item)).toBeUndefined();
    expect(linkedTask([{ ...task, notes: `${item.url}7` }], item)).toBeUndefined();
  });
});
