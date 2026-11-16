import { vaultErrorCode } from "@/hooks/useVault";

export function errorText(err: unknown): string {
  if (vaultErrorCode(err) === "conflict") return "The file changed on disk while it was being saved. Try again.";
  if (err instanceof Error) return err.message || err.name;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err) ?? String(err);
  } catch {
    return String(err);
  }
}
