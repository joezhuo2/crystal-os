import { describe, expect, it } from "vitest";
import {
  awakeTasks,
  canSnooze,
  cleanSnoozeDate,
  clearedSnooze,
  formatSnoozeDate,
  isSnoozed,
  msUntilMidnight,
  ownSnoozed,
  sameDayNextMonth,
  snoozedSections,
  snoozeLabel,
  snoozePresets,
  snoozeUpdates,
  splitSnoozed,
  UNSNOOZE,
  type SnoozeLike,
} from "./snooze";

const task = (over: Partial<SnoozeLike> = {}): SnoozeLike => ({ id: "a", completed: false, ...over });

describe("cleanSnoozeDate", () => {
  it("keeps real dates and drops the rest", () => {
    expect(cleanSnoozeDate("2026-10-12")).toBe("2026-10-12");
    expect(cleanSnoozeDate("2026-10-12T00:00:00Z")).toBe("2026-10-12");
    expect(cleanSnoozeDate("2026-02-30")).toBeUndefined();
    expect(cleanSnoozeDate("soon")).toBeUndefined();
    expect(cleanSnoozeDate(null)).toBeUndefined();
  });
});

describe("ownSnoozed", () => {
  it("hides until the start of the snooze day", () => {
    const t = task({ snoozedUntil: "2026-10-10" });
    expect(ownSnoozed(t, "2026-10-09")).toBe(true);
    expect(ownSnoozed(t, "2026-10-10")).toBe(false);
    expect(ownSnoozed(t, "2026-10-11")).toBe(false);
  });

  it("hides Someday tasks with no end", () => {
    expect(ownSnoozed(task({ someday: true }), "2099-01-01")).toBe(true);
  });

  it("never hides a completed task", () => {
    expect(ownSnoozed(task({ someday: true, completed: true }), "2026-10-07")).toBe(false);
    expect(ownSnoozed(task({ snoozedUntil: "2026-12-01", completed: true }), "2026-10-07")).toBe(false);
  });

  it("is awake with no snooze", () => {
    expect(ownSnoozed(task(), "2026-10-07")).toBe(false);
  });
});

describe("isSnoozed", () => {
  it("makes a child follow its parent", () => {
    const parent = task({ id: "p", someday: true });
    const child = task({ id: "c", parentId: "p" });
    const byId = new Map([parent, child].map((t) => [t.id, t]));
    expect(isSnoozed(child, "2026-10-07", byId)).toBe(true);
  });

  it("ignores a child's own snooze while its parent is awake", () => {
    const parent = task({ id: "p" });
    const child = task({ id: "c", parentId: "p", someday: true });
    const byId = new Map([parent, child].map((t) => [t.id, t]));
    expect(isSnoozed(child, "2026-10-07", byId)).toBe(false);
  });

  it("lets an orphaned child stand on its own", () => {
    const child = task({ id: "c", parentId: "gone", someday: true });
    expect(isSnoozed(child, "2026-10-07", new Map())).toBe(true);
  });

  it("keeps a completed child out of the snoozed set", () => {
    const parent = task({ id: "p", someday: true });
    const child = task({ id: "c", parentId: "p", completed: true });
    const byId = new Map([parent, child].map((t) => [t.id, t]));
    expect(isSnoozed(child, "2026-10-07", byId)).toBe(false);
  });
});

describe("splitSnoozed and awakeTasks", () => {
  const tasks = [
    task({ id: "a" }),
    task({ id: "b", snoozedUntil: "2026-10-09" }),
    task({ id: "c", parentId: "b" }),
    task({ id: "d", snoozedUntil: "2026-10-01" }),
  ];

  it("splits in list order", () => {
    const { awake, snoozed } = splitSnoozed(tasks, "2026-10-07");
    expect(awake.map((t) => t.id)).toEqual(["a", "d"]);
    expect(snoozed.map((t) => t.id)).toEqual(["b", "c"]);
  });

  it("wakes everything once the date comes", () => {
    expect(awakeTasks(tasks, "2026-10-09").map((t) => t.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("returns the same array when nothing is snoozed", () => {
    const plain = [task({ id: "a" }), task({ id: "b" })];
    expect(awakeTasks(plain, "2026-10-07")).toBe(plain);
  });
});

describe("canSnooze", () => {
  it("allows open top-level tasks only", () => {
    expect(canSnooze(task())).toBe(true);
    expect(canSnooze(task({ completed: true }))).toBe(false);
    expect(canSnooze(task({ parentId: "p" }))).toBe(false);
  });
});

describe("snoozeUpdates and clearedSnooze", () => {
  it("sets one kind and clears the other", () => {
    expect(snoozeUpdates("2026-10-12")).toEqual({ snoozedUntil: "2026-10-12", someday: undefined });
    expect(snoozeUpdates("someday")).toEqual({ snoozedUntil: undefined, someday: true });
  });

  it("clears only a task that has a snooze", () => {
    expect(clearedSnooze(task())).toEqual({});
    expect(clearedSnooze(task({ someday: true }))).toBe(UNSNOOZE);
    expect(clearedSnooze(task({ snoozedUntil: "2026-10-12" }))).toBe(UNSNOOZE);
  });
});

describe("sameDayNextMonth", () => {
  it("clamps to the month's last day", () => {
    expect(sameDayNextMonth("2026-01-31")).toBe("2026-02-28");
    expect(sameDayNextMonth("2028-01-31")).toBe("2028-02-29");
    expect(sameDayNextMonth("2026-10-07")).toBe("2026-11-07");
    expect(sameDayNextMonth("2026-12-15")).toBe("2027-01-15");
  });
});

describe("snoozePresets", () => {
  const dates = (today: string) => Object.fromEntries(snoozePresets(today).map((p) => [p.id, p.date]));

  it("on a Wednesday", () => {
    // 2026-10-07 is a Wednesday.
    expect(dates("2026-10-07")).toEqual({
      tomorrow: "2026-10-08",
      weekend: "2026-10-10",
      "next-week": "2026-10-12",
      "next-month": "2026-11-07",
    });
  });

  it("on a Saturday, the weekend is next week's", () => {
    expect(dates("2026-10-10")).toMatchObject({ weekend: "2026-10-17", "next-week": "2026-10-12" });
  });

  it("on a Sunday", () => {
    expect(dates("2026-10-11")).toMatchObject({ weekend: "2026-10-17", "next-week": "2026-10-12" });
  });

  it("on a Monday, next week is a week away", () => {
    expect(dates("2026-10-12")).toMatchObject({ "next-week": "2026-10-19" });
  });

  it("every preset is after today", () => {
    for (const p of snoozePresets("2026-10-07")) expect(p.date > "2026-10-07").toBe(true);
  });
});

describe("labels", () => {
  it("formats the date, with the year only when it differs", () => {
    expect(formatSnoozeDate("2026-10-12", "2026-10-07")).toBe("Mon, Oct 12");
    expect(formatSnoozeDate("2027-01-04", "2026-10-07")).toBe("Mon, Jan 4, 2027");
  });

  it("labels each kind", () => {
    expect(snoozeLabel(task({ someday: true }), "2026-10-07")).toBe("Someday");
    expect(snoozeLabel(task({ snoozedUntil: "2026-10-12" }), "2026-10-07")).toBe("Until Mon, Oct 12");
    expect(snoozeLabel(task(), "2026-10-07")).toBe("");
  });
});

describe("snoozedSections", () => {
  it("orders dated tasks soonest first, leaves children out, and puts Someday apart", () => {
    const snoozed = [
      task({ id: "late", snoozedUntil: "2026-11-01" }),
      task({ id: "some", someday: true }),
      task({ id: "soon", snoozedUntil: "2026-10-09" }),
      task({ id: "kid", parentId: "soon" }),
    ];
    const { dated, someday } = snoozedSections(snoozed);
    expect(dated.map((t) => t.id)).toEqual(["soon", "late"]);
    expect(someday.map((t) => t.id)).toEqual(["some"]);
  });
});

describe("msUntilMidnight", () => {
  it("counts to the next local midnight", () => {
    expect(msUntilMidnight(new Date(2026, 9, 7, 23, 59, 0))).toBe(60_000);
    expect(msUntilMidnight(new Date(2026, 9, 7, 0, 0, 0))).toBe(86_400_000);
  });
});
