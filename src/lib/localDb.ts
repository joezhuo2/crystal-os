import { ApiError, apiRequest } from "./apiRequest";
import { recordDiagnostic } from "./diagnostics";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
type Scalar = string | number | boolean | null;

export interface DbError {
  message: string;
  code?: string;
}

export interface DbResult<T> {
  data: T | null;
  error: DbError | null;
  status: number;
}

interface Query {
  table: string;
  op: "select" | "insert" | "update" | "upsert" | "delete";
  rows?: Row[];
  patch?: Row;
  filters: Array<{ column: string; op: "eq" | "gt" | "gte" | "lt"; value: Scalar }>;
  order?: { column: string; ascending: boolean };
  limit?: number;
  columns?: string[];
  returning?: boolean;
  onConflict?: string[];
  ignoreDuplicates?: boolean;
}

const DUPLICATE = "23505";

async function send(query: Query): Promise<DbResult<Row[]>> {
  try {
    const { data } = await apiRequest<{ data: Row[] | null }>("/api/data/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(query),
    });
    return { data, error: null, status: 200 };
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 0;
    const message = err instanceof Error ? err.message : String(err);
    if (query.op !== "select" && status !== 409) {
      recordDiagnostic("data", `${query.op} ${query.table} → ${status || "no response"}: ${message}`);
    }
    return { data: null, error: { message, ...(status === 409 ? { code: DUPLICATE } : {}) }, status };
  }
}

class Builder implements PromiseLike<DbResult<Row[]>> {
  constructor(private query: Query) {}

  select(columns = "*") {
    if (this.query.op !== "select") this.query.returning = true;
    if (columns.trim() !== "*") this.query.columns = columns.split(",").map((c) => c.trim());
    return this;
  }

  private filter(op: Query["filters"][number]["op"], column: string, value: Scalar) {
    this.query.filters.push({ column, op, value });
    return this;
  }

  eq(column: string, value: Scalar) {
    return this.filter("eq", column, value);
  }

  gt(column: string, value: Scalar) {
    return this.filter("gt", column, value);
  }

  gte(column: string, value: Scalar) {
    return this.filter("gte", column, value);
  }

  lt(column: string, value: Scalar) {
    return this.filter("lt", column, value);
  }

  order(column: string, { ascending = true }: { ascending?: boolean } = {}) {
    this.query.order = { column, ascending };
    return this;
  }

  limit(count: number) {
    this.query.limit = count;
    return this;
  }

  async single(): Promise<DbResult<Row>> {
    const result = await send(this.query);
    if (result.error) return result;
    const row = result.data?.[0] ?? null;
    return row ? { ...result, data: row } : { data: null, error: { message: "No row was returned" }, status: 406 };
  }

  then<A = DbResult<Row[]>, B = never>(
    resolve?: ((value: DbResult<Row[]>) => A | PromiseLike<A>) | null,
    reject?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return send(this.query).then(resolve, reject);
  }
}

const rowsOf = (rows: Row | Row[]): Row[] => (Array.isArray(rows) ? rows : [rows]);

export const db = {
  from(table: string) {
    const start = (query: Partial<Query> & Pick<Query, "op">) => new Builder({ table, filters: [], ...query });
    return {
      select: (columns?: string) => start({ op: "select" }).select(columns),
      insert: (rows: Row | Row[]) => start({ op: "insert", rows: rowsOf(rows) }),
      update: (patch: Row) => start({ op: "update", patch }),
      upsert: (rows: Row | Row[], opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) =>
        start({
          op: "upsert",
          rows: rowsOf(rows),
          onConflict: opts.onConflict?.split(",").map((c) => c.trim()),
          ignoreDuplicates: opts.ignoreDuplicates,
        }),
      delete: () => start({ op: "delete" }),
    };
  },
};
