import { UploadTransport, chooseUploadFile } from "./transport.mjs";

// The kernel worker reports each new request; the page does not poll while idle.
export function browser() {
  let transport;
  return {
    start(message) {
      if (message.version !== 0) throw new Error(`unsupported upload mailbox ${message.version}`);
      transport = new UploadTransport(message.memory, message.address, chooseUploadFile);
    },
    messages: { "upload-request"() { void transport?.poll(); } },
    // The open picker takes every key; Ctrl+C still interrupts the program that asked.
    claimsKey: () => document.querySelector("#file-upload[open]") ? "interrupt" : false,
    dispose() { transport?.close(); },
  };
}

export function worker({ send }) {
  let request, reported;
  return {
    service() {
      if (!request || Atomics.load(request, 0) === reported) return;
      reported = Atomics.load(request, 0);
      send({ type: "upload-request" });
    },
    start({ dolly, memory }) {
      const address = Number(dolly._dolly_upload_mailbox_address());
      request = new Int32Array(memory.buffer, address, 1);
      reported = Atomics.load(request, 0);
      return { memory: memory.buffer, address, version: dolly._dolly_upload_mailbox_version() };
    },
  };
}
