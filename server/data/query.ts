import { CalendarError as DataError } from "../calendar/errors";

export const TABLES = [
  "tasks",
  "transactions",
  "task_categories",
  "financial_categories",
  "task_completions",
  "focus_sessions",
  "habits",
  "habit_checks",
  "links",
  "contributions",
  "accounts",
  "recurring_transactions",
  "category_rules",
  "savings_goals",
  "import_skips",
] as const;

export type Table = (typeof TABLES)[number];
export type Row = Record<string, unknown>;
export type Db = Partial<Record<Table, Row[]>>;

type Scalar = string | number | boolean | null;
const FILTER_OPS = ["eq", "gt", "gte", "lt"] as const;

export interface Filter {
  column: string;
  op: (typeof FILTER_OPS)[number];
  value: Scalar;
}

export interface Query {
  table: Table;
  op: "select" | "insert" | "update" | "upsert" | "delete";
  rows?: Row[];
  patch?: Row;
  filters?: Filter[];
  order?: { column: string; ascending: boolean };
  limit?: number;
  columns?: string[];
  returning?: boolean;
  onConflict?: string[];
  ignoreDuplicates?: boolean;
}

export const DUPLICATE = "23505";

const MAX_ROWS = 5000;
const UNIQUE: Partial<Record<Table, string[]>> = {
  habit_checks: ["habit_id", "day"],
  links: ["kind", "item_id"],
  import_skips: ["source_id"],
};
const DEFAULTS: Partial<Record<Table, Row>> = { habits: { position: 0, archived_at: null } };

const REFS: Array<{ parent: Table; table: Table; column: string; onDelete: "null" | "cascade" }> = [
  { parent: "tasks", table: "tasks", column: "parent_id", onDelete: "null" },
  { parent: "tasks", table: "task_completions", column: "task_id", onDelete: "null" },
  { parent: "tasks", table: "focus_sessions", column: "task_id", onDelete: "null" },
  { parent: "task_categories", table: "tasks", column: "category_id", onDelete: "null" },
  { parent: "task_categories", table: "task_completions", column: "category_id", onDelete: "null" },
  { parent: "financial_categories", table: "transactions", column: "category_id", onDelete: "null" },
  { parent: "habits", table: "habit_checks", column: "habit_id", onDelete: "cascade" },
  { parent: "transactions", table: "links", column: "item_id", onDelete: "cascade" },
  { parent: "financial_categories", table: "recurring_transactions", column: "category_id", onDelete: "null" },
  { parent: "financial_categories", table: "category_rules", column: "category_id", onDelete: "cascade" },
  { parent: "accounts", table: "transactions", column: "account_id", onDelete: "null" },
  { parent: "accounts", table: "transactions", column: "to_account_id", onDelete: "null" },
  { parent: "accounts", table: "recurring_transactions", column: "account_id", onDelete: "null" },
  { parent: "accounts", table: "savings_goals", column: "account_id", onDelete: "null" },
];

export class DuplicateError extends DataError {
  code = DUPLICATE;
  constructor() {
    super("A row with this key already exists", 409);
  }
}

const isObject = (v: unknown): v is Row => !!v && typeof v === "object" && !Array.isArray(v);
const isName = (v: unknown): v is string => typeof v === "string" && /^[a-z_]{1,40}$/.test(v);
const isScalar = (v: unknown): v is Scalar => v === null || ["string", "number", "boolean"].includes(typeof v);

export function parseQuery(raw: unknown): Query {
  const bad = (what: string) => new DataError(`Invalid query: ${what}`);
  if (!isObject(raw)) throw bad("body must be an object");
  const { table, op, rows, patch, filters, order, limit, columns, onConflict } = raw;
  if (!TABLES.includes(table as Table)) throw bad("unknown table");
  if (!["select", "insert", "update", "upsert", "delete"].includes(op as string)) throw bad("unknown op");
  if (rows !== undefined && !(Array.isArray(rows) && rows.length <= MAX_ROWS && rows.every(isObject))) throw bad("rows");
  if (patch !== undefined && !isObject(patch)) throw bad("patch");
  if (
    filters !== undefined &&
    !(
      Array.isArray(filters) &&
      filters.every((f) => isObject(f) && isName(f.column) && FILTER_OPS.includes(f.op as Filter["op"]) && isScalar(f.value))
    )
  ) {
    throw bad("filters");
  }
  if (order !== undefined && !(isObject(order) && isName(order.column) && typeof order.ascending === "boolean")) throw bad("order");
  if (limit !== undefined && !(Number.isInteger(limit) && (limit as number) >= 0)) throw bad("limit");
  if (columns !== undefined && !(Array.isArray(columns) && columns.every(isName))) throw bad("columns");
  if (onConflict !== undefined && !(Array.isArray(onConflict) && onConflict.length > 0 && onConflict.every(isName))) throw bad("onConflict");
  if ((op === "insert" || op === "upsert") && !rows) throw bad("rows are required");
  if (op === "update" && !patch) throw bad("patch is required");
  if ((op === "update" || op === "delete") && !(filters as Filter[] | undefined)?.length) throw bad("update and delete need a filter");
  return raw as unknown as Query;
}

export function tablesFor(q: Query): Table[] {
  if (q.op !== "delete") return [q.table];
  return [...new Set([q.table, ...REFS.filter((r) => r.parent === q.table).map((r) => r.table)])];
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;
  return (a as string | number) < (b as string | number) ? -1 : 1;
}

function matches(row: Row, filters: Filter[] = []): boolean {
  return filters.every(({ column, op, value }) => {
    const cell = row[column] ?? null;
    if (op === "eq") return cell === value;
    if (cell === null || value === null) return false;
    const c = compare(cell, value);
    return op === "gt" ? c > 0 : op === "gte" ? c >= 0 : c < 0;
  });
}

function shape(rows: Row[], q: Query): Row[] {
  let out = rows;
  if (q.order) {
    const { column, ascending } = q.order;
    out = [...out].sort((a, b) => (ascending ? compare(a[column], b[column]) : compare(b[column], a[column])));
  }
  if (q.limit !== undefined) out = out.slice(0, q.limit);
  const columns = q.columns;
  return columns ? out.map((r) => Object.fromEntries(columns.map((c) => [c, r[c] ?? null]))) : out;
}

export interface QueryContext {
  now(): string;
  newId(): string;
}

export function runQuery(db: Db, q: Query, ctx: QueryContext): { data: Row[] | null; changed: Table[] } {
  const rows = (db[q.table] ??= []);

  if (q.op === "select") return { data: shape(rows.filter((r) => matches(r, q.filters)), q), changed: [] };

  if (q.op === "insert" || q.op === "upsert") {
    const keys = q.op === "upsert" ? (q.onConflict ?? ["id"]) : null;
    const unique = [["id"], ...(UNIQUE[q.table] ? [UNIQUE[q.table] as string[]] : [])];
    const same = (a: Row, b: Row, cols: string[]) => cols.every((c) => a[c] !== undefined && a[c] === b[c]);
    const written: Row[] = [];
    for (const input of q.rows ?? []) {
      const row: Row = { id: ctx.newId(), created_at: ctx.now(), ...DEFAULTS[q.table], ...input };
      const existing = keys && rows.find((r) => same(r, row, keys));
      if (existing) {
        if (!q.ignoreDuplicates) Object.assign(existing, input, { id: existing.id });
        written.push(existing);
        continue;
      }
      if (unique.some((cols) => rows.some((r) => same(r, row, cols)))) throw new DuplicateError();
      rows.push(row);
      written.push(row);
    }
    return { data: q.returning ? shape(written, q) : null, changed: [q.table] };
  }

  const hit = rows.filter((r) => matches(r, q.filters));

  if (q.op === "update") {
    for (const row of hit) Object.assign(row, q.patch, { id: row.id });
    return { data: q.returning ? shape(hit, q) : null, changed: hit.length ? [q.table] : [] };
  }

  if (!hit.length) return { data: null, changed: [] };
  const changed = new Set<Table>([q.table]);
  const ids = new Set(hit.map((r) => r.id));
  db[q.table] = rows.filter((r) => !ids.has(r.id));
  for (const ref of REFS.filter((r) => r.parent === q.table)) {
    const target = db[ref.table] ?? [];
    if (!target.some((r) => ids.has(r[ref.column]))) continue;
    changed.add(ref.table);
    if (ref.onDelete === "cascade") db[ref.table] = target.filter((r) => !ids.has(r[ref.column]));
    else for (const r of target) if (ids.has(r[ref.column])) r[ref.column] = null;
  }
  return { data: null, changed: [...changed] };
}
