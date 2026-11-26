import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const terminate = vi.fn(async () => {});
const recognize = vi.fn(async () => ({ data: { text: "hi", confidence: 90, blocks: [] } }));
const createWorker = vi.fn(async () => ({ recognize, terminate }));

vi.mock("tesseract.js", () => ({ createWorker, default: { createWorker } }));
vi.mock("tesseract.js/dist/worker.min.js?url", () => ({ default: "/worker.js" }));
vi.mock("tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url", () => ({ default: "/core.js" }));
vi.mock("@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz?url", () => ({ default: "/lang/eng.traineddata.gz" }));

const { OCR_IDLE_MS, ocrPage } = await import("./ocr");

describe("ocrPage", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("reuses the worker between pages and releases it once idle", async () => {
    await ocrPage(new Blob());
    await vi.advanceTimersByTimeAsync(OCR_IDLE_MS - 1);
    await ocrPage(new Blob());
    expect(createWorker).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(OCR_IDLE_MS - 1);
    expect(terminate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(terminate).toHaveBeenCalledTimes(1);
    await ocrPage(new Blob());
    expect(createWorker).toHaveBeenCalledTimes(2);
  });
});
