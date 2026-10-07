/**
 * Pomodoro linked to a task (v0.9.5).
 *
 * The Pomodoro store holds the linked task as `{ id, title }`. These helpers
 * keep that link in step with the task list (a deleted or completed task is
 * unlinked, a renamed one renamed) and choose which tasks the picker offers.
 */
import type { FocusTask } from "@/lib/pomodoro";
import { PRIORITY_RANK } from "@/lib/homeTasks";
import { awakeTasks, type SnoozeLike } from "@/lib/snooze";
import type { Priority } from "@/contexts/AppContext";

/** The fields these helpers read off a task. */
export type FocusTaskLike = SnoozeLike & { name: string; startDate: string; priority: Priority };

export type FocusTaskChange = { action: "keep" } | { action: "unlink" } | { action: "rename"; title: string };

/** What the linked task's link should do now that the task list changed. */
export function reconcileFocusTask(linked: FocusTask | null, tasks: readonly FocusTaskLike[]): FocusTaskChange {
  if (!linked) return { action: "keep" };
  const task = tasks.find((x) => x.id === linked.id);
  if (!task || task.completed) return { action: "unlink" };
  if (task.name !== linked.title) return { action: "rename", title: task.name };
  return { action: "keep" };
}

/**
 * Tasks the picker offers: open and not snoozed. Overdue and today's come
 * first (they sort earliest by date), then by priority, then by name.
 */
export function focusTaskOptions<T extends FocusTaskLike>(tasks: T[], today: string): T[] {
  return awakeTasks(
    tasks.filter((x) => !x.completed),
    today,
  )
    .slice()
    .sort(
      (a, b) =>
        a.startDate.localeCompare(b.startDate) ||
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        a.name.localeCompare(b.name),
    );
}
