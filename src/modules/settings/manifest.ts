import { Settings } from "lucide-react";
import type { ModuleManifest } from "../types";

export default {
  id: "settings",
  label: "Settings",
  icon: Settings,
  description: "App settings.",
  core: true,
  bottom: true,
  load: () => import("@/components/views/SettingsPage"),
} satisfies ModuleManifest<"settings">;
