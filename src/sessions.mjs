import { DOLLY_BUILD_ID } from "../dist/dolly-build-id.mjs";
import { DOLLY_IMAGES } from "../dist/dolly-images.mjs";
import {
  DOLLY_SESSION_FORMAT_VERSION, listStoredSessions, sessionImageIdentity,
  sessionLoadUrl, validSessionName,
  loadStoredSession, saveStoredSession, deleteStoredSession,
} from "./session-store.mjs";
import { exportSessionFile, importSessionFile } from "./session-file.mjs";

const status = document.querySelector("#status");
const input = document.querySelector("#import-session");
let busy = false;
async function operation(action) {
  if (busy) return;
  busy = true;
  input.disabled = true;
  document.querySelectorAll("button").forEach(button => { button.disabled = true; });
  try { await action(); }
  catch (error) {
    status.textContent = error.name === "ConstraintError" ? "That name already exists. Import again with another name." : error.message;
  } finally {
    busy = false;
    input.disabled = false;
    document.querySelectorAll("button").forEach(button => { button.disabled = false; });
  }
}

async function refresh() {
  const sessions = await listStoredSessions();
  const list = document.querySelector("#sessions");
  list.replaceChildren();
  for (const record of sessions) {
    const item = document.createElement("li");
    const compatible = record.formatVersion === DOLLY_SESSION_FORMAT_VERSION &&
      record.buildId === DOLLY_BUILD_ID && DOLLY_IMAGES.some(({ image }) => image === record.image) &&
      record.imageIdentity === sessionImageIdentity(DOLLY_IMAGES, record.image);
    const name = document.createElement(validSessionName(record.name) && compatible ? "a" : "span");
    name.textContent = record.name;
    if (name.tagName === "A") name.href = sessionLoadUrl(record.name, new URL("../", import.meta.url));
    const detail = document.createElement("small");
    detail.textContent = `${record.image} · ${new Date(record.updatedAt).toLocaleString()} · ` +
      `${(record.byteLength / 1024).toFixed(1)} KiB` +
      (compatible ? "" : " · Older runtime or image; saved data retained, cannot load in this build.");
    const actions = document.createElement("div");
    for (const [label, action] of [
      ["Export", async () => {
        status.textContent = `Exporting ${record.name}…`;
        const saved = await loadStoredSession(record.name);
        if (!saved) throw new Error("Session no longer exists. Reload the list.");
        const url = URL.createObjectURL(await exportSessionFile(saved));
        const link = document.createElement("a");
        link.href = url; link.download = `${record.name}.dolly-session`;
        document.body.append(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        status.textContent = `Exported ${record.name}. The file contains credentials and is not encrypted.`;
      }],
      ["Delete", async () => {
        if (!window.confirm(`Delete the local save '${record.name}'? This cannot be undone. Export it first if you need a backup.`)) return;
        await deleteStoredSession(record.name);
        await refresh();
      }],
    ]) {
      const button = document.createElement("button");
      button.textContent = label;
      button.addEventListener("click", () => { void operation(action); });
      actions.append(button);
    }
    item.append(name, detail, actions);
    list.append(item);
  }
  status.textContent = sessions.length ? `${sessions.length} saved session${sessions.length === 1 ? "" : "s"}.` :
    "No saved sessions yet. Open an image and press Ctrl+Shift+S.";
  document.documentElement.dataset.sessionsStatus = "ready";
}

input.addEventListener("change", () => {
  const file = input.files[0];
  input.value = "";
  if (!file) return;
  void operation(async () => {
    status.textContent = "Checking session file…";
    const record = await importSessionFile(file);
    const name = window.prompt("Import session as:", record.name);
    if (name === null) { await refresh(); return; }
    record.name = name.trim();
    if (!validSessionName(record.name)) throw new Error("Names use 1–64 letters, numbers, '.', '_' or '-'; index.html is reserved.");
    await saveStoredSession(record, { overwrite: false });
    await refresh();
  });
});

try { await refresh(); }
catch (error) {
  status.textContent = `Could not read local saves: ${error.message}. Browser storage may be unavailable.`;
  document.documentElement.dataset.sessionsStatus = "failed";
}
