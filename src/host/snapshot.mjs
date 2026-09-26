import { SessionTransport } from "../session-transport.mjs";

export const contract = Object.freeze({ name: "snapshot", version: 0, header: "dolly/snapshot.h",
  abi: ["dolly-snapshot-0"], dependencies: ["runtime@0"], phase: "image", imports: [] });

export function browser({ send }) {
  let transport;
  return {
    get transport() { return transport; },
    dispose() { transport?.close(); },
    start(message) {
      if (message.version !== 2) throw new Error(`unsupported session mailbox ${message.version}`);
      transport = new SessionTransport(message.memory, message.address, message.nameAddress, message.nameCapacity,
        message.transferAddress, message.transferCapacity, () => send({ type: "snapshot-request" }));
    },
  };
}

export function worker({ get }) {
  let kernel;
  return {
    captureBase(dolly) {
      if (dolly._dolly_session_base_capture() !== 0) throw new Error("Dolly could not index the session baseline");
    },
    restore(dolly, bytes) {
      const memory = get("runtime").memory;
      const address = Number(dolly._dolly_session_restore_address(BigInt(bytes.byteLength)));
      if (!Number.isSafeInteger(address) || address <= 0 || address > memory.buffer.byteLength - bytes.byteLength) {
        throw new Error("invalid session restore memory range");
      }
      new Uint8Array(memory.buffer, address, bytes.byteLength).set(new Uint8Array(bytes));
      if (dolly._dolly_session_restore(BigInt(bytes.byteLength)) !== 0) {
        throw new Error("Dolly session filesystem restore failed; the saved copy is unchanged");
      }
    },
    service() { kernel?._dolly_session_service(); },
    messages: { "snapshot-request"() { kernel?._dolly_session_service(); } },
    start({ dolly, memory }) {
      kernel = dolly;
      return { memory: memory.buffer, address: Number(dolly._dolly_session_mailbox_address()),
        version: dolly._dolly_session_mailbox_version(), nameAddress: Number(dolly._dolly_session_name_address()),
        nameCapacity: dolly._dolly_session_name_capacity(), transferAddress: Number(dolly._dolly_session_transfer_address()),
        transferCapacity: dolly._dolly_session_transfer_capacity() };
    },
  };
}
