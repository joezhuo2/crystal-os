/**
 * Local error reporting. Unhandled promise rejections, uncaught errors and
 * failed Supabase writes are kept in memory and, on desktop, appended to
 * `diagnostics.log` in the app log dir (src-tauri/src/diagnostics.rs).
 * Settings → Diagnostics copies them with some app info so a bug report has
 * something to go on. Nothing is sent anywhere.
 *
 * Entries never include request bodies or query strings, only the method,
 * the path (which names the table) and the error Supabase returned, so task
 * titles, amounts and notes stay out of the log.
 */
import { isDesktop } from "@/lib/platform";

export type DiagnosticKind = "rejection" | "error" | "supabase";

export interface DiagnosticEntry {
  at: string;
  kind: DiagnosticKind;
  message: string;
}

/** Entries kept in memory; the desktop log file keeps more. */
export const MAX_ENTRIES = 200;
const MAX_MESSAGE_CHARS = 1_000;
const STACK_FRAMES = 5;
const FLUSH_MS = 500;

const entries: DiagnosticEntry[] = [];
let pending: string[] = [];
let flushTimer: ReturnType<typeof setTimeout> | undefined;

export function formatEntry(entry: DiagnosticEntry): string {
  return `${entry.at} [${entry.kind}] ${entry.message}`;
}

/** A readable one-off description of whatever was thrown or rejected. */
export function describeError(reason: unknown): string {
  if (reason instanceof Error) {
    const head = `${reason.name}: ${reason.message}`;
    const frames = (reason.stack ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("at ") || line.includes("@"))
      .slice(0, STACK_FRAMES);
    return frames.length ? `${head} | ${frames.join(" | ")}` : head;
  }
  if (typeof reason === "string") return reason;
  try {
    return JSON.stringify(reason) ?? String(reason);
  } catch {
    return String(reason);
  }
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

async function flush(): Promise<void> {
  flushTimer = undefined;
  if (!pending.length) return;
  const lines = pending;
  pending = [];
  try {
    await invoke("diagnostics_append", { lines });
  } catch (err) {
    // Not recorded: a failing log write must not feed itself.
    console.warn("[diagnostics] could not write the log file", err);
  }
}

export function recordDiagnostic(kind: DiagnosticKind, message: string, now: Date = new Date()): DiagnosticEntry {
  const entry: DiagnosticEntry = {
    at: now.toISOString(),
    kind,
    message: message.length > MAX_MESSAGE_CHARS ? `${message.slice(0, MAX_MESSAGE_CHARS)}…` : message,
  };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);

  if (isDesktop()) {
    pending.push(formatEntry(entry));
    flushTimer ??= setTimeout(() => void flush(), FLUSH_MS);
  }
  return entry;
}

/** This session's entries, oldest first. */
export function getDiagnostics(): readonly DiagnosticEntry[] {
  return entries;
}

/** Test helper. */
export function clearDiagnostics(): void {
  entries.length = 0;
  pending = [];
  if (flushTimer !== undefined) clearTimeout(flushTimer);
  flushTimer = undefined;
}

let removeHandlers: (() => void) | undefined;

/** Listen for unhandled rejections and uncaught errors. Safe to call twice. */
export function installGlobalErrorHandlers(target: Window = window): () => void {
  if (removeHandlers) return removeHandlers;
  const onRejection = (event: PromiseRejectionEvent) => {
    recordDiagnostic("rejection", describeError(event.reason));
  };
  const onError = (event: ErrorEvent) => {
    const where = event.filename ? ` (${event.filename}:${event.lineno}:${event.colno})` : "";
    recordDiagnostic("error", `${event.error ? describeError(event.error) : event.message}${where}`);
  };
  target.addEventListener("unhandledrejection", onRejection);
  target.addEventListener("error", onError);
  removeHandlers = () => {
    target.removeEventListener("unhandledrejection", onRejection);
    target.removeEventListener("error", onError);
    removeHandlers = undefined;
  };
  return removeHandlers;
}

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method.toUpperCase();
  if (typeof Request !== "undefined" && input instanceof Request) return input.method.toUpperCase();
  return "GET";
}

function requestPath(input: RequestInfo | URL): string {
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  try {
    return new URL(raw, "http://localhost").pathname;
  } catch {
    return "(unknown path)";
  }
}

/** Supabase's error JSON (PostgREST, Storage) boiled down to one line. */
export function summariseErrorBody(body: string): string {
  try {
    const json = JSON.parse(body) as Record<string, unknown>;
    const code = json.code ?? json.error ?? json.statusCode;
    const message = json.message ?? json.msg ?? json.error_description;
    const parts = [code, message, json.details, json.hint].filter(
      (part): part is string | number => typeof part === "string" || typeof part === "number",
    );
    if (parts.length) return parts.join(" · ");
  } catch {
    // Not JSON; fall through.
  }
  return body.slice(0, 200);
}

/**
 * A fetch for the Supabase client that records failed writes. Reads are left
 * out (a failed read already shows in the UI as missing data), and so is auth,
 * whose failures are sign-in mistakes rather than bugs.
 */
export function createLoggingFetch(base: typeof fetch = (input, init) => fetch(input, init)): typeof fetch {
  return async (input, init) => {
    const method = requestMethod(input, init);
    const path = requestPath(input);
    const watched = method !== "GET" && method !== "HEAD" && !path.includes("/auth/v1/");
    let response: Response;
    try {
      response = await base(input, init);
    } catch (err) {
      if (watched) recordDiagnostic("supabase", `${method} ${path} failed: ${describeError(err)}`);
      throw err;
    }
    if (watched && !response.ok) {
      const status = `${response.status}${response.statusText ? ` ${response.statusText}` : ""}`;
      // Read a copy in the background so the caller gets the response at once.
      response
        .clone()
        .text()
        .then(
          (body) => recordDiagnostic("supabase", `${method} ${path} → ${status}: ${summariseErrorBody(body)}`),
          () => recordDiagnostic("supabase", `${method} ${path} → ${status}`),
        );
    }
    return response;
  };
}

interface NativeLog {
  path: string;
  lines: string[];
}

declare const __APP_VERSION__: string | undefined;

/** Plain-text report for "Copy diagnostics". */
export async function buildDiagnosticsReport(now: Date = new Date()): Promise<string> {
  const desktop = isDesktop();
  const version = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "unknown";
  const header = [
    `Crystal OS ${version} (${desktop ? "desktop" : "web"})`,
    `Generated: ${now.toISOString()}`,
    `User agent: ${navigator.userAgent}`,
    `Online: ${navigator.onLine ? "yes" : "no"}`,
    `Screen: ${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio}x`,
  ];

  let lines = entries.map(formatEntry);
  let source = "this session (in memory)";
  if (desktop) {
    if (flushTimer !== undefined) clearTimeout(flushTimer);
    await flush();
    try {
      const log = await invoke<NativeLog>("diagnostics_read", { maxLines: MAX_ENTRIES });
      lines = log.lines;
      source = log.path;
    } catch (err) {
      source = `this session (in memory; log file unreadable: ${describeError(err)})`;
    }
  }

  return [
    ...header,
    "",
    `Recent errors (${lines.length}) from ${source}:`,
    ...(lines.length ? lines : ["(none)"]),
  ].join("\n");
}
