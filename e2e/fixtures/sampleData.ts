import { buildNote, type VaultNoteDetail } from "../../src/lib/vaultCore";
import type { FxConversion, TradeEvent, TradeJournal, TradesData } from "../../src/lib/trades";
import type { MailDigest, MailStatus } from "../../src/lib/mail";
import type { AiStatus } from "../../src/lib/ai";
import { parseFrontmatter } from "../../src/lib/vaultNative";
import { emptyProgress, serializeCourse, serializeProgress, serializeTopic, type Course, type Topic } from "../../src/modules/observatory/model";
import { formatQuestion, type QuestionDraft, type QuestionType } from "../../src/modules/observatory/questions";

export const SAMPLE_EMAIL = "sample@example.com";
export const SAMPLE_USER_ID = "5a5a5a5a-0000-4000-8000-000000000001";

const pad = (n: number) => String(n).padStart(2, "0");
const uuid = (group: number, n: number) => `00000000-0000-4000-8${pad(group)}0-${String(n).padStart(12, "0")}`;

export function day(offset: number, base = new Date()): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const NOW = new Date(`${day(0)}T10:20:00`);

export const at = (offset: number, time: string) => new Date(`${day(offset)}T${time}:00`).toISOString();

const weekday = (offset: number) => new Date(`${day(offset)}T12:00:00`).getDay();

// Deterministic pseudo-random, so every capture shows the same data.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const created = at(-120, "09:00");

export const taskCategories = [
  { id: uuid(1, 1), name: "Work", color: "hsl(239 84% 67%)" },
  { id: uuid(1, 2), name: "Personal", color: "hsl(160 84% 39%)" },
  { id: uuid(1, 3), name: "Health", color: "hsl(340 82% 52%)" },
  { id: uuid(1, 4), name: "Learning", color: "hsl(45 93% 47%)" },
].map((c) => ({ ...c, user_id: SAMPLE_USER_ID, created_at: created }));

const [WORK, PERSONAL, HEALTH, LEARNING] = taskCategories.map((c) => c.id);

export const financialCategories = [
  { id: uuid(2, 1), name: "Salary", color: "hsl(160 84% 39%)" },
  { id: uuid(2, 2), name: "Food & Dining", color: "hsl(25 95% 53%)" },
  { id: uuid(2, 3), name: "Transport", color: "hsl(239 84% 67%)" },
  { id: uuid(2, 4), name: "Entertainment", color: "hsl(340 82% 52%)" },
  { id: uuid(2, 5), name: "Utilities", color: "hsl(45 93% 47%)" },
  { id: uuid(2, 6), name: "Coffee", color: "hsl(30 60% 40%)" },
  { id: uuid(2, 7), name: "Housing", color: "hsl(200 70% 50%)" },
].map((c) => ({ ...c, user_id: SAMPLE_USER_ID, created_at: created }));

const [SALARY, FOOD, TRANSPORT, FUN, UTILITIES, COFFEE, HOUSING] = financialCategories.map((c) => c.id);

type TaskSeed = [name: string, offset: number, start: string, end: string, priority: string, category: string, extra?: Record<string, unknown>];

const taskSeeds: TaskSeed[] = [
  ["Draft Q4 roadmap outline", 0, "09:00", "10:30", "high", WORK, { estimate_minutes: 90, checklist: [
    { id: "c1", text: "Collect team goals", done: true },
    { id: "c2", text: "Sketch milestones", done: true },
    { id: "c3", text: "Share for review", done: false },
  ] }],
  ["Review pull requests", 0, "11:00", "11:45", "medium", WORK, { estimate_minutes: 45 }],
  ["Lunch walk", 0, "12:30", "13:00", "low", HEALTH, { estimate_minutes: 30 }],
  ["Write project status update", 0, "14:00", "15:00", "urgent", WORK, { estimate_minutes: 60 }],
  ["Read two chapters of the sample book", 0, "20:00", "21:00", "low", LEARNING, { estimate_minutes: 60 }],
  ["Morning stretch", 0, "07:00", "07:20", "medium", HEALTH, { completed: true, repeat_kind: "daily", repeat_days: 1 }],
  ["Inbox zero", 0, "08:00", "08:30", "medium", PERSONAL, { completed: true }],
  ["Prepare demo slides", 1, "10:00", "12:00", "high", WORK, { estimate_minutes: 120 }],
  ["Dentist appointment", 1, "15:30", "16:30", "medium", HEALTH],
  ["Practice Spanish lesson 12", 1, "19:00", "19:30", "low", LEARNING, { estimate_minutes: 30 }],
  ["Team retro notes", 2, "13:00", "14:00", "medium", WORK],
  ["Fix bike brakes", 2, "17:30", "18:30", "low", PERSONAL],
  ["Renew library card", 3, "12:00", "12:15", "low", PERSONAL],
  ["Quarterly budget check-in", 4, "09:30", "10:30", "high", PERSONAL, { estimate_minutes: 60 }],
  ["Online course: module 4", 5, "10:00", "11:30", "medium", LEARNING, { estimate_minutes: 90 }],
  ["Call the landlord about the heater", -1, "16:00", "16:20", "urgent", PERSONAL],
  ["Send invoice to Sample Studio", -1, "10:00", "10:30", "high", WORK, { completed: true }],
  ["Gym: upper body", -1, "18:00", "19:00", "medium", HEALTH, { completed: true }],
  ["Update team wiki page", -2, "14:00", "15:00", "medium", WORK, { completed: true }],
  ["Back up laptop", -3, "20:00", "20:30", "low", PERSONAL, { completed: true }],
  ["Pick a new houseplant", 6, "11:00", "12:00", "low", PERSONAL],
];

export const tasks = taskSeeds.map(([name, offset, start, end, priority, category, extra], i) => ({
  id: uuid(3, i + 1),
  user_id: SAMPLE_USER_ID,
  name,
  start_date: day(offset),
  start_time: start,
  end_date: day(offset),
  end_time: end,
  priority,
  category_id: category,
  completed: false,
  repeat_kind: null,
  repeat_days: null,
  repeat_weekdays: null,
  created_at: at(Math.min(offset, 0) - 3, "08:00"),
  ...extra,
}));

tasks.push({
  ...tasks[0],
  id: uuid(3, 99),
  name: "Collect feedback from design",
  priority: "medium",
  start_time: "10:30",
  end_time: "11:00",
  parent_id: tasks[0].id,
  checklist: undefined,
  estimate_minutes: 30,
} as (typeof tasks)[number]);

function buildTransactions() {
  const out: Record<string, unknown>[] = [];
  const rand = rng(7);
  const add = (name: string, amount: number, type: "income" | "expense", category: string, offset: number) =>
    out.push({ id: uuid(4, out.length + 1), user_id: SAMPLE_USER_ID, name, amount, type, category_id: category, date: day(offset), created_at: at(offset, "12:00") });
  for (let offset = -185; offset <= 0; offset++) {
    const date = new Date(`${day(offset)}T12:00:00`);
    if (date.getDate() === 1) add("Rent", 1850, "expense", HOUSING, offset);
    if (date.getDate() === 1 || date.getDate() === 15) add("Paycheque - Sample Co.", 2900, "income", SALARY, offset);
    if (date.getDate() === 8) add("Electricity - Northwind Power", Math.round(70 + rand() * 40), "expense", UTILITIES, offset);
    if (date.getDate() === 12) add("Phone plan", 55, "expense", UTILITIES, offset);
    if (date.getDate() === 3) add("Transit pass", 128.75, "expense", TRANSPORT, offset);
    if (date.getDate() === 20) add("Streaming subscription", 16.99, "expense", FUN, offset);
    if (date.getDate() === 25) add("Freelance project - Sample Studio", 650, "income", SALARY, offset);
    if (weekday(offset) === 6) add("Groceries", Math.round((60 + rand() * 70) * 100) / 100, "expense", FOOD, offset);
    if (weekday(offset) >= 1 && weekday(offset) <= 5 && rand() < 0.5) add("Coffee", Math.round((3.5 + rand() * 3) * 100) / 100, "expense", COFFEE, offset);
    if (rand() < 0.12) add("Dinner out", Math.round((28 + rand() * 50) * 100) / 100, "expense", FOOD, offset);
    if (rand() < 0.05) add("Movie night", 24, "expense", FUN, offset);
  }
  return out;
}

export const transactions = buildTransactions();

export const habits = [
  ["Meditate", "hsl(260 70% 65%)"],
  ["Read 20 pages", "hsl(45 93% 47%)"],
  ["Workout", "hsl(340 82% 52%)"],
  ["No phone after 10pm", "hsl(190 80% 50%)"],
].map(([name, color], i) => ({
  id: uuid(5, i + 1),
  user_id: SAMPLE_USER_ID,
  name,
  color,
  position: i,
  created_at: created,
  archived_at: null,
}));

function buildHabitChecks() {
  const rand = rng(11);
  const out: Record<string, unknown>[] = [];
  const odds = [0.85, 0.7, 0.55, 0.6];
  for (let offset = -90; offset <= 0; offset++) {
    habits.forEach((h, i) => {
      if (offset === 0 && i > 1) return;
      if (rand() < odds[i]) out.push({ habit_id: h.id, user_id: SAMPLE_USER_ID, day: day(offset), created_at: at(offset, "21:00") });
    });
  }
  return out;
}

export const habitChecks = buildHabitChecks();

const focusTitles = ["Draft Q4 roadmap outline", "Review pull requests", "Online course: module 3", "Write project status update", "Prepare demo slides", "Update team wiki page"];

function buildFocusSessions() {
  const rand = rng(23);
  const out: Record<string, unknown>[] = [];
  for (let offset = -90; offset <= 0; offset++) {
    const runs = offset === 0 ? 1 : weekday(offset) % 6 === 0 ? Math.floor(rand() * 2) : 1 + Math.floor(rand() * 4);
    for (let r = 0; r < runs; r++) {
      const title = focusTitles[Math.floor(rand() * focusTitles.length)];
      const task = tasks.find((t) => t.name === title);
      const seconds = [1500, 1500, 1500, 3000, 900][Math.floor(rand() * 5)];
      const end = at(offset, `${pad(9 + r * 2)}:${pad(Math.floor(rand() * 50))}`);
      out.push({
        id: uuid(6, out.length + 1),
        user_id: SAMPLE_USER_ID,
        started_at: new Date(Date.parse(end) - seconds * 1000).toISOString(),
        ended_at: end,
        seconds,
        task_id: task?.id ?? null,
        task_title: title,
      });
    }
  }
  return out;
}

export const focusSessions = buildFocusSessions();

const completionTitles = ["Morning stretch", "Send invoice to Sample Studio", "Gym: upper body", "Update team wiki page", "Back up laptop", "Inbox zero", "Water the plants", "Review pull requests", "Pay electricity bill", "Meal prep"];

function buildCompletions() {
  const rand = rng(31);
  const out: Record<string, unknown>[] = [];
  for (let offset = -90; offset <= 0; offset++) {
    const count = offset === 0 ? 1 : 1 + Math.floor(rand() * 5);
    for (let c = 0; c < count; c++) {
      const title = completionTitles[Math.floor(rand() * completionTitles.length)];
      const task = tasks.find((t) => t.name === title);
      out.push({
        id: uuid(7, out.length + 1),
        user_id: SAMPLE_USER_ID,
        title,
        completed_at: at(offset, `${pad(8 + c * 2)}:${pad(Math.floor(rand() * 59))}`),
        task_id: task?.id ?? null,
        category_id: task?.category_id ?? [WORK, PERSONAL, HEALTH, LEARNING][c % 4],
      });
    }
  }
  return out;
}

export const taskCompletions = buildCompletions();

export const supabaseTables: Record<string, Record<string, unknown>[]> = {
  tasks,
  transactions,
  task_categories: taskCategories,
  financial_categories: financialCategories,
  habits,
  habit_checks: habitChecks,
  focus_sessions: focusSessions,
  task_completions: taskCompletions,
  settings: [],
};

export const calendarStatus = { configured: true, connected: true, account: SAMPLE_EMAIL };

const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

export const calendarList = {
  calendars: [{ id: "primary", summary: SAMPLE_EMAIL, primary: true, backgroundColor: "#7c83ff", accessRole: "owner", timeZone: zone }],
};

type EventSeed = [summary: string, offset: number, start: string, end: string, location?: string];

const eventSeeds: EventSeed[] = [
  ["Design review", 0, "10:00", "11:00", "Room 4B"],
  ["1:1 with manager", 0, "15:30", "16:00"],
  ["Yoga class", 0, "18:30", "19:30", "Sample Studio"],
  ["Product demo", 1, "13:00", "14:00", "Main conference room"],
  ["Coffee with Alex", 1, "16:30", "17:15", "Corner Cafe"],
  ["Sprint planning", 2, "10:00", "11:30"],
  ["Book club", 3, "19:00", "20:30", "Public library"],
  ["Lunch with Sam", 4, "12:00", "13:00"],
  ["Farmers market", 5, "09:00", "10:30"],
  ["Hike at the sample trail", 6, "10:00", "13:00"],
  ["Customer call - Contoso", -1, "14:00", "14:45"],
  ["Team lunch", -2, "12:00", "13:00"],
  ["Workshop: writing docs", -3, "13:30", "15:30"],
  ["Quarterly all-hands", 7, "11:00", "12:00"],
  ["Haircut", 8, "17:00", "17:45"],
  ["Concert", 10, "20:00", "22:30", "City Hall"],
];

function buildEvents() {
  const out: Record<string, unknown>[] = [];
  const add = (summary: string, offset: number, start: string, end: string, location = "") =>
    out.push({
      id: `sample-event-${out.length + 1}`,
      calendarId: "primary",
      summary,
      description: "",
      location,
      allDay: false,
      startDate: day(offset),
      startTime: start,
      endDate: day(offset),
      endTime: end,
      startISO: at(offset, start),
      endISO: at(offset, end),
      recurrence: null,
      recurringEventId: null,
      htmlLink: "https://calendar.example.com/event",
    });
  for (let offset = -35; offset <= 42; offset++) {
    const wd = weekday(offset);
    if (wd >= 1 && wd <= 5) add("Daily stand-up", offset, "09:30", "09:45");
    if (wd === 3) add("Weekly sync", offset, "14:00", "15:00");
  }
  eventSeeds.forEach(([summary, offset, start, end, location]) => add(summary, offset, start, end, location));
  out.push({
    ...out[0],
    id: "sample-event-allday",
    summary: "Sample public holiday",
    allDay: true,
    startDate: day(9),
    endDate: day(9),
    startTime: "",
    endTime: "",
    startISO: new Date(`${day(9)}T00:00:00`).toISOString(),
    endISO: new Date(`${day(10)}T00:00:00`).toISOString(),
  });
  return out;
}

export const calendarEvents = buildEvents();

export const mailStatus: MailStatus = {
  providers: { google: { configured: true }, microsoft: { configured: false } },
  ai: { provider: "claude", model: "", keyOverride: false, configured: true },
  cache: { fetchDays: 30, retainDays: 90 },
  accounts: [{ id: "sample-account", provider: "google", email: SAMPLE_EMAIL }],
};

type MailSeed = Pick<MailDigest["items"][number], "category" | "from" | "fromAddress" | "subject" | "snippet"> &
  Partial<MailDigest["items"][number]> & { hoursAgo: number };

const mailSeeds: MailSeed[] = [
  { category: "bill", from: "Northwind Power", fromAddress: "billing@northwind.example", subject: "Your November statement is ready", snippet: "Amount due $84.20 by the due date.", amount: "$84.20", dueDate: day(6), hoursAgo: 5 },
  { category: "job", from: "Contoso Careers", fromAddress: "careers@contoso.example", subject: "Interview invitation: Product Designer", snippet: "We'd like to schedule a 45 minute call next week.", company: "Contoso", jobStatus: "interview", hoursAgo: 9 },
  { category: "order", from: "Fabrikam Store", fromAddress: "orders@fabrikam.example", subject: "Your order has shipped", snippet: "Order #10423 is on its way and should arrive Tuesday.", details: [{ label: "Order", value: "#10423" }], hoursAgo: 20 },
  { category: "security", from: "Sample Cloud", fromAddress: "no-reply@samplecloud.example", subject: "New sign-in on a Windows device", snippet: "If this was you, no action is needed.", hoursAgo: 30 },
  { category: "bill", from: "Tailspin Mobile", fromAddress: "billing@tailspin.example", subject: "Phone bill for this month", snippet: "Your bill of $55.00 will be charged automatically.", amount: "$55.00", dueDate: day(10), hoursAgo: 40 },
  { category: "job", from: "Adventure Works Talent", fromAddress: "jobs@adventureworks.example", subject: "Thanks for applying", snippet: "We received your application for Frontend Developer.", company: "Adventure Works", jobStatus: "applied", hoursAgo: 52 },
  { category: "order", from: "Wide World Books", fromAddress: "hello@wideworld.example", subject: "Order confirmed", snippet: "Thanks for your order of 2 items.", hoursAgo: 70 },
  { category: "job", from: "Litware Recruiting", fromAddress: "talent@litware.example", subject: "Update on your application", snippet: "We've decided to move forward with other candidates.", company: "Litware", jobStatus: "rejected", hoursAgo: 96 },
];

export function mailDigest(): MailDigest {
  return {
    generatedAt: NOW.toISOString(),
    errors: [],
    items: mailSeeds.map(({ hoursAgo, ...m }, i) => ({
      id: `sample-mail-${i + 1}`,
      accountId: "sample-account",
      provider: "google",
      account: SAMPLE_EMAIL,
      confident: true,
      classifiedBy: "rules",
      receivedAt: new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString(),
      url: "https://mail.example.com/",
      ...m,
    })),
  };
}

const TFSA = "Sample TFSA";
const CASH = "Sample Cash";

type Fill = Partial<TradeEvent> & Pick<TradeEvent, "symbol" | "side" | "quantity" | "price" | "currency" | "account"> & { offset: number; clock?: string };

const fills: Fill[] = [
  { symbol: "ACME", side: "buy", quantity: 20, price: 50.1, currency: "USD", account: TFSA, offset: -56 },
  { symbol: "ACME", side: "sell", quantity: 20, price: 58.4, currency: "USD", account: TFSA, offset: -41 },
  { symbol: "NWND", side: "buy", quantity: 15, price: 120.25, currency: "USD", account: TFSA, offset: -49 },
  { symbol: "NWND", side: "sell", quantity: 15, price: 111.6, currency: "USD", account: TFSA, offset: -31 },
  { symbol: "CTSO", side: "buy", effect: "open", quantity: 2, price: 1.5, currency: "USD", account: CASH, offset: -36, option: { strike: 40, right: "call", expiry: day(-21) } },
  { symbol: "CTSO", side: "sell", effect: "close", quantity: 2, price: 2.85, currency: "USD", account: CASH, offset: -26, option: { strike: 40, right: "call", expiry: day(-21) } },
  { symbol: "MPLE", side: "buy", quantity: 50, price: 24.1, currency: "CAD", account: TFSA, offset: -29 },
  { symbol: "MPLE", side: "sell", quantity: 50, price: 26.55, currency: "CAD", account: TFSA, offset: -12 },
  { symbol: "ACME", side: "buy", effect: "open", quantity: 2, price: 0.8, currency: "USD", account: CASH, offset: -23, option: { strike: 65, right: "call", expiry: day(-15) } },
  { symbol: "FBKM", side: "buy", effect: "open", quantity: 3, price: 2.1, currency: "USD", account: CASH, offset: -19, option: { strike: 30, right: "put", expiry: day(12) } },
  { symbol: "FBKM", side: "sell", effect: "close", quantity: 3, price: 1.75, currency: "USD", account: CASH, offset: -9, option: { strike: 30, right: "put", expiry: day(12) } },
  { symbol: "TLSP", side: "buy", quantity: 30, price: 18.05, currency: "USD", account: TFSA, offset: -15 },
  { symbol: "TLSP", side: "sell", quantity: 30, price: 23.1, currency: "USD", account: TFSA, offset: -4 },
  { symbol: "NRTH", side: "buy", quantity: 40, price: 32.2, currency: "CAD", account: TFSA, offset: -7 },
  { symbol: "LITW", side: "buy", quantity: 25, price: 44.7, currency: "CAD", account: TFSA, offset: -38 },
  { symbol: "LITW", side: "sell", quantity: 25, price: 41.3, currency: "CAD", account: TFSA, offset: -20 },
];

export const tradeEvents: TradeEvent[] = [
  ...fills.map(({ offset, clock, ...f }, i): TradeEvent => ({
    id: `sample-trade-${i + 1}`,
    source: "email",
    status: "filled",
    orderType: i % 3 ? "limit" : "market",
    time: at(offset, clock ?? `${pad(10 + (i % 5))}:${pad((i * 7) % 60)}`),
    total: Math.round(f.quantity * f.price! * (f.option ? 100 : 1) * 100) / 100,
    ...f,
  })),
  { id: "sample-trade-cancel-1", source: "email", status: "cancelled", account: TFSA, side: "buy", orderType: "limit", symbol: "ACME", quantity: 0, orderedQuantity: 10, price: 47.5, currency: "USD", time: at(-33, "11:05") },
  { id: "sample-trade-expired-1", source: "email", status: "expired", account: TFSA, side: "sell", orderType: "limit", symbol: "NRTH", quantity: 0, orderedQuantity: 40, price: 36, currency: "CAD", time: at(-2, "16:00") },
  { id: "sample-trade-cancel-2", source: "manual", status: "cancelled", account: CASH, side: "buy", effect: "open", orderType: "limit", symbol: "CTSO", option: { strike: 45, right: "call", expiry: day(20) }, quantity: 0, orderedQuantity: 1, price: 0.95, currency: "USD", time: at(-5, "13:40") },
];

const journal = (j: Omit<TradeJournal, "updatedAt">, offset: number): TradeJournal => ({ ...j, updatedAt: at(offset, "20:00") });

export const tradeJournal: Record<string, TradeJournal> = {
  "sample-trade-1": journal({ thesis: "Breakout above the 50-day average on rising volume.", target: 60, stop: 47, review: "Took profit near target. Patience paid off.", followedRules: true, grade: "A", tags: ["breakout", "swing"] }, -41),
  "sample-trade-3": journal({ thesis: "Earnings run-up play.", target: 135, stop: 112, review: "Held through earnings against my plan; should have cut at the stop.", followedRules: false, grade: "D", tags: ["earnings"] }, -31),
  "sample-trade-5": journal({ thesis: "Momentum continuation after the sample product launch.", review: "Clean entry, sold into strength.", followedRules: true, grade: "B", tags: ["momentum", "options"] }, -26),
  "sample-trade-7": journal({ thesis: "Dividend stock pullback to support.", target: 27, stop: 22.5, followedRules: true, grade: "B", tags: ["swing", "dividend"] }, -12),
  "sample-trade-14": journal({ thesis: "Long-term starter position.", target: 40, stop: 29, tags: ["long-term"] }, -7),
};

export const tradeFx: FxConversion[] = [
  { id: "sample-fx-1", account: TFSA, fromAmount: 5000, fromCurrency: "CAD", toAmount: 3655.5, toCurrency: "USD", time: at(-58, "09:45") },
  { id: "sample-fx-2", account: CASH, fromAmount: 2000, fromCurrency: "CAD", toAmount: 1428.2, toCurrency: "USD", time: at(-37, "10:15") },
];

export function tradesData(): TradesData {
  return { events: tradeEvents, fx: tradeFx, journal: tradeJournal, lastSync: NOW.toISOString(), errors: [], connected: true };
}

type NoteSeed = { path: string; tags: string[]; offset: number; body: string; extra?: Record<string, unknown> };

const daily = (offset: number, focus: string, mood: string, reflection: string): NoteSeed => ({
  path: `Daily/${day(offset)}.md`,
  tags: ["daily"],
  offset,
  body: `# ${day(offset)}\n\n## Log\n- Morning stretch done\n- Worked on the roadmap draft\n\n<!-- crystal-os:today -->\n**Focus:** ${focus}\n**Mood:** ${mood}\n**Reflection:** ${reflection}\n<!-- /crystal-os:today -->\n`,
});

const noteSeeds: NoteSeed[] = [
  {
    path: "Projects/Website Redesign.md",
    tags: ["project", "design"],
    offset: -1,
    extra: { status: "active" },
    body: `# Website Redesign\n\nA refresh of the sample portfolio site. Linked to [[Design System Notes]] and [[Weekly Sync]].\n\n## Goals\n- Faster first load (target under 1s)\n- Clearer project pages\n- Dark mode that matches the app\n\n## Tasks\n- [x] Audit current pages\n- [x] Pick a type scale\n- [ ] Build the new hero section\n- [ ] Write case study copy\n\n## Notes\nKeep the navigation to five items at most. Reuse the card component from the design system and test on a phone before shipping.\n\n> Ship small, ship often.\n`,
  },
  {
    path: "Projects/Design System Notes.md",
    tags: ["project", "design"],
    offset: -3,
    body: `# Design System Notes\n\nTokens, components and the rules behind them.\n\n## Colour\n- Primary: indigo\n- Accent: teal\n\n## Components\n- Card\n- Button\n- Tag chip\n\nSee [[Website Redesign]].\n`,
  },
  {
    path: "Meetings/Weekly Sync.md",
    tags: ["meeting", "work"],
    offset: -2,
    body: `# Weekly Sync\n\n## Agenda\n1. Roadmap draft\n2. Demo prep\n3. Open questions\n\n## Action items\n- [ ] Share the roadmap outline\n- [ ] Book the demo room\n\nRelated: [[Website Redesign]]\n`,
  },
  {
    path: "Reading/The Sample Book.md",
    tags: ["reading", "book"],
    offset: -4,
    body: `# The Sample Book\n\n## Highlights\n- Small habits compound over time.\n- Make the next step obvious.\n- Environment beats willpower.\n\n## Thoughts\nTry pairing the evening reading habit with tea. Links to [[Habit Ideas]].\n`,
  },
  {
    path: "Ideas/Habit Ideas.md",
    tags: ["ideas", "habits"],
    offset: -6,
    body: `# Habit Ideas\n\n- Ten minutes of journaling after lunch\n- A short walk between meetings\n- Phone stays in the hallway after 10pm\n`,
  },
  {
    path: "Ideas/Side Project Ideas.md",
    tags: ["ideas"],
    offset: -9,
    body: `# Side Project Ideas\n\n- A plant watering reminder\n- A recipe scaler\n- A tiny static blog generator\n`,
  },
  {
    path: "Recipes/Weeknight Pasta.md",
    tags: ["recipe", "food"],
    offset: -12,
    body: `# Weeknight Pasta\n\n## Ingredients\n- 200 g pasta\n- 2 cloves garlic\n- Cherry tomatoes\n- Basil and olive oil\n\n## Steps\n1. Boil the pasta.\n2. Soften garlic and tomatoes in oil.\n3. Toss everything with basil.\n`,
  },
  {
    path: "Inbox.md",
    tags: ["inbox"],
    offset: 0,
    body: `# Inbox\n\n- Look into a standing desk\n- Gift idea for the sample birthday\n- Try the new cafe on the corner\n`,
  },
  daily(0, "Finish the roadmap outline", "good", "Productive morning, slow afternoon."),
  daily(-1, "Clear the invoice backlog", "great", "Everything shipped on time."),
  daily(-2, "Wiki cleanup", "okay", "Too many meetings."),
  daily(-3, "Back up and tidy files", "good", "Quiet, focused day."),
  daily(-4, "Read and plan", "low", "Tired after a late night."),
  daily(-5, "Weekend errands", "great", "Long hike, felt great."),
  daily(-6, "Rest", "good", "Slow morning with a book."),
];

function rawNote(seed: NoteSeed): string {
  const front = [`tags: [${seed.tags.join(", ")}]`, `created: ${day(seed.offset)}`, ...Object.entries(seed.extra ?? {}).map(([k, v]) => `${k}: ${v}`)];
  return `---\n${front.join("\n")}\n---\n${seed.body}`;
}

const OBS = "Observatory";

type CourseSeed = Pick<Course, "code" | "name" | "color" | "outcomes" | "exams" | "assessments">;
type TopicSeed = Partial<Topic> & Pick<Topic, "slug" | "title" | "priority" | "weeks"> & { summary: string; questions: Omit<QuestionDraft, "id">[] };

const card = (prompt: string, answer: string, type: QuestionType = "card") => ({ type, prompt, answer });

const courseSeeds: [CourseSeed, TopicSeed[]][] = [
  [
    {
      code: "MATH201", name: "Calculus II", color: "hsl(192 88% 66%)",
      outcomes: ["Evaluate integrals with substitution, parts and partial fractions", "Decide whether a series converges", "Build and use Taylor polynomials"],
      assessments: [{ name: "Assignments", weight: 0.2 }, { name: "Quizzes", weight: 0.1 }],
      exams: [{ name: "Midterm", date: day(-24), weight: 0.3, done: true }, { name: "Final exam", date: day(12), weight: 0.4 }],
    },
    [
      { slug: "taylor-series", title: "Taylor Series", priority: "high", objective: true, weeks: [9, 10], sections: ["11.10"], summary: "A smooth function is the sum of its derivatives at a point, scaled by powers of the distance.", questions: [
        card("Write the Maclaurin series for $e^x$ and state where it converges.", "$$\ne^x = \\sum_{n=0}^{\\infty} \\frac{x^n}{n!} = 1 + x + \\frac{x^2}{2!} + \\frac{x^3}{3!} + \\cdots\n$$\n\nIt converges for every real $x$ (radius $R = \\infty$)."),
        card("What is the degree 3 Taylor polynomial of $\\sin x$ at $a = 0$?", "$T_3(x) = x - \\dfrac{x^3}{6}$"),
      ] },
      { slug: "integration-by-parts", title: "Integration by Parts", priority: "high", objective: true, weeks: [2], sections: ["7.1"], summary: "Trade one integral for an easier one: $\\int u\\,dv = uv - \\int v\\,du$.", questions: [
        card("Evaluate $\\displaystyle\\int x e^{x}\\,dx$.", "1. Let $u = x$ and $dv = e^x\\,dx$, so $du = dx$ and $v = e^x$.\n2. $\\int x e^x\\,dx = x e^x - \\int e^x\\,dx$\n3. $= (x - 1)e^x + C$", "worked"),
      ] },
      { slug: "improper-integrals", title: "Improper Integrals", priority: "medium", weeks: [4], sections: ["7.8"], summary: "Integrals over infinite intervals, defined as limits.", questions: [
        card("For which $p$ does $\\displaystyle\\int_1^{\\infty} \\frac{dx}{x^p}$ converge?\n\n- [ ] $p < 1$\n- [ ] $p = 1$\n- [x] $p > 1$", "It converges exactly when $p > 1$, to $\\frac{1}{p-1}$.", "mc"),
      ] },
      { slug: "series-tests", title: "Convergence Tests", priority: "medium", weeks: [6, 7], sections: ["11.4", "11.6"], summary: "Comparison, ratio and root tests for infinite series.", questions: [
        card("State the ratio test.", "If $L = \\lim_{n\\to\\infty} \\left|\\frac{a_{n+1}}{a_n}\\right|$, the series converges absolutely when $L < 1$ and diverges when $L > 1$."),
      ] },
      { slug: "partial-fractions", title: "Partial Fractions", priority: "medium", weeks: [3], sections: ["7.4"], summary: "Split a rational function into simpler pieces.", questions: [
        card("Decompose $\\dfrac{1}{x(x+1)}$.", "$\\dfrac{1}{x} - \\dfrac{1}{x+1}$"),
      ] },
      { slug: "polar-coordinates", title: "Polar Coordinates", priority: "low", weeks: [12], sections: ["10.3"], summary: "Curves written as $r = f(\\theta)$.", questions: [
        card("Area enclosed by $r = f(\\theta)$ for $a \\le \\theta \\le b$?", "$A = \\dfrac{1}{2}\\displaystyle\\int_a^b f(\\theta)^2\\,d\\theta$"),
      ] },
    ],
  ],
  [
    {
      code: "PHYS110", name: "Mechanics", color: "hsl(38 80% 66%)",
      outcomes: ["Apply Newton's laws to particles and rigid bodies", "Use energy and momentum conservation"],
      assessments: [{ name: "Labs", weight: 0.2 }, { name: "Problem sets", weight: 0.2 }],
      exams: [{ name: "Midterm", date: day(30), weight: 0.25 }, { name: "Final exam", date: day(52), weight: 0.35 }],
    },
    [
      { slug: "newtons-laws", title: "Newton's Laws", priority: "high", objective: true, weeks: [1, 2], sections: ["4.1"], summary: "Net force equals mass times acceleration.", questions: [
        card("A 2 kg box is pushed with a net force of 10 N. What is its acceleration?", "$a = F/m = 10/2 = 5\\ \\text{m/s}^2$"),
      ] },
      { slug: "work-and-energy", title: "Work and Energy", priority: "medium", weeks: [4], sections: ["7.2"], summary: "Work changes kinetic energy.", questions: [
        card("State the work-energy theorem.", "$W_{net} = \\Delta K = \\tfrac{1}{2}mv_f^2 - \\tfrac{1}{2}mv_i^2$"),
      ] },
      { slug: "momentum", title: "Momentum and Collisions", priority: "medium", weeks: [6], sections: ["9.1"], summary: "Momentum is conserved when no external force acts.", questions: [card("Define linear momentum.", "$\\vec p = m\\vec v$")] },
      { slug: "rotation", title: "Rotational Motion", priority: "low", weeks: [8], sections: ["10.1"], summary: "Torque, moment of inertia and angular acceleration.", questions: [card("Rotational analogue of $F = ma$?", "$\\tau = I\\alpha$")] },
    ],
  ],
  [
    {
      code: "CS140", name: "Introduction to Programming", color: "hsl(165 55% 62%)",
      outcomes: ["Write, test and debug small programs", "Reason about loops, functions and recursion"],
      assessments: [{ name: "Labs", weight: 0.3 }, { name: "Project", weight: 0.2 }],
      exams: [{ name: "Final exam", date: day(26), weight: 0.5 }],
    },
    [
      { slug: "recursion", title: "Recursion", priority: "high", objective: true, weeks: [7], sections: ["5.3"], summary: "A function that solves a problem by calling itself on a smaller one.", questions: [
        card("What does this print?\n\n```python\ndef f(n):\n    return 1 if n <= 1 else n * f(n - 1)\n\nprint(f(4))\n```", "24", "output"),
      ] },
      { slug: "loops", title: "Loops", priority: "medium", weeks: [3], sections: ["3.2"], summary: "Repeat work with for and while.", questions: [card("When does a `while` loop check its condition?", "Before every pass, including the first.")] },
      { slug: "functions", title: "Functions", priority: "medium", weeks: [4], sections: ["4.1"], summary: "Name a piece of work and reuse it.", questions: [card("What is a parameter?", "A name in the function definition that receives an argument.")] },
    ],
  ],
  [
    {
      code: "ECON101", name: "Principles of Microeconomics", color: "hsl(330 50% 70%)",
      outcomes: ["Explain supply, demand and market equilibrium"],
      assessments: [{ name: "Quizzes", weight: 0.3 }],
      exams: [{ name: "Final exam", date: day(40), weight: 0.7 }],
    },
    [
      { slug: "supply-and-demand", title: "Supply and Demand", priority: "medium", weeks: [1], sections: ["3"], summary: "Prices settle where supply meets demand.", questions: [card("What happens to price when demand rises and supply is fixed?", "It rises.")] },
      { slug: "elasticity", title: "Elasticity", priority: "low", weeks: [3], sections: ["5"], summary: "How strongly quantity reacts to price.", questions: [card("Price elasticity of demand?", "$E_d = \\dfrac{\\%\\Delta Q}{\\%\\Delta P}$")] },
    ],
  ],
  [
    {
      code: "STAT230", name: "Probability", color: "hsl(255 60% 76%)",
      outcomes: ["Compute probabilities with counting rules and conditioning", "Work with common discrete and continuous distributions"],
      assessments: [{ name: "Assignments", weight: 0.25 }],
      exams: [{ name: "Midterm", date: day(19), weight: 0.3 }, { name: "Final exam", date: day(48), weight: 0.45 }],
    },
    [
      { slug: "conditional-probability", title: "Conditional Probability", priority: "high", weeks: [3], sections: ["4.1"], summary: "Probability once you know something has happened.", questions: [card("Define $P(A \\mid B)$.", "$P(A \\mid B) = \\dfrac{P(A \\cap B)}{P(B)}$ for $P(B) > 0$")] },
      { slug: "binomial-distribution", title: "Binomial Distribution", priority: "medium", weeks: [5], sections: ["5.3"], summary: "Successes in $n$ independent trials.", questions: [card("PMF of $X \\sim \\text{Bin}(n, p)$?", "$P(X = k) = \\binom{n}{k} p^k (1-p)^{n-k}$")] },
      { slug: "expectation", title: "Expectation", priority: "medium", weeks: [6], sections: ["7.1"], summary: "The long-run average of a random variable.", questions: [card("Is expectation linear?", "Yes: $E[aX + bY] = aE[X] + bE[Y]$")] },
    ],
  ],
  [
    {
      code: "CHEM120", name: "General Chemistry", color: "hsl(12 60% 56%)",
      outcomes: ["Balance reactions and use stoichiometry"],
      assessments: [{ name: "Labs", weight: 0.25 }],
      exams: [{ name: "Final exam", date: day(45), weight: 0.5 }],
    },
    [
      { slug: "stoichiometry", title: "Stoichiometry", priority: "medium", weeks: [2], sections: ["3.4"], summary: "Counting atoms through a reaction.", questions: [card("How many moles are in 36 g of water?", "$36 / 18 = 2$ mol")] },
      { slug: "ideal-gas-law", title: "Ideal Gas Law", priority: "medium", weeks: [5], sections: ["5.4"], summary: "Pressure, volume and temperature of a gas.", questions: [card("State the ideal gas law.", "$PV = nRT$")] },
    ],
  ],
];

const deepSkyTopics: TopicSeed[] = [
  { slug: "music-theory-basics", title: "Music Theory Basics", priority: "medium", weeks: [], summary: "Scales, intervals and why some chords sound bright.", questions: [card("How many semitones are in a perfect fifth?", "7"), card("What makes a major triad?", "A root, a major third (4 semitones) and a perfect fifth (7 semitones).")] },
  { slug: "bayes-rule", title: "Bayes' Rule", priority: "medium", weeks: [], summary: "Updating a belief when new evidence arrives.", questions: [card("State Bayes' rule.", "$P(A \\mid B) = \\dfrac{P(B \\mid A)\\,P(A)}{P(B)}$")] },
  { slug: "sourdough-starter", title: "Sourdough Starter", priority: "low", weeks: [], summary: "Wild yeast and bacteria kept alive with flour and water.", questions: [card("Why feed a starter at a 1:1:1 ratio?", "Equal parts starter, flour and water keep it active and predictable.")] },
];

const suggestionSeeds = [
  { title: "Spaced repetition research", kind: "project suggestion", summary: "Your Website Redesign notes mention learning tools; the science behind spacing effects would fit." },
  { title: "How tides work", kind: "random idea", summary: "The Moon's pull, the Sun's smaller one and why there are two high tides a day." },
];

const stored = (dueDays: number, lastDays: number, stability: number) =>
  ({ dueAt: at(dueDays, "08:00"), lastReviewAt: at(lastDays, "19:00"), stability, difficulty: 5, elapsed_days: 0, scheduled_days: 0, reps: 3, lapses: 0, state: 2 });

function courseProgress(code: string, topics: TopicSeed[]): string {
  const p = emptyProgress();
  topics.forEach((t, ti) =>
    t.questions.forEach((_, qi) => {
      const key = `${t.slug}/q${qi + 1}`;
      if (code === "MATH201" && ti === 0 && qi === 0) p.cards[key] = stored(-3, -7, 4);
      else if (code === "MATH201" && ti === 1) p.cards[key] = stored(-1, -5, 6);
      else if ((ti + qi) % 3 !== 2) p.cards[key] = stored(4 + ti, -2 - ti, 6 + ti * 5);
    }),
  );
  for (let offset = -6; offset <= 0; offset++) {
    const runs = offset === 0 ? 2 : 1;
    for (let r = 0; r < runs; r++) p.log.push({ kind: "observation", topic: topics[(offset + 6 + r) % topics.length]!.slug, at: at(offset, `${pad(8 + r)}:15`) });
  }
  return serializeProgress(p, `${p.log.length} reviews logged.`);
}

function topicNote(code: string, t: TopicSeed): string {
  const { summary, questions, ...fields } = t;
  const body = [`> [!summary]\n> ${summary}`, ...questions.map((q, i) => formatQuestion({ ...q, id: `q${i + 1}` }))].join("\n\n");
  return serializeTopic({ course: code, objective: false, sections: [], sources: [], tasks: [], events: [], ...fields, body: `${body}\n` });
}

const observatoryRaw: [path: string, raw: string, offset: number][] = [
  ...courseSeeds.flatMap(([c, topics]): [string, string, number][] => [
    [`${OBS}/${c.code}/_course.md`, serializeCourse({ ...c, term: "2026F", keywords: [], archived: false }), -40],
    [`${OBS}/${c.code}/progress.md`, courseProgress(c.code, topics), 0],
    ...topics.map((t, i): [string, string, number] => [`${OBS}/${c.code}/topics/${t.slug}.md`, topicNote(c.code, t), -30 + i]),
  ]),
  ...deepSkyTopics.map((t, i): [string, string, number] => [`${OBS}/DeepSky/topics/${t.slug}.md`, topicNote("DeepSky", t), -8 + i]),
  [`${OBS}/DeepSky/progress.md`, courseProgress("DeepSky", deepSkyTopics), 0],
  ...suggestionSeeds.map((s, i): [string, string, number] => [
    `${OBS}/DeepSky/_ai/${day(-1)} ${s.title}.md`,
    `---\nkind: ${s.kind}\nstatus: pending\nsource: claude\n---\n# ${s.title}\n\n${s.summary}\n`,
    -1 + i,
  ]),
];

export const vaultNotes: (VaultNoteDetail & { raw: string })[] = [
  ...noteSeeds.map((seed) => {
    const mtime = Date.parse(at(seed.offset, "09:00"));
    return {
      ...buildNote(seed.path, { tags: seed.tags, created: day(seed.offset), ...seed.extra }, seed.body, mtime, seed.body.length, mtime),
      raw: rawNote(seed),
    };
  }),
  ...observatoryRaw.map(([path, raw, offset]) => {
    const mtime = Date.parse(at(offset, "09:00"));
    const { data, content } = parseFrontmatter(raw);
    return { ...buildNote(path, data, content, mtime, raw.length, mtime), raw };
  }),
];

export const observatorySettings = { aiProvider: "claude", aiModel: "claude-sonnet-5-5", aiDraft: true, deepSkyProjects: true, deepSkyRandom: true };

export const aiStatus: AiStatus = {
  claude: { configured: true, model: "claude-sonnet-5-5" },
  nim: { configured: false, baseUrl: "https://integrate.api.nvidia.com/v1", model: "moonshotai/kimi-k3" },
  omniroute: { configured: false, hasKey: false, baseUrl: "http://localhost:20128/v1", model: "auto/coding" },
};
