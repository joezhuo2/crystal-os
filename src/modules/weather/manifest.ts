import { CloudSun } from "lucide-react";
import type { ModuleManifest } from "../types";

export default {
  id: "weather",
  label: "The Atmosphere",
  icon: CloudSun,
  description: "Weather, air quality and the sky.",
  phone: true,
  load: () => import("./WeatherPage"),
} satisfies ModuleManifest<"weather">;
