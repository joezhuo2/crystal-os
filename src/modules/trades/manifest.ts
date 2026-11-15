import { CandlestickChart } from "lucide-react";
import type { ModuleManifest } from "../types";

export default {
  id: "trades",
  label: "The Ledger",
  icon: CandlestickChart,
  description: "Wealthsimple trades, profit/loss and your trade journal.",
  load: () => import("./TradesPage"),
} satisfies ModuleManifest<"trades">;
