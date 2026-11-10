import { AppWindow } from "lucide-react";
import type { ModuleManifest } from "../types";

export default {
  id: "portal",
  label: "The Portal",
  icon: AppWindow,
  description: "Web apps embedded in a side panel.",
  bottom: true,
  load: () => import("./PortalPage"),
} satisfies ModuleManifest<"portal">;
