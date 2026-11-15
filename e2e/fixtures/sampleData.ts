import { buildNote, type VaultNoteDetail } from "../../src/lib/vaultCore";
import type { FxConversion, TradeEvent, TradeJournal, TradesData } from "../../src/lib/trades";
import type { MailDigest, MailStatus } from "../../src/lib/mail";

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
  ai: { configured: false, model: "" },
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

export const vaultNotes: (VaultNoteDetail & { raw: string })[] = noteSeeds.map((seed) => {
  const mtime = Date.parse(at(seed.offset, "09:00"));
  return {
    ...buildNote(seed.path, { tags: seed.tags, created: day(seed.offset), ...seed.extra }, seed.body, mtime, seed.body.length, mtime),
    raw: rawNote(seed),
  };
});
