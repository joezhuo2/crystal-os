import { Calendar } from "lucide-react";
import type { ModuleManifest } from "../types";

export default {
  id: "calendar",
  label: "The Horizon",
  icon: Calendar,
  description: "Calendar and time blocking.",
  phone: true,
  load: () => import("./CalendarPage"),
} satisfies ModuleManifest<"calendar">;
