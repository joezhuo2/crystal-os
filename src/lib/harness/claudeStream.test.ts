import { describe, expect, it } from "vitest";
import { initializeRequest, parseClaudeLine, permissionResponse, setPermissionModeRequest, toolTitle, userMessage } from "./claudeStream";

// Shapes captured from claude 2.1.267 in the ADR 0003 spike (paths shortened).
const LINES = {
  init: '{"type":"system","subtype":"init","cwd":"C:\\\\ws","session_id":"54e07007-f517-4834-ba1c-4ce984bedd8b","model":"claude-haiku-4-5-20251001","permissionMode":"manual","apiKeySource":"none"}',
  assistant:
    '{"type":"assistant","message":{"model":"claude-haiku-4-5-20251001","content":[{"type":"thinking","thinking":"","signature":"x"},{"type":"text","text":"Running it."},{"type":"tool_use","id":"toolu_1","name":"Bash","input":{"command":"echo hi > spike.txt"}}]}}',
  canUseTool:
    '{"type":"control_request","request_id":"354a01fa","request":{"subtype":"can_use_tool","tool_name":"Bash","display_name":"Bash","input":{"command":"echo hi > spike.txt"},"description":"Write \\"hi\\" to spike.txt file","tool_use_id":"toolu_1"}}',
  toolResult: '{"type":"user","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_1","content":[{"type":"text","text":"done"}],"is_error":false}]}}',
  denied: '{"type":"system","subtype":"permission_denied","tool_name":"Write","tool_use_id":"toolu_2","message":"Claude requested permissions to write"}',
  result:
    '{"type":"result","subtype":"success","is_error":false,"result":"Done.","session_id":"54e07007-f517-4834-ba1c-4ce984bedd8b","modelUsage":{"claude-haiku-4-5-20251001":{"inputTokens":44,"outputTokens":1018,"cacheReadInputTokens":187633,"cacheCreationInputTokens":26234}}}',
};

describe("parseClaudeLine", () => {
  it("parses init", () => {
    expect(parseClaudeLine(LINES.init)).toEqual([{ type: "init", sessionId: "54e07007-f517-4834-ba1c-4ce984bedd8b", model: "claude-haiku-4-5-20251001" }]);
  });

  it("splits assistant content and drops redacted thinking", () => {
    expect(parseClaudeLine(LINES.assistant)).toEqual([
      { type: "text", text: "Running it.", model: "claude-haiku-4-5-20251001" },
      { type: "tool_use", id: "toolu_1", name: "Bash", input: { command: "echo hi > spike.txt" } },
    ]);
  });

  it("parses can_use_tool permission requests", () => {
    expect(parseClaudeLine(LINES.canUseTool)).toEqual([
      { type: "permission", requestId: "354a01fa", toolName: "Bash", toolUseId: "toolu_1", description: 'Write "hi" to spike.txt file', input: { command: "echo hi > spike.txt" } },
    ]);
  });

  it("parses tool results, denials, and results", () => {
    expect(parseClaudeLine(LINES.toolResult)).toEqual([{ type: "tool_result", toolUseId: "toolu_1", content: "done", isError: false }]);
    expect(parseClaudeLine(LINES.denied)[0]).toMatchObject({ type: "permission_denied", toolUseId: "toolu_2" });
    const [result] = parseClaudeLine(LINES.result);
    expect(result).toMatchObject({ type: "result", isError: false, text: "Done." });
    expect(result.type === "result" && result.modelUsage["claude-haiku-4-5-20251001"].outputTokens).toBe(1018);
  });

  it("ignores hooks, rate limit events, and garbage", () => {
    expect(parseClaudeLine('{"type":"system","subtype":"hook_started"}')).toEqual([]);
    expect(parseClaudeLine('{"type":"rate_limit_event"}')).toEqual([]);
    expect(parseClaudeLine("not json")).toEqual([]);
  });
});

describe("stdin messages", () => {
  it("builds the shapes the CLI accepted in the spike", () => {
    expect(JSON.parse(userMessage("hi"))).toEqual({ type: "user", message: { role: "user", content: [{ type: "text", text: "hi" }] } });
    expect(JSON.parse(initializeRequest("i1"))).toEqual({ type: "control_request", request_id: "i1", request: { subtype: "initialize" } });
    expect(JSON.parse(setPermissionModeRequest("m1", "plan")).request).toEqual({ subtype: "set_permission_mode", mode: "plan" });
    expect(JSON.parse(permissionResponse("r1", true, { command: "ls" }))).toEqual({
      type: "control_response",
      response: { subtype: "success", request_id: "r1", response: { behavior: "allow", updatedInput: { command: "ls" } } },
    });
    expect(JSON.parse(permissionResponse("r1", false, {})).response.response.behavior).toBe("deny");
  });

  it("titles tool calls", () => {
    expect(toolTitle("Bash", { command: "npm test" })).toBe("Bash: npm test");
    expect(toolTitle("Read", { file_path: "src/a.ts" })).toBe("Read: src/a.ts");
    expect(toolTitle("TodoWrite", {})).toBe("TodoWrite");
  });
});
