import { SessionTransport } from "./transport.mjs";
import { DOLLY_SESSION_TRANSFER_CAPACITY } from "./abi.mjs";
import { mountSessionSave } from "./ui.mjs";
import { DOLLY_IMAGE_BUILD_ID } from "../../page/generated.mjs";
import { DOLLY_IMAGES } from "../../page/images.mjs";
import { sha256 } from "../../page/static-asset.mjs";
import { DOLLY_SESSION_FORMAT_VERSION, loadStoredSession, sessionCompatible,
  sessionLoadUrl, validSessionName, DOLLY_SESSION_MAX_BYTES } from "../../site/session-store.mjs";

// A session route (/session/?name=NAME), or boot()'s session option on a page
// of one's own, boots the saved session's image from the save, which is its whole
// filesystem: no image is loaded. With recover=1 the site's route unpacks the
// files into a fresh system image instead.
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
  } else if (!sessionCompatible(record, DOLLY_IMAGES, DOLLY_IMAGE_BUILD_ID)) {
    throw new Error(`This save was made on another build of this version. It has not been deleted or overwritten.${listed}`);
  } else if (image === "custom" &&
      await sha256(new TextEncoder().encode(record.customImage.source)) !== record.customImage.artifact.recipeSha256) {
    // A custom save's Dollyfile names the boot's host modules. The record carries both the file
    // and its digest, so this proves the save is whole, not where it came from: an imported save
    // boots with the modules its file names, as a Dollyfile pasted into /custom/ would.
    throw new Error(`This save's Dollyfile is not the one its image was built from.${listed}`);
  }
  return { image, label: `${recovering ? "RECOVER FILES FROM" : "RESTORE SESSION"} ${name}`,
    custom: image === "custom" ? record.customImage : undefined, configuration: { save: record.bytes, name, recovering, updatedAt: record.updatedAt } };
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
  const { save, name, recovering, updatedAt } = page.configuration, capture = sessionCapture(page);
  const session = mountSessionSave(page, () => capture, name === undefined ? null : { name, recovering, updatedAt });
  return {
    configuration: save === undefined ? {} : { save, ...(recovering ? { recover: name } : {}) },
    page: { get sessionName() { return session.name; }, saveSession: session.save },
    claimsKey: session.claimsKey,
    entryStarted: session.entryStarted,
    // An ended image leaves the session this tab saved or restored to open again.
    ended: () => session.name && page.site ? [{ text: `Open saved session ${session.name}`,
      href: sessionLoadUrl(session.name, page.site).href }] : [],
    messages: { "snapshot-chunk": capture.chunk, "snapshot-changed": ({ changed }) => session.changed(changed) },
    dispose() { session.abort(); },
  };
}

export function worker({ get, ask, send, configuration: { save, recover } }) {
  let kernel, transport, cancelled, changed = false;
  // One step of a save, and word to the page when processes have changed what
  // the last save holds, or no longer have (the kernel publishes its count here).
  const service = () => {
    kernel?.dolly_session_service();
    if (transport && transport.changed !== changed) send({ type: "snapshot-changed", changed: changed = transport.changed });
  };
  if (save !== undefined && (!(save instanceof Blob) || save.size === 0 || save.size > DOLLY_SESSION_MAX_BYTES)) {
    throw new Error("invalid Dolly session snapshot");
  }
  if (recover !== undefined && (!validSessionName(recover) || save === undefined)) {
    throw new Error("invalid Dolly file recovery request");
  }
  // Hands the kernel the save a transfer range at a time, as it is decompressed.
  async function stream({ kernel, memory, stage }, doing, failed) {
    const address = Number(kernel.dolly_session_transfer_address());
    const reader = save.stream().pipeThrough(new DecompressionStream("gzip")).getReader();
    let taken = 0, reported = performance.now();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (let offset = 0; offset < value.length; offset += DOLLY_SESSION_TRANSFER_CAPACITY) {
        const piece = value.subarray(offset, offset + DOLLY_SESSION_TRANSFER_CAPACITY);
        new Uint8Array(memory.buffer, address, piece.length).set(piece);
        if (kernel.dolly_session_restore_write(BigInt(piece.length), 0) !== 0) throw failed();
      }
      taken += value.length;
      if (performance.now() - reported >= 1000) {
        stage(`${doing}: ${Math.floor(taken / 1024 / 1024)} MiB`);
        reported = performance.now();
      }
    }
    if (kernel.dolly_session_restore_write(0n, 1) !== 0) throw failed();
    save = undefined;
  }
  const restores = () => save !== undefined && recover === undefined;
  return {
    restoresFilesystem: restores,
    // The save is the whole filesystem: the kernel empties the boot's and takes it.
    async restoreFilesystem(context) {
      if (!restores()) return false;
      context.stage("restoring the saved session...");
      if (context.kernel.dolly_session_restore_begin() !== 0) throw new Error("Dolly could not empty the filesystem for the saved session");
      await stream(context, "restoring the saved session",
        () => new Error("Dolly session filesystem restore failed; the saved copy is unchanged"));
      context.stage("saved session restored");
      return true;
    },
    // File recovery: the kernel takes the save's files and directories under
    // /home and /workspace into a new directory of the system image.
    async imageRestored(context) {
      if (recover === undefined) return;
      if (context.image !== "system") throw new Error("invalid Dolly file recovery request");
      const destination = `/workspace/recovered-${recover}`, { kernel, memory, stage } = context;
      stage(`recovering saved files into ${destination}...`);
      const failed = () => new Error("File recovery failed; the original saved session is unchanged");
      const names = new TextEncoder().encode(`${destination}\0/home\0/workspace\0`);
      new Uint8Array(memory.buffer, Number(kernel.dolly_session_transfer_address()), names.length).set(names);
      if (kernel.dolly_session_recover_begin(BigInt(names.length)) !== 0) throw failed();
      await stream(context, "recovering saved files", failed);
    },
    service,
    messages: {
      "snapshot-capture"() {
        // The count before the capture clears it, so the page has it ahead of the reply.
        service();
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
