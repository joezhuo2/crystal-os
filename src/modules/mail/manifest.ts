import { Mail } from "lucide-react";
import type { ModuleManifest } from "../types";

export default {
  id: "mail",
  label: "The Courier",
  icon: Mail,
  description: "Bills, job applications, orders and security alerts from Gmail.",
  load: () => import("./MailPage"),
} satisfies ModuleManifest<"mail">;
