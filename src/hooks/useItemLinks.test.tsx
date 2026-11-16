import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "@/lib/apiRequest";
import { useItemLinks, useSetItemLink } from "./useItemLinks";

vi.mock("@/lib/apiRequest", async (original) => ({ ...(await original<typeof import("@/lib/apiRequest")>()), apiRequest: vi.fn() }));
const request = vi.mocked(apiRequest);
const sent = () => JSON.parse(String(request.mock.calls.at(-1)?.[1]?.body));

afterEach(() => vi.clearAllMocks());

function mount() {
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => ({ links: useItemLinks(), setLink: useSetItemLink() }), { wrapper });
}

describe("item links", () => {
  it("loads, links and unlinks", async () => {
    request.mockResolvedValue({ data: [{ kind: "mail", item_id: "m1", title: "Invoice", note_path: "Bills.md", meta: { url: "https://mail.example/m1" } }] });
    const { result } = mount();
    await waitFor(() => expect(result.current.links).toHaveLength(1));
    expect(result.current.links[0]).toEqual({ kind: "mail", itemId: "m1", title: "Invoice", notePath: "Bills.md", meta: { url: "https://mail.example/m1" } });

    request.mockResolvedValue({ data: null });
    await act(() => result.current.setLink({ kind: "transaction", itemId: "x1", title: "Rent" }, "Home.md"));
    expect(sent()).toMatchObject({ table: "links", op: "upsert", onConflict: ["kind", "item_id"], rows: [{ kind: "transaction", item_id: "x1", note_path: "Home.md" }] });
    await waitFor(() => expect(result.current.links.map((l) => l.itemId)).toEqual(["m1", "x1"]));

    await act(() => result.current.setLink({ kind: "mail", itemId: "m1", title: "Invoice" }, undefined));
    expect(sent()).toMatchObject({ op: "delete", filters: [{ column: "kind", op: "eq", value: "mail" }, { column: "item_id", op: "eq", value: "m1" }] });
    await waitFor(() => expect(result.current.links.map((l) => l.itemId)).toEqual(["x1"]));
  });
});
