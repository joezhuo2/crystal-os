import { Sparkles } from "lucide-react";
import type { ModuleManifest } from "../types";

export default {
  id: "nebula",
  label: "The Nebula",
  icon: Sparkles,
  description: "AI coding agents.",
  desktopOnly: true,
  bottom: true,
  load: () => import("./NebulaPage"),
} satisfies ModuleManifest<"nebula">;
