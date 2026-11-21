import { afterEach, describe, expect, it, vi } from "vitest";
import { chat, chatStream, parseChatInput, type StreamEvent } from "./chat";
import { createAiConfig } from "./config";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const image = { type: "image" as const, mediaType: "image/png" as const, data: "iVBORw0KGgo=" };

afterEach(() => vi.unstubAllGlobals());

describe("chat", () => {
  it("shapes an Anthropic Messages request and joins the text blocks", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ content: [{ type: "text", text: "Hi" }, { type: "text", text: " there" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const ai = createAiConfig({ ANTHROPIC_API_KEY: "sk-ant-master-key" });

    const reply = await chat(ai, {
      provider: "claude",
      system: "Be brief",
      maxTokens: 99_999,
      messages: [{ role: "user", content: [{ type: "text", text: "What is this?" }, image] }],
    });
    expect(reply).toEqual({ text: "Hi there" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.headers).toMatchObject({ "x-api-key": "sk-ant-master-key", "anthropic-version": "2023-06-01" });
    expect(JSON.parse(init.body)).toEqual({
      model: "claude-sonnet-5-5",
      max_tokens: 32000,
      system: "Be brief",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "What is this?" },
            { type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORw0KGgo=" } },
          ],
        },
      ],
    });
  });

  it("shapes an OpenAI-compatible request for NIM with the system prompt first", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ choices: [{ message: { content: "ok" } }] }));
    vi.stubGlobal("fetch", fetchMock);
    const ai = createAiConfig({ NVIDIA_API_KEY: "nvapi-master-key" });

    expect(await chat(ai, { provider: "nim", model: "deepseek-ai/x", apiKey: "nvapi-override", system: "S", messages: [{ role: "user", content: [image] }] })).toEqual({ text: "ok" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
    expect(init.headers.authorization).toBe("Bearer nvapi-override");
    expect(JSON.parse(init.body)).toEqual({
      model: "deepseek-ai/x",
      max_tokens: 2048,
      messages: [
        { role: "system", content: "S" },
        { role: "user", content: [{ type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgo=" } }] },
      ],
    });
  });

  it("calls a keyless local OmniRoute without an authorization header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ choices: [{ message: { content: "x" } }] }));
    vi.stubGlobal("fetch", fetchMock);
    await chat(createAiConfig({}), { provider: "omniroute", messages: [{ role: "user", content: "hi" }] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:20128/v1/chat/completions");
    expect(init.headers.authorization).toBeUndefined();
    expect(JSON.parse(init.body).model).toBe("auto/coding");
  });

  it("refuses an unconfigured provider with a 400 and makes no call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(chat(createAiConfig({}), { provider: "claude", messages: [{ role: "user", content: "hi" }] })).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/Claude API key/),
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces the upstream error message", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: { message: "bad key" } }, 401)));
    await expect(chat(createAiConfig({ ANTHROPIC_API_KEY: "sk-ant-master-key" }), { provider: "claude", messages: [{ role: "user", content: "hi" }] })).rejects.toMatchObject({
      status: 502,
      message: "Claude request failed (401): bad key",
    });
  });
});

const sse = (...chunks: string[]) =>
  new Response(new ReadableStream({ start: (c) => (chunks.forEach((s) => c.enqueue(new TextEncoder().encode(s))), c.close()) }));
const collect = async (run: (emit: (e: StreamEvent) => void) => Promise<void>) => {
  const events: StreamEvent[] = [];
  await run((e) => events.push(e));
  return events;
};

describe("chatStream", () => {
  it("streams Claude thinking and text with adaptive thinking on, and flags a max_tokens stop", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sse(
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"Hmm"}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hi"}}\n\nevent: content_block_delta\ndata: {"type":"content_bl',
        'ock_delta","delta":{"type":"text_delta","text":" there"}}\n\nevent: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"max_tokens"}}\n\n',
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const ai = createAiConfig({ ANTHROPIC_API_KEY: "sk-ant-master-key" });
    const events = await collect((emit) => chatStream(ai, { provider: "claude", messages: [{ role: "user", content: "hi" }] }, emit));
    expect(events).toEqual([
      { type: "thinking", text: "Hmm" },
      { type: "text", text: "Hi" },
      { type: "text", text: " there" },
      { type: "done", truncated: true },
    ]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ stream: true, thinking: { type: "adaptive", display: "summarized" } });
  });

  it("streams OpenAI-compatible reasoning and splits <think> tags out of the text", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sse(
          'data: {"choices":[{"delta":{"reasoning_content":"plan"}}]}\n',
          'data: {"choices":[{"delta":{"content":"<think>more</think>Answer"}}]}\n',
          'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\ndata: [DONE]\n',
        ),
      ),
    );
    const events = await collect((emit) => chatStream(createAiConfig({ NVIDIA_API_KEY: "k" }), { provider: "nim", messages: [{ role: "user", content: "hi" }] }, emit));
    expect(events).toEqual([
      { type: "thinking", text: "plan" },
      { type: "thinking", text: "more" },
      { type: "text", text: "Answer" },
      { type: "done", truncated: false },
    ]);
  });

  it("throws on an error event in the stream", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sse('event: error\ndata: {"type":"error","error":{"message":"Overloaded"}}\n\n')));
    await expect(collect((emit) => chatStream(createAiConfig({ ANTHROPIC_API_KEY: "k" }), { provider: "claude", messages: [{ role: "user", content: "hi" }] }, emit))).rejects.toThrow(
      "Claude stopped: Overloaded",
    );
  });
});

describe("parseChatInput", () => {
  it.each([
    [{ provider: "gpt", messages: [{ role: "user", content: "hi" }] }],
    [{ provider: "claude", messages: [] }],
    [{ provider: "claude", messages: [{ role: "system", content: "hi" }] }],
    [{ provider: "claude", messages: [{ role: "user", content: [{ type: "image", mediaType: "image/gif", data: "AA==" }] }] }],
    [{ provider: "claude", model: "bad model", messages: [{ role: "user", content: "hi" }] }],
  ])("rejects %j", (body) => {
    expect(() => parseChatInput(body)).toThrow();
  });

  it("drops unknown fields such as an apiKey", () => {
    expect(parseChatInput({ provider: "nim", apiKey: "nvapi-sneaky", messages: [{ role: "user", content: "hi" }] })).not.toHaveProperty("apiKey");
  });
});
