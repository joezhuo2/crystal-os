import { apiRequest } from "@/lib/apiRequest";
import { addDays, toLocalDateStr } from "@/lib/utils";

export type MailProvider = "google" | "microsoft";
export type MailCategory = "bill" | "job" | "order" | "security";
export type JobStatus = "applied" | "interview" | "offer" | "rejected" | "update";

export interface MailAccount {
  id: string;
  provider: MailProvider;
  email: string;
}

export interface MailStatus {
  providers: Record<MailProvider, { configured: boolean }>;
  ai: { configured: boolean; model: string };
  cache: MailCacheSettings;
  accounts: MailAccount[];
}

export interface MailCacheSettings {
  fetchDays: number;
  retainDays: number;
}

export interface MailItem {
  id: string;
  accountId: string;
  provider: MailProvider;
  account: string;
  category: MailCategory;
  confident: boolean;
  classifiedBy: "rules" | "ai";
  from: string;
  fromAddress: string;
  subject: string;
  snippet: string;
  receivedAt: string;
  url: string;
  amount?: string;
  dueDate?: string;
  company?: string;
  jobStatus?: JobStatus;
  details?: { label: string; value: string }[];
}

export interface MailDigest {
  generatedAt: string;
  items: MailItem[];
  errors: { accountId: string; account: string; message: string }[];
}

export const PROVIDER_LABEL: Record<MailProvider, string> = { google: "Gmail", microsoft: "Outlook" };

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  update: "Update",
};

const DAY_MS = 86_400_000;

const request = <T,>(url: string, init?: RequestInit) => apiRequest<T>(url, init, "Mail API error");

const CONNECTED_KEY = "crystal-os:mail-connected";

export function mailWasConnected(): boolean {
  try {
    return localStorage.getItem(CONNECTED_KEY) === "1";
  } catch {
    return false;
  }
}

export async function fetchMailStatus(): Promise<MailStatus> {
  const status = await request<MailStatus>("/api/mail/status");
  try {
    if (status.accounts.length) localStorage.setItem(CONNECTED_KEY, "1");
    else localStorage.removeItem(CONNECTED_KEY);
  } catch {
    // Storage blocked: the Home card just keeps checking.
  }
  return status;
}

export const MAIL_AI_MODELS = [
  { id: "claude-haiku-5-5", label: "Haiku 5.5" },
  { id: "claude-sonnet-5-5", label: "Sonnet 5.5" },
  { id: "claude-opus-5-5", label: "Opus 5.5" },
  { id: "claude-fable-5-2", label: "Fable 5.2" },
];

export const saveMailAi = (body: { apiKey?: string | null; model?: string }) =>
  request<MailStatus["ai"]>("/api/mail/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const saveMailCache = (body: Partial<MailCacheSettings>) =>
  request<MailCacheSettings>("/api/mail/cache", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const fetchMailDigest = (refresh = false) => request<MailDigest>(`/api/mail/digest${refresh ? "?refresh=1" : ""}`);

export const startMailAuth = (provider: MailProvider) => request<{ url: string }>(`/api/mail/auth/start?provider=${provider}`);

export const disconnectMailAccount = (id: string) => request<{ ok: true }>(`/api/mail/accounts/${encodeURIComponent(id)}`, { method: "DELETE" });

const newest = (a: MailItem, b: MailItem) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt);

export function newestFirst(items: MailItem[], category: MailCategory): MailItem[] {
  return items.filter((i) => i.category === category).sort(newest);
}

export function sortBills(items: MailItem[]): MailItem[] {
  const bills = items.filter((i) => i.category === "bill");
  const dated = bills.filter((i) => i.dueDate).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!) || newest(a, b));
  return [...dated, ...bills.filter((i) => !i.dueDate).sort(newest)];
}

export const jobCompany = (item: MailItem) => item.company || item.from;

export function latestJobs(items: MailItem[]): MailItem[] {
  const latest = new Map<string, MailItem>();
  for (const item of newestFirst(items, "job")) {
    const key = jobCompany(item).toLowerCase();
    if (!latest.has(key)) latest.set(key, item);
  }
  return [...latest.values()];
}

const dueWithin = (item: MailItem, from: string, days: number) => !!item.dueDate && item.dueDate >= from && item.dueDate <= addDays(from, days);

export function mailSummary(items: MailItem[], now: Date) {
  const today = toLocalDateStr(now);
  const weekAgo = now.getTime() - 7 * DAY_MS;
  const recent = (category: MailCategory) => items.filter((i) => i.category === category && Date.parse(i.receivedAt) >= weekAgo).length;
  return {
    billsDue: items.filter((i) => i.category === "bill" && dueWithin(i, today, 7)).length,
    activeJobs: latestJobs(items).filter((i) => i.jobStatus !== "rejected").length,
    orders: recent("order"),
    security: recent("security"),
  };
}

export const isOverdue = (item: MailItem, today: string) => !!item.dueDate && item.dueDate < today;

export const formatDay = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function dueLabel(dueDate: string, today: string): string {
  if (dueDate < today) return `Overdue · ${formatDay(dueDate)}`;
  if (dueDate === today) return "Due today";
  if (dueDate === addDays(today, 1)) return "Due tomorrow";
  return `Due ${formatDay(dueDate)}`;
}

export function relativeDate(iso: string, now: Date): string {
  const mins = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 24 * 60) return `${Math.floor(mins / 60)}h ago`;
  if (mins < 7 * 24 * 60) return `${Math.floor(mins / (24 * 60))}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function mailRecap(items: MailItem[], day: string): string[] | null {
  const onDay = (category: MailCategory) => items.filter((i) => i.category === category && toLocalDateStr(new Date(i.receivedAt)) === day);
  const bills = sortBills(items).filter((i) => dueWithin(i, day, 7));
  const jobs = latestJobs(onDay("job"));
  const orders = onDay("order").length;
  const security = onDay("security").length;
  const lines = [
    ...bills.map((b) => `- **Bill** ${b.from}${b.amount ? ` ${b.amount}` : ""}, due ${formatDay(b.dueDate!)}`),
    ...jobs.map((j) => `- **Job** ${jobCompany(j)}: ${JOB_STATUS_LABEL[j.jobStatus ?? "update"]}`),
    ...(orders ? [`- **Orders** ${orders} ${orders === 1 ? "email" : "emails"}`] : []),
    ...(security ? [`- **Security alerts** ${security}`] : []),
  ];
  return lines.length ? ["## Mail", "", ...lines] : null;
}
