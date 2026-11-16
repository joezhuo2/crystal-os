import type Tesseract from "tesseract.js";
import workerUrl from "tesseract.js/dist/worker.min.js?url";
import coreUrl from "tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url";
import langUrl from "@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz?url";

export interface OcrWord { text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }
export interface OcrResult { text: string; confidence: number; words: OcrWord[] }

const abs = (url: string) => new URL(url, window.location.href).href;

export function ocrOptions(): Partial<Tesseract.WorkerOptions> {
  return {
    workerPath: abs(workerUrl),
    corePath: abs(coreUrl),
    langPath: new URL(".", abs(langUrl)).href,
    workerBlobURL: false,
    cacheMethod: "none",
    gzip: true,
    errorHandler: () => {},
  };
}

let workerPromise: Promise<Tesseract.Worker> | null = null;

function getWorker(): Promise<Tesseract.Worker> {
  return (workerPromise ??= import("tesseract.js").then((mod) => {
    const createWorker = mod.createWorker ?? mod.default.createWorker;
    return createWorker("eng", undefined, ocrOptions());
  }).catch((err) => {
    workerPromise = null;
    throw err;
  }));
}

export async function ocrPage(image: HTMLCanvasElement | HTMLImageElement | Blob): Promise<OcrResult> {
  const worker = await getWorker();
  const { data } = await worker.recognize(image, {}, { text: true, blocks: true });
  const words = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)));
  return {
    text: data.text,
    confidence: data.confidence / 100,
    words: words.map((w) => ({ text: w.text, confidence: w.confidence / 100, bbox: w.bbox })),
  };
}

export async function terminateOcr(): Promise<void> {
  const pending = workerPromise;
  workerPromise = null;
  if (pending) await pending.then((w) => w.terminate(), () => undefined);
}
