import { BookOpen } from "lucide-react";
import type { ModuleManifest } from "../types";

export default {
  id: "archive",
  label: "The Archive",
  icon: BookOpen,
  description: "Notes from your Obsidian vault.",
  phone: true,
  bottom: true,
  load: () => import("./ArchivePage"),
} satisfies ModuleManifest<"archive">;
