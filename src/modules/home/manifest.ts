import { Home } from "lucide-react";
import type { ModuleManifest } from "../types";

export default {
  id: "home",
  label: "The Pulse",
  icon: Home,
  description: "Your day at a glance.",
  core: true,
  phone: true,
  load: () => import("@/components/views/HomePage"),
} satisfies ModuleManifest<"home">;
