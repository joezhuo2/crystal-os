import { describe, expect, it } from "vitest";
import { dueLabel, latestJobs, mailRecap, mailSummary, newestFirst, relativeDate, sortBills, type MailItem } from "./mail";

let n = 0;
const item = (over: Partial<MailItem>): MailItem => ({
  id: String(++n),
  accountId: "a1",
  provider: "google",
  account: "me@example.com",
  category: "bill",
  confident: true,
  classifiedBy: "rules",
  from: "Sender",
  fromAddress: "sender@example.com",
  subject: "Subject",
  snippet: "",
  receivedAt: "2026-11-10T12:00:00Z",
  url: "https://mail.example.com",
  ...over,
});

const local = (date: string, time = "12:00") => new Date(`${date}T${time}:00`).toISOString();

describe("sortBills", () => {
  it("puts dated bills first, soonest due, then undated ones newest first", () => {
    const items = [
      item({ id: "undated-old", receivedAt: "2026-11-01T00:00:00Z" }),
      item({ id: "late", dueDate: "2026-11-20" }),
      item({ id: "order", category: "order" }),
      item({ id: "undated-new", receivedAt: "2026-11-09T00:00:00Z" }),
      item({ id: "soon", dueDate: "2026-11-14" }),
    ];
    expect(sortBills(items).map((i) => i.id)).toEqual(["soon", "late", "undated-new", "undated-old"]);
  });
});

describe("latestJobs", () => {
  it("keeps the newest email per company, falling back to the sender", () => {
    const items = [
      item({ id: "acme-1", category: "job", company: "Acme", jobStatus: "applied", receivedAt: "2026-11-01T00:00:00Z" }),
      item({ id: "acme-2", category: "job", company: "ACME", jobStatus: "interview", receivedAt: "2026-11-05T00:00:00Z" }),
      item({ id: "globex", category: "job", from: "Globex Talent", jobStatus: "rejected", receivedAt: "2026-11-03T00:00:00Z" }),
    ];
    expect(latestJobs(items).map((i) => i.id)).toEqual(["acme-2", "globex"]);
  });
});

describe("newestFirst", () => {
  it("filters one category and sorts by received time across time zone offsets", () => {
    const items = [
      item({ id: "a", category: "order", receivedAt: "2026-11-10T10:00:00+02:00" }),
      item({ id: "b", category: "order", receivedAt: "2026-11-10T09:00:00Z" }),
      item({ id: "c", category: "security" }),
    ];
    expect(newestFirst(items, "order").map((i) => i.id)).toEqual(["b", "a"]);
  });
});

describe("mailSummary", () => {
  it("counts bills due in 7 days, active applications and this week's orders and alerts", () => {
    const now = new Date("2026-11-13T12:00:00");
    const items = [
      item({ dueDate: "2026-11-13" }),
      item({ dueDate: "2026-11-20" }),
      item({ dueDate: "2026-11-21" }),
      item({ dueDate: "2026-11-12" }),
      item({ category: "job", company: "Acme", jobStatus: "interview" }),
      item({ category: "job", company: "Globex", jobStatus: "rejected" }),
      item({ category: "order", receivedAt: local("2026-11-07") }),
      item({ category: "order", receivedAt: local("2026-11-05") }),
      item({ category: "security", receivedAt: local("2026-11-13", "09:00") }),
    ];
    expect(mailSummary(items, now)).toEqual({ billsDue: 2, activeJobs: 1, orders: 1, security: 1 });
  });
});

describe("dueLabel", () => {
  it("marks overdue, today, tomorrow and later", () => {
    expect(dueLabel("2026-11-10", "2026-11-13")).toBe("Overdue · Nov 10");
    expect(dueLabel("2026-11-13", "2026-11-13")).toBe("Due today");
    expect(dueLabel("2026-11-14", "2026-11-13")).toBe("Due tomorrow");
    expect(dueLabel("2026-11-30", "2026-11-13")).toBe("Due Nov 30");
  });
});

describe("relativeDate", () => {
  it("reads minutes, hours, days, then the date", () => {
    const now = new Date("2026-11-13T12:00:00Z");
    expect(relativeDate("2026-11-13T11:59:40Z", now)).toBe("just now");
    expect(relativeDate("2026-11-13T11:15:00Z", now)).toBe("45m ago");
    expect(relativeDate("2026-11-13T07:00:00Z", now)).toBe("5h ago");
    expect(relativeDate("2026-11-10T12:00:00Z", now)).toBe("3d ago");
    expect(relativeDate("2026-10-01T12:00:00Z", now)).toMatch(/^(Sep 30|Oct 1)$/);
  });
});

describe("mailRecap", () => {
  it("lists bills due within a week, the day's job updates and counts", () => {
    const day = "2026-11-13";
    const items = [
      item({ from: "Power Co", fromAddress: "billing@power.example", amount: "$84.20", dueDate: "2026-11-18" }),
      item({ from: "Water", dueDate: "2026-11-25" }),
      item({ from: "Old", dueDate: "2026-11-01" }),
      item({ category: "job", company: "Acme", jobStatus: "applied", receivedAt: local(day, "09:00") }),
      item({ category: "job", company: "Acme", jobStatus: "interview", receivedAt: local(day, "15:00") }),
      item({ category: "job", company: "Globex", receivedAt: local(day, "10:00") }),
      item({ category: "job", company: "Initech", jobStatus: "offer", receivedAt: local("2026-11-12") }),
      item({ category: "order", receivedAt: local(day) }),
      item({ category: "order", receivedAt: local(day, "18:00") }),
      item({ category: "security", receivedAt: local(day) }),
    ];
    const lines = mailRecap(items, day);
    expect(lines).toEqual([
      "## Mail",
      "",
      "- **Bill** Power Co $84.20, due Nov 18",
      "- **Job** Acme: Interview",
      "- **Job** Globex: Update",
      "- **Orders** 2 emails",
      "- **Security alerts** 1",
    ]);
    expect(lines!.join("\n")).not.toContain("@");
  });

  it("returns null when there is nothing to say", () => {
    expect(mailRecap([], "2026-11-13")).toBeNull();
    expect(mailRecap([item({ category: "order", receivedAt: local("2026-11-12") })], "2026-11-13")).toBeNull();
  });
});
