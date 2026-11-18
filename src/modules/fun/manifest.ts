import { Gamepad2 } from "lucide-react";
import type { ModuleManifest } from "../types";

export default {
  id: "fun",
  label: "The Arcade",
  icon: Gamepad2,
  description: "Daily games with streaks and scores.",
  bottom: true,
  load: () => import("./FunPage"),
} satisfies ModuleManifest<"fun">;
