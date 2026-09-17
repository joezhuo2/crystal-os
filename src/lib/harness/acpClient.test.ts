import { describe, expect, it, vi } from "vitest";
import { AcpClient, AcpError } from "./acpClient";

function setup() {
  const sent: Record<string, unknown>[] = [];
  const client = new AcpClient({ send: async (line) => void sent.push(JSON.parse(line)), timeoutMs: 1000 });
  return { client, sent };
}

describe("AcpClient", () => {
  it("correlates responses by id", async () => {
    const { client, sent } = setup();
    const a = client.request<{ n: number }>("initialize", {});
    const b = client.request<{ n: number }>("session/list", {});
    await Promise.resolve();
    client.handleLine(JSON.stringify({ jsonrpc: "2.0", id: sent[1].id, result: { n: 2 } }));
    client.handleLine(JSON.stringify({ jsonrpc: "2.0", id: sent[0].id, result: { n: 1 } }));
    expect(await a).toEqual({ n: 1 });
    expect(await b).toEqual({ n: 2 });
  });

  it("rejects with the JSON-RPC error message and data", async () => {
    const { client, sent } = setup();
    const p = client.request("session/prompt", {}, null);
    await Promise.resolve();
    client.handleLine(JSON.stringify({ jsonrpc: "2.0", id: sent[0].id, error: { code: -32603, message: "Internal error", data: "429 rate limited" } }));
    await expect(p).rejects.toThrow("Internal error 429 rate limited");
  });

  it("waits for responses to requests written by Rust", async () => {
    const { client } = setup();
    const id = client.allocateId();
    const p = client.expect<{ sessionId: string }>(id);
    client.handleLine(JSON.stringify({ jsonrpc: "2.0", id, result: { sessionId: "s1" } }));
    expect((await p).sessionId).toBe("s1");
  });

  it("times out", async () => {
    vi.useFakeTimers();
    const { client } = setup();
    const p = client.expect(client.allocateId(), 20_000);
    vi.advanceTimersByTime(20_001);
    await expect(p).rejects.toBeInstanceOf(AcpError);
    vi.useRealTimers();
  });

  it("never times out a request sent with a null timeout (session/prompt)", async () => {
    vi.useFakeTimers();
    const { client, sent } = setup();
    let settled = false;
    const p = client.request("session/prompt", {}, null).then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(settled).toBe(false);
    client.handleLine(JSON.stringify({ jsonrpc: "2.0", id: sent[0].id, result: { stopReason: "end_turn" } }));
    await p;
    expect(settled).toBe(true);
    vi.useRealTimers();
  });

  it("routes interleaved updates for two sessions to their own handlers", () => {
    const { client } = setup();
    const a: string[] = [];
    const b: string[] = [];
    const handler = (out: string[]) => ({ onUpdate: (u: Record<string, unknown>) => out.push(String((u.content as { text: string }).text)), onPermission: () => undefined });
    client.bindSession("A", handler(a));
    client.bindSession("B", handler(b));
    const update = (sessionId: string, text: string) =>
      JSON.stringify({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } } } });
    client.handleLine(update("A", "a1"));
    client.handleLine(update("B", "b1"));
    client.handleLine(update("A", "a2"));
    client.handleLine(update("C", "lost"));
    expect(a).toEqual(["a1", "a2"]);
    expect(b).toEqual(["b1"]);
  });

  it("answers permission requests once, and cancels for unknown sessions", async () => {
    const { client, sent } = setup();
    let respond: ((o: { outcome: "selected"; optionId: string }) => void) | undefined;
    client.bindSession("A", { onUpdate: () => undefined, onPermission: (_p, r) => (respond = r) });
    client.handleLine(JSON.stringify({ jsonrpc: "2.0", id: 99, method: "session/request_permission", params: { sessionId: "A", options: [] } }));
    respond!({ outcome: "selected", optionId: "allow" });
    respond!({ outcome: "selected", optionId: "again" });
    client.handleLine(JSON.stringify({ jsonrpc: "2.0", id: 100, method: "session/request_permission", params: { sessionId: "zzz" } }));
    await Promise.resolve();
    expect(sent).toEqual([
      { jsonrpc: "2.0", id: 99, result: { outcome: { outcome: "selected", optionId: "allow" } } },
      { jsonrpc: "2.0", id: 100, result: { outcome: { outcome: "cancelled" } } },
    ]);
  });

  it("refuses client methods it does not implement", async () => {
    const { client, sent } = setup();
    client.handleLine(JSON.stringify({ jsonrpc: "2.0", id: 5, method: "fs/read_text_file", params: {} }));
    await Promise.resolve();
    expect(sent[0]).toMatchObject({ id: 5, error: { code: -32601 } });
  });

  it("fails pending requests when the process exits", async () => {
    const { client } = setup();
    const p = client.request("session/prompt", {}, null);
    client.close("DeepSeek Harness stopped");
    await expect(p).rejects.toThrow("DeepSeek Harness stopped");
    await expect(client.request("x", {})).rejects.toThrow();
  });
});
