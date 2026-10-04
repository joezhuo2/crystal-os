/**
 * Task and transaction writes made while Supabase is unreachable. Instead of
 * failing the save, a write is kept here (in localStorage, per user) and
 * replayed in order once the database answers again.
 *
 * Inserts carry an id made on this device, so a queued task can be edited,
 * completed or deleted before it ever reaches the server, and replaying an
 * insert that did land (but whose response was lost) is recognised as done
 * rather than duplicated.
 */

export type QueueTable = "tasks" | "transactions" | "task_completions";
export type QueueRow = Record<string, unknown>;

export type QueuedWrite =
  | { op: "insert"; table: QueueTable; id: string; row: QueueRow; queuedAt: string }
  | { op: "update"; table: QueueTable; id: string; row: QueueRow; queuedAt: string }
  | { op: "delete"; table: QueueTable; id: string; queuedAt: string };

/** What a Supabase write resolves to, reduced to the parts the queue reads. */
export type WriteResult = {
  error: { message: string; code?: string } | null;
  status: number;
};

/**
 * True when a failed write should be kept and tried again later rather than
 * reported: no response at all (status 0, the request never got through), an
 * expired session the client will refresh, a timeout, rate limiting, or a
 * gateway that is down. Anything else is a real rejection.
 */
export function isRetryable(status: number): boolean {
  return status === 0 || status === 401 || status === 408 || status === 429 || (status >= 502 && status <= 504);
}

/** Postgres unique_violation: an insert with this id already landed. */
const DUPLICATE_KEY = "23505";

/**
 * Adds a write to the queue, folding it into earlier writes to the same row
 * (from index `from` on; earlier entries are being sent and must not change):
 * an update to a queued insert becomes part of the insert, updates merge, a
 * delete of a queued insert removes both, and a delete replaces queued updates.
 */
export function enqueue(queue: QueuedWrite[], write: QueuedWrite, from = 0): QueuedWrite[] {
  const sameRow = (w: QueuedWrite, i: number) => i >= from && w.table === write.table && w.id === write.id;
  const insertAt = queue.findIndex((w, i) => sameRow(w, i) && w.op === "insert");

  if (write.op === "update") {
    if (insertAt >= 0) {
      const insert = queue[insertAt] as Extract<QueuedWrite, { op: "insert" }>;
      return queue.map((w, i) => (i === insertAt ? { ...insert, row: { ...insert.row, ...write.row } } : w));
    }
    const updateAt = queue.findIndex((w, i) => sameRow(w, i) && w.op === "update");
    if (updateAt >= 0) {
      const update = queue[updateAt] as Extract<QueuedWrite, { op: "update" }>;
      return queue.map((w, i) => (i === updateAt ? { ...update, row: { ...update.row, ...write.row } } : w));
    }
    return [...queue, write];
  }

  if (write.op === "delete") {
    const rest = queue.filter((w, i) => !sameRow(w, i));
    // Never sent, so there is nothing on the server to delete.
    return insertAt >= 0 ? rest : [...rest, write];
  }

  return [...queue, write];
}

/**
 * The rows a queued write has not reached yet, as they will be once it does:
 * pending updates merged in, pending deletes dropped. Used to lay queued
 * writes over a fresh load so they stay on screen until they are sent.
 */
export function overlayRows<R extends { id: string }>(rows: R[], queue: QueuedWrite[], table: QueueTable): R[] {
  const pending = new Map<string, QueuedWrite>();
  for (const w of queue) if (w.table === table && w.op !== "insert") pending.set(w.id, w);
  if (pending.size === 0) return rows;
  const out: R[] = [];
  for (const row of rows) {
    const w = pending.get(row.id);
    if (!w) out.push(row);
    else if (w.op === "update") out.push({ ...row, ...w.row });
  }
  return out;
}

/** Queued inserts into `table`, as rows with their id and queue time as `created_at`. */
export function pendingInserts(queue: QueuedWrite[], table: QueueTable): Array<QueueRow & { id: string }> {
  return queue
    .filter((w): w is Extract<QueuedWrite, { op: "insert" }> => w.op === "insert" && w.table === table)
    .map((w) => ({ created_at: w.queuedAt, ...w.row, id: w.id }));
}

export type FlushResult = {
  /** Writes the server accepted. */
  sent: QueuedWrite[];
  /** Writes the server rejected; they are dropped from the queue. */
  failed: Array<{ write: QueuedWrite; message: string }>;
  /** Writes still waiting, in order, because the server stopped answering. */
  remaining: QueuedWrite[];
};

/**
 * Sends queued writes in order. Stops at the first one that cannot get
 * through, so later writes never overtake earlier ones.
 */
export async function flushWrites(
  queue: QueuedWrite[],
  send: (write: QueuedWrite) => Promise<WriteResult>,
): Promise<FlushResult> {
  const sent: QueuedWrite[] = [];
  const failed: FlushResult["failed"] = [];
  for (let i = 0; i < queue.length; i++) {
    const write = queue[i];
    let result: WriteResult;
    try {
      result = await send(write);
    } catch {
      result = { error: { message: "network error" }, status: 0 };
    }
    if (!result.error || (write.op === "insert" && result.error.code === DUPLICATE_KEY)) {
      sent.push(write);
    } else if (isRetryable(result.status)) {
      return { sent, failed, remaining: queue.slice(i) };
    } else {
      failed.push({ write, message: result.error.message });
    }
  }
  return { sent, failed, remaining: [] };
}

// ── the queue for the signed-in user ──

const KEY_PREFIX = "crystal-os-offline-queue:";

function readQueue(userId: string): QueuedWrite[] {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + userId);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as QueuedWrite[]) : [];
  } catch {
    return [];
  }
}

function saveQueue(userId: string, queue: QueuedWrite[]) {
  try {
    if (queue.length) localStorage.setItem(KEY_PREFIX + userId, JSON.stringify(queue));
    else localStorage.removeItem(KEY_PREFIX + userId);
  } catch {
    // Storage blocked: the queue still lives for this session.
  }
}

/**
 * One user's queue: kept in memory, mirrored to localStorage on every change
 * so a write made offline survives closing the app.
 */
export function createOfflineQueue() {
  let userId: string | null = null;
  let queue: QueuedWrite[] = [];
  // The first `sending` entries are being flushed; new writes do not fold into them.
  let sending = 0;
  let flushing: Promise<FlushResult | null> | null = null;
  const listeners = new Set<() => void>();

  const set = (next: QueuedWrite[]) => {
    queue = next;
    if (userId) saveQueue(userId, queue);
    listeners.forEach((l) => l());
  };

  return {
    /** Switches to a user's saved queue (null when signed out). */
    use(id: string | null) {
      if (id === userId) return;
      userId = id;
      queue = id ? readQueue(id) : [];
      sending = 0;
      flushing = null;
      listeners.forEach((l) => l());
    },
    get: () => queue,
    size: () => queue.length,
    push(write: QueuedWrite) {
      set(enqueue(queue, write, sending));
    },
    /** Drops queued writes matching `match` that are not being sent. */
    remove(match: (write: QueuedWrite) => boolean) {
      set(queue.filter((w, i) => i < sending || !match(w)));
    },
    /**
     * Replays the queue through `send`. Concurrent calls share one run; returns
     * null when there was nothing to send.
     */
    flush(send: (write: QueuedWrite) => Promise<WriteResult>): Promise<FlushResult | null> {
      if (flushing) return flushing;
      if (!queue.length) return Promise.resolve(null);
      const owner = userId;
      const batch = queue;
      sending = batch.length;
      flushing = flushWrites(batch, send).then((result) => {
        if (owner !== userId) return result;
        // Writes queued while this ran come after whatever is still waiting.
        const added = queue.slice(sending);
        sending = 0;
        flushing = null;
        set([...result.remaining, ...added]);
        return result;
      });
      return flushing;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const offlineQueue = createOfflineQueue();
