import type { MailItem } from "@/lib/mail";
import { toLocalDateStr } from "@/lib/utils";

const INVESTMENT_SENDER =
  /wealthsimple|questrade|interactive\s?brokers|ibkr|robinhood|fidelity|schwab|vanguard|e-?trade|coinbase|kraken|binance|webull|moomoo|qtrade|disnat|direct\s?investing|investorline|newton\.co|shakepay/i;
const INVESTMENT_SUBJECT = /\b(order (has been )?(filled|executed)|(buy|sell|limit|market) order|dividend|funds have been converted|trade confirmation)\b/i;

export const isInvestmentMail = (item: Pick<MailItem, "from" | "fromAddress" | "subject">) =>
  INVESTMENT_SENDER.test(`${item.from} ${item.fromAddress}`) || INVESTMENT_SUBJECT.test(item.subject);

// shortcut: amounts are read as dot-decimal and logged as-is whatever the currency, add conversion if foreign orders show up
export function parseAmount(text: string | undefined): number | null {
  const match = text?.replace(/,/g, "").match(/\d+(?:\.\d{1,2})?/);
  const value = match ? Number(match[0]) : NaN;
  return value > 0 ? value : null;
}

const detail = (item: MailItem, label: string) => item.details?.find((d) => d.label === label)?.value;

export const mailSourceId = (item: Pick<MailItem, "id">) => `mail:${item.id}`;

export function purchaseSourceId(item: MailItem): string {
  const order = detail(item, "Order number");
  return order ? `order:${(item.fromAddress.split("@")[1] ?? item.from).toLowerCase()}:${order.toLowerCase()}` : mailSourceId(item);
}

export interface MailPurchase {
  sourceId: string;
  name: string;
  amount: number;
  date: string;
}

export function mailPurchases(items: MailItem[], known: ReadonlySet<string>): MailPurchase[] {
  const found = new Map<string, MailPurchase>();
  for (const item of items) {
    if (item.category !== "order" || isInvestmentMail(item) || detail(item, "Status") === "Refunded") continue;
    const amount = parseAmount(detail(item, "Total") ?? item.amount);
    const sourceId = purchaseSourceId(item);
    if (amount === null || known.has(sourceId) || known.has(mailSourceId(item))) continue;
    const date = toLocalDateStr(new Date(item.receivedAt));
    const earlier = found.get(sourceId);
    if (!earlier || date < earlier.date) found.set(sourceId, { sourceId, name: (item.from.trim() || item.subject.trim()).slice(0, 120), amount, date });
  }
  return [...found.values()];
}

export interface MailBill {
  sourceId: string;
  name: string;
  amount: number | null;
  dueDate: string;
  url: string;
}

export function upcomingBills(items: MailItem[], known: ReadonlySet<string>): MailBill[] {
  return items
    .filter((i) => i.category === "bill" && i.dueDate && !isInvestmentMail(i) && !known.has(mailSourceId(i)))
    .map((i) => ({ sourceId: mailSourceId(i), name: (i.from.trim() || i.subject.trim()).slice(0, 120), amount: parseAmount(i.amount), dueDate: i.dueDate!, url: i.url }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function billAlerts(bills: MailBill[], today: string, tomorrow: string) {
  return bills
    .filter((b) => b.dueDate === today || b.dueDate === tomorrow)
    .map((b) => ({
      key: `bill-due:${b.sourceId}`,
      title: `${b.name} bill due ${b.dueDate === today ? "today" : "tomorrow"}`,
      body: b.amount === null ? "Open The Vault to log it once it is paid." : `$${b.amount.toFixed(2)} is due. Log it in The Vault once it is paid.`,
    }));
}
