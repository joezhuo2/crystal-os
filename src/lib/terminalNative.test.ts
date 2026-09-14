import { describe, expect, it } from "vitest";
import { TerminalStream, type TerminalEvent, type TerminalInfo } from "./terminalNative";

function setup() {
  const written: string[] = [];
  const exits: (number | null)[] = [];
  const stream = new TerminalStream({
    write: (data) => written.push(data),
    exit: (code) => exits.push(code),
  });
  return { stream, written, exits };
}

function info(id: number, scrollback = "", exited = false): TerminalInfo {
  return { id, shell: "PowerShell", scrollback, scrollbackEnd: scrollback.length, exited };
}

const out = (id: number, data: string, end: number): TerminalEvent => ({ type: "output", id, data, end });

describe("TerminalStream", () => {
  it("replays scrollback and skips output it already contains", () => {
    const { stream, written } = setup();
    stream.attach(info(1, "PS> "));
    stream.push(out(1, "PS> ", 4));
    stream.push(out(1, "dir\r\n", 9));
    expect(written).toEqual(["PS> ", "dir\r\n"]);
  });

  it("holds output that arrives before attach resolves", () => {
    const { stream, written } = setup();
    stream.push(out(1, "banner\r\n", 8));
    stream.push(out(1, "PS> ", 12));
    stream.attach(info(1, "banner\r\n"));
    expect(written).toEqual(["banner\r\n", "PS> "]);
  });

  it("drops output from a shell that Refresh replaced", () => {
    const { stream, written } = setup();
    stream.attach(info(1));
    stream.detach();
    stream.push(out(1, "old", 3));
    stream.push(out(2, "new", 3));
    stream.attach(info(2));
    stream.push(out(1, "late", 7));
    expect(written).toEqual(["new"]);
  });

  it("reports an exit once", () => {
    const { stream, exits } = setup();
    stream.push({ type: "exit", id: 1, code: 0 });
    stream.attach(info(1, "", true));
    stream.push({ type: "exit", id: 1, code: 0 });
    expect(exits).toEqual([0]);
  });

  it("reports the exit of a session attached after it ended", () => {
    const { stream, exits } = setup();
    stream.attach(info(3, "bye\r\n", true));
    expect(exits).toEqual([null]);
  });
});
