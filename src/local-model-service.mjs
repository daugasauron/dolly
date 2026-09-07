import { HttpError } from "./http-policy.mjs";
import { DOLLY_ERRNO } from "../dist/dolly-errno.mjs";
import { LOCAL_MODEL_ORIGIN, LOCAL_MODELS, DEFAULT_LOCAL_MODEL, LOCAL_LIMITS, reservedLocalURL, validateCompletion } from "./local-model-contract.mjs";

const encoder = new TextEncoder();
const cancelled = () => new DOMException("Local generation stopped", "AbortError");

export class LocalModelService extends EventTarget {
  constructor({ createWorker = () => new Worker(new URL("./webgpu-worker.mjs", import.meta.url),
    { type: "module", name: "dolly-webgpu" }), cancelGrace = 2000 } = {}) {
    super();
    this.createWorker = createWorker;
    this.cancelGrace = cancelGrace;
    this.pending = new Map();
    this.sequence = 0;
    this.state = "unloaded";
    this.detail = "Select a model to load it. Cached weights are reused.";
  }
  status(state, detail) {
    this.state = state;
    this.detail = detail;
    this.dispatchEvent(new Event("change"));
  }
  rpc(type, data = {}) {
    if (!this.worker) return Promise.reject(new Error("Model worker is unavailable"));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, ...data });
    });
  }
  ready() {
    this.status("ready", `${this.model.name} ready · ${this.model.context_window} token context`);
  }
  async load(modelId = DEFAULT_LOCAL_MODEL.id) {
    const model = LOCAL_MODELS.find(model => model.id === modelId);
    if (!model) throw new Error("Unknown model");
    if (!["unloaded", "error", "ready"].includes(this.state)) throw new Error("Model is busy; stop or unload it before switching.");
    if (this.state === "ready" && this.model.id === modelId) return;
    this.dispose();
    this.model = model;
    this.status("loading", `Checking WebGPU and loading ${model.name}…`);
    let worker;
    try {
      worker = this.worker = this.createWorker();
      worker.addEventListener("message", ({ data }) => {
        if (worker !== this.worker) return;
        if (data.progress) { this.status("loading", data.progress); return; }
        const pending = this.pending.get(data.id);
        if (!pending) return;
        this.pending.delete(data.id);
        if (data.error) pending.reject(new Error(data.error));
        else pending.resolve(data.value);
      });
      worker.addEventListener("error", event => {
        if (worker !== this.worker) return;
        this.dispose(new Error(event.message || "Model worker failed"));
        this.status("error", event.message || "Model worker failed; load it again.");
      });
      await this.rpc("load", { modelId });
      if (worker === this.worker) this.ready();
    } catch (error) {
      if (worker === this.worker) { this.dispose(error); this.status("error", error.message); }
    }
  }
  dispose(error = cancelled()) {
    this.active?.controller?.error(error);
    this.worker?.terminate();
    this.worker = undefined;
    this.model = undefined;
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    if (this.active) this.release(this.active);
    this.status("unloaded", "Model unloaded. Cached weights are kept for the next load.");
  }
  release(active) {
    if (active !== this.active) return;
    clearTimeout(active.deadline);
    active.signal?.removeEventListener("abort", active.abort);
    this.active = undefined;
    if (this.worker) this.ready();
  }
  progress(active) {
    clearTimeout(active.deadline);
    active.deadline = setTimeout(() => this.fail(active,
      new Error("Local model made no progress for two minutes. Try a smaller model or a shorter prompt.")),
    LOCAL_LIMITS.idleTimeoutMilliseconds);
  }
  fail(active, error) {
    if (this.active !== active || active.stopping) return;
    // An SSE error keeps the engine failure visible through Pi's OpenAI client.
    active.controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: { message: error.message, type: "local_model_error" } })}\n\n`));
    active.controller.close();
    active.controller = undefined;
    void this.stop(error);
  }
  async stop(reason = cancelled()) {
    const active = this.active;
    if (!active) return;
    if (active.stopping) return active.stopping;
    active.controller?.error(reason);
    if (!active.started) { this.release(active); return; }
    this.status("stopping", "Stopping generation…");
    active.stopping = (async () => {
      const timer = setTimeout(() => {
        if (this.active === active) this.dispose(new Error("Model did not stop; worker unloaded. Load it again."));
      }, this.cancelGrace);
      try { await this.rpc("cancel", { generation: active.id }); }
      catch (error) {
        if (this.active === active && this.worker) {
          this.dispose(error);
          this.status("error", error.message);
        }
      }
      finally { clearTimeout(timer); this.release(active); }
    })();
    return active.stopping;
  }
  async fetch(url, init) {
    if (url.pathname === "/v1/models") return json({ object: "list", data: LOCAL_MODELS }, 200, url);
    let request;
    try {
      request = validateCompletion(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(init.body)));
    } catch (error) { return json({ error: { message: error.message, type: "invalid_request_error" } }, 400, url); }
    if (this.state !== "ready" || this.model.id !== request.model) return json({ error: { message: this.active
      ? "Local model is busy; wait for the current generation to stop."
      : `${request.model} is not loaded. Press Ctrl+Shift+L to load that size, or select the loaded model in Pi.`,
    type: "local_model_unavailable" } }, 409, url);
    init.signal?.throwIfAborted();
    const active = { id: ++this.sequence, signal: init.signal, bytes: 0, finished: false };
    this.active = active;
    this.status("generating", `${this.model.name} is generating…`);
    active.abort = () => { void this.stop(init.signal.reason ?? cancelled()); };
    active.signal?.addEventListener("abort", active.abort, { once: true });
    this.progress(active);
    const created = Math.floor(Date.now() / 1000), id = `chatcmpl-dolly-${active.id}`;
    const body = new ReadableStream({
      start: controller => { active.controller = controller; },
      pull: async controller => {
        try {
          if (this.active !== active || active.stopping) throw cancelled();
          if (!active.started) {
            active.started = true;
            await this.rpc("start", { generation: active.id, request });
          }
          const result = await this.rpc("next", { generation: active.id });
          if (this.active !== active || active.stopping) return;
          this.progress(active);
          let text;
          if (result.done) {
            if (!active.finished) throw new Error("Model stream ended without a finish reason");
            text = "data: [DONE]\n\n";
          } else {
            const chunk = result.value;
            if (chunk.choices?.some(choice => choice.finish_reason)) active.finished = true;
            text = `data: ${JSON.stringify({ id, object: "chat.completion.chunk", created, model: request.model, ...chunk })}\n\n`;
          }
          const bytes = encoder.encode(text);
          active.bytes += bytes.byteLength;
          if (active.bytes > LOCAL_LIMITS.maxResponseBytes || bytes.byteLength > 1024 * 1024) throw new Error("Local response exceeds its byte limit");
          controller.enqueue(bytes);
          if (result.done) { controller.close(); this.release(active); }
        } catch (error) {
          this.fail(active, error);
        }
      },
      cancel: reason => { active.controller = undefined; return this.stop(reason ?? cancelled()); },
    }, { highWaterMark: 0 });
    return withURL(new Response(body, { headers: { "content-type": "text/event-stream", "cache-control": "no-store" } }), url);
  }
}

function withURL(response, url) {
  Object.defineProperty(response, "url", { value: url.href });
  return response;
}
function json(value, status, url) {
  return withURL(new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } }), url);
}

// Local authority is independent of remote HTTP authority. Always reserve the
// namespace, including when the service is absent (notably image builders).
export function localModelTransport(remotePolicy, service, remoteFetch = globalThis.fetch.bind(globalThis)) {
  function localRule(url, method, bytes) {
    if (!service || url.origin !== LOCAL_MODEL_ORIGIN || url.username || url.password || url.search || url.hash ||
        !((method === "GET" && url.pathname === "/v1/models" && bytes === 0) ||
          (method === "POST" && url.pathname === "/v1/chat/completions")) || bytes > LOCAL_LIMITS.maxRequestBytes) {
      throw new HttpError(DOLLY_ERRNO.EACCES, "Browser-local service request denied");
    }
    return LOCAL_LIMITS;
  }
  return {
    policy: { authorize(url, method, headers, bytes) {
      if (!reservedLocalURL(url)) return remotePolicy.authorize(url, method, headers, bytes);
      const rule = localRule(url, method, bytes);
      for (const name of [...headers.keys()]) headers.delete(name);
      return rule;
    } },
    fetchRequest: (url, init) => {
      url = new URL(url);
      if (!reservedLocalURL(url)) return remoteFetch(url, init);
      localRule(url, init.method, init.body?.byteLength ?? 0);
      return service.fetch(url, { ...init, headers: new Headers() });
    },
  };
}
