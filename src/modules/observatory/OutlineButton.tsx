import { useRef } from "react";
import { FileInput } from "lucide-react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import { PhaseLabel } from "./ActionButton";
import { IconAction } from "./IconAction";
import { htmlText, pdfText, readOutlineWithAi, recordOutline } from "./aiOutline";
import { errorText } from "./errorText";
import { OutlineError, parseUwOutline, type ParsedOutline } from "./outline";
import type { OutlineConfidence } from "./resources/pdfOutline";
import { UNCLEAR_BELOW } from "./resources/types";
import { useObservatoryAi } from "./settings";
import { useActionPhase } from "./useActionPhase";

type Parsed = { outline: ParsedOutline; confidence?: OutlineConfidence };

function warnUnclear({ outline, confidence }: Parsed, title: string) {
  const unclear = Object.entries(confidence ?? {})
    .filter(([key, c]) => c < UNCLEAR_BELOW && !(key === "topics" && !outline.topics.length))
    .map(([key]) => key);
  if (unclear.length) toast.warning(title, { description: unclear.join(", ") });
}

async function load(file: File): Promise<{ text: () => string; parse: () => Parsed }> {
  if (!/\.pdf$/i.test(file.name)) {
    const html = await file.text();
    return { text: () => htmlText(html), parse: () => ({ outline: parseUwOutline(html) }) };
  }
  const [{ readPdf }, { parsePdfOutline }] = await Promise.all([import("./resources/pdf"), import("./resources/pdfOutline")]);
  const doc = await readPdf(new Uint8Array(await file.arrayBuffer()));
  return { text: () => pdfText(doc), parse: () => parsePdfOutline(doc, new Date(), file.name) };
}

export function OutlineButton({ onOutline, code, children, disabled, iconOnly, ...props }: ButtonProps & { onOutline: (outline: ParsedOutline) => void; code?: string; iconOnly?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const { phase, run } = useActionPhase();
  const ai = useObservatoryAi();

  const readWithAi = (text: () => string) =>
    run(async () => {
      try {
        const parsed = await readOutlineWithAi(text());
        warnUnclear(parsed, "Unclear in this outline, please check");
        onOutline(parsed.outline);
        void recordOutline(parsed.outline, code);
        return true;
      } catch (err) {
        toast.error("AI could not read that outline", { description: errorText(err) });
        return false;
      }
    });

  const read = (file: File) =>
    run(async () => {
      let loaded: Awaited<ReturnType<typeof load>>;
      try {
        loaded = await load(file);
      } catch {
        toast.error("Could not read that file");
        return false;
      }
      const { text } = loaded;
      let parsed: Parsed;
      try {
        parsed = loaded.parse();
      } catch (err) {
        if (!(err instanceof OutlineError)) toast.error("Could not read that file");
        else if (ai) toast.error(err.message, { description: "AI can read outlines in other formats.", action: { label: "Read with AI", onClick: () => void readWithAi(text) } });
        else toast.error(err.message, { description: "AI can read other outlines when a provider is picked in Settings, The Observatory." });
        return false;
      }
      const { outline } = parsed;
      if (ai && !outline.topics.length && !outline.outcomes.length) {
        toast.warning("No topics or outcomes found in this outline", {
          action: { label: "Read with AI", onClick: () => void readWithAi(text) },
          cancel: {
            label: "Use as is",
            onClick: () => {
              warnUnclear(parsed, "Unclear in this PDF, please check");
              onOutline(outline);
            },
          },
          duration: 15000,
        });
        return false;
      }
      warnUnclear(parsed, "Unclear in this PDF, please check");
      onOutline(parsed.outline);
      return true;
    });

  return (
    <>
      {iconOnly ? (
        <IconAction
          icon={FileInput}
          label="Import outline"
          hint="A UW outline page (HTML) or PDF"
          disabled={disabled}
          busy={phase === "pending"}
          action={() => {
            input.current?.click();
            return false;
          }}
        />
      ) : (
        <Button {...props} disabled={disabled || phase === "pending"} aria-live="polite" onClick={() => phase === "idle" && input.current?.click()}>
          <PhaseLabel phase={phase} pending="Importing" done="Imported">
            {children}
          </PhaseLabel>
        </Button>
      )}
      <input
        ref={input}
        type="file"
        accept=".html,.htm,.pdf"
        className="hidden"
        data-testid="outline-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void read(file);
        }}
      />
    </>
  );
}
