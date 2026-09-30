import { SessionTransport } from "./transport.mjs";
import { mountSessionSave } from "./ui.mjs";

import { validSessionName, DOLLY_SESSION_MAX_BYTES } from "../../src/session-store.mjs";

// configuration: { bytes, recover } restores a saved session, or with recover
// unpacks its files into /workspace/recovered-NAME of a fresh system image.
export function browser(page) {
  let transport;
  const session = mountSessionSave(page, () => transport);
  const saved = page.configuration;
  return {
    configuration: saved, transfers: saved.bytes ? [saved.bytes] : [],
    get name() { return session.name; },
    save: session.save,
    claimsKey: session.claimsKey,
    entryStarted: session.entryStarted,
    dispose() { session.abort(); transport?.close(); },
    start(message) {
      if (message.version !== 2) throw new Error(`unsupported session mailbox ${message.version}`);
      transport = new SessionTransport(message.memory, message.address, message.nameAddress, message.nameCapacity,
        message.transferAddress, message.transferCapacity, () => page.send({ type: "snapshot-request" }));
    },
  };
}

export function worker({ get, configuration: { bytes, recover } }) {
  let kernel;
  if (bytes !== undefined && (!(bytes instanceof ArrayBuffer) || bytes.byteLength < 16 ||
      bytes.byteLength > DOLLY_SESSION_MAX_BYTES)) throw new Error("invalid Dolly session snapshot");
  if (recover !== undefined && (!validSessionName(recover) || bytes === undefined)) {
    throw new Error("invalid Dolly file recovery request");
  }
  function restore(dolly) {
    const memory = get("runtime").memory;
    const address = Number(dolly._dolly_session_restore_address(BigInt(bytes.byteLength)));
    if (!Number.isSafeInteger(address) || address <= 0 || address > memory.buffer.byteLength - bytes.byteLength) {
      throw new Error("invalid session restore memory range");
    }
    new Uint8Array(memory.buffer, address, bytes.byteLength).set(new Uint8Array(bytes));
    if (dolly._dolly_session_restore(BigInt(bytes.byteLength)) !== 0) {
      throw new Error("Dolly session filesystem restore failed; the saved copy is unchanged");
    }
  }
  async function recoverFiles({ dolly, supervisor, stage, writeFile }) {
    const path = "/tmp/dolly-session-recovery.delta", destination = `/workspace/recovered-${recover}`;
    stage(`recovering saved files into ${destination}...`);
    writeFile(path, new Uint8Array(bytes));
    try {
      const program = "/usr/bin/session-recover";
      if (await supervisor.spawn([program, path, destination]) !== 0) {
        throw new Error("File recovery failed; the original saved session is unchanged");
      }
    } finally { dolly.FS.unlink(path); }
  }
  return {
    async imageRestored(context) {
      const { dolly, image, stage } = context;
      if (dolly._dolly_session_base_capture() !== 0) throw new Error("Dolly could not index the session baseline");
      if (bytes === undefined) return;
      if (recover !== undefined) {
        if (image !== "system") throw new Error("invalid Dolly file recovery request");
        await recoverFiles(context);
      } else {
        stage("restoring named session filesystem...");
        restore(dolly);
        stage("named session filesystem restored");
      }
      bytes.transfer(0);
      bytes = undefined;
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
