import { NetworkTransport, DOLLY_HTTP_MAILBOX_VERSION, DOLLY_HTTP_SLOT_COUNT } from "./http-broker.mjs";

// Disposable Wasm userspace, with the caller's browser policy and no display,
// file picker, local service or ENTRY. Used for dependencies and Studio builds.
export async function buildImage(image, artifacts, networkPolicy, report, { customSource, signal } = {}) {
  signal?.throwIfAborted();
  const inputs = new Map(artifacts.map(artifact => [artifact.recipeSha256, artifact]));
  const worker = new Worker(new URL("./runtime-worker.mjs", import.meta.url), {
    type: "module", name: `dolly-build-${image}`,
  });
  let network, admission, abort;
  const decoder = new TextDecoder("utf-8", { ignoreBOM: true });
  try {
    return await new Promise((resolve, reject) => {
      abort = () => reject(signal.reason);
      signal?.addEventListener("abort", abort, { once: true });
      worker.addEventListener("error", event => reject(new Error(event.message || "Image build worker failed")), { once: true });
      worker.addEventListener("message", ({ data: message }) => {
        try {
          if (message.type === "bootstrap") report(message.text);
          else if (message.type === "bootstrap-bytes") report(decoder.decode(message.bytes, { stream: true }));
          else if (message.type === "build-input") {
            const artifact = inputs.get(message.recipeSha256);
            if (!artifact || !(message.bytes instanceof ArrayBuffer) || message.bytes.byteLength !== artifact.byteLength) {
              throw new Error("invalid returned build input");
            }
            artifact.bytes = message.bytes;
          }
          else if (message.type === "system-snapshot") resolve({ bytes: message.bytes, inputs: message.inputs });
          else if (message.type === "error") reject(new Error(message.message));
          else if (message.type === "broker-ready") {
            if (network || message.httpVersion !== DOLLY_HTTP_MAILBOX_VERSION ||
                message.httpSlots !== DOLLY_HTTP_SLOT_COUNT ||
                !(message.httpAdmission instanceof SharedArrayBuffer) || message.httpAdmission.byteLength !== 8) {
              throw new Error("invalid build HTTP broker handshake");
            }
            admission = new Int32Array(message.httpAdmission);
            network = new NetworkTransport(message.memory, message.httpAddress, message.httpCapacity,
              networkPolicy.policy, { fetchRequest: networkPolicy.fetchRequest });
            worker.postMessage({ type: "broker-ready-ack" });
          } else if (message.type === "http-request") {
            if (!network) throw new Error("build requested HTTP before broker setup");
            void network.dispatch(message).then(result => {
              Atomics.store(admission, 1, result);
              Atomics.store(admission, 0, 0);
              Atomics.notify(admission, 0);
            }).catch(reject);
          }
        } catch (error) { reject(error); }
      });
      // The Worker returns each buffer after importing it into Wasm, so shared
      // dependencies remain reusable without cloning gigabytes of inputs.
      worker.postMessage({ type: "configure", mode: "rebuild", image, buildOnly: true, artifacts,
        ...(customSource === undefined ? {} : { customSource }) }, [...new Set(artifacts.map(artifact => artifact.bytes))]);
    });
  } finally {
    signal?.removeEventListener("abort", abort);
    network?.close();
    worker.terminate();
  }
}
