import { Orbit } from "lucide-react";
import type { ModuleManifest } from "../types";

export default {
  id: "orbit",
  label: "The Orbit",
  icon: Orbit,
  description: "Habits, mood and focus time.",
  phone: true,
  load: () => import("./OrbitPage"),
} satisfies ModuleManifest<"orbit">;
