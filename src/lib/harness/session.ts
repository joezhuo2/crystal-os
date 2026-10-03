/**
 * Drives the engines behind Nebula chats (ADR 0003).
 *
 * - Low/Medium: one dsh process per project folder, one ACP session per chat.
 *   Each turn picks the first usable model for the tier and falls through to
 *   the next when the route fails before producing output.
 * - High: one claude process per chat, stream-json over stdin/stdout.
 *
 * Permission requests become cards in manual mode; plan and auto are answered
 * automatically for dsh. Process exits cancel pending cards and fail the turn;
 * the next message reopens the session.
 *
 * Stop cancels the turn through the engine (ACP `session/cancel`, claude
 * `interrupt`). An engine that has not settled after STOP_GRACE_MS is killed,
 * and STOP_FORCE_MS after that the chat is released even if no exit arrived.
 * Pressing Stop a second time skips straight to the kill.
 */
import { AcpClient, AcpError, type PermissionOutcome } from "./acpClient";
import {
  initializeRequest,
  interruptRequest,
  parseClaudeLine,
  permissionResponse,
  setPermissionModeRequest,
  toolTitle,
  userMessage,
} from "./claudeStream";
import { buildHandoff } from "./handoff";
import { decideDshPermission, PLAN_MODE_PREFIX, userChoice, type AcpPermissionOption } from "./modes";
import { isRouteFailure, modelOptionValue, Router, type Candidate } from "./modelRouter";
import type { ExitEvent, HarnessNative, LineEvent } from "./native";
import { harness, newId } from "./store";
import { claudeUsageDelta, contextWindowFor, estimateDshTurn, type ClaudeModelUsage } from "./tokenLedger";
import type { Block, ChatMessage, ChatMeta, Effort, Engine, Mode, ToolStatus } from "./types";
import { engineFor } from "./types";

export const OPEN_SESSION_TIMEOUT_MS = 20_000;
export const STOP_GRACE_MS = 3_000;
export const STOP_FORCE_MS = 2_000;

class StoppedError extends Error {
  constructor() {
    super("Stopped.");
    this.name = "StoppedError";
  }
}

/** One running turn. `engaged` is set once the prompt reached an engine. */
interface TurnControl {
  requested: boolean;
  engaged: boolean;
  /** Rejects when the turn is released without waiting for the engine. */
  released: Promise<never>;
  release: () => void;
  timers: ReturnType<typeof setTimeout>[];
}

interface DshProc {
  procId: number;
  workspace: string;
  client: AcpClient;
  ready: Promise<void>;
}

interface PendingCard {
  engine: Engine;
  respond: (allow: boolean) => void;
  /** Answers the engine that the turn was stopped. */
  cancel: () => void;
}

interface ClaudeProc {
  procId: number;
  chatId: string;
  model: string;
  effort: Effort;
  mode: Mode;
  sessionId: string;
  usage: Record<string, ClaudeModelUsage>;
  turn: { messageId: string; resolve: (result: { isError: boolean; text: string }) => void; reject: (err: Error) => void } | null;
}

const toolStatus = (s: unknown): ToolStatus => (s === "pending" || s === "in_progress" || s === "completed" || s === "failed" ? s : "in_progress");

function stringify(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** Text from ACP tool call `content` entries. */
function acpToolOutput(content: unknown): string | undefined {
  if (!Array.isArray(content)) return undefined;
  const parts = content.flatMap((raw: unknown) => {
    const entry = (raw ?? {}) as { type?: string; content?: { type?: string; text?: unknown }; path?: string; newText?: string; terminalId?: string };
    if (entry.type === "content" && entry.content?.type === "text") return [String(entry.content.text)];
    if (entry.type === "diff") return [`--- ${entry.path}\n${entry.newText ?? ""}`];
    if (entry.type === "terminal") return [`[terminal ${entry.terminalId}]`];
    return [];
  });
  return parts.length ? parts.join("\n") : undefined;
}

function appendText(blocks: Block[], kind: "text" | "thought", text: string): Block[] {
  const last = blocks[blocks.length - 1];
  if (last && last.kind === kind) return [...blocks.slice(0, -1), { ...last, text: last.text + text }];
  return [...blocks, { kind, text }];
}

function hasOutput(message: ChatMessage | undefined) {
  return Boolean(message?.blocks.some((b) => b.kind === "text" || b.kind === "tool" || b.kind === "thought"));
}

export class HarnessSession {
  private router: Router;
  private dshByWorkspace = new Map<string, DshProc>();
  private dshByProc = new Map<number, DshProc>();
  /** chatId → ACP session on a dsh process. */
  private dshSessions = new Map<string, { proc: DshProc; sessionId: string }>();
  private claudeByChat = new Map<string, ClaudeProc>();
  private claudeByProc = new Map<number, ClaudeProc>();
  private cards = new Map<string, PendingCard>();
  private turns = new Map<string, TurnControl>();
  private started = false;

  constructor(
    private native: HarnessNative,
    private notify: (title: string, body?: string) => void = () => undefined,
  ) {
    this.router = new Router((provider) => native.probe(provider));
  }

  async start() {
    if (this.started) return;
    this.started = true;
    await this.native.reset().catch(() => undefined);
    await this.native.onLine((event) => this.onLine(event));
    await this.native.onExit((event) => this.onExit(event));
  }

  /* ---------------------------------------------------------------- *
   * Routing native events
   * ---------------------------------------------------------------- */

  onLine({ procId, line }: LineEvent) {
    const dsh = this.dshByProc.get(procId);
    if (dsh) return dsh.client.handleLine(line);
    const claude = this.claudeByProc.get(procId);
    if (claude) this.onClaudeLine(claude, line);
  }

  onExit({ procId, code }: ExitEvent) {
    const dsh = this.dshByProc.get(procId);
    if (dsh) {
      this.dshByProc.delete(procId);
      this.dshByWorkspace.delete(dsh.workspace.toLowerCase());
      dsh.client.close(`DeepSeek Harness stopped (exit ${code ?? "unknown"})`);
      for (const [chatId, session] of this.dshSessions) {
        if (session.proc === dsh) {
          this.dshSessions.delete(chatId);
          this.cancelCards(chatId, "dsh");
        }
      }
    }
    const claude = this.claudeByProc.get(procId);
    if (claude) {
      this.claudeByProc.delete(procId);
      this.claudeByChat.delete(claude.chatId);
      this.cancelCards(claude.chatId, "claude");
      claude.turn?.reject(new Error(`Claude Code stopped (exit ${code ?? "unknown"})`));
      claude.turn = null;
    }
  }

  /** Drops pending cards; `answer` tells a still-running engine they were cancelled. */
  private cancelCards(chatId: string, engine: Engine | null, answer = false) {
    let cancelled = 0;
    for (const [key, card] of this.cards) {
      if (key.startsWith(`${chatId}:`) && (engine === null || card.engine === engine)) {
        this.cards.delete(key);
        if (answer) card.cancel();
        cancelled++;
      }
    }
    if (cancelled === 0) return;
    harness.mapMessages(chatId, (m) => ({
      ...m,
      blocks: m.blocks.map((b) => (b.kind === "permission" && b.status === "pending" ? { ...b, status: "cancelled" as const } : b)),
    }));
    if (!answer) this.pushNotice(chatId, "warning", "Engine restarted — pending action was cancelled.");
  }

  /* ---------------------------------------------------------------- *
   * Public API used by the UI
   * ---------------------------------------------------------------- */

  answerPermission(chatId: string, blockId: string, allow: boolean) {
    const key = `${chatId}:${blockId}`;
    const card = this.cards.get(key);
    if (!card) return; // Late click after a restart: no-op.
    this.cards.delete(key);
    this.setCardStatus(chatId, blockId, allow ? "allowed" : "denied");
    card.respond(allow);
    harness.persistChat(chatId);
  }

  async stop(chatId: string) {
    const turn = this.turns.get(chatId);
    if (!turn) return;
    if (turn.requested) return this.forceStop(chatId, turn);
    turn.requested = true;
    harness.setStopping(chatId, true);
    this.cancelCards(chatId, null, true);
    // Still starting up: nothing to cancel yet, and the startup bails at its next checkpoint.
    if (!turn.engaged) return turn.release();

    const claude = this.claudeByChat.get(chatId);
    const dsh = this.dshSessions.get(chatId);
    if (claude) await this.native.send(claude.procId, interruptRequest(`interrupt-${newId()}`)).catch(() => undefined);
    else if (dsh) await dsh.proc.client.notify("session/cancel", { sessionId: dsh.sessionId }).catch(() => undefined);
    // The engine ignored the cancel (a hung tool or model stream): end the process tree.
    if (this.turns.get(chatId) === turn) turn.timers.push(setTimeout(() => this.forceStop(chatId, turn), STOP_GRACE_MS));
  }

  private forceStop(chatId: string, turn: TurnControl) {
    if (this.turns.get(chatId) !== turn) return;
    turn.timers.forEach(clearTimeout);
    const procId = turn.engaged ? (this.claudeByChat.get(chatId)?.procId ?? this.dshSessions.get(chatId)?.proc.procId) : undefined;
    if (procId !== undefined) void this.native.kill(procId);
    turn.timers = [setTimeout(() => turn.release(), procId === undefined ? 0 : STOP_FORCE_MS)];
  }

  /** Throws once Stop was pressed; called between startup steps. */
  private checkpoint(turn: TurnControl) {
    if (turn.requested) throw new StoppedError();
  }

  /** Mode applies immediately: to the next permission decision, and to claude now. */
  async setMode(chatId: string, mode: Mode) {
    harness.setChatOptions(chatId, { mode });
    const claude = this.claudeByChat.get(chatId);
    if (claude && claude.mode !== mode) {
      claude.mode = mode;
      await this.native.send(claude.procId, setPermissionModeRequest(`mode-${newId()}`, mode)).catch(() => undefined);
    }
  }

  async send(chatId: string, text: string) {
    const s = harness.getState();
    const chat = s.chats.find((c) => c.id === chatId);
    const project = chat && s.projects.find((p) => p.id === chat.projectId);
    const config = s.config;
    if (!chat || !project || !config || !text.trim() || s.runtime[chatId]?.running) return;

    const engine = engineFor(chat.tier);
    const previous = s.runtime[chatId]?.messages ?? [];
    let handoff: string | null = null;
    if (chat.lastEngine && chat.lastEngine !== engine) {
      handoff = buildHandoff(previous, engine);
      harness.appendMessage(chatId, { id: newId(), role: "system", blocks: [{ kind: "handoff", from: chat.lastEngine, to: engine }], createdAt: Date.now() });
    }
    harness.appendMessage(chatId, { id: newId(), role: "user", blocks: [{ kind: "text", text }], createdAt: Date.now() });
    harness.setRunning(chatId, true);
    harness.persistChat(chatId);

    let release: () => void = () => undefined;
    const released = new Promise<never>((_, reject) => (release = () => reject(new StoppedError())));
    released.catch(() => undefined);
    const turn: TurnControl = { requested: false, engaged: false, released, release, timers: [] };
    this.turns.set(chatId, turn);

    const prompt = [handoff, chat.mode === "plan" && engine === "dsh" ? PLAN_MODE_PREFIX : null, text].filter(Boolean).join("\n\n");
    try {
      const run = engine === "dsh" ? this.runDshTurn(chat, project.path, prompt, turn) : this.runClaudeTurn(chat, project.path, prompt, config.claudeModel, turn);
      run.catch(() => undefined);
      await Promise.race([run, released]);
      harness.updateChat(chatId, { lastEngine: engine });
      if (turn.requested) this.pushNotice(chatId, "info", "Stopped.");
    } catch (err) {
      if (turn.requested) this.pushNotice(chatId, "info", "Stopped.");
      else this.pushNotice(chatId, "error", err instanceof Error ? err.message : String(err));
    } finally {
      turn.timers.forEach(clearTimeout);
      if (this.turns.get(chatId) === turn) this.turns.delete(chatId);
      if (turn.requested) {
        // Tools cut off mid-run never report back.
        harness.mapMessages(chatId, (m) => ({
          ...m,
          blocks: m.blocks.map((b) => (b.kind === "tool" && (b.status === "in_progress" || b.status === "pending") ? { ...b, status: "failed" as const } : b)),
        }));
      }
      harness.setRunning(chatId, false);
      harness.persistChat(chatId);
      const after = harness.getState();
      if (after.activeChatId !== chatId) {
        this.notify("Nebula finished", after.chats.find((c) => c.id === chatId)?.title);
      }
    }
  }

  /** Effort or model changed on a High chat: restart claude on the same session. */
  restartClaude(chatId: string) {
    const claude = this.claudeByChat.get(chatId);
    if (!claude) return;
    this.claudeByChat.delete(chatId);
    this.claudeByProc.delete(claude.procId);
    void this.native.kill(claude.procId);
  }

  /** Project removed: stop its dsh process. */
  closeWorkspace(path: string) {
    const proc = this.dshByWorkspace.get(path.toLowerCase());
    if (proc) void this.native.kill(proc.procId);
  }

  /* ---------------------------------------------------------------- *
   * Helpers
   * ---------------------------------------------------------------- */

  private pushNotice(chatId: string, tone: "info" | "warning" | "error", text: string) {
    harness.appendMessage(chatId, { id: newId(), role: "system", blocks: [{ kind: "notice", tone, text }], createdAt: Date.now() });
  }

  private setCardStatus(chatId: string, blockId: string, status: "allowed" | "denied" | "cancelled") {
    harness.mapMessages(chatId, (m) => ({
      ...m,
      blocks: m.blocks.map((b) => (b.kind === "permission" && b.id === blockId ? { ...b, status } : b)),
    }));
  }

  private editMessage(chatId: string, messageId: string, fn: (blocks: Block[]) => Block[]) {
    harness.updateMessage(chatId, messageId, (m) => ({ ...m, blocks: fn(m.blocks) }));
  }

  private currentMessage(chatId: string, messageId: string) {
    return harness.getState().runtime[chatId]?.messages.find((m) => m.id === messageId);
  }

  /* ---------------------------------------------------------------- *
   * dsh (Low / Medium)
   * ---------------------------------------------------------------- */

  private async dshFor(workspace: string): Promise<DshProc> {
    const key = workspace.toLowerCase();
    const existing = this.dshByWorkspace.get(key);
    if (existing && !existing.client.isClosed) {
      await existing.ready;
      return existing;
    }
    const started = await this.native.dshStart(workspace);
    const known = this.dshByProc.get(started.procId);
    if (known) return known;
    const client = new AcpClient({
      send: (line) => this.native.send(started.procId, line),
      timeoutMs: 60_000,
      log: (message) => console.warn("[nebula:dsh]", message),
    });
    const proc: DshProc = {
      procId: started.procId,
      workspace,
      client,
      ready: client
        .request("initialize", { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false } })
        .then(() => undefined),
    };
    this.dshByWorkspace.set(key, proc);
    this.dshByProc.set(started.procId, proc);
    await proc.ready;
    return proc;
  }

  private async openDshSession(chat: ChatMeta, proc: DshProc, workspace: string): Promise<string> {
    const open = async (withMcp: boolean) => {
      const rpcId = proc.client.allocateId();
      const response = proc.client.expect<{ sessionId?: string }>(rpcId, OPEN_SESSION_TIMEOUT_MS);
      const attached = await this.native.acpOpenSession(proc.procId, rpcId, workspace, chat.dshSessionId ?? null, withMcp);
      const result = await response;
      return { sessionId: result?.sessionId ?? chat.dshSessionId ?? "", attached };
    };
    let opened: { sessionId: string; attached: string[] };
    try {
      opened = await open(true);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      try {
        opened = await open(false);
        harness.setBanner(chat.id, `MCP servers were not attached (${reason}). Turn servers off in Settings → Nebula to find the broken one.`);
      } catch (retryErr) {
        if (!chat.dshSessionId) throw retryErr;
        // The saved session is gone: start a fresh one with a handoff next turn.
        harness.updateChat(chat.id, { dshSessionId: undefined, lastEngine: undefined });
        return this.openDshSession({ ...chat, dshSessionId: undefined }, proc, workspace);
      }
    }
    if (!opened.sessionId) throw new AcpError("DeepSeek Harness did not return a session id");
    harness.updateChat(chat.id, { dshSessionId: opened.sessionId });
    return opened.sessionId;
  }

  private async runDshTurn(chat: ChatMeta, workspace: string, prompt: string, turn: TurnControl) {
    const config = harness.getState().config!;
    const proc = await this.dshFor(workspace);
    this.checkpoint(turn);
    let session = this.dshSessions.get(chat.id);
    if (!session || session.proc !== proc) {
      const sessionId = await this.openDshSession(chat, proc, workspace);
      session = { proc, sessionId };
      this.dshSessions.set(chat.id, session);
    }
    const { sessionId } = session;
    this.checkpoint(turn);

    const { usable, skipped } = await this.router.available(chat.tier, config);
    this.checkpoint(turn);
    if (skipped.length && usable.length) {
      this.pushNotice(chat.id, "info", `Skipped ${skipped.map((s) => `${s.candidate.label} (${s.reason})`).join(", ")}.`);
    }
    let queue: Candidate[] = usable;
    while (queue.length) {
      const candidate = queue.shift()!;
      const messageId = newId();
      harness.appendMessage(chat.id, { id: messageId, role: "assistant", engine: "dsh", model: candidate.label, blocks: [], createdAt: Date.now() });
      const steps: number[] = [];
      let outputChars = 0;

      proc.client.bindSession(sessionId, {
        onUpdate: (update) => {
          const kind = update.sessionUpdate;
          if (kind === "agent_message_chunk" || kind === "agent_thought_chunk") {
            const content = update.content as { type?: string; text?: string } | undefined;
            if (content?.type === "text" && content.text) {
              outputChars += content.text.length;
              this.editMessage(chat.id, messageId, (b) => appendText(b, kind === "agent_message_chunk" ? "text" : "thought", content.text!));
            }
          } else if (kind === "tool_call") {
            const id = String(update.toolCallId ?? newId());
            this.editMessage(chat.id, messageId, (b) => [
              ...b,
              { kind: "tool", id, title: String(update.title ?? "Tool"), toolKind: update.kind as string | undefined, status: toolStatus(update.status), input: stringify(update.rawInput), output: acpToolOutput(update.content) },
            ]);
          } else if (kind === "tool_call_update") {
            const id = String(update.toolCallId);
            this.editMessage(chat.id, messageId, (blocks) =>
              blocks.map((b) =>
                b.kind === "tool" && b.id === id
                  ? {
                      ...b,
                      status: update.status ? toolStatus(update.status) : b.status,
                      title: typeof update.title === "string" ? update.title : b.title,
                      output: acpToolOutput(update.content) ?? stringify(update.rawOutput) ?? b.output,
                    }
                  : b,
              ),
            );
            if (update.status === "completed" || update.status === "failed") harness.persistChat(chat.id);
          } else if (kind === "usage_update" && typeof update.used === "number") {
            steps.push(update.used);
            harness.setContext(chat.id, { used: update.used, size: contextWindowFor(candidate.label, typeof update.size === "number" ? update.size : undefined), model: candidate.label });
          }
        },
        onPermission: (params, respond) => this.dshPermission(chat.id, messageId, params, respond),
      });

      try {
        await proc.client.request("session/set_config_option", { sessionId, configId: "model", value: modelOptionValue(candidate) });
        await proc.client.request("session/set_config_option", { sessionId, configId: "reasoning_effort", value: harness.getState().chats.find((c) => c.id === chat.id)?.effort ?? chat.effort });
        this.checkpoint(turn);
        const pending = proc.client.request<{ stopReason?: string }>("session/prompt", { sessionId, prompt: [{ type: "text", text: prompt }] }, null);
        turn.engaged = true;
        const result = await pending;
        if (turn.requested) return;
        if (result?.stopReason === "cancelled") this.pushNotice(chat.id, "info", "Stopped.");
        else if (result?.stopReason && result.stopReason !== "end_turn") this.pushNotice(chat.id, "warning", `Turn ended: ${result.stopReason}.`);
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const produced = hasOutput(this.currentMessage(chat.id, messageId));
        if (!turn.requested && !produced && !proc.client.isClosed && isRouteFailure(message)) {
          this.router.markDown(candidate);
          if (queue.length === 0) {
            const next = await this.router.available(chat.tier, config, candidate);
            queue = next.usable;
          }
          if (queue.length) {
            this.editMessage(chat.id, messageId, (b) => [...b, { kind: "notice", tone: "warning", text: `${candidate.label} unavailable (${message.slice(0, 160)}). Trying ${queue[0].label}.` }]);
            continue;
          }
        }
        throw err;
      } finally {
        proc.client.unbindSession(sessionId);
        harness.addTokens(chat.id, { [candidate.label]: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, estimated: true, ...estimateDshTurn(steps, outputChars) } });
        harness.persistChat(chat.id);
      }
    }
    throw new Error("No model is available for this tier. Check Settings → Nebula.");
  }

  private dshPermission(chatId: string, messageId: string, params: Record<string, unknown>, respond: (o: PermissionOutcome) => void) {
    const toolCall = (params.toolCall ?? {}) as Record<string, unknown>;
    const options = (Array.isArray(params.options) ? params.options : []) as AcpPermissionOption[];
    const mode = harness.getState().chats.find((c) => c.id === chatId)?.mode ?? "manual";
    const decision = decideDshPermission(mode, toolCall.kind as string | undefined, options);
    const send = (d: ReturnType<typeof userChoice>) => respond(d.type === "select" ? { outcome: "selected", optionId: d.optionId } : { outcome: "cancelled" });
    if (decision.type !== "ask") return send(decision);

    const blockId = `perm-${newId()}`;
    this.editMessage(chatId, messageId, (b) => [
      ...b,
      { kind: "permission", id: blockId, title: String(toolCall.title ?? "The agent wants to run a tool"), detail: stringify(toolCall.rawInput), status: "pending" },
    ]);
    this.cards.set(`${chatId}:${blockId}`, { engine: "dsh", respond: (allow) => send(userChoice(options, allow)), cancel: () => respond({ outcome: "cancelled" }) });
    harness.persistChat(chatId);
  }

  /* ---------------------------------------------------------------- *
   * claude (High)
   * ---------------------------------------------------------------- */

  private async claudeFor(chat: ChatMeta, workspace: string, model: string): Promise<ClaudeProc> {
    const existing = this.claudeByChat.get(chat.id);
    if (existing && existing.model === model && existing.effort === chat.effort) {
      if (existing.mode !== chat.mode) {
        existing.mode = chat.mode;
        await this.native.send(existing.procId, setPermissionModeRequest(`mode-${newId()}`, chat.mode));
      }
      return existing;
    }
    if (existing) this.restartClaude(chat.id);

    const resume = Boolean(chat.claudeSessionId);
    const sessionId = chat.claudeSessionId ?? globalThis.crypto.randomUUID();
    const started = await this.native.claudeStart({ chatId: chat.id, cwd: workspace, model, effort: chat.effort, mode: chat.mode, sessionId, resume });
    const proc: ClaudeProc = { procId: started.procId, chatId: chat.id, model, effort: chat.effort, mode: chat.mode, sessionId, usage: {}, turn: null };
    this.claudeByChat.set(chat.id, proc);
    this.claudeByProc.set(started.procId, proc);
    if (!resume) harness.updateChat(chat.id, { claudeSessionId: sessionId });
    await this.native.send(started.procId, initializeRequest(`init-${newId()}`));
    return proc;
  }

  private async runClaudeTurn(chat: ChatMeta, workspace: string, prompt: string, model: string, turn: TurnControl, retried = false): Promise<void> {
    const proc = await this.claudeFor(chat, workspace, model);
    this.checkpoint(turn);
    const messageId = newId();
    harness.appendMessage(chat.id, { id: messageId, role: "assistant", engine: "claude", model, blocks: [], createdAt: Date.now() });
    const result = await new Promise<{ isError: boolean; text: string }>((resolve, reject) => {
      proc.turn = { messageId, resolve, reject };
      turn.engaged = true;
      this.native.send(proc.procId, userMessage(prompt)).catch(reject);
    });
    proc.turn = null;
    if (!result.isError || turn.requested) return;
    if (!retried && chat.claudeSessionId && /no conversation found|session.*not found/i.test(result.text)) {
      // The saved Claude session is gone: start fresh with the transcript as context.
      this.restartClaude(chat.id);
      harness.updateChat(chat.id, { claudeSessionId: undefined });
      const messages = harness.getState().runtime[chat.id]?.messages ?? [];
      const handoff = buildHandoff(messages.slice(0, -2), "claude");
      const fresh = harness.getState().chats.find((c) => c.id === chat.id)!;
      return this.runClaudeTurn(fresh, workspace, [handoff, prompt].filter(Boolean).join("\n\n"), model, turn, true);
    }
    throw new Error(result.text || "Claude Code reported an error");
  }

  private onClaudeLine(proc: ClaudeProc, line: string) {
    const chatId = proc.chatId;
    for (const event of parseClaudeLine(line)) {
      const turn = proc.turn;
      switch (event.type) {
        case "init":
          if (event.sessionId && event.sessionId !== proc.sessionId) {
            proc.sessionId = event.sessionId;
            harness.updateChat(chatId, { claudeSessionId: event.sessionId });
          }
          if (turn && event.model) harness.updateMessage(chatId, turn.messageId, (m) => ({ ...m, model: event.model }));
          break;
        case "text":
          if (turn) this.editMessage(chatId, turn.messageId, (b) => appendText(b, "text", b.length && b[b.length - 1].kind === "text" ? `\n\n${event.text}` : event.text));
          break;
        case "thinking":
          if (turn) this.editMessage(chatId, turn.messageId, (b) => appendText(b, "thought", event.text));
          break;
        case "tool_use":
          if (turn) {
            this.editMessage(chatId, turn.messageId, (b) => [
              ...b,
              { kind: "tool", id: event.id, title: toolTitle(event.name, event.input), toolKind: event.name, status: "in_progress", input: stringify(event.input) },
            ]);
          }
          break;
        case "tool_result":
          if (turn) {
            this.editMessage(chatId, turn.messageId, (blocks) =>
              blocks.map((b) => (b.kind === "tool" && b.id === event.toolUseId ? { ...b, status: event.isError ? "failed" : "completed", output: event.content } : b)),
            );
            harness.persistChat(chatId);
          }
          break;
        case "permission": {
          const target = turn?.messageId;
          const blockId = `perm-${event.requestId}`;
          if (!target) {
            void this.native.send(proc.procId, permissionResponse(event.requestId, false, event.input, "No turn is running."));
            break;
          }
          this.editMessage(chatId, target, (b) => [
            ...b,
            { kind: "permission", id: blockId, title: event.description ?? toolTitle(event.toolName, event.input), detail: stringify(event.input), status: "pending" },
          ]);
          this.cards.set(`${chatId}:${blockId}`, {
            engine: "claude",
            respond: (allow) => void this.native.send(proc.procId, permissionResponse(event.requestId, allow, event.input)),
            cancel: () => void this.native.send(proc.procId, permissionResponse(event.requestId, false, event.input, "The user stopped this turn.")).catch(() => undefined),
          });
          harness.persistChat(chatId);
          break;
        }
        case "permission_denied":
          if (turn) this.editMessage(chatId, turn.messageId, (b) => [...b, { kind: "notice", tone: "warning", text: event.message }]);
          break;
        case "usage": {
          const model = event.model ?? proc.model;
          harness.setContext(chatId, { used: event.used, size: contextWindowFor(model, proc.usage[model]?.contextWindow), model });
          break;
        }
        case "result": {
          const delta = claudeUsageDelta(proc.usage, event.modelUsage);
          proc.usage = event.modelUsage;
          // The first result is the first time Claude Code names the window size.
          const context = harness.getState().runtime[chatId]?.context;
          const reported = context && event.modelUsage[context.model]?.contextWindow;
          if (context && reported && reported !== context.size) harness.setContext(chatId, { ...context, size: reported });
          harness.addTokens(chatId, delta);
          if (turn) turn.resolve({ isError: event.isError, text: event.text });
          break;
        }
        default:
          break;
      }
    }
  }
}
