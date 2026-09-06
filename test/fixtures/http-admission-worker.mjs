const { createHttpAdmission, DOLLY_HTTP_LIMITS } = await import(new URL(import.meta.url).searchParams.get("broker"));

const admission = createHttpAdmission(request => self.postMessage({ type: "request", request }));
self.postMessage({ type: "ready", control: admission.control.buffer });
// Direct calls model a fully compromised kernel bypassing all in-Wasm
// checks. No request data can grow the host queue while admission is pending.
const memory = new SharedArrayBuffer(1024);
const request = { memory, method: 1n, methodSize: 3n, url: 8n, urlSize: 1n,
  headers: 0n, headersSize: 0n, body: 0n,
  bodySize: BigInt(DOLLY_HTTP_LIMITS.body) + 1n, flags: 0, sequence: 1 };
for (let i = 0; i < 100; i++) {
  const result = admission.dispatch(request);
  self.postMessage({ type: "result", result });
}
self.postMessage({ type: "done" });
