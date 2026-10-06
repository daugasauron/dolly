import { SessionTransport } from "./transport.mjs";
import { mountSessionSave } from "./ui.mjs";
import { DOLLY_BUILD_ID } from "../../dist/dolly-build-id.mjs";
import { DOLLY_IMAGE_BUILD_ID } from "../../dist/dolly-image-build-id.mjs";
import { DOLLY_IMAGES } from "../../dist/dolly-images.mjs";
import { DOLLY_SESSION_FORMAT_VERSION, decodeSessionSnapshot, loadStoredSession, sessionCompatible,
  sessionLoadUrl, validSessionName, DOLLY_SESSION_MAX_BYTES } from "../../src/session-store.mjs";

// A session route (/session/?name=NAME) boots the saved session's image and
// restores its delta; with recover=1 it unpacks the files into a fresh system
// image instead.
export async function boot(route) {
  if (!route.loadSession) return undefined;
  if (route.mode !== "snapshot") throw new Error("invalid Dolly route configuration");
  const query = new URL(location.href).searchParams;
  const name = query.get("name"), recovering = query.get("recover") === "1";
  if (!validSessionName(name)) throw new Error("The Dolly session URL has an invalid name. Open /sessions to see saved sessions.");
  const record = await loadStoredSession(name);
  if (record === null) throw new Error(`Session '${name}' was not found in this browser. Open /sessions to see saved sessions.`);
  if (record.name !== name) throw new Error("Stored session name does not match its key");
  let image = record.image;
  if (recovering) {
    if (record.formatVersion !== DOLLY_SESSION_FORMAT_VERSION) throw new Error("This save uses an unsupported recovery format");
    if (!DOLLY_IMAGES.some(definition => definition.image === "system")) throw new Error("File recovery needs the system image in this distribution");
    image = "system";
  } else if (!sessionCompatible(record, DOLLY_IMAGES, DOLLY_BUILD_ID, DOLLY_IMAGE_BUILD_ID)) {
    throw new Error("This save belongs to an older runtime or image recipe. It has not been deleted or overwritten. Open /sessions to see saved sessions.");
  }
  const bytes = await decodeSessionSnapshot(record);
  record.bytes.transfer(0);
  record.bytes = undefined;
  return { image, label: `${recovering ? "RECOVER FILES FROM" : "RESTORE SESSION"} ${name}`,
    custom: image === "custom" ? record.customImage : undefined, configuration: { bytes, name, recovering } };
}

export function browser(page) {
  let transport;
  const { bytes, name, recovering } = page.configuration;
  const session = mountSessionSave(page, () => transport, name === undefined ? null : { name, recovering });
  return {
    configuration: bytes === undefined ? {} : { bytes, ...(recovering ? { recover: name } : {}) },
    transfers: bytes ? [bytes] : [],
    page: { get sessionName() { return session.name; }, saveSession: session.save },
    claimsKey: session.claimsKey,
    entryStarted: session.entryStarted,
    // An ended image leaves the session this tab saved or restored to open again.
    ended: () => session.name ? [{ text: `Open saved session ${session.name}`,
      href: sessionLoadUrl(session.name, page.applicationBase).href }] : [],
    dispose() { session.abort(); transport?.close(); },
    start(message) {
      transport = new SessionTransport(message.memory, message.address, message.nameAddress, message.transferAddress,
        () => page.send({ type: "snapshot-request" }));
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
      if ((await supervisor.spawn([program, path, destination])).status !== 0) {
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
        nameAddress: Number(dolly._dolly_session_name_address()),
        transferAddress: Number(dolly._dolly_session_transfer_address()) };
    },
  };
}
