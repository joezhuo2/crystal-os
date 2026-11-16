import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { TradeEvent, TradesData } from "@/lib/trades";

const base = { source: "manual", status: "filled", account: "TFSA", orderType: "Limit", currency: "USD" } as const;
const events: TradeEvent[] = [
  { ...base, id: "b1", side: "buy", symbol: "NVDA", quantity: 2, price: 100, total: 200, time: "2026-01-05T15:00:00.000Z" },
  { ...base, id: "s1", side: "sell", symbol: "NVDA", quantity: 2, price: 150, total: 300, time: "2026-01-12T15:00:00.000Z" },
  { ...base, id: "s2", side: "sell", symbol: "AMD", quantity: 5, price: 80, total: 400, time: "2026-02-02T15:00:00.000Z" },
  {
    ...base,
    id: "o1",
    side: "buy",
    effect: "open",
    symbol: "APLD",
    option: { strike: 17, right: "put", expiry: "2099-10-30" },
    quantity: 3,
    price: 0.5,
    total: 150,
    time: "2026-03-02T15:00:00.000Z",
  },
];

const data: TradesData = { events, fx: [], journal: {}, lastSync: null, errors: [], connected: true };

vi.mock("@/hooks/useTrades", () => ({
  useTrades: () => ({ data, isLoading: false, isError: false, error: null }),
  useTradesSync: () => ({ sync: vi.fn(), isPending: false, error: null }),
  useImportTradesCsv: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteTradeEvent: () => ({ mutate: vi.fn(), isPending: false }),
  useAddTradeEvent: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateTradeEvent: () => ({ mutate: vi.fn(), isPending: false }),
  useSaveTradeJournal: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/components/ItemNoteLink", () => ({ ItemNoteLink: () => null }));

import TradesPage from "./TradesPage";

describe("TradesPage", () => {
  it("shows the stats strip and the closed, incomplete and open positions", () => {
    render(<TradesPage />);
    expect(screen.getByRole("heading", { name: "The Ledger" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "USD statistics" })).toHaveTextContent("+US$100.00");
    expect(screen.getByRole("region", { name: "USD statistics" })).toHaveTextContent("1 closed trade");

    expect(screen.getByRole("button", { name: "NVDA" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add the missing buy" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Open/ }));
    expect(screen.getByRole("button", { name: /APLD \$17 Put/ })).toBeInTheDocument();
    expect(screen.getByText("Unrealized P/L needs live prices — not tracked.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: /Orders/ }));
    expect(screen.getAllByRole("button", { name: /Edit the .* order/ })).toHaveLength(4);
  });
});
