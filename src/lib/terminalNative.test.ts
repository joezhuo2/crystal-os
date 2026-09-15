import { describe, expect, it } from "vitest";
import { TerminalHub, TerminalStream, type TerminalEvent, type TerminalInfo } from "./terminalNative";

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

  it("ignores events for other sessions", () => {
    const { stream, written } = setup();
    stream.attach(info(1));
    stream.push(out(2, "other", 5));
    expect(written).toEqual([]);
  });

  it("reports an exit once", () => {
    const { stream, exits } = setup();
    stream.attach(info(1, "", true), [{ type: "exit", id: 1, code: 0 }]);
    stream.push({ type: "exit", id: 1, code: 0 });
    expect(exits).toEqual([0]);
  });

  it("reports the exit of a session attached after it ended", () => {
    const { stream, exits } = setup();
    stream.attach(info(3, "bye\r\n", true));
    expect(exits).toEqual([null]);
  });
});

describe("TerminalHub", () => {
  it("holds output that arrives before attach resolves", () => {
    const hub = new TerminalHub();
    const { stream, written } = setup();
    hub.push(out(1, "banner\r\n", 8));
    hub.push(out(1, "PS> ", 12));
    hub.attach(stream, info(1, "banner\r\n"));
    expect(written).toEqual(["banner\r\n", "PS> "]);
  });

  it("routes each session's output to its own view", () => {
    const hub = new TerminalHub();
    const a = setup();
    const b = setup();
    hub.attach(a.stream, info(1));
    hub.push(out(2, "early b", 7));
    hub.attach(b.stream, info(2));
    hub.push(out(1, "a", 1));
    hub.push(out(2, "b", 8));
    expect(a.written).toEqual(["a"]);
    expect(b.written).toEqual(["early b", "b"]);
  });

  it("drops output from a shell that Refresh replaced", () => {
    const hub = new TerminalHub();
    const { stream, written, exits } = setup();
    hub.attach(stream, info(1));
    hub.forget(1);
    hub.push(out(1, "old", 3));
    hub.push({ type: "exit", id: 1, code: 1 });
    hub.push(out(2, "new", 3));
    hub.attach(stream, info(2));
    hub.push(out(1, "late", 7));
    expect(written).toEqual(["new"]);
    expect(exits).toEqual([]);
  });

  it("stops routing to a released view without dropping its session", () => {
    const hub = new TerminalHub();
    const first = setup();
    hub.attach(first.stream, info(1));
    hub.release(first.stream);
    hub.push(out(1, "while away", 10));
    const second = setup();
    hub.attach(second.stream, info(1, "while away"));
    expect(first.written).toEqual([]);
    expect(second.written).toEqual(["while away"]);
  });
});
