import { useMemo } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiChat } from "./AiChat";
import { askScope, type AskScope } from "./aiAsk";
import { imageUrl, type AiImage } from "./aiImages";
import { streamCapture } from "./aiStudy";
import { useObservatoryAi, useObservatorySettings } from "./settings";

const DEFAULT_ASK = "Help me with what I highlighted.";

export function ReaderAi({ image, onClear, scope, onPage }: { image: AiImage | null; onClear: () => void; scope?: AskScope; onPage?: (page: number) => void }) {
  const ai = useObservatoryAi();
  const { aiCaptureAsk, aiAskResource } = useObservatorySettings();
  const src = useMemo(() => (image ? imageUrl(image) : ""), [image]);

  if (!ai) return <p className="text-sm text-muted-foreground">Pick an AI provider in Settings → The Observatory to ask about a region of the page.</p>;
  if (!image && aiAskResource && scope)
    return (
      <AiChat
        run={(turns, onEvent, onSources, signal) => askScope(scope, turns, onEvent, onSources, signal)}
        label="Ask about this PDF"
        placeholder="Ask about this PDF, or drag a box over the page to ask about one region"
        finding
        onSource={(s) => s.page && onPage?.(s.page)}
      />
    );
  if (!image) return <p className="text-sm text-muted-foreground">Drag a box over the page to ask the AI about that question or topic.</p>;

  return (
    <AiChat
      run={(turns, onEvent, _onSources, signal) => streamCapture(image, turns, onEvent, signal)}
      label="Ask about the captured region"
      placeholder="What do you want to know? Leave blank for a general explanation"
      defaultAsk={DEFAULT_ASK}
      autoAsk={aiCaptureAsk}
    >
      <div className="relative w-fit">
        <img src={src} alt="Captured region" className="max-h-40 rounded-md border border-border/60 bg-white object-contain" />
        <Button type="button" variant="secondary" size="icon" className="absolute right-1 top-1 h-6 w-6" aria-label="Remove captured region" onClick={onClear}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </AiChat>
  );
}
