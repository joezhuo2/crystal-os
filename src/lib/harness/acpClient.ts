/**
 * Minimal ACP (Agent Client Protocol) client: JSON-RPC 2.0, one message per
 * line, over a dsh process. One client serves every session on that process;
 * updates and permission requests are routed by `sessionId`, responses by
 * request id.
 */

export class AcpError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = "AcpError";
  }
}

export type PermissionOutcome = { outcome: "selected"; optionId: string } | { outcome: "cancelled" };

export interface SessionHandler {
  onUpdate(update: Record<string, unknown>): void;
  onPermission(params: Record<string, unknown>, respond: (outcome: PermissionOutcome) => void): void;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer?: ReturnType<typeof setTimeout>;
}

export interface AcpClientOptions {
  send: (line: string) => Promise<void>;
  /** Default request timeout; `session/prompt` passes its own (none). */
  timeoutMs?: number;
  log?: (message: string) => void;
}

export class AcpClient {
  private nextRpcId = 1;
  private pending = new Map<number, Pending>();
  private sessions = new Map<string, SessionHandler>();
  private closed: Error | null = null;

  constructor(private opts: AcpClientOptions) {}

  allocateId(): number {
    return this.nextRpcId++;
  }

  /** Waits for the response to a request that was written by someone else (Rust). */
  /** `timeoutMs: null` waits indefinitely (a prompt can run for many minutes). */
  expect<T>(id: number, timeoutMs: number | null = this.opts.timeoutMs ?? null): Promise<T> {
    if (this.closed) return Promise.reject(this.closed);
    return new Promise<T>((resolve, reject) => {
      const entry: Pending = { resolve: resolve as (v: unknown) => void, reject };
      if (timeoutMs) {
        entry.timer = setTimeout(() => {
          this.pending.delete(id);
          reject(new AcpError(`Request ${id} timed out after ${Math.round(timeoutMs / 1000)}s`));
        }, timeoutMs);
      }
      this.pending.set(id, entry);
    });
  }

  async request<T>(method: string, params: unknown, timeoutMs: number | null = this.opts.timeoutMs ?? null): Promise<T> {
    const id = this.allocateId();
    const response = this.expect<T>(id, timeoutMs);
    try {
      await this.opts.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    } catch (err) {
      this.settle(id, undefined, err instanceof Error ? err : new Error(String(err)));
    }
    return response;
  }

  notify(method: string, params: unknown) {
    return this.opts.send(JSON.stringify({ jsonrpc: "2.0", method, params }));
  }

  bindSession(sessionId: string, handler: SessionHandler) {
    this.sessions.set(sessionId, handler);
  }

  unbindSession(sessionId: string) {
    this.sessions.delete(sessionId);
  }

  /** The process exited: fail everything still waiting. */
  close(reason: string) {
    this.closed = new AcpError(reason);
    for (const [id, entry] of this.pending) {
      if (entry.timer) clearTimeout(entry.timer);
      entry.reject(this.closed);
      this.pending.delete(id);
    }
    this.sessions.clear();
  }

  get isClosed() {
    return this.closed !== null;
  }

  private settle(id: number, result: unknown, error?: Error) {
    const entry = this.pending.get(id);
    if (!entry) return;
    this.pending.delete(id);
    if (entry.timer) clearTimeout(entry.timer);
    if (error) entry.reject(error);
    else entry.resolve(result);
  }

  private respond(id: number | string, result: unknown) {
    void this.opts.send(JSON.stringify({ jsonrpc: "2.0", id, result })).catch(() => undefined);
  }

  private respondError(id: number | string, code: number, message: string) {
    void this.opts.send(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })).catch(() => undefined);
  }

  handleLine(line: string) {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(line);
    } catch {
      this.opts.log?.(`non-JSON line from dsh: ${line.slice(0, 200)}`);
      return;
    }
    const method = typeof msg.method === "string" ? msg.method : null;
    const id = msg.id as number | string | undefined;

    if (!method && id !== undefined) {
      const error = msg.error as { code?: number; message?: string; data?: unknown } | undefined;
      if (error) {
        const detail = error.data === undefined ? "" : ` ${typeof error.data === "string" ? error.data : JSON.stringify(error.data)}`;
        this.settle(Number(id), undefined, new AcpError(`${error.message ?? "Request failed"}${detail}`, error.code, error.data));
      } else {
        this.settle(Number(id), msg.result);
      }
      return;
    }
    if (!method) return;

    const params = (msg.params ?? {}) as Record<string, unknown>;
    const sessionId = typeof params.sessionId === "string" ? params.sessionId : "";
    const handler = this.sessions.get(sessionId);

    if (method === "session/update") {
      if (handler) handler.onUpdate((params.update ?? {}) as Record<string, unknown>);
      else this.opts.log?.(`update for unknown session ${sessionId}`);
      return;
    }
    if (method === "session/request_permission" && id !== undefined) {
      if (!handler) {
        this.respond(id, { outcome: { outcome: "cancelled" } });
        return;
      }
      let answered = false;
      handler.onPermission(params, (outcome) => {
        if (answered) return;
        answered = true;
        this.respond(id, { outcome });
      });
      return;
    }
    if (id !== undefined) this.respondError(id, -32601, `Method not supported by Crystal OS: ${method}`);
  }
}
