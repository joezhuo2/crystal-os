/**
 * Mirrors VaultError in server/obsidian/vault.ts: an error that carries the
 * HTTP status the middleware should reply with, so route handlers can throw
 * instead of threading a response object through every helper.
 */
export class CalendarError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "CalendarError";
    this.status = status;
  }
}
