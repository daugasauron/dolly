import { UploadTransport, chooseUploadFile, showUploadProgress } from "./transport.mjs";
import { DOLLY_UPLOAD_WORD_REQUEST, DOLLY_UPLOAD_WORD_CANCELLED } from "./abi.mjs";
export { DOLLY_UPLOAD_ABI_DIGEST as digest } from "./abi.mjs";

// The kernel worker reports each new request and each retired one (its
// process ended or cancelled); the page never polls the mailbox.
export function browser() {
  let transport;
  return {
    start(message) {
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
      const request = Atomics.load(words, DOLLY_UPLOAD_WORD_REQUEST), cancelled = Atomics.load(words, DOLLY_UPLOAD_WORD_CANCELLED);
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
      reported = Atomics.load(words, DOLLY_UPLOAD_WORD_REQUEST);
      retired = Atomics.load(words, DOLLY_UPLOAD_WORD_CANCELLED);
      return { memory: memory.buffer, address };
    },
  };
}
