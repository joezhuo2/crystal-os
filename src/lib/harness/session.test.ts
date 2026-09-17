import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExitEvent, HarnessNative, LineEvent } from "./native";
import { HarnessSession } from "./session";
import { harness } from "./store";
import type { NebulaConfig } from "./types";

const config: NebulaConfig = {
  omnirouteBaseUrl: "http://localhost:20128/v1",
  omnirouteModel: "auto/coding",
  nimBaseUrl: "https://integrate.api.nvidia.com/v1",
  nimModels: { kimi: "moonshotai/kimi-k3", deepseek: "deepseek-ai/deepseek-v4-flash-0731", nemotron: "nvidia/nemotron-3-ultra-550b-a55b" },
  claudeModel: "opus",
  projectsRoot: "C:/Projects",
  disabledMcp: [],
};

const SESSION = "c4bad7b8-7a9d-4ae6-8465-48f8cad0633c";

/**
 * A fake dsh: answers ACP requests the way the spike server did, and lets a
 * test script what `session/prompt` does per model.
 */
function fakeNative(onPrompt: (model: string, emit: (msg: unknown) => void, id: number) => void) {
  let lineHandler: (e: LineEvent) => void = () => undefined;
  let exitHandler: (e: ExitEvent) => void = () => undefined;
  let model = "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose JSON-RPC fixtures
  const sent: Record<string, any>[] = [];
  const emit = (msg: unknown) => lineHandler({ procId: 1, line: JSON.stringify(msg) });

  const native = {
    reset: vi.fn(async () => undefined),
    onLine: vi.fn(async (h: (e: LineEvent) => void) => ((lineHandler = h), () => undefined)),
    onExit: vi.fn(async (h: (e: ExitEvent) => void) => ((exitHandler = h), () => undefined)),
    probe: vi.fn(async () => ({ ok: true, status: 200, error: null, missingModels: [], hasKey: true })),
    dshStart: vi.fn(async () => ({ procId: 1, reused: false })),
    acpOpenSession: vi.fn(async (_proc: number, rpcId: number) => {
      queueMicrotask(() => emit({ jsonrpc: "2.0", id: rpcId, result: { sessionId: SESSION, configOptions: [] } }));
      return ["obsidian"];
    }),
    kill: vi.fn(async () => undefined),
    send: vi.fn(async (_proc: number, line: string) => {
      const msg = JSON.parse(line);
      sent.push(msg);
      queueMicrotask(() => {
        if (msg.method === "initialize") emit({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: 1 } });
        if (msg.method === "session/set_config_option") {
          if (msg.params.configId === "model") model = JSON.parse(msg.params.value)[1];
          emit({ jsonrpc: "2.0", id: msg.id, result: { configOptions: [] } });
        }
        if (msg.method === "session/prompt") onPrompt(model, emit, msg.id);
      });
    }),
  } as unknown as HarnessNative;
  return { native, sent, exit: (code = 1) => exitHandler({ procId: 1, kind: "dsh", key: "c:/p", code }) };
}

function setupChat(tier: "low" | "medium" | "high" = "medium", mode: "auto" | "manual" | "plan" = "auto") {
  const project = harness.addProject("p", "C:/p");
  const chat = harness.createChat(project.id);
  harness.setChatOptions(chat.id, { tier, mode });
  return chat;
}

const update = (text: string) => ({ jsonrpc: "2.0", method: "session/update", params: { sessionId: SESSION, update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text } } } });

beforeEach(() => {
  localStorage.clear();
  harness._reset();
  harness.setPersistence({ saveState: async () => undefined, saveChat: async () => undefined, deleteChat: async () => undefined });
  harness.hydrate(null);
  harness.setConfig(config);
});

describe("HarnessSession (dsh)", () => {
  it("runs a turn on the first medium model and records it", async () => {
    const { native, sent } = fakeNative((model, emit, id) => {
      emit(update(`hello from ${model}`));
      emit({ jsonrpc: "2.0", method: "session/update", params: { sessionId: SESSION, update: { sessionUpdate: "usage_update", used: 1200, size: 200000 } } });
      emit({ jsonrpc: "2.0", id, result: { stopReason: "end_turn" } });
    });
    const session = new HarnessSession(native);
    await session.start();
    const chat = setupChat();
    await session.send(chat.id, "hi");

    const rt = harness.getState().runtime[chat.id];
    const assistant = rt.messages.find((m) => m.role === "assistant")!;
    expect(assistant.model).toBe("moonshotai/kimi-k3");
    expect(assistant.blocks).toEqual([{ kind: "text", text: "hello from moonshotai/kimi-k3" }]);
    expect(rt.running).toBe(false);
    expect(rt.tokens["moonshotai/kimi-k3"]).toMatchObject({ input: 1200, estimated: true });
    expect(harness.getState().chats[0]).toMatchObject({ dshSessionId: SESSION, lastEngine: "dsh" });
    expect(sent.find((m) => m.method === "session/set_config_option" && m.params.configId === "reasoning_effort")?.params.value).toBe("high");
  });

  it("falls through to the next model when a route fails before any output", async () => {
    const { native } = fakeNative((model, emit, id) => {
      if (model === "moonshotai/kimi-k3") emit({ jsonrpc: "2.0", id, error: { code: -32603, message: "429 Too Many Requests" } });
      else {
        emit(update("ok"));
        emit({ jsonrpc: "2.0", id, result: { stopReason: "end_turn" } });
      }
    });
    const session = new HarnessSession(native);
    await session.start();
    const chat = setupChat();
    await session.send(chat.id, "hi");
    const assistants = harness.getState().runtime[chat.id].messages.filter((m) => m.role === "assistant");
    expect(assistants.map((m) => m.model)).toEqual(["moonshotai/kimi-k3", "deepseek-ai/deepseek-v4-flash-0731"]);
    expect(assistants[0].blocks[0]).toMatchObject({ kind: "notice", tone: "warning" });
  });

  it("does not retry after output was produced", async () => {
    const { native } = fakeNative((_model, emit, id) => {
      emit(update("partial"));
      emit({ jsonrpc: "2.0", id, error: { code: -32603, message: "503 upstream" } });
    });
    const session = new HarnessSession(native);
    await session.start();
    const chat = setupChat();
    await session.send(chat.id, "hi");
    const messages = harness.getState().runtime[chat.id].messages;
    expect(messages.filter((m) => m.role === "assistant")).toHaveLength(1);
    expect(messages[messages.length - 1].blocks[0]).toMatchObject({ kind: "notice", tone: "error" });
  });

  it("shows a card in manual mode and cancels it when dsh exits", async () => {
    const fake: ReturnType<typeof fakeNative> = fakeNative((_model, emit) => {
      emit({ jsonrpc: "2.0", id: 900, method: "session/request_permission", params: { sessionId: SESSION, toolCall: { toolCallId: "t1", title: "Edit a.ts", kind: "edit" }, options: [{ optionId: "allow", kind: "allow_once" }, { optionId: "reject", kind: "reject_once" }] } });
      setTimeout(() => fake.exit(1), 0);
    });
    const session = new HarnessSession(fake.native);
    await session.start();
    const chat = setupChat("medium", "manual");
    await session.send(chat.id, "edit it");

    const blocks = harness.getState().runtime[chat.id].messages.flatMap((m) => m.blocks);
    const card = blocks.find((b) => b.kind === "permission");
    expect(card).toMatchObject({ status: "cancelled", title: "Edit a.ts" });
    expect(blocks.some((b) => b.kind === "notice" && b.text.includes("pending action was cancelled"))).toBe(true);
    // A late click does nothing.
    session.answerPermission(chat.id, (card as { id: string }).id, true);
    expect(fake.sent.some((m) => m.id === 900)).toBe(false);
  });

  it("auto-rejects edits in plan mode and prefixes the prompt", async () => {
    const { native, sent } = fakeNative((_model, emit, id) => {
      emit({ jsonrpc: "2.0", id: 901, method: "session/request_permission", params: { sessionId: SESSION, toolCall: { kind: "edit" }, options: [{ optionId: "allow", kind: "allow_once" }, { optionId: "reject", kind: "reject_once" }] } });
      setTimeout(() => emit({ jsonrpc: "2.0", id, result: { stopReason: "end_turn" } }), 0);
    });
    const session = new HarnessSession(native);
    await session.start();
    const chat = setupChat("low", "plan");
    await session.send(chat.id, "refactor");
    expect(sent.find((m) => m.id === 901)?.result).toEqual({ outcome: { outcome: "selected", optionId: "reject" } });
    expect(sent.find((m) => m.method === "session/prompt")?.params.prompt[0].text).toMatch(/^\[Plan mode\]/);
  });

  it("retries without MCP servers when opening the session fails", async () => {
    const { native } = fakeNative((_model, emit, id) => emit({ jsonrpc: "2.0", id, result: { stopReason: "end_turn" } }));
    let calls = 0;
    (native.acpOpenSession as ReturnType<typeof vi.fn>).mockImplementation(async (_p: number, rpcId: number, _cwd: string, _s: string | null, withMcp: boolean) => {
      calls++;
      const { native: _unused } = { native };
      void _unused;
      if (withMcp) {
        const lineHandler = (native.onLine as ReturnType<typeof vi.fn>).mock.calls[0][0] as (e: LineEvent) => void;
        queueMicrotask(() => lineHandler({ procId: 1, line: JSON.stringify({ jsonrpc: "2.0", id: rpcId, error: { code: -32603, message: "MCP server obsidian failed to start" } }) }));
        return ["obsidian"];
      }
      const lineHandler = (native.onLine as ReturnType<typeof vi.fn>).mock.calls[0][0] as (e: LineEvent) => void;
      queueMicrotask(() => lineHandler({ procId: 1, line: JSON.stringify({ jsonrpc: "2.0", id: rpcId, result: { sessionId: SESSION } }) }));
      return [];
    });
    const session = new HarnessSession(native);
    await session.start();
    const chat = setupChat("low");
    await session.send(chat.id, "hi");
    expect(calls).toBe(2);
    expect(harness.getState().runtime[chat.id].banner).toMatch(/MCP servers were not attached/);
  });
});

describe("HarnessSession (stop)", () => {
  const promptSent = (sent: Record<string, unknown>[]) => vi.waitFor(() => expect(sent.some((m) => m.method === "session/prompt")).toBe(true));
  const lastBlock = (chatId: string) => harness.getState().runtime[chatId].messages.at(-1)!.blocks.at(-1);

  it("cancels a running dsh turn and reports Stopped", async () => {
    let finish = () => undefined as void;
    const { native, sent } = fakeNative((_model, emit, id) => {
      emit(update("partial"));
      finish = () => emit({ jsonrpc: "2.0", id, result: { stopReason: "cancelled" } });
    });
    const session = new HarnessSession(native);
    await session.start();
    const chat = setupChat();
    const turn = session.send(chat.id, "hi");
    await promptSent(sent);

    await session.stop(chat.id);
    expect(harness.getState().runtime[chat.id].stopping).toBe(true);
    expect(sent.find((m) => m.method === "session/cancel")?.params).toEqual({ sessionId: SESSION });
    finish();
    await turn;

    const rt = harness.getState().runtime[chat.id];
    expect(rt).toMatchObject({ running: false, stopping: false });
    expect(lastBlock(chat.id)).toEqual({ kind: "notice", tone: "info", text: "Stopped." });
    expect(rt.messages.flatMap((m) => m.blocks).filter((b) => b.kind === "notice")).toHaveLength(1);
  });

  it("does not fall through to the next model when the stopped turn errors", async () => {
    let fail = () => undefined as void;
    const { native, sent } = fakeNative((_model, emit, id) => {
      fail = () => emit({ jsonrpc: "2.0", id, error: { code: -32603, message: "429 Too Many Requests" } });
    });
    const session = new HarnessSession(native);
    await session.start();
    const chat = setupChat();
    const turn = session.send(chat.id, "hi");
    await promptSent(sent);
    await session.stop(chat.id);
    fail();
    await turn;
    const messages = harness.getState().runtime[chat.id].messages;
    expect(messages.filter((m) => m.role === "assistant")).toHaveLength(1);
    expect(sent.filter((m) => m.method === "session/prompt")).toHaveLength(1);
    expect(lastBlock(chat.id)).toMatchObject({ kind: "notice", tone: "info", text: "Stopped." });
  });

  it("kills an engine that ignores the cancel when Stop is pressed again", async () => {
    const fake: ReturnType<typeof fakeNative> = fakeNative((_model, emit) => {
      emit({ jsonrpc: "2.0", method: "session/update", params: { sessionId: SESSION, update: { sessionUpdate: "tool_call", toolCallId: "t1", title: "npm test", status: "in_progress" } } });
    });
    (fake.native.kill as ReturnType<typeof vi.fn>).mockImplementation(async () => fake.exit(1));
    const session = new HarnessSession(fake.native);
    await session.start();
    const chat = setupChat();
    const turn = session.send(chat.id, "hi");
    await promptSent(fake.sent);
    await session.stop(chat.id);
    await session.stop(chat.id);
    await turn;

    expect(fake.native.kill).toHaveBeenCalledWith(1);
    const blocks = harness.getState().runtime[chat.id].messages.flatMap((m) => m.blocks);
    expect(blocks.find((b) => b.kind === "tool")).toMatchObject({ status: "failed" });
    expect(blocks.some((b) => b.kind === "notice" && b.tone === "error")).toBe(false);
    expect(harness.getState().runtime[chat.id].running).toBe(false);
  });

  it("releases the chat at once while the engine is still starting", async () => {
    let started = (_value: { procId: number; reused: boolean }) => undefined as void;
    const { native, sent } = fakeNative(() => undefined);
    (native.dshStart as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise((resolve) => (started = resolve)));
    const session = new HarnessSession(native);
    await session.start();
    const chat = setupChat();
    const turn = session.send(chat.id, "hi");
    await vi.waitFor(() => expect(native.dshStart).toHaveBeenCalled());
    await session.stop(chat.id);
    await turn;
    expect(harness.getState().runtime[chat.id].running).toBe(false);
    expect(lastBlock(chat.id)).toMatchObject({ text: "Stopped." });

    started({ procId: 1, reused: false });
    await new Promise((r) => setTimeout(r, 20));
    expect(sent.some((m) => m.method === "session/prompt")).toBe(false);
    expect(native.kill).not.toHaveBeenCalled();
  });

  it("answers a pending permission card as cancelled", async () => {
    let finish = () => undefined as void;
    const { native, sent } = fakeNative((_model, emit, id) => {
      emit({ jsonrpc: "2.0", id: 900, method: "session/request_permission", params: { sessionId: SESSION, toolCall: { toolCallId: "t1", title: "Edit a.ts", kind: "edit" }, options: [{ optionId: "allow", kind: "allow_once" }, { optionId: "reject", kind: "reject_once" }] } });
      finish = () => emit({ jsonrpc: "2.0", id, result: { stopReason: "cancelled" } });
    });
    const session = new HarnessSession(native);
    await session.start();
    const chat = setupChat("medium", "manual");
    const turn = session.send(chat.id, "edit it");
    await vi.waitFor(() => expect(harness.getState().runtime[chat.id].messages.flatMap((m) => m.blocks).some((b) => b.kind === "permission")).toBe(true));
    await session.stop(chat.id);
    finish();
    await turn;
    expect(sent.find((m) => m.id === 900)?.result).toEqual({ outcome: { outcome: "cancelled" } });
    const blocks = harness.getState().runtime[chat.id].messages.flatMap((m) => m.blocks);
    expect(blocks.find((b) => b.kind === "permission")).toMatchObject({ status: "cancelled" });
    expect(blocks.some((b) => b.kind === "notice" && b.text.includes("Engine restarted"))).toBe(false);
  });
});
