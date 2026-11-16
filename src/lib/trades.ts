import { apiRequest } from "@/lib/apiRequest";

export type TradeCurrency = "USD" | "CAD";
export type TradeStatus = "filled" | "partial" | "cancelled" | "expired" | "rejected";
export type TradeSource = "email" | "manual" | "csv";

export interface OptionContract {
  strike: number;
  right: "call" | "put";
  expiry: string;
}

export interface TradeEvent {
  id: string;
  source: TradeSource;
  status: TradeStatus;
  account: string;
  side: "buy" | "sell";
  effect?: "open" | "close";
  orderType: string;
  symbol: string;
  option?: OptionContract;
  quantity: number;
  orderedQuantity?: number;
  price?: number;
  total?: number;
  currency: TradeCurrency;
  time: string;
  url?: string;
}

export interface FxConversion {
  id: string;
  account: string;
  fromAmount: number;
  fromCurrency: TradeCurrency;
  toAmount: number;
  toCurrency: TradeCurrency;
  time: string;
  url?: string;
}

export interface Dividend {
  id: string;
  source: "email" | "csv";
  account: string;
  symbol: string;
  amount: number;
  currency: TradeCurrency;
  time: string;
  url?: string;
}

export type TradeGrade = "A" | "B" | "C" | "D" | "F";

export interface TradeJournal {
  thesis?: string;
  target?: number;
  stop?: number;
  review?: string;
  followedRules?: boolean;
  grade?: TradeGrade;
  tags: string[];
  updatedAt: string;
}

export interface TradesData {
  events: TradeEvent[];
  fx: FxConversion[];
  dividends: Dividend[];
  journal: Record<string, TradeJournal>;
  lastSync: string | null;
  syncing?: boolean;
  errors: { account: string; message: string }[];
  connected: boolean;
}

const request = <T,>(url: string, init?: RequestInit) => apiRequest<T>(url, init, "Trades API error");

const send = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

const eventUrl = (id: string) => `/api/trades/events/${encodeURIComponent(id)}`;

export const fetchTrades = () => request<TradesData>("/api/trades");

export const syncTrades = () => request<TradesData>("/api/trades/sync", { method: "POST" });

export const addTradeEvent = (body: Omit<TradeEvent, "id" | "source">) => request<TradesData>("/api/trades/events", send("POST", body));

export const updateTradeEvent = (event: TradeEvent) => request<TradesData>(eventUrl(event.id), send("PUT", event));

export const deleteTradeEvent = (id: string) => request<TradesData>(eventUrl(id), { method: "DELETE" });

export const saveTradeJournal = (positionId: string, journal: Omit<TradeJournal, "updatedAt">) =>
  request<TradesData>(`/api/trades/journal/${encodeURIComponent(positionId)}`, send("PUT", journal));

export const importTradesCsv = (csv: string) =>
  request<TradesData & { imported: number; dividends_imported: number; skipped: number }>("/api/trades/import", send("POST", { csv }));

const CURRENCY_PREFIX: Record<TradeCurrency, string> = { USD: "US$", CAD: "C$" };

export function formatMoney(value: number, currency: TradeCurrency, signed = false): string {
  const amount = Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = value < 0 && amount !== "0.00" ? "-" : signed && value > 0 && amount !== "0.00" ? "+" : "";
  return `${sign}${CURRENCY_PREFIX[currency]}${amount}`;
}

export function formatPct(value: number, signed = false): string {
  const text = value.toFixed(1);
  return `${signed && value > 0 && text !== "0.0" ? "+" : ""}${text === "-0.0" ? "0.0" : text}%`;
}

export function instrumentLabel(item: { symbol: string; option?: OptionContract }): string {
  if (!item.option) return item.symbol;
  const { strike, right, expiry } = item.option;
  const date = new Date(`${expiry}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const strikeText = strike.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return `${item.symbol} $${strikeText} ${right === "call" ? "Call" : "Put"} · ${date}`;
}
