// ESC or CSI followed by a control sequence (colors, cursor moves, OSC titles).
// eslint-disable-next-line no-control-regex
const ANSI = /[](?:\][^]*(?:|\\)|[[()#;?]*(?:\d{1,4}(?:;\d{0,4})*)?[0-9A-ORZcf-nqry=><~])/g;

/** Removes terminal escape codes. Applied at render time; transcripts keep the raw text. */
export function stripAnsi(text: string): string {
  return text.replace(ANSI, "");
}
