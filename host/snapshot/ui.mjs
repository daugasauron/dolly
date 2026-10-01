import { DOLLY_BUILD_ID } from "../../dist/dolly-build-id.mjs";
import { DOLLY_IMAGE_BUILD_ID } from "../../dist/dolly-image-build-id.mjs";
import { DOLLY_IMAGES } from "../../dist/dolly-images.mjs";
import { loadCustomImage } from "../../src/custom-image.mjs";
import { sha256 } from "../../src/image-artifact.mjs";
import { publicURL } from "../../src/static-asset.mjs";
import {
  DOLLY_SESSION_FORMAT_VERSION,
  customSessionIdentity,
  encodeSessionStream,
  loadStoredSession,
  saveStoredSession,
  sessionImageIdentity,
  sessionLoadUrl,
  validSessionName,
} from "../../src/session-store.mjs";

const markup = `<style>
  #session-open { position: fixed; right: 0.5rem; bottom: 0.35rem; z-index: 6;
    padding: 0.15rem 0.45rem; color: inherit; background: #262626;
    border: 1px solid #77736c; font: inherit; font-size: 13px; cursor: pointer; }
  #session-open[data-failed] { border-color: #e98773; }
  #session-dialog { width: min(420px, calc(100vw - 2rem)); padding: 1.2rem;
    background: #262626; color: inherit; border: 1px solid #77736c; font: inherit; }
  #session-dialog::backdrop { background: #0008; }
  #session-dialog h2 { margin: 0 0 1rem; font-size: 20px; }
  #session-dialog p { font-size: 14px; line-height: 1.5; }
  #session-dialog label { display: block; margin: 1rem 0 0.4rem; }
  #session-dialog input { width: 100%; padding: 0.4rem; font: inherit;
    color: inherit; background: #191919; border: 1px solid #77736c; }
  #session-dialog button { padding: 0.35rem 0.65rem; font: inherit;
    color: inherit; background: #333; border: 1px solid #77736c; cursor: pointer; }
  #session-dialog a { color: #f2d45c; }
  #session-dialog nav { display: flex; gap: 0.6rem; align-items: center; margin-top: 1rem; }
  #session-dialog nav a { margin-right: auto; font-size: 14px; }
</style>
<button id="session-open" type="button" aria-label="Save session" title="Save session (Ctrl+Shift+S)" hidden>Save</button>
<dialog id="session-dialog" aria-labelledby="session-title">
  <form id="session-form">
    <h2 id="session-title">Save session</h2>
    <p id="session-detail" role="status"></p>
    <p>Keep the program’s latest checkpoint, files and agent history in this browser.
      Save again to keep later changes.</p>
    <label for="session-name">Session name</label>
    <input id="session-name" name="name" required minlength="1" maxlength="64"
      pattern="[A-Za-z0-9._\\-]+" autocomplete="off" spellcheck="false">
    <nav>
      <a id="session-list" target="_blank" rel="noopener">Saved sessions ↗</a>
      <button id="session-close" type="button">Close</button>
      <button id="session-save" type="submit">Save</button>
    </nav>
  </form>
</dialog>`;

// The Save button, its dialog and Ctrl+Shift+S. A save captures the session
// delta through the snapshot mailbox and keeps it in this browser. The page
// describes the running image once its ENTRY starts; restored names the
// session this page booted from, if any.
export function mountSessionSave({ keyboard, showStatus, applicationBase }, transport, restored) {
  document.body.insertAdjacentHTML("beforeend", markup);
  const button = document.querySelector("#session-open");
  const dialog = document.querySelector("#session-dialog");
  const nameField = document.querySelector("#session-name");
  const detail = document.querySelector("#session-detail");
  const saveButton = document.querySelector("#session-save");
  const dataset = document.documentElement.dataset;
  let base, sessionName = null, lastSave = null, saveError = "";
  let saving = null, controller = null, rebuiltBaseVerified = false;

  function update(message) {
    const failed = dataset.sessionStatus === "failed";
    button.toggleAttribute("data-failed", failed);
    button.textContent = failed ? "Save failed" : lastSave
      ? `Save · ${lastSave.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}`
      : sessionName ? "Save · restored" : "Save · not saved";
    button.title = message ?? (lastSave
      ? `Last saved ${lastSave.toLocaleTimeString()} · Ctrl+Shift+S saves again`
      : sessionName ? `Restored ${sessionName} · Ctrl+Shift+S saves changes`
      : "Not saved yet · Ctrl+Shift+S saves this session");
    detail.textContent = message ?? (lastSave
      ? `${sessionName} · Last saved ${lastSave.toLocaleTimeString()}.`
      : sessionName ? `Restored ${sessionName}. Later changes need another save.`
      : "Not saved yet. Refreshing or closing this tab loses its changes.");
  }

  function open() {
    if (document.pointerLockElement) document.exitPointerLock();
    nameField.value = sessionName ?? base?.image ?? "session";
    update(dataset.sessionStatus === "failed" ? `Save failed: ${saveError}` : undefined);
    dialog.showModal();
    nameField.focus();
    nameField.select();
  }

  button.addEventListener("click", open);
  document.querySelector("#session-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => keyboard.focus({ preventScroll: true }));
  document.querySelector("#session-list").href = publicURL("sessions/", applicationBase).href;
  document.querySelector("#session-form").addEventListener("submit", event => {
    event.preventDefault();
    void save(nameField.value.trim()).catch(() => {});
  });

  async function save(requestedName) {
    if (saving) return saving;
    saving = (async () => {
      if (!base) throw new Error("Dolly is not ready to save a session");
      if (base.custom) await loadCustomImage(base.custom.source, base.custom.artifact);
      if (!base.custom && base.systemSnapshot !== null && !rebuiltBaseVerified) {
        const { DOLLY_SYSTEM_SNAPSHOT: metadata } = await import(
          `../../dist/dolly-${base.image}-system-snapshot.mjs`);
        if (metadata.image !== base.image || metadata.buildId !== DOLLY_IMAGE_BUILD_ID ||
            metadata.byteLength !== base.systemSnapshot.byteLength || metadata.sha256 !== await sha256(base.systemSnapshot)) {
          throw new Error("Rebuilt filesystem differs from the prebuilt session base; no session was saved");
        }
        rebuiltBaseVerified = true;
      }
      let name = requestedName ?? sessionName;
      if (name === null) {
        name = window.prompt("Save Dolly session as:", "");
        if (name === null) return null;
        name = name.trim();
      }
      if (!validSessionName(name)) {
        throw new Error("Session names use 1-64 letters, numbers, '.', '_' or '-'");
      }
      if (name !== sessionName && await loadStoredSession(name) !== null &&
          !window.confirm(`Replace the saved session '${name}'?`)) return null;
      showStatus(`Saving ${name}…`, true);
      dataset.sessionStatus = "capturing";
      update(`Saving ${name}…`);
      button.disabled = nameField.disabled = saveButton.disabled = true;
      controller = new AbortController();
      const capture = async onChunk => {
        const result = await transport().capture(name, { signal: controller.signal, onChunk });
        dataset.sessionUncompressedBytes = String(onChunk ? result : result.byteLength);
        dataset.sessionStatus = "compressing";
        return result;
      };
      const encoded = await encodeSessionStream(capture);
      dataset.sessionStatus = "storing";
      const encodedSize = encoded.bytes.byteLength;
      try {
        await saveStoredSession({
          name,
          formatVersion: DOLLY_SESSION_FORMAT_VERSION,
          buildId: DOLLY_BUILD_ID,
          image: base.image,
          imageIdentity: base.identity,
          ...(base.custom ? { customImage: base.custom } : {}),
          updatedAt: Date.now(),
          encoding: encoded.encoding,
          bytes: encoded.bytes,
        });
      } finally { encoded.bytes.transfer(0); }
      sessionName = name;
      lastSave = new Date();
      dataset.session = name;
      dataset.sessionBytes = String(encodedSize);
      dataset.sessionStatus = "saved";
      history.replaceState(null, "", sessionLoadUrl(name, applicationBase));
      showStatus(`Saved ${name} locally · /sessions lists your saves`);
      update();
      return name;
    })().catch((error) => {
      dataset.sessionStatus = "failed";
      saveError = error instanceof Error ? error.message : String(error);
      showStatus(`Save failed: ${saveError}`, true);
      update(`Save failed: ${saveError}`);
      throw error;
    }).finally(() => {
      saving = null;
      controller = null;
      button.disabled = nameField.disabled = saveButton.disabled = false;
    });
    return saving;
  }

  return {
    get name() { return sessionName; },
    save,
    // The dialog and the Save button keep their keys; Ctrl+Shift+S saves, the
    // first time through the dialog.
    claimsKey(event) {
      if (dialog.open || button.contains(event.target)) return true;
      if (!base || !event.ctrlKey || !event.shiftKey || event.altKey || event.metaKey || event.code !== "KeyS") return false;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.type === "keydown" && !event.repeat) {
        if (sessionName === null) open();
        else void save().catch(() => {});
      }
      return true;
    },
    // custom is the running custom image record (Dollyfile, artifact and
    // what the tab inherited); systemSnapshot is the rebuilt base, or null
    // when packaged. The identity names the base a session restores onto.
    entryStarted({ image, custom, systemSnapshot }) {
      base = { image, custom, systemSnapshot,
        identity: custom ? customSessionIdentity(custom) : sessionImageIdentity(DOLLY_IMAGES, image) };
      if (restored?.recovering) {
        dataset.sessionStatus = "recovered";
        showStatus(`Recovered files in /workspace/recovered-${restored.name}. Ctrl+Shift+S saves this as a new session.`, true);
      } else if (restored) {
        sessionName = restored.name;
        dataset.session = restored.name;
        dataset.sessionStatus = "restored";
      }
      button.hidden = false;
      update();
    },
    abort() { controller?.abort(new Error("The runtime stopped; the previous save is unchanged")); },
  };
}
