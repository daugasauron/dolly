import { UploadTransport, chooseUploadFile } from "../upload-transport.mjs";

export const contract = Object.freeze({ name: "upload", version: 0, header: "dolly/upload.h",
  abi: ["dolly-upload-0"], dependencies: ["runtime@0"], phase: "image", imports: [] });

export function browser() {
  let transport, timer;
  return {
    start(message) {
      if (message.version !== 0) throw new Error(`unsupported upload mailbox ${message.version}`);
      transport = new UploadTransport(message.memory, message.address, chooseUploadFile);
      timer = setInterval(() => { void transport.poll(); }, 50);
    },
    dispose() { clearInterval(timer); transport?.close(); },
  };
}

export function worker() {
  return { start({ dolly, memory }) {
    return { memory: memory.buffer, address: Number(dolly._dolly_upload_mailbox_address()),
      version: dolly._dolly_upload_mailbox_version() };
  } };
}
