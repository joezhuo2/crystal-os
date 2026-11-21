import { afterEach, describe, expect, it, vi } from "vitest";
import { askAi, parseJsonReply, streamAi } from "./ai";

vi.mock("./apiToken", () => ({ apiToken: async () => "tok", forgetApiToken: () => undefined }));

afterEach(() => vi.unstubAllGlobals());

describe("parseJsonReply", () => {
  it("pulls the first JSON object or array out of prose and code fences", () => {
    expect(parseJsonReply('Sure! ```json\n{"a": [1, "}"]}\n``` Done.')).toEqual({ a: [1, "}"] });
    expect(parseJsonReply('Here [sic] is it: [{"i":0}] and {"b":1}')).toEqual([{ i: 0 }]);
    expect(parseJsonReply('{"q": "say \\"hi\\" {"}')).toEqual({ q: 'say "hi" {' });
  });

  it("throws a clear error when there is no JSON", () => {
    expect(() => parseJsonReply("I can't help with that [x]")).toThrow("The AI reply did not contain any JSON");
    expect(() => parseJsonReply('{"open": true')).toThrow(/did not contain any JSON/);
  });
});

describe("askAi", () => {
  it("posts the request to /api/ai/chat and returns the text", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: "hello" })));
    vi.stubGlobal("fetch", fetchMock);
    const input = { provider: "nim" as const, model: "", system: "S", messages: [{ role: "user" as const, content: "hi" }], maxTokens: 50 };

    expect(await askAi(input)).toBe("hello");
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/ai\/chat$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual(input);
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer tok");
  });

  it("surfaces the server's error message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "No Claude API key is set." }), { status: 400 })));
    await expect(askAi({ provider: "claude", messages: [{ role: "user", content: "hi" }] })).rejects.toThrow("No Claude API key is set.");
  });
});

describe("streamAi", () => {
  it("reads NDJSON events split across chunks and throws on an error line", async () => {
    const body = (...chunks: string[]) =>
      new Response(new ReadableStream({ start: (c) => (chunks.forEach((s) => c.enqueue(new TextEncoder().encode(s))), c.close()) }));
    const fetchMock = vi.fn().mockResolvedValue(body('{"type":"thinking","text":"a"}\n{"type":"te', 'xt","text":"b"}\n{"type":"done","truncated":false}\n'));
    vi.stubGlobal("fetch", fetchMock);
    const events: unknown[] = [];
    await streamAi({ provider: "claude", messages: [{ role: "user", content: "hi" }] }, (e) => events.push(e));
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/api\/ai\/chat\/stream$/);
    expect(events).toEqual([{ type: "thinking", text: "a" }, { type: "text", text: "b" }, { type: "done", truncated: false }]);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(body('{"type":"text","text":"x"}\n{"type":"error","error":"Overloaded"}\n')));
    await expect(streamAi({ provider: "claude", messages: [{ role: "user", content: "hi" }] }, () => {})).rejects.toThrow("Overloaded");
  });
});
