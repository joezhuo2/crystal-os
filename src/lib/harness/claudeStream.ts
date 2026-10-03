/**
 * Claude Code headless stream-json: parsing what `claude -p --output-format
 * stream-json` prints, and building what it reads on stdin. Shapes were
 * captured in the ADR 0003 spike.
 */
import type { Mode } from "./types";
import { claudeContextUsed, type ClaudeModelUsage, type ClaudeStepUsage } from "./tokenLedger";

export type ClaudeEvent =
  | { type: "init"; sessionId: string; model: string }
  | { type: "usage"; model?: string; used: number }
  | { type: "text"; text: string; model?: string }
  | { type: "thinking"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; toolUseId: string; content: string; isError: boolean }
  | { type: "permission"; requestId: string; toolName: string; toolUseId?: string; description?: string; input: unknown }
  | { type: "permission_denied"; toolUseId?: string; message: string }
  | { type: "result"; isError: boolean; text: string; sessionId?: string; modelUsage: Record<string, ClaudeModelUsage> }
  | { type: "control_response"; requestId: string; error?: string };

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part && typeof part === "object" && "text" in part ? String((part as { text: unknown }).text) : ""))
      .filter(Boolean)
      .join("\n");
  }
  return content == null ? "" : JSON.stringify(content);
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const list = (v: unknown): Obj[] => (Array.isArray(v) ? v.map(obj) : []);

export function parseClaudeLine(line: string): ClaudeEvent[] {
  let msg: Obj;
  try {
    msg = obj(JSON.parse(line));
  } catch {
    return [];
  }
  switch (msg.type) {
    case "system":
      if (msg.subtype === "init") return [{ type: "init", sessionId: str(msg.session_id) ?? "", model: str(msg.model) ?? "" }];
      if (msg.subtype === "permission_denied") return [{ type: "permission_denied", toolUseId: str(msg.tool_use_id), message: str(msg.message) ?? "Permission denied" }];
      return [];
    case "assistant": {
      const message = obj(msg.message);
      const model = str(message.model);
      // Subagent steps run in their own context, so only the main thread's
      // usage describes this chat's window.
      const usage: ClaudeEvent[] =
        message.usage && typeof message.usage === "object" && msg.parent_tool_use_id == null
          ? [{ type: "usage", model, used: claudeContextUsed(message.usage as ClaudeStepUsage) }]
          : [];
      return usage.concat(list(message.content).flatMap((block): ClaudeEvent[] => {
        if (block.type === "text" && str(block.text)) return [{ type: "text", text: block.text as string, model }];
        if (block.type === "thinking" && str(block.thinking)) return [{ type: "thinking", text: block.thinking as string }];
        if (block.type === "tool_use") return [{ type: "tool_use", id: str(block.id) ?? "", name: str(block.name) ?? "tool", input: block.input }];
        return [];
      }));
    }
    case "user":
      return list(obj(msg.message).content)
        .filter((block) => block.type === "tool_result")
        .map((block) => ({ type: "tool_result" as const, toolUseId: str(block.tool_use_id) ?? "", content: contentToText(block.content), isError: Boolean(block.is_error) }));
    case "control_request": {
      const request = obj(msg.request);
      if (request.subtype !== "can_use_tool") return [];
      return [
        {
          type: "permission",
          requestId: String(msg.request_id),
          toolName: str(request.tool_name) ?? "tool",
          toolUseId: str(request.tool_use_id),
          description: str(request.description),
          input: request.input,
        },
      ];
    }
    case "control_response": {
      const response = obj(msg.response);
      return [{ type: "control_response", requestId: str(response.request_id) ?? "", error: response.subtype === "error" ? String(response.error ?? "error") : undefined }];
    }
    case "result":
      return [
        {
          type: "result",
          isError: Boolean(msg.is_error),
          text: str(msg.result) ?? "",
          sessionId: str(msg.session_id),
          modelUsage: obj(msg.modelUsage) as Record<string, ClaudeModelUsage>,
        },
      ];
    default:
      return [];
  }
}

export function userMessage(text: string): string {
  return JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text }] } });
}

export function controlRequest(requestId: string, request: Record<string, unknown>): string {
  return JSON.stringify({ type: "control_request", request_id: requestId, request });
}

export const initializeRequest = (requestId: string) => controlRequest(requestId, { subtype: "initialize" });
export const interruptRequest = (requestId: string) => controlRequest(requestId, { subtype: "interrupt" });
export const setPermissionModeRequest = (requestId: string, mode: Mode) => controlRequest(requestId, { subtype: "set_permission_mode", mode });

export function permissionResponse(requestId: string, allow: boolean, input: unknown, message = "The user denied this action."): string {
  return JSON.stringify({
    type: "control_response",
    response: {
      subtype: "success",
      request_id: requestId,
      response: allow ? { behavior: "allow", updatedInput: input ?? {} } : { behavior: "deny", message },
    },
  });
}

/** A short, human title for a tool call card. */
export function toolTitle(name: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  const detail = i.command ?? i.file_path ?? i.path ?? i.pattern ?? i.url ?? i.description;
  return detail ? `${name}: ${String(detail).slice(0, 160)}` : name;
}
