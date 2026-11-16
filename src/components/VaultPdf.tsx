import { useEffect, useRef, useState } from "react";
import { readVaultBinary } from "@/lib/vaultNative";

const MAX_PAGES = 10;

export default function VaultPdf({ path }: { path: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pages, setPages] = useState<number | "failed" | null>(null);

  useEffect(() => {
    let live = true;
    let close = () => {};
    const holder = ref.current;
    holder?.replaceChildren();
    (async () => {
      const { openPdf, renderPage } = await import("@/modules/observatory/resources/pdf");
      const doc = await openPdf(new Uint8Array(await readVaultBinary(path)));
      close = () => void doc.loadingTask.destroy();
      if (!live) return close();
      setPages(doc.numPages);
      for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES) && live; n++) {
        const canvas = await renderPage(doc, n, 1.5);
        canvas.style.width = "100%";
        canvas.style.height = "auto";
        if (live) holder?.append(canvas);
      }
    })().catch(() => live && setPages("failed"));
    return () => {
      live = false;
      close();
    };
  }, [path]);

  if (pages === "failed") return <span className="text-xs text-muted-foreground">PDF not found: {path}</span>;
  return (
    <span className="block space-y-2">
      <span className="block text-xs text-muted-foreground">
        {path}
        {typeof pages === "number" && pages > MAX_PAGES && ` · first ${MAX_PAGES} of ${pages} pages`}
      </span>
      <span ref={ref} role="img" aria-label={`PDF ${path}`} className="block space-y-2 [&>canvas]:rounded-md [&>canvas]:bg-white" />
    </span>
  );
}
