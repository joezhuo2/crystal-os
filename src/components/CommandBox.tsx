import { useEffect, useRef, useState } from "react";
import { COMMAND_DONE_EVENT, COMMAND_RUN_EVENT, parseQuickCommand, type QuickCommandResult } from "@/lib/quickCommand";

const HINT = "task buy milk  ·  focus 25  ·  or just type an idea";
const ANSWER_TIMEOUT_MS = 5000;
const DONE_HOLD_MS = 900;

async function hideWindow() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().hide();
}

/** The whole page of the desktop command box window (src-tauri/src/command_box.rs). */
export default function CommandBox() {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<QuickCommandResult | null>(null);
  const [waiting, setWaiting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<number>();

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    import("@tauri-apps/api/event").then(({ listen }) =>
      listen<QuickCommandResult>(COMMAND_DONE_EVENT, (e) => {
        window.clearTimeout(timer.current);
        setWaiting(false);
        setStatus(e.payload);
        if (!e.payload.ok) return;
        setText("");
        timer.current = window.setTimeout(() => void hideWindow(), DONE_HOLD_MS);
      }).then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      }),
    );

    // The window is reused: each time it comes back, start clean.
    const onFocus = () => {
      setStatus(null);
      inputRef.current?.focus();
    };
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      unlisten?.();
      window.removeEventListener("focus", onFocus);
      window.clearTimeout(timer.current);
    };
  }, []);

  const submit = async () => {
    if (waiting) return;
    const command = parseQuickCommand(text);
    if (command.kind === "invalid") return setStatus({ ok: false, message: command.reason });
    setWaiting(true);
    setStatus(null);
    const { emit } = await import("@tauri-apps/api/event");
    await emit(COMMAND_RUN_EVENT, text);
    timer.current = window.setTimeout(() => {
      setWaiting(false);
      setStatus({ ok: false, message: "Crystal OS did not answer. Open it and sign in, then try again." });
    }, ANSWER_TIMEOUT_MS);
  };

  return (
    <form
      className="flex h-screen flex-col justify-center gap-1.5 border border-white/15 bg-[#0b1020] px-4 text-white"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") void hideWindow();
      }}
    >
      <input
        ref={inputRef}
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label="Command"
        aria-describedby="command-status"
        placeholder="Type a command…"
        spellCheck={false}
        className="w-full bg-transparent text-lg outline-none placeholder:text-white/35"
      />
      <p id="command-status" role="status" className={`truncate text-xs ${status ? (status.ok ? "text-emerald-300" : "text-rose-300") : "text-white/45"}`}>
        {waiting ? "Working…" : (status?.message ?? HINT)}
      </p>
    </form>
  );
}
