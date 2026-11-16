import { env, pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";
import mjs from "onnxruntime-web/ort-wasm-simd-threaded.mjs?url";
import wasm from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";

env.allowLocalModels = false;
env.useWasmCache = false;
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.wasmPaths = { mjs: new URL(mjs, self.location.href).href, wasm: new URL(wasm, self.location.href).href };
  env.backends.onnx.wasm.numThreads = 1;
}

let extractor: Promise<FeatureExtractionPipeline> | null = null;

self.onmessage = async (event: MessageEvent<{ id: number; texts: string[] }>) => {
  const { id, texts } = event.data;
  try {
    extractor ??= pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", { dtype: "q8" });
    const output = await (await extractor)(texts, { pooling: "mean", normalize: true });
    self.postMessage({ id, vectors: output.tolist() });
  } catch (err) {
    extractor = null;
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
