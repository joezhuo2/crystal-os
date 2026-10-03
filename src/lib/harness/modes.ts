import type { Mode } from "./types";

/** An ACP `session/request_permission` option. */
export interface AcpPermissionOption {
  optionId: string;
  name?: string;
  kind: "allow_once" | "allow_always" | "reject_once" | "reject_always" | string;
}

export type PermissionDecision = { type: "select"; optionId: string } | { type: "ask" } | { type: "cancel" };

/** Tool kinds that only look at things. Everything else can change state. */
const READ_ONLY_KINDS = new Set(["read", "search", "fetch", "think"]);

function pick(options: AcpPermissionOption[], kinds: string[]): string | null {
  for (const kind of kinds) {
    const option = options.find((o) => o.kind === kind);
    if (option) return option.optionId;
  }
  return null;
}

/**
 * How Nebula answers a dsh permission request without asking the user.
 * dsh ACP has no modes, so plan mode is enforced here by refusing anything
 * that is not read-only.
 */
export function decideDshPermission(mode: Mode, toolKind: string | undefined, options: AcpPermissionOption[]): PermissionDecision {
  if (mode === "manual") return { type: "ask" };
  if (mode === "plan" && !READ_ONLY_KINDS.has(toolKind ?? "")) {
    const reject = pick(options, ["reject_once", "reject_always"]);
    return reject ? { type: "select", optionId: reject } : { type: "cancel" };
  }
  const allow = pick(options, ["allow_once", "allow_always"]);
  return allow ? { type: "select", optionId: allow } : { type: "ask" };
}

/** The option to send when the user clicks Allow or Deny on a card. */
export function userChoice(options: AcpPermissionOption[], allow: boolean): PermissionDecision {
  const optionId = allow ? pick(options, ["allow_once", "allow_always"]) : pick(options, ["reject_once", "reject_always"]);
  return optionId ? { type: "select", optionId } : { type: "cancel" };
}

export const PLAN_MODE_PREFIX =
  "[Plan mode] Investigate and propose a plan only. Do not edit, create, move, or delete files, and do not run commands that change anything. The user will switch modes when they want the plan carried out.";
