import { CalendarError as DataError } from "../calendar/errors";
import { type Db, type Row, TABLES } from "./query";

const PAGE = 1000;
const TIMESTAMPS = ["created_at", "completed_at", "started_at", "ended_at", "archived_at"];

export type Credentials = { refreshToken: string } | { email: string; password: string };

export interface ImportOptions {
  url: string;
  anonKey: string;
  credentials: Credentials;
  fetch?: typeof fetch;
}

function clean(row: Row): Row {
  const { user_id: _owner, ...rest } = row;
  for (const key of TIMESTAMPS) {
    const value = rest[key];
    if (typeof value !== "string") continue;
    const time = new Date(value);
    if (!Number.isNaN(time.getTime())) rest[key] = time.toISOString();
  }
  return rest;
}

export async function importFromSupabase({ url, anonKey, credentials, fetch: send = fetch }: ImportOptions): Promise<Db> {
  const base = url.replace(/\/+$/, "");
  const grant = "refreshToken" in credentials ? "refresh_token" : "password";
  const body = "refreshToken" in credentials ? { refresh_token: credentials.refreshToken } : credentials;

  const auth = await send(`${base}/auth/v1/token?grant_type=${grant}`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const session = (await auth.json().catch(() => null)) as Record<string, unknown> | null;
  if (!auth.ok || typeof session?.access_token !== "string") {
    const reason = session?.error_description ?? session?.msg ?? session?.message ?? `status ${auth.status}`;
    throw new DataError(`Supabase sign-in failed: ${String(reason)}`, 401);
  }

  const headers = { apikey: anonKey, Authorization: `Bearer ${session.access_token}` };
  const db: Db = {};
  for (const table of TABLES) {
    const rows: Row[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const res = await send(`${base}/rest/v1/${table}?select=*&order=id&limit=${PAGE}&offset=${offset}`, { headers });
      if (res.status === 404) break;
      if (!res.ok) throw new DataError(`Could not read ${table} from Supabase (status ${res.status})`, 502);
      const page = (await res.json()) as Row[];
      rows.push(...page.map(clean));
      if (page.length < PAGE) break;
    }
    db[table] = rows;
  }
  return db;
}
