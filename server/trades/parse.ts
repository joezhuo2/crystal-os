import { createHash } from "node:crypto";
import type { Dividend, FxConversion, OptionContract, TradeCurrency, TradeEvent, TradeStatus } from "./types";

export interface TradeEmail {
  messageId: string;
  subject: string;
  text?: string;
  receivedAt: string;
  url?: string;
}

export type ParsedEmail = { kind: "trade"; event: TradeEvent } | { kind: "fx"; fx: FxConversion } | { kind: "dividend"; dividend: Dividend } | null;

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const ZONE_HOURS: Record<string, number> = { EDT: -4, EST: -5 };
const STATUS_PHRASES: [RegExp, TradeStatus][] = [
  [/your order has been partially filled/i, "partial"],
  [/your order has been filled/i, "filled"],
  [/your order has been cancell?ed/i, "cancelled"],
  [/your order has expired/i, "expired"],
  [/your order has been rejected/i, "rejected"],
];
const FX_PHRASE = /your funds have been converted/i;
const DIVIDEND_PHRASE = /dividend/i;
const NOT_A_SYMBOL = new Set(["TFSA", "RRSP", "FHSA", "RESP", "LIRA", "USD", "CAD"]);

function fields(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Za-z][A-Za-z ]*?):\s*(.+)$/.exec(line.trim());
    if (m && !out.has(m[1].toLowerCase())) out.set(m[1].toLowerCase(), m[2].trim());
  }
  return out;
}

function toNumber(raw: string): number {
  return Number(raw.replace(/,/g, ""));
}

function money(raw: string | undefined): { value: number; currency: TradeCurrency } | undefined {
  const m = raw && /^(US)?\$\s*(-?[\d,]+(?:\.\d+)?)/.exec(raw.trim());
  if (!m) return undefined;
  const value = toNumber(m[2]);
  return Number.isFinite(value) ? { value, currency: m[1] ? "USD" : "CAD" } : undefined;
}

function quantity(raw: string | undefined): { filled: number; ordered?: number } | undefined {
  const m = raw && /^([\d,]+(?:\.\d+)?)(?:\s+of\s+([\d,]+(?:\.\d+)?))?/i.exec(raw.trim());
  if (!m) return undefined;
  const filled = toNumber(m[1]);
  const ordered = m[2] === undefined ? undefined : toNumber(m[2]);
  return Number.isFinite(filled) ? { filled, ordered } : undefined;
}

function emailTime(raw: string | undefined): string | undefined {
  const m = raw && /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*(E[SD]T)/i.exec(raw.trim());
  if (!m) return undefined;
  const month = MONTHS.indexOf(m[1].toLowerCase());
  if (month < 0) return undefined;
  const ms = Date.UTC(Number(m[3]), month, Number(m[2]), Number(m[4]) - ZONE_HOURS[m[6].toUpperCase()], Number(m[5]));
  return Number.isNaN(ms) ? undefined : new Date(ms).toISOString();
}

function option(raw: string | undefined, expiry: string | undefined): { symbol: string; option: OptionContract } | undefined {
  const m = raw && /^(\S+)\s+([\d,]+(?:\.\d+)?)\s+(call|put)/i.exec(raw.trim());
  if (!m || !expiry || !/^\d{4}-\d{2}-\d{2}/.test(expiry)) return undefined;
  const strike = toNumber(m[2]);
  if (!Number.isFinite(strike)) return undefined;
  return { symbol: m[1].toUpperCase(), option: { strike, right: m[3].toLowerCase() as "call" | "put", expiry: expiry.slice(0, 10) } };
}

function parseFx(email: TradeEmail, f: Map<string, string>): ParsedEmail {
  const amount = (raw: string | undefined) => {
    const m = raw && /([\d,]+(?:\.\d+)?)\s*(USD|CAD)/i.exec(raw);
    return m ? { value: toNumber(m[1]), currency: m[2].toUpperCase() as TradeCurrency } : undefined;
  };
  const from = amount(f.get("amount submitted"));
  const to = amount(f.get("amount received"));
  if (!from || !to || !Number.isFinite(from.value) || !Number.isFinite(to.value)) return null;
  const fx: FxConversion = {
    id: email.messageId,
    account: (f.get("account") ?? "").replace(/\s*\(.*\)\s*$/, ""),
    fromAmount: from.value,
    fromCurrency: from.currency,
    toAmount: to.value,
    toCurrency: to.currency,
    time: email.receivedAt,
  };
  if (email.url) fx.url = email.url;
  return { kind: "fx", fx };
}

function parseDividend(email: TradeEmail, f: Map<string, string>, haystack: string): ParsedEmail {
  const candidates = [
    f.get("symbol"),
    /\bfrom\s+([A-Z][A-Z0-9.]{0,9})\b/.exec(haystack)?.[1],
    ...[...haystack.matchAll(/\(([A-Z][A-Z0-9.]{0,9})\)/g)].map((m) => m[1]),
  ];
  const symbol = candidates.find((s) => s && !NOT_A_SYMBOL.has(s.toUpperCase()))?.toUpperCase();
  const raw = f.get("amount") ?? f.get("total") ?? f.get("dividend") ?? haystack;
  const m = /(US)?\$\s*([\d,]+(?:\.\d+)?)\s*(USD|CAD)?/i.exec(raw);
  const amount = m ? toNumber(m[2]) : NaN;
  if (!symbol || !m || !(amount > 0)) return null;
  const account = f.get("account") ?? /\bin your\s+([A-Za-z][A-Za-z -]*?)\s+account/i.exec(haystack)?.[1] ?? "";
  const dividend: Dividend = {
    id: email.messageId,
    source: "email",
    account: account.replace(/\s*\(.*\)\s*$/, ""),
    symbol,
    amount,
    currency: m[1] || m[3]?.toUpperCase() === "USD" ? "USD" : "CAD",
    time: emailTime(f.get("time")) ?? email.receivedAt,
  };
  if (email.url) dividend.url = email.url;
  return { kind: "dividend", dividend };
}

export function parseWealthsimpleEmail(email: TradeEmail): ParsedEmail {
  const text = email.text ?? "";
  const haystack = `${email.subject}\n${text}`;
  const f = fields(text);

  if (FX_PHRASE.test(haystack)) return parseFx(email, f);
  if (DIVIDEND_PHRASE.test(email.subject)) return parseDividend(email, f, haystack);

  const status = STATUS_PHRASES.find(([re]) => re.test(email.subject))?.[1] ?? STATUS_PHRASES.find(([re]) => re.test(haystack))?.[1];
  if (!status) return null;

  const type = /^(.*?)\s*(Buy|Sell)(?:\s+to\s+(Open|Close))?$/i.exec(f.get("type") ?? "");
  const qty = quantity(f.get("contracts") ?? f.get("shares"));
  if (!type || !qty) return null;

  let symbol: string;
  let contract: OptionContract | undefined;
  if (f.has("option")) {
    const parsed = option(f.get("option"), f.get("expiry"));
    if (!parsed) return null;
    symbol = parsed.symbol;
    contract = parsed.option;
  } else {
    const raw = f.get("symbol");
    if (!raw) return null;
    symbol = raw.toUpperCase();
  }

  const price = money(f.get("average price")) ?? money(f.get("limit price"));
  const total = money(f.get("total cost")) ?? money(f.get("total value"));
  const unfilled = status === "cancelled" || status === "expired" || status === "rejected";
  const event: TradeEvent = {
    id: email.messageId,
    source: "email",
    status,
    account: (f.get("account") ?? "").replace(/\s*\(.*\)\s*$/, ""),
    side: type[2].toLowerCase() as "buy" | "sell",
    orderType: type[1].trim() || "Market",
    symbol,
    quantity: unfilled ? (qty.ordered ?? qty.filled) : qty.filled,
    currency: (price ?? total)?.currency ?? "CAD",
    time: emailTime(f.get("time")) ?? email.receivedAt,
  };
  if (type[3]) event.effect = type[3].toLowerCase() as "open" | "close";
  if (contract) event.option = contract;
  if (qty.ordered !== undefined) event.orderedQuantity = qty.ordered;
  if (price) event.price = price.value;
  if (total) event.total = total.value;
  if (email.url) event.url = email.url;
  return { kind: "trade", event };
}

function csvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const text = csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((v) => v.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v) => v.trim() !== "")) rows.push(row);
  return rows;
}

// shortcut: export format inferred, adjust mapping when a real export does not match
export function parseTradesCsv(csv: string): { events: TradeEvent[]; dividends: Dividend[]; skipped: number } {
  const rows = csvRows(csv);
  if (rows.length === 0) return { events: [], dividends: [], skipped: 0 };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (row: string[], name: string) => {
    const i = header.indexOf(name);
    return i < 0 ? "" : (row[i] ?? "").trim();
  };
  const activity = header.includes("activity_type");
  const events: TradeEvent[] = [];
  const dividends: Dividend[] = [];
  const seen = new Map<string, number>();
  let skipped = 0;

  for (const row of rows.slice(1)) {
    const date = col(row, activity ? "transaction_date" : "date");
    if (activity && /^dividend/i.test(col(row, "activity_type"))) {
      const amount = Math.abs(toNumber(col(row, "net_cash_amount")));
      const paid = new Date(date);
      const cur = (col(row, "currency") || "CAD").toUpperCase();
      const ticker = col(row, "symbol").toUpperCase();
      if (!ticker || !(amount > 0) || (cur !== "USD" && cur !== "CAD") || Number.isNaN(paid.getTime())) {
        skipped++;
        continue;
      }
      const hash = createHash("sha1").update(row.map((v) => v.trim().toLowerCase()).join("|")).digest("hex");
      const n = seen.get(hash) ?? 0;
      seen.set(hash, n + 1);
      dividends.push({
        id: `csv:div:${n === 0 ? hash : createHash("sha1").update(`${hash}#${n}`).digest("hex")}`,
        source: "csv",
        account: col(row, "account_type") || "Non-registered",
        symbol: ticker,
        amount,
        currency: cur,
        time: paid.toISOString(),
      });
      continue;
    }
    const sideRaw = activity
      ? /^trade$/i.test(col(row, "activity_type"))
        ? (/buy|sell/i.exec(col(row, "activity_sub_type"))?.[0] ?? /buy|sell/i.exec(col(row, "direction"))?.[0] ?? "")
        : ""
      : col(row, "side");
    const side = /^buy/i.test(sideRaw) ? "buy" : /^sell/i.test(sideRaw) ? "sell" : undefined;
    const symbol = col(row, "symbol").toUpperCase();
    const currency = (col(row, "currency") || "CAD").toUpperCase();
    const qty = Math.abs(toNumber(col(row, "quantity")));
    const price = col(row, activity ? "unit_price" : "price");
    const net = col(row, "net_cash_amount");
    const time = new Date(date);
    if (!side || !symbol || (currency !== "USD" && currency !== "CAD") || !(qty > 0) || Number.isNaN(time.getTime())) {
      skipped++;
      continue;
    }
    const key = createHash("sha1").update(row.map((v) => v.trim().toLowerCase()).join("|")).digest("hex");
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    const event: TradeEvent = {
      id: `csv:${n === 0 ? key : createHash("sha1").update(`${key}#${n}`).digest("hex")}`,
      source: "csv",
      status: "filled",
      account: (activity ? col(row, "account_type") : col(row, "account")) || "Non-registered",
      side,
      orderType: "Market",
      symbol,
      quantity: qty,
      currency,
      time: time.toISOString(),
    };
    if (price !== "" && Number.isFinite(toNumber(price))) event.price = Math.abs(toNumber(price));
    if (net !== "" && Number.isFinite(toNumber(net))) event.total = Math.abs(toNumber(net));
    events.push(event);
  }
  return { events, dividends, skipped };
}
