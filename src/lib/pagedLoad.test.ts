import { describe, expect, it, vi } from "vitest";
import { ascNullsLast, loadInPages, mergePage, type FetchPage } from "./pagedLoad";

interface Row {
  id: string;
  n: number;
}

const rows = (count: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({ id: `id-${String(i).padStart(4, "0")}`, n: i }));

/** An in-memory table that answers keyset page requests. */
function table(data: Row[]) {
  const requests: Array<string | null> = [];
  const fetchPage: FetchPage<Row> = async (afterId, limit) => {
    requests.push(afterId);
    const page = data.filter((r) => afterId === null || r.id > afterId).slice(0, limit);
    return { data: page, error: null };
  };
  return { fetchPage, requests };
}

describe("loadInPages", () => {
  it("delivers every row across pages, past the old single-request cap", async () => {
    const { fetchPage, requests } = table(rows(1203));
    const received: Row[] = [];

    const load = loadInPages(fetchPage, (page) => received.push(...page), { pageSize: 500 });

    expect(await load.done).toBeNull();
    expect(received.map((r) => r.n)).toEqual(rows(1203).map((r) => r.n));
    expect(requests).toEqual([null, "id-0499", "id-0999"]);
  });

  it("settles firstPage before the remaining pages arrive", async () => {
    const { fetchPage } = table(rows(10));
    const order: string[] = [];

    const load = loadInPages(fetchPage, (page) => order.push(`page:${page.length}`), {
      pageSize: 4,
    });
    void load.firstPage.then(() => order.push("first"));

    await load.done;
    expect(order.indexOf("first")).toBeLessThan(order.indexOf("page:2"));
    expect(order.filter((e) => e.startsWith("page:"))).toEqual(["page:4", "page:4", "page:2"]);
  });

  it("settles on an empty table without calling onPage", async () => {
    const onPage = vi.fn();
    const load = loadInPages(table([]).fetchPage, onPage);

    await load.firstPage;
    expect(await load.done).toBeNull();
    expect(onPage).not.toHaveBeenCalled();
  });

  it("stops and reports the error that interrupted loading", async () => {
    const all = rows(6);
    const fetchPage: FetchPage<Row> = async (afterId, limit) =>
      afterId === null
        ? { data: all.slice(0, limit), error: null }
        : { data: null, error: { message: "permission denied" } };
    const onPage = vi.fn();

    const load = loadInPages(fetchPage, onPage, { pageSize: 3 });

    expect(await load.done).toEqual({ message: "permission denied" });
    expect(onPage).toHaveBeenCalledTimes(1);
  });

  it("turns a thrown request into an error result", async () => {
    const fetchPage: FetchPage<Row> = async () => {
      throw new Error("network down");
    };

    const load = loadInPages(fetchPage, vi.fn());

    await load.firstPage;
    expect(await load.done).toEqual({ message: "network down" });
  });

  it("stops without delivering once no longer active", async () => {
    const { fetchPage, requests } = table(rows(10));
    let active = true;
    const onPage = vi.fn(() => {
      active = false;
    });

    const load = loadInPages(fetchPage, onPage, { pageSize: 4, isActive: () => active });

    expect(await load.done).toBeNull();
    expect(onPage).toHaveBeenCalledTimes(1);
    expect(requests).toHaveLength(1);
  });
});

describe("mergePage", () => {
  const byN = (a: Row, b: Row) => a.n - b.n;

  it("appends new rows and keeps the result sorted", () => {
    const merged = mergePage([{ id: "b", n: 2 }], [{ id: "a", n: 1 }, { id: "c", n: 3 }], byN);
    expect(merged.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps the existing entry when a page repeats an id", () => {
    const edited = { id: "a", n: 10 };
    const merged = mergePage([edited], [{ id: "a", n: 1 }, { id: "b", n: 2 }], byN);
    expect(merged).toEqual([{ id: "b", n: 2 }, edited]);
  });

  it("returns the same array when nothing is new", () => {
    const prev = [{ id: "a", n: 1 }];
    expect(mergePage(prev, [{ id: "a", n: 1 }], byN)).toBe(prev);
  });
});

describe("ascNullsLast", () => {
  it("sorts ascending with nulls at the end", () => {
    const values = ["2026-09-17", null, "2026-01-02", "2026-05-01"];
    expect([...values].sort(ascNullsLast)).toEqual([
      "2026-01-02",
      "2026-05-01",
      "2026-09-17",
      null,
    ]);
  });
});
