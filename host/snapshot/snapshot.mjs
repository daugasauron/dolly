import { SessionTransport } from "./transport.mjs";
import { mountSessionSave } from "./ui.mjs";
import { DOLLY_BUILD_ID } from "../../dist/dolly-build-id.mjs";
import { DOLLY_IMAGE_BUILD_ID } from "../../dist/dolly-image-build-id.mjs";
import { DOLLY_IMAGES } from "../../src/images.mjs";
import { DOLLY_SESSION_FORMAT_VERSION, decodeSessionSnapshot, loadStoredSession, sessionCompatible,
  sessionLoadUrl, validSessionName, DOLLY_SESSION_MAX_BYTES } from "../../src/session-store.mjs";

// A session route (/session/?name=NAME), or boot()'s session option on a page
// of one's own, boots the saved session's image and restores its delta; with
// recover=1 the site's route unpacks the files into a fresh system image instead.
export async function boot(route) {
  if (!route.loadSession) return undefined;
  if (route.mode !== "snapshot") throw new Error("invalid Dolly route configuration");
  const query = new URL(location.href).searchParams;
  const name = route.session ?? query.get("name"), recovering = route.session === undefined && query.get("recover") === "1";
  // The site lists its saves; a page of one's own has no such page.
  const listed = route.session === undefined ? " Open /sessions to see saved sessions." : "";
  if (!validSessionName(name)) throw new Error(`The Dolly session name is invalid.${listed}`);
  const record = await loadStoredSession(name);
  if (record === null) throw new Error(`Session '${name}' was not found in this browser.${listed}`);
  if (record.name !== name) throw new Error("Stored session name does not match its key");
  let image = record.image;
  if (recovering) {
    if (record.formatVersion !== DOLLY_SESSION_FORMAT_VERSION) throw new Error("This save uses an unsupported recovery format");
    if (!DOLLY_IMAGES.some(definition => definition.image === "system")) throw new Error("File recovery needs the system image in this distribution");
    image = "system";
  } else if (!sessionCompatible(record, DOLLY_IMAGES, DOLLY_BUILD_ID, DOLLY_IMAGE_BUILD_ID)) {
    throw new Error(`This save belongs to an older runtime or image recipe. It has not been deleted or overwritten.${listed}`);
  }
  const bytes = await decodeSessionSnapshot(record);
  record.bytes.transfer(0);
  record.bytes = undefined;
  return { image, label: `${recovering ? "RECOVER FILES FROM" : "RESTORE SESSION"} ${name}`,
    custom: image === "custom" ? record.customImage : undefined, configuration: { bytes, name, recovering } };
}

// The page's capture: the Worker reads the session's chunks out of the mailbox
// and hands each one to onChunk here, waiting until it is consumed.
function sessionCapture({ send, ask }) {
  let consume = null;
  return {
    async capture({ signal, onChunk }) {
      signal?.throwIfAborted();
      if (consume) throw new Error("A Dolly session save is already active");
      const cancel = () => send({ type: "snapshot-cancel" });
      consume = onChunk;
      signal?.addEventListener("abort", cancel, { once: true });
      try { return await ask({ type: "snapshot-capture" }); }
      finally {
        consume = null;
        signal?.removeEventListener("abort", cancel);
      }
    },
    chunk: ({ bytes }) => consume?.(bytes),
  };
}

export function browser(page) {
  const { bytes, name, recovering } = page.configuration, capture = sessionCapture(page);
  const session = mountSessionSave(page, () => capture, name === undefined ? null : { name, recovering });
  return {
    configuration: bytes === undefined ? {} : { bytes, ...(recovering ? { recover: name } : {}) },
    transfers: bytes ? [bytes] : [],
    page: { get sessionName() { return session.name; }, saveSession: session.save },
    claimsKey: session.claimsKey,
    entryStarted: session.entryStarted,
    // An ended image leaves the session this tab saved or restored to open again.
    ended: () => session.name && page.site ? [{ text: `Open saved session ${session.name}`,
      href: sessionLoadUrl(session.name, page.site).href }] : [],
    messages: { "snapshot-chunk": capture.chunk },
    dispose() { session.abort(); },
  };
}

export function worker({ get, ask, configuration: { bytes, recover } }) {
  let kernel, transport, cancelled;
  if (bytes !== undefined && (!(bytes instanceof ArrayBuffer) || bytes.byteLength < 16 ||
      bytes.byteLength > DOLLY_SESSION_MAX_BYTES)) throw new Error("invalid Dolly session snapshot");
  if (recover !== undefined && (!validSessionName(recover) || bytes === undefined)) {
    throw new Error("invalid Dolly file recovery request");
  }
  function restore(kernel) {
    const memory = get("runtime").memory;
    const address = Number(kernel.dolly_session_restore_address(BigInt(bytes.byteLength)));
    if (!Number.isSafeInteger(address) || address <= 0 || address > memory.buffer.byteLength - bytes.byteLength) {
      throw new Error("invalid session restore memory range");
    }
    new Uint8Array(memory.buffer, address, bytes.byteLength).set(new Uint8Array(bytes));
    if (kernel.dolly_session_restore(BigInt(bytes.byteLength)) !== 0) {
      throw new Error("Dolly session filesystem restore failed; the saved copy is unchanged");
    }
  }
  async function recoverFiles({ supervisor, stage, files }) {
    const path = "/tmp/dolly-session-recovery.delta", destination = `/workspace/recovered-${recover}`;
    stage(`recovering saved files into ${destination}...`);
    files.write(path, new Uint8Array(bytes));
    try {
      const program = "/usr/bin/session-recover";
      if ((await supervisor.spawn([program, path, destination])).status !== 0) {
        throw new Error("File recovery failed; the original saved session is unchanged");
      }
    } finally { files.remove(path); }
  }
  return {
    async imageRestored(context) {
      const { kernel, image, stage } = context;
      if (kernel.dolly_session_base_capture() !== 0) throw new Error("Dolly could not index the session baseline");
      if (bytes === undefined) return;
      if (recover !== undefined) {
        if (image !== "system") throw new Error("invalid Dolly file recovery request");
        await recoverFiles(context);
      } else {
        stage("restoring named session filesystem...");
        restore(kernel);
        stage("named session filesystem restored");
      }
      bytes.transfer(0);
      bytes = undefined;
    },
    service() { kernel?.dolly_session_service(); },
    messages: {
      "snapshot-capture"() {
        const controller = cancelled = new AbortController();
        return transport.capture({ signal: controller.signal,
          onChunk: chunk => ask({ type: "snapshot-chunk", bytes: chunk }, [chunk.buffer]) });
      },
      "snapshot-cancel"() { cancelled?.abort(); },
    },
    start({ kernel: exports, memory }) {
      kernel = exports;
      // The kernel serves the mailbox on a request, after each consumed chunk
      // and on cancellation, in a task of its own.
      transport = new SessionTransport(memory.buffer, Number(kernel.dolly_session_mailbox_address()),
        Number(kernel.dolly_session_transfer_address()),
        () => setTimeout(() => kernel?.dolly_session_service()));
    },
    dispose() { transport?.close(); },
  };
}
