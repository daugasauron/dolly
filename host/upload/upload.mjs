import { UploadTransport, chooseUploadFile, showUploadProgress } from "./transport.mjs";
export { DOLLY_UPLOAD_ABI_DIGEST as digest } from "./abi.mjs";

// The kernel worker reports each new request and each retired one (its
// process ended or cancelled); the page never polls the mailbox.
export function browser() {
  let transport;
  return {
    start(message) {
      if (message.version !== 1) throw new Error(`unsupported upload mailbox ${message.version}`);
      transport = new UploadTransport(message.memory, message.address, chooseUploadFile, showUploadProgress);
    },
    messages: { "upload-request"() { void transport?.poll(); }, "upload-retired"() { transport?.retire(); } },
    // The open dialog takes every key; Ctrl+C still interrupts the program that asked.
    claimsKey: () => document.querySelector("#file-upload[open]") ? "interrupt" : false,
    dispose() { transport?.close(); },
  };
}

export function worker({ send }) {
  let words, reported, retired;
  return {
    service() {
      if (!words) return;
      const request = Atomics.load(words, 0), cancelled = Atomics.load(words, 1);
      if (request !== reported) {
        reported = request;
        send({ type: "upload-request" });
      }
      if (cancelled !== retired) {
        retired = cancelled;
        send({ type: "upload-retired" });
      }
    },
    start({ dolly, memory }) {
      const address = Number(dolly._dolly_upload_mailbox_address());
      words = new Int32Array(memory.buffer, address, 2);
      reported = Atomics.load(words, 0);
      retired = Atomics.load(words, 1);
      return { memory: memory.buffer, address, version: dolly._dolly_upload_mailbox_version() };
    },
  };
}
