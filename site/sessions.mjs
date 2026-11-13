import { DOLLY_IMAGE_BUILD_ID } from "../page/generated.mjs";
import { DOLLY_IMAGES, loadImages } from "../page/images.mjs";
import {
  DOLLY_SESSION_FORMAT_VERSION, listStoredSessions, sessionCompatible,
  sessionLoadUrl, validSessionName,
  loadStoredSession, saveStoredSession, deleteStoredSession,
} from "./session-store.mjs";
import { exportSessionFile, importSessionFile } from "./session-file.mjs";
import { clearPackStore, packStoreSize } from "../page/pack-store.mjs";
import { clearRuntime, keepRuntime, runtimeKept } from "./offline.mjs";

const site = new URL("../", import.meta.url);

// The sessions page is the site's own: its images are the site's.
await loadImages(new URL("../", import.meta.url));

const invalidName = "Names use 1–64 letters, numbers, '.', '_' or '-'.";
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
    status.textContent = error.name === "ConstraintError" ? "That name already exists. Try again with another name." : error.message;
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
    const compatible = sessionCompatible(record, DOLLY_IMAGES, DOLLY_IMAGE_BUILD_ID);
    const recoverable = !compatible && validSessionName(record.name) &&
      record.formatVersion === DOLLY_SESSION_FORMAT_VERSION && DOLLY_IMAGES.some(({ image }) => image === "system");
    const name = document.createElement(validSessionName(record.name) && compatible ? "a" : "span");
    name.textContent = record.name;
    if (name.tagName === "A") name.href = sessionLoadUrl(record.name, new URL("../", import.meta.url));
    const detail = document.createElement("small");
    detail.textContent = `${record.image} · ${new Date(record.updatedAt).toLocaleString()} · ` +
      `${(record.byteLength / 1024 / 1024).toFixed(1)} MiB` +
      (compatible ? "" : " · Made on another build of this version; saved data retained.");
    const actions = document.createElement("div");
    for (const [label, action] of [
      ...(recoverable ? [["Recover files", () => {
        const url = sessionLoadUrl(record.name, new URL("../", import.meta.url));
        url.searchParams.set("recover", "1");
        location.assign(url);
      }]] : []),
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
      // The save under its new name first, then the old one removed: an interruption leaves both.
      ["Rename", async () => {
        const name = window.prompt(`Rename '${record.name}' to:`, record.name)?.trim();
        if (!name || name === record.name) return;
        if (!validSessionName(name)) throw new Error(invalidName);
        const saved = await loadStoredSession(record.name);
        if (!saved) throw new Error("Session no longer exists. Reload the list.");
        await saveStoredSession({ ...saved, name }, { overwrite: false });
        await deleteStoredSession(record.name);
        await refresh();
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
  const kept = await packStoreSize().catch(() => ({ count: 0, bytes: 0 }));
  document.querySelector("#pack-store").textContent = `Images started on this site keep their downloads in this browser, ` +
    `so they start again without downloading them: ${(kept.bytes / 1024 / 1024).toFixed(1)} MiB in ${kept.count} packs. ` +
    (await runtimeKept(site).catch(() => false) ? "The runtime is kept too: saved sessions open without a network. "
      : "Saving a session keeps the runtime too, so that saves open without a network. ") +
    (await navigator.storage.persisted() ? "The browser keeps them and the saves until they are cleared."
      : "The browser may remove them and the saves when it runs short of space; a save asks it not to.");
  document.documentElement.dataset.sessionsStatus = "ready";
}

document.querySelector("#clear-packs").addEventListener("click", () => void operation(async () => {
  await clearPackStore();
  await clearRuntime(site).catch(() => {});
  await refresh();
}));

input.addEventListener("change", () => {
  const file = input.files[0];
  input.value = "";
  if (!file) return;
  void operation(async () => {
    status.textContent = "Checking session file…";
    const record = await importSessionFile(file);
    // The modules the save starts with: its image's, or for a custom image those its Dollyfile
    // names, which the file's own digest does not vouch for (docs/sessions.md).
    const modules = record.image === "custom"
      ? (await import("./dollyfile-view.mjs")).inspectDollyfile(record.customImage.source).hostRequirements
      : DOLLY_IMAGES.find(({ image }) => image === record.image)?.hostRequirements;
    const name = window.prompt(`Import session as (it starts ${record.image} with ` +
      `${modules?.join(", ") ?? "host modules this release does not list"}):`, record.name);
    if (name === null) { await refresh(); return; }
    record.name = name.trim();
    if (!validSessionName(record.name)) throw new Error(invalidName);
    await saveStoredSession(record, { overwrite: false });
    await keepRuntime(site).catch(() => {});
    await refresh();
  });
});

try { await refresh(); }
catch (error) {
  status.textContent = `Could not read local saves: ${error.message}. Browser storage may be unavailable.`;
  document.documentElement.dataset.sessionsStatus = "failed";
}
