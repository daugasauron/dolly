import { inspectDollyfile, MAX_DOLLYFILE_BYTES } from "./dollyfile-view.mjs";

export const BUILD_ORIGIN = "https://build.dolly.invalid";
export const BUILD_LIMITS = Object.freeze({
  maxRequestBytes: MAX_DOLLYFILE_BYTES, maxResponseBytes: 8 * 1024 * 1024,
  timeoutMilliseconds: 45 * 60_000, credentialHeaders: new Set(),
});
const encoder = new TextEncoder();
const cancelled = () => new DOMException("Image build cancelled", "AbortError");
function response(body, status, url) {
  return Object.defineProperty(new Response(body, { status, headers: {
    "content-type": "application/x-ndjson", "cache-control": "no-store",
  } }), "url", { value: url.href });
}

// One explicit approval, one bounded stream, one disposable build at a time.
// The run callback receives only recipe text, logging and cancellation.
export class ImageBuildService extends EventTarget {
  constructor(run) {
    super();
    this.run = run;
    this.state = "idle";
    this.detail = "";
  }
  status(state, detail) {
    this.state = state;
    this.detail = detail;
    this.dispatchEvent(new Event("change"));
  }
  emit(job, event) {
    if (!job.stream) return;
    const bytes = encoder.encode(JSON.stringify(event) + "\n");
    job.bytes += bytes.byteLength;
    // Reserve room for a terminal error; do not accumulate an unbounded queue
    // when a compromised guest stops reading or a compiler floods its output.
    if (job.bytes > BUILD_LIMITS.maxResponseBytes - 4096) throw new Error("Image build log exceeds 8 MiB");
    job.stream.enqueue(bytes);
  }
  finish(job, error) {
    if (!job.stream) return;
    if (error) job.stream.enqueue(encoder.encode(JSON.stringify({ type: "error", message: String(error.message).slice(0, 512) }) + "\n"));
    job.stream.close();
    job.stream = undefined;
  }
  release(job) {
    clearTimeout(job.deadline);
    clearInterval(job.heartbeat);
    job.signal?.removeEventListener("abort", job.abort);
    if (this.active === job) this.active = undefined;
  }
  cancel(reason = cancelled()) {
    if (!(reason instanceof Error)) reason = new Error(String(reason));
    const job = this.active;
    if (!job || job.controller.signal.aborted) return;
    job.controller.abort(reason);
    this.finish(job, reason);
    this.status(job.started ? "stopping" : "error", reason.message);
    if (!job.started) this.release(job);
  }
  async fetch(url, init) {
    if (this.active) return response(JSON.stringify({ type: "error", message: "An image build is already pending or running" }) + "\n", 409, url);
    let source, recipe;
    try {
      if (!init.body || init.body.byteLength > MAX_DOLLYFILE_BYTES) throw new Error("Dollyfile exceeds 128 KiB");
      source = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(init.body);
      if (source.includes("\0")) throw new Error("Dollyfile contains NUL bytes");
      recipe = inspectDollyfile(source);
      if (recipe.kind !== "image") throw new Error("Submit an IMAGE recipe, not a MODULE");
    } catch (error) { return response(JSON.stringify({ type: "error", message: error.message }) + "\n", 400, url); }
    init.signal?.throwIfAborted();
    const job = { source, name: recipe.image, open: url.pathname.endsWith("/open"),
      signal: init.signal, controller: new AbortController(), bytes: 0 };
    this.active = job;
    this.result = undefined;
    job.abort = () => this.cancel(init.signal.reason ?? cancelled());
    job.signal?.addEventListener("abort", job.abort, { once: true });
    job.deadline = setTimeout(() => this.cancel(new Error("Image build exceeded 45 minutes")), BUILD_LIMITS.timeoutMilliseconds);
    const body = new ReadableStream({
      start: stream => { job.stream = stream; },
      cancel: () => { job.stream = undefined; this.cancel(); },
    }, { highWaterMark: 0 });
    this.emit(job, { type: "status", text: "Waiting for browser approval. Review the Dollyfile and choose Build." });
    job.heartbeat = setInterval(() => {
      try { this.emit(job, { type: "progress", state: this.state }); }
      catch (error) { this.cancel(error); }
    }, 10_000);
    this.status("pending", `Build ${job.name}? This runs another Wasm sandbox, using this page's HTTP policy.`);
    return response(body, 200, url);
  }
  async approve() {
    const job = this.active;
    if (!job || job.started || job.controller.signal.aborted) return;
    job.started = true;
    this.status("building", `Building ${job.name}… Logs stream to the calling command.`);
    try {
      const artifact = await this.run(job.source, text => {
        job.controller.signal.throwIfAborted();
        this.emit(job, { type: "log", text });
      }, job.controller.signal);
      job.controller.signal.throwIfAborted();
      this.result = { source: job.source, name: job.name, artifact };
      this.emit(job, { type: "result", image: job.name, sha256: artifact.sha256 });
      this.finish(job);
      this.status("ready", `${job.name} built. Open the completed image in a new tab.`);
    } catch (error) {
      this.finish(job, error);
      this.status("error", error.message);
    } finally { this.release(job); }
  }
}
