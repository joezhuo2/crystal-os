import { afterEach, describe, expect, it, vi } from "vitest";
import { createMailAi } from "./ai";

const items = [
  { id: "a", from: "X", subject: "invoice", snippet: "" },
  { id: "b", from: "Y", subject: "hello", snippet: "" },
];

function reply(text: string, status = 200) {
  return new Response(JSON.stringify({ content: [{ type: "text", text }] }), { status });
}

afterEach(() => vi.unstubAllGlobals());

describe("mail ai", () => {
  it("does nothing without a key", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const ai = createMailAi(undefined);
    expect(ai.configured).toBe(false);
    expect((await ai.classify(items)).size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("parses verdicts and caches them by id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      reply('Sure: [{"i":0,"category":"bill","amount":"$5","dueDate":"2026-12-01"},{"i":1,"category":"none"},{"i":7,"category":"bill"}]'),
    );
    vi.stubGlobal("fetch", fetchMock);
    const ai = createMailAi("key", "m");

    const verdicts = await ai.classify(items);
    expect(verdicts.get("a")).toEqual({ category: "bill", amount: "$5", dueDate: "2026-12-01" });
    expect(verdicts.get("b")).toEqual({ category: null });
    const init = fetchMock.mock.calls[0][1];
    expect(init.headers["x-api-key"]).toBe("key");
    expect(JSON.parse(init.body).model).toBe("m");

    await ai.classify(items);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["network error", () => Promise.reject(new Error("offline"))],
    ["non-200", () => Promise.resolve(reply("[]", 500))],
    ["bad JSON", () => Promise.resolve(reply("[{oops"))],
  ])("returns no verdicts on %s", async (_, impl) => {
    vi.stubGlobal("fetch", vi.fn(impl));
    expect((await createMailAi("key").classify(items)).size).toBe(0);
  });

  it("caps unsure items and batches by 20", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply("[]"));
    vi.stubGlobal("fetch", fetchMock);
    const many = Array.from({ length: 90 }, (_, i) => ({ id: String(i), from: "", subject: "", snippet: "" }));
    await createMailAi("key").classify(many);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
