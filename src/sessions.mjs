import { DOLLY_BUILD_ID } from "../dist/dolly-build-id.mjs";
import { DOLLY_IMAGES } from "../dist/dolly-images.mjs";
import {
  DOLLY_SESSION_FORMAT_VERSION, listStoredSessions, sessionImageIdentity,
  sessionLoadUrl, validSessionName,
} from "./session-store.mjs";

const status = document.querySelector("#status");
try {
  const sessions = await listStoredSessions();
  const list = document.querySelector("#sessions");
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
    item.append(name, detail);
    list.append(item);
  }
  status.textContent = sessions.length ? `${sessions.length} saved session${sessions.length === 1 ? "" : "s"}.` :
    "No saved sessions yet. Open an image and press Ctrl+Shift+S.";
  document.documentElement.dataset.sessionsStatus = "ready";
} catch (error) {
  status.textContent = `Could not read local saves: ${error.message}. Browser storage may be unavailable.`;
  document.documentElement.dataset.sessionsStatus = "failed";
}
