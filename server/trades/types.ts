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
