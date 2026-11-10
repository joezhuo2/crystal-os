import { Wallet } from "lucide-react";
import type { ModuleManifest } from "../types";

export default {
  id: "financials",
  label: "The Vault",
  icon: Wallet,
  description: "Income, spending and budgets.",
  phone: true,
  load: () => import("./FinancialsPage"),
} satisfies ModuleManifest<"financials">;
