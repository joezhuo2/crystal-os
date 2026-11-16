import { Telescope } from "lucide-react";
import type { ModuleManifest } from "../types";

export default {
  id: "observatory",
  label: "The Observatory",
  icon: Telescope,
  description: "Courses, study queue and spaced repetition.",
  phone: true,
  load: () => import("./ObservatoryPage"),
} satisfies ModuleManifest<"observatory">;
