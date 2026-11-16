import { afterEach, describe, expect, it, vi } from "vitest";
import { askAi, parseJsonReply } from "./ai";

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
