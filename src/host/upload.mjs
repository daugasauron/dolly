import { UploadTransport, chooseUploadFile } from "../upload-transport.mjs";

export const contract = Object.freeze({ name: "upload", version: 0, header: "dolly/upload.h",
  abi: ["dolly-upload-0"], dependencies: ["runtime@0"], phase: "image", imports: [] });

// The kernel worker reports each new request; the page does not poll while idle.
export function browser() {
  let transport;
  return {
    start(message) {
      if (message.version !== 0) throw new Error(`unsupported upload mailbox ${message.version}`);
      transport = new UploadTransport(message.memory, message.address, chooseUploadFile);
    },
    messages: { "upload-request"() { void transport?.poll(); } },
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
