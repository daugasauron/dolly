import { LOCAL_MODELS, validateCompletion } from "./local-model-contract.mjs";
import { qwenCompletions } from "./qwen-completions.mjs";

let engine, iterator, nextPending, generation, loading = false;
let model;
const nativeFetch = globalThis.fetch.bind(globalThis);

async function load(modelId) {
  if (engine || loading) throw new Error("Model is already loaded or loading");
  model = LOCAL_MODELS.find(model => model.id === modelId);
  if (!model) throw new Error("Unknown model");
  loading = true;
  try {
    postMessage({ progress: "Checking the worker’s WebGPU adapter…" });
    const adapter = await navigator.gpu?.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter || adapter.info?.isFallbackAdapter) {
      throw new Error("The browser could not provide a hardware WebGPU adapter. Open GPU setup below to enable acceleration and check your driver.");
    }
    if (!adapter.features.has("shader-f16")) throw new Error("This GPU lacks WebGPU shader-f16. See GPU setup below; a compatible GPU/driver is required.");
    postMessage({ progress: "Preparing the pinned model assets…" });
    const catalog = await (await nativeFetch(new URL("../dist/webgpu/assets.json", import.meta.url))).json();
    const manifest = catalog.models.find(entry => entry.model === model.id);
    if (!manifest) throw new Error("Model assets are missing from this release");
    postMessage({ progress: "Starting WebLLM…" });
    const assets = new Map(manifest.assets.map(asset => [asset.url, asset]));
    // Engine downloads are a trusted, fixed asset graph, never guest URLs.
    globalThis.fetch = async (input, init = {}) => {
      const url = typeof input === "string" || input instanceof URL ? String(input) : input.url;
      const asset = assets.get(url);
      if (!loading || !asset || (init.method ?? input.method ?? "GET") !== "GET") throw new Error(`Denied model asset: ${url}`);
      postMessage({ progress: `Downloading and verifying ${asset.file}…` });
      const target = asset.bundle ? new URL(`../dist/webgpu/${asset.sha256}-${asset.file}`, import.meta.url) : asset.url;
      const response = await nativeFetch(target, { signal: init.signal ?? input.signal,
        credentials: "omit", referrerPolicy: "no-referrer" });
      if (!response.ok) throw new Error(`Model asset ${asset.file}: HTTP ${response.status}`);
      const bytes = new Uint8Array(asset.bytes);
      const reader = response.body.getReader();
      let offset = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value.length > bytes.length - offset) throw new Error(`Model asset exceeds declared size: ${asset.file}`);
          bytes.set(value, offset);
          offset += value.length;
        }
      } finally { await reader.cancel(); }
      const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(n => n.toString(16).padStart(2, "0")).join("");
      if (offset !== asset.bytes || hash !== asset.sha256) throw new Error(`Model asset integrity failure: ${asset.file}`);
      return new Response(bytes, { headers: response.headers });
    };
    const { MLCEngine } = await import("../dist/webgpu/webllm.mjs");
    postMessage({ progress: "Loading the Qwen model…" });
    engine = new MLCEngine({
      // CacheStorage.add bypasses the guarded Fetch implementation. The pinned
      // IndexedDB backend calls Fetch and stores only the verified response.
      appConfig: { cacheBackend: "indexeddb", model_list: [{ model_id: model.id, model: manifest.baseURL,
        model_lib: manifest.assets.find(a => a.file === "qwen.wasm").url,
        overrides: { context_window_size: model.context_window, max_history_size: 1,
          // The pinned MLC configs retain Qwen 2 IDs; these match Qwen 3.5's tokenizers.
          conv_config: { stop_token_ids: [248044, 248046] } } }] },
      initProgressCallback: report => postMessage({ progress: report.text }),
    });
    await engine.reload(model.id);
    return { adapter: { vendor: adapter.info?.vendor, architecture: adapter.info?.architecture,
      description: adapter.info?.description }, contextWindow: model.context_window };
  } finally { loading = false; }
}

async function command(message) {
  if (message.type === "load") return load(message.modelId);
  if (message.type === "start") {
    if (!engine || iterator) throw new Error("Model unavailable or busy");
    const request = validateCompletion(message.request);
    if (request.model !== model.id) throw new Error("Requested model is not loaded");
    generation = message.generation;
    iterator = qwenCompletions(engine, request);
    return;
  }
  if (message.generation !== generation) throw new Error("Stale model generation");
  if (message.type === "next") {
    if (!iterator || nextPending) throw new Error("Invalid model stream demand");
    nextPending = iterator.next();
    try {
      const result = await nextPending;
      if (result.done) iterator = undefined;
      return result;
    } finally { nextPending = undefined; }
  }
  if (message.type === "cancel") {
    await engine?.interruptGenerate();
    try { await nextPending; } catch { /* The original next reply carries the error. */ }
    try {
      // Let WebLLM reach its terminal result and release its internal lock.
      // Returning early from its generator can strand that lock.
      while (iterator && !(await iterator.next()).done) { /* Discard cancelled output. */ }
    } catch { /* Interrupted structured output is expected to be incomplete. */ }
    finally { iterator = undefined; }
    // WebLLM may have unloaded itself after losing the GPU device.
    await engine.getMessage(model.id);
    return;
  }
  throw new Error("Unknown model worker command");
}

addEventListener("message", ({ data }) => {
  void command(data).then(value => postMessage({ id: data.id, value }),
    error => postMessage({ id: data.id, error: String(error.message ?? error) }));
});
