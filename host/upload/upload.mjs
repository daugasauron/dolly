import { UploadTransport, chooseUploadFile, showUploadProgress } from "./transport.mjs";
import { DOLLY_UPLOAD_WORD_REQUEST, DOLLY_UPLOAD_WORD_CANCELLED } from "./abi.mjs";
export { DOLLY_UPLOAD_ABI_DIGEST as digest } from "./abi.mjs";

// The page shows the picker and the progress; the Worker asks for a file,
// reads it and writes it into the mailbox. The user's Cancel reaches the
// Worker, and the Worker's end of a transfer closes the dialog.
export function browser({ send }) {
  let controller = null;
  return {
    messages: {
      "upload-choose"() {
        const current = controller = new AbortController();
        current.signal.addEventListener("abort", () => {
          if (controller !== current) return;
          controller = null;
          send({ type: "upload-cancel" });
        }, { once: true });
        return chooseUploadFile(current);
      },
      "upload-progress"({ sent, size }) { showUploadProgress(sent, size); },
      "upload-close"() {
        const current = controller;
        controller = null;
        current?.abort();
      },
    },
    // The open dialog takes every key; Ctrl+C still interrupts the program that asked.
    claimsKey: () => document.querySelector("#file-upload[open]") ? "interrupt" : false,
    dispose() { controller?.abort(); },
  };
}

// The kernel's mailbox reports each new request and each retired one (its
// process ended or cancelled) at the service tick.
export function worker({ send, ask }) {
  let transport, reported, retired;
  function choose(controller) {
    controller.signal.addEventListener("abort", () => send({ type: "upload-close" }), { once: true });
    return ask({ type: "upload-choose" });
  }
  return {
    messages: { "upload-cancel"() { transport?.active?.controller.abort(); } },
    service() {
      if (!transport) return;
      const { words } = transport;
      const request = Atomics.load(words, DOLLY_UPLOAD_WORD_REQUEST), cancelled = Atomics.load(words, DOLLY_UPLOAD_WORD_CANCELLED);
      if (request !== reported) {
        reported = request;
        void transport.poll();
      }
      if (cancelled !== retired) {
        retired = cancelled;
        transport.retire();
      }
    },
    start({ dolly, memory }) {
      transport = new UploadTransport(memory.buffer, Number(dolly._dolly_upload_mailbox_address()), choose,
        (sent, size) => send({ type: "upload-progress", sent, size }));
      reported = Atomics.load(transport.words, DOLLY_UPLOAD_WORD_REQUEST);
      retired = Atomics.load(transport.words, DOLLY_UPLOAD_WORD_CANCELLED);
    },
    dispose() { transport?.close(); },
  };
}
