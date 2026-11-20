import { DOLLY_IMAGE_BUILD_ID } from "../../page/generated.mjs";
import { DOLLY_IMAGES } from "../../page/images.mjs";
import {
  DOLLY_SESSION_FORMAT_VERSION,
  customSessionIdentity,
  encodeSessionStream,
  loadStoredSession,
  saveStoredSession,
  sessionImageIdentity,
  sessionLoadUrl,
  validSessionName,
} from "./session-store.mjs";
import { keepRuntime } from "./offline.mjs";

// An adopted style sheet, which a page's style-src without 'unsafe-inline' allows.
const style = `
  #session-dialog { width: min(420px, calc(100vw - 2rem)); padding: 1.2rem;
    background: var(--dolly-ui-background); color: inherit; border: 1px solid var(--dolly-ui-quiet); font: inherit; }
  #session-dialog::backdrop { background: #0008; }
  #session-dialog h2 { margin: 0 0 1rem; font-size: 20px; }
  #session-dialog p { font-size: 14px; line-height: 1.5; }
  #session-dialog label { display: block; margin: 1rem 0 0.4rem; }
  #session-dialog input { width: 100%; padding: 0.4rem; font: inherit;
    color: inherit; background: var(--dolly-ui-sunken); border: 1px solid var(--dolly-ui-quiet); }
  #session-dialog button { padding: 0.35rem 0.65rem; font: inherit;
    color: inherit; background: var(--dolly-ui-raised); border: 1px solid var(--dolly-ui-quiet); cursor: pointer; }
  #session-dialog a { color: var(--dolly-ui-accent); }
  #session-dialog nav { display: flex; gap: 0.6rem; align-items: center; margin-top: 1rem; }
  #session-dialog nav a { margin-right: auto; font-size: 14px; }
`;
const markup = `<dialog id="session-dialog" aria-labelledby="session-title">
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

// Ctrl+Shift+S and its dialog, and the status line says how a save went: the
// page shows no button of its own for it. A save captures the session
// delta through the snapshot mailbox and keeps it in this browser. The page
// describes the running image once its ENTRY starts; restored names the
// session this page booted from, if any. A save names itself in the tab's URL
// (the site's session route, or ?session= on a page of one's own), and on a
// page with a site the dialog links the site's list of saves.
export function mountSessionSave({ mount, keyboard, showStatus, site }, transport, restored) {
  const look = new CSSStyleSheet();
  look.replaceSync(style);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, look];
  mount.insertAdjacentHTML("beforeend", markup);
  const dialog = document.querySelector("#session-dialog");
  const nameField = document.querySelector("#session-name");
  const detail = document.querySelector("#session-detail");
  const saveButton = document.querySelector("#session-save");
  const dataset = document.documentElement.dataset;
  let base, sessionName = null, lastSave = null, saveError = "";
  let saving = null, controller = null;
  // When the save this tab restored or last made was stored: a later one is another tab's.
  let knownSave = null;
  // Whether processes changed files since the last capture began (the kernel's
  // count, snapshot.mjs), and whether any change was reported since the last save
  // that was stored: a failed save leaves it set.
  let changed = false, unsaved = false;
  // A tab of the site whose session was saved or restored asks, with the
  // browser's own prompt, before it is left with changes no save holds.
  if (site) addEventListener("beforeunload", event => { if (sessionName !== null && (changed || unsaved)) event.preventDefault(); });

  function update(message) {
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

  document.querySelector("#session-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => keyboard.focus({ preventScroll: true }));
  const list = document.querySelector("#session-list");
  if (site) list.href = new URL("sessions/", site).href; else list.remove();
  document.querySelector("#session-form").addEventListener("submit", event => {
    event.preventDefault();
    void save(nameField.value.trim()).catch(() => {});
  });

  async function save(requestedName) {
    if (saving) return saving;
    // A save asks the browser to keep the origin's storage: the saves and the
    // packs images start from (page/pack-store.mjs). Chrome answers from the
    // site's engagement, Firefox asks the user; the save does not wait.
    navigator.storage.persist().catch(() => {});
    saving = (async () => {
      if (!base) throw new Error("Dolly is not ready to save a session");
      let name = requestedName ?? sessionName;
      if (name === null) {
        name = window.prompt("Save Dolly session as:", "");
        if (name === null) return null;
        name = name.trim();
      }
      if (!validSessionName(name)) {
        throw new Error("Session names use 1-64 letters, numbers, '.', '_' or '-'");
      }
      const before = dataset.sessionStatus;
      dataset.sessionStatus = "capturing";
      const stored = await loadStoredSession(name);
      if (stored !== null && (name !== sessionName ? !window.confirm(`Replace the saved session '${name}'?`)
        : stored.updatedAt !== knownSave && !window.confirm(`'${name}' was saved from another tab at ` +
          `${new Date(stored.updatedAt).toLocaleTimeString()}. Replace that save with this tab's files?`))) {
        if (before === undefined) delete dataset.sessionStatus; else dataset.sessionStatus = before;
        return null;
      }
      showStatus(`Saving ${name}…`, true);
      update(`Saving ${name}…`);
      nameField.disabled = saveButton.disabled = true;
      controller = new AbortController();
      const capture = async onChunk => {
        const result = await transport().capture({ signal: controller.signal, onChunk });
        dataset.sessionUncompressedBytes = String(onChunk ? result : result.byteLength);
        dataset.sessionStatus = "compressing";
        return result;
      };
      const encoded = await encodeSessionStream(capture);
      dataset.sessionStatus = "storing";
      const encodedSize = encoded.bytes.size, updatedAt = Date.now();
      await saveStoredSession({
        name,
        formatVersion: DOLLY_SESSION_FORMAT_VERSION,
        buildId: DOLLY_IMAGE_BUILD_ID,
        image: base.image,
        imageIdentity: base.identity,
        ...(base.custom ? { customImage: base.custom } : {}),
        updatedAt,
        encoding: encoded.encoding,
        bytes: encoded.bytes,
      });
      knownSave = updatedAt;
      unsaved = false;
      sessionName = name;
      lastSave = new Date();
      dataset.session = name;
      dataset.sessionBytes = String(encodedSize);
      dataset.sessionStatus = "saved";
      // A reload opens the save again: the site's session route, or on a page of
      // one's own the address's ?session=, which the page gives boot().
      const address = new URL(location.href);
      address.searchParams.set("session", name);
      history.replaceState(null, "", site ? sessionLoadUrl(name, site) : address);
      showStatus(`Saved ${name} locally${site ? " · /sessions lists your saves" : ""}`);
      update();
      // The site's runtime is kept beside the save, which then opens without a
      // network (offline.mjs); the save does not wait for it.
      if (site) void keepRuntime(site).then(() => "kept", () => "failed").then(state => { dataset.sessionOffline = state; });
      return name;
    })().catch((error) => {
      dataset.sessionStatus = "failed";
      // Chrome's error for a full store has no text.
      saveError = error?.name === "QuotaExceededError"
        ? "this browser has no room left for the site. Delete saves or clear downloads on the sessions page; the previous save is unchanged"
        : error instanceof Error ? error.message : String(error);
      showStatus(`Save failed: ${saveError}`, true);
      update(`Save failed: ${saveError}`);
      throw error;
    }).finally(() => {
      saving = null;
      controller = null;
      nameField.disabled = saveButton.disabled = false;
    });
    return saving;
  }

  return {
    get name() { return sessionName; },
    save,
    changed(value) { changed = value; unsaved ||= value; },
    // The dialog keeps its keys; Ctrl+Shift+S saves, the first time through the dialog.
    claimsKey(event) {
      if (dialog.open) return true;
      if (event.target !== document.body && !mount.contains(event.target)) return false;
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
    // what the tab inherited); the identity names the image the save was made on.
    entryStarted({ image, custom }) {
      base = { image, custom,
        identity: custom ? customSessionIdentity(custom) : sessionImageIdentity(DOLLY_IMAGES, image) };
      if (restored?.recovering) {
        dataset.sessionStatus = "recovered";
        showStatus(`Recovered files in /workspace/recovered-${restored.name}. Ctrl+Shift+S saves this as a new session.`, true);
      } else if (restored) {
        sessionName = restored.name;
        knownSave = restored.updatedAt;
        dataset.session = restored.name;
        dataset.sessionStatus = "restored";
      }
      update();
    },
    abort() { controller?.abort(new Error("The runtime stopped; the previous save is unchanged")); },
  };
}
