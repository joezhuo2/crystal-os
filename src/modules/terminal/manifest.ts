import { SquareTerminal } from "lucide-react";
import type { ModuleManifest } from "../types";

export default {
  id: "terminal",
  label: "Terminal",
  icon: SquareTerminal,
  description: "A shell inside the app.",
  desktopOnly: true,
  bottom: true,
  load: () => import("./TerminalPage"),
} satisfies ModuleManifest<"terminal">;
