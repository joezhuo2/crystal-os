import { useEffect, useRef, useState, type DragEvent } from "react";
import { AnimatePresence, m } from "framer-motion";
import { FileUp, Loader2 } from "lucide-react";
import { useAppActivity } from "@/lib/appActivity";
import { isDesktop } from "@/lib/platform";
import type { ResourceType } from "./resources/types";
import { useDropFiling } from "./useDropFiling";

export { PROCESSING_TOAST } from "./useDropFiling";

const hasFiles = (e: { dataTransfer: DataTransfer | null }) => !!e.dataTransfer?.types.includes("Files");

export function DropZone({ courseHint, typeHint, box }: { courseHint?: string; typeHint?: ResourceType; box?: boolean }) {
  const { still } = useAppActivity();
  const { handle, reading, popup } = useDropFiling({ courseHint, typeHint });
  const [over, setOver] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const desktop = isDesktop();

  useEffect(() => {
    const enter = (e: globalThis.DragEvent) => hasFiles(e) && setOver(true);
    window.addEventListener("dragenter", enter);
    return () => window.removeEventListener("dragenter", enter);
  }, []);

  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (desktop) void handle([...e.dataTransfer.files]);
  };

  return (
    <>
      {box && (
        <button
          type="button"
          data-testid="observatory-dropbox"
          disabled={!desktop}
          onClick={() => picker.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={drop}
          className="glass-card w-full flex items-center gap-3 border border-dashed border-border/70 px-4 py-4 text-left text-sm transition-colors hover:border-primary/60 disabled:opacity-60"
        >
          {reading ? (
            <Loader2 className={`h-5 w-5 shrink-0 text-primary ${still ? "" : "motion-safe:animate-spin"}`} aria-hidden="true" />
          ) : (
            <FileUp className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          )}
          <span>
            <span className="block font-medium">{reading ? `Reading ${reading} file${reading === 1 ? "" : "s"}…` : "Drop PDFs, slides, Word documents or web pages here or click to choose"}</span>
            <span className="block text-xs text-muted-foreground">
              {desktop ? "Slides, textbooks and question sheets are sorted into the right course and type automatically. PowerPoint, Word and HTML files are saved as PDFs." : "Filing PDFs needs the desktop app."}
            </span>
          </span>
          <input
            ref={picker}
            type="file"
            accept=".pdf,.pptx,.ppt,.docx,.html,.htm,application/pdf"
            multiple
            className="hidden"
            data-testid="observatory-dropbox-input"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = "";
              if (files.length) void handle(files);
            }}
          />
        </button>
      )}
      <AnimatePresence>
        {over && (
          <m.div
            data-testid="observatory-drop"
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm"
            initial={still ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={still ? { opacity: 1, transition: { duration: 0 } } : { opacity: 0 }}
            transition={{ duration: 0.15 }}
            onDragOver={(e) => e.preventDefault()}
            onDragLeave={(e) => e.currentTarget === e.target && setOver(false)}
            onDrop={drop}
          >
            <div className="glass-card pointer-events-none flex flex-col items-center gap-2 px-10 py-8 text-center">
              <FileUp className="h-8 w-8 text-primary" aria-hidden="true" />
              <p className="font-semibold">{desktop ? (courseHint ? `Drop PDFs to file them in ${courseHint}` : "Drop PDFs to file them") : "Filing PDFs needs the desktop app"}</p>
            </div>
          </m.div>
        )}
      </AnimatePresence>
      {popup}
    </>
  );
}
