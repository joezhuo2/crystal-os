import { ListTodo } from "lucide-react";
import type { ModuleManifest } from "../types";

export default {
  id: "tasks",
  label: "The Engine",
  icon: ListTodo,
  description: "Tasks, subtasks and the focus timer.",
  phone: true,
  load: () => import("./TasksPage"),
} satisfies ModuleManifest<"tasks">;
