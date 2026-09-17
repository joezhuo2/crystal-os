/**
 * Loads a table page by page instead of in one request.
 *
 * The dashboard used to fetch every task and transaction in a single query, so
 * nothing rendered until the whole history had been downloaded and parsed. That
 * query was also silently truncated: PostgREST caps a response at `max_rows`
 * (1000 on Supabase), and rows past the cap were never loaded at all.
 */

/** Rows per request, well under Supabase's default 1000-row response cap. */
export const PAGE_SIZE = 500;

export interface PageError {
  message: string;
}

/**
 * Fetches up to `limit` rows whose id sorts after `afterId`, ordered by id.
 * Keyset rather than offset paging: a row inserted or deleted while later pages
 * are still loading cannot shift the next page and skip or repeat a row.
 */
export type FetchPage<T> = (
  afterId: string | null,
  limit: number,
) => PromiseLike<{ data: T[] | null; error: PageError | null }>;

export interface PagedLoad {
  /** Settles once the first page has been delivered, or loading has stopped. */
  firstPage: Promise<void>;
  /** Settles after the last page, with the error that stopped loading, if any. */
  done: Promise<PageError | null>;
}

export interface PagedLoadOptions {
  pageSize?: number;
  /** Checked before each request and delivery; false stops loading silently. */
  isActive?: () => boolean;
}

/**
 * Requests pages one after another and hands each to `onPage` as it arrives,
 * so the first screenful can render without waiting for the rest.
 */
export function loadInPages<T extends { id: string }>(
  fetchPage: FetchPage<T>,
  onPage: (rows: T[]) => void,
  { pageSize = PAGE_SIZE, isActive = () => true }: PagedLoadOptions = {},
): PagedLoad {
  let settleFirstPage!: () => void;
  const firstPage = new Promise<void>((resolve) => {
    settleFirstPage = resolve;
  });

  const done = (async (): Promise<PageError | null> => {
    let afterId: string | null = null;
    try {
      while (isActive()) {
        const { data, error } = await fetchPage(afterId, pageSize);
        if (!isActive()) return null;
        if (error) return error;

        const rows = data ?? [];
        if (rows.length > 0) onPage(rows);
        settleFirstPage();

        if (rows.length < pageSize) return null;
        afterId = rows[rows.length - 1].id;
      }
      return null;
    } catch (err) {
      return { message: err instanceof Error ? err.message : String(err) };
    } finally {
      settleFirstPage();
    }
  })();

  return { firstPage, done };
}

/**
 * `prev` plus the rows of `page` it does not already hold, sorted. An id that is
 * already present keeps its existing entry: it can carry an edit made while
 * later pages were still arriving, which is newer than the fetched copy.
 * Returns `prev` itself when nothing is new, so React can skip the update.
 */
export function mergePage<T extends { id: string }>(
  prev: T[],
  page: T[],
  compare: (a: T, b: T) => number,
): T[] {
  const seen = new Set(prev.map((row) => row.id));
  const fresh = page.filter((row) => !seen.has(row.id));
  if (fresh.length === 0) return prev;
  return [...prev, ...fresh].sort(compare);
}

/** Ascending with nulls last, matching Postgres's default ORDER BY. */
export function ascNullsLast(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  if (a == null || b == null) return a == null ? (b == null ? 0 : 1) : -1;
  return a.localeCompare(b);
}
