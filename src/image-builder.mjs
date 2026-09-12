import { NetworkTransport, DOLLY_HTTP_MAILBOX_VERSION, DOLLY_HTTP_SLOT_COUNT } from "./http-broker.mjs";

// Disposable Wasm userspace, with the caller's browser policy and no display,
// file picker, local service or ENTRY. Used for dependencies and Studio builds.
export async function buildImage(image, artifacts, networkPolicy, report, { customSource, signal } = {}) {
  signal?.throwIfAborted();
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
      // Dependency buffers can still be used by the graph resolver: copy them.
      worker.postMessage({ type: "configure", mode: "rebuild", image, buildOnly: true, artifacts,
        ...(customSource === undefined ? {} : { customSource }) });
    });
  } finally {
    signal?.removeEventListener("abort", abort);
    network?.close();
    worker.terminate();
  }
}
