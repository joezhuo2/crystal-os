import { describe, expect, it, vi } from "vitest";
import { seedDefaultCategories, type CategoryClient } from "./seedCategories";

const DEFAULTS = [
  { name: "Work", color: "hsl(239 84% 67%)" },
  { name: "Personal", color: "hsl(160 84% 39%)" },
] as const;

/**
 * Stubs the `client.from(table).insert(rows).select()` chain the real Supabase
 * client exposes, so these run without network access.
 */
function clientReturning(result: {
  data: Array<{ id: string; name: string; color: string }> | null;
  error: { message: string } | null;
}) {
  const select = vi.fn().mockResolvedValue(result);
  const insert = vi.fn().mockReturnValue({ select });
  const from = vi.fn().mockReturnValue({ insert });
  return { client: { from } as unknown as CategoryClient, from, insert, select };
}

describe("seedDefaultCategories", () => {
  it("inserts the defaults and returns the rows the database assigned", async () => {
    const inserted = [
      { id: "11111111-1111-1111-1111-111111111111", name: "Work", color: "hsl(239 84% 67%)" },
      { id: "22222222-2222-2222-2222-222222222222", name: "Personal", color: "hsl(160 84% 39%)" },
    ];
    const { client, from, insert } = clientReturning({ data: inserted, error: null });

    const result = await seedDefaultCategories(client, "task_categories", DEFAULTS);

    expect(from).toHaveBeenCalledWith("task_categories");
    expect(insert).toHaveBeenCalledWith([
      { name: "Work", color: "hsl(239 84% 67%)" },
      { name: "Personal", color: "hsl(160 84% 39%)" },
    ]);
    expect(result).toEqual(inserted);
  });

  it("never sends the placeholder ids — the database assigns them", async () => {
    const { client, insert } = clientReturning({ data: [], error: null });

    await seedDefaultCategories(client, "task_categories", DEFAULTS);

    const [rows] = insert.mock.calls[0];
    for (const row of rows) {
      expect(row).not.toHaveProperty("id");
    }
  });

  it("does not send user_id — the column default supplies it", async () => {
    const { client, insert } = clientReturning({ data: [], error: null });

    await seedDefaultCategories(client, "financial_categories", DEFAULTS);

    const [rows] = insert.mock.calls[0];
    for (const row of rows) {
      expect(row).not.toHaveProperty("user_id");
    }
  });

  it("returns null when the insert fails rather than throwing", async () => {
    const { client } = clientReturning({
      data: null,
      error: { message: "duplicate key value violates unique constraint" },
    });

    expect(await seedDefaultCategories(client, "task_categories", DEFAULTS)).toBeNull();
  });

  it("returns null when the insert reports no rows", async () => {
    const { client } = clientReturning({ data: null, error: null });

    expect(await seedDefaultCategories(client, "task_categories", DEFAULTS)).toBeNull();
  });
});
