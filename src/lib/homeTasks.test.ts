import { describe, expect, it } from "vitest";
import type { Priority, Task } from "@/contexts/AppContext";
import { UPCOMING_DAYS, upcomingDates, upcomingTasks } from "./homeTasks";

const TODAY = "2026-09-23";

function task(id: string, priority: Priority, startDate: string, extra: Partial<Task> = {}): Task {
  return {
    id,
    name: id,
    startDate,
    startTime: "",
    endDate: startDate,
    endTime: "",
    priority,
    categoryId: "c",
    completed: false,
    ...extra,
  };
}

describe("upcomingDates", () => {
  it("lists the days after today, not today itself", () => {
    const dates = upcomingDates(TODAY);
    expect(dates).toHaveLength(UPCOMING_DAYS);
    expect(dates[0]).toBe("2026-09-24");
    expect(dates.at(-1)).toBe("2026-10-07");
  });
});

describe("upcomingTasks", () => {
  it("puts higher priority first, even when it is later", () => {
    const ids = upcomingTasks(
      [task("low-soon", "low", "2026-09-24"), task("urgent-later", "urgent", "2026-09-30"), task("high-mid", "high", "2026-09-26")],
      TODAY,
    ).map((u) => u.task.id);
    expect(ids).toEqual(["urgent-later", "high-mid", "low-soon"]);
  });

  it("breaks a priority tie by earliest date, then earliest start time", () => {
    const ids = upcomingTasks(
      [
        task("b-late-day", "medium", "2026-09-28"),
        task("a-soon-pm", "medium", "2026-09-25", { startTime: "15:00" }),
        task("z-soon-am", "medium", "2026-09-25", { startTime: "09:00" }),
      ],
      TODAY,
    ).map((u) => u.task.id);
    expect(ids).toEqual(["z-soon-am", "a-soon-pm", "b-late-day"]);
  });

  it("ignores names entirely", () => {
    const ids = upcomingTasks([task("Alpha", "low", "2026-09-24"), task("Zulu", "urgent", "2026-09-24")], TODAY).map(
      (u) => u.task.id,
    );
    expect(ids).toEqual(["Zulu", "Alpha"]);
  });

  it("uses a repeating task's next occurrence and skips completed or out-of-range tasks", () => {
    const result = upcomingTasks(
      [
        task("weekly", "medium", "2026-09-20", { repeatDays: 7 }),
        task("done", "urgent", "2026-09-24", { completed: true }),
        task("far", "urgent", "2026-12-01"),
      ],
      TODAY,
    );
    expect(result).toEqual([{ task: expect.objectContaining({ id: "weekly" }), date: "2026-09-27" }]);
  });
});
