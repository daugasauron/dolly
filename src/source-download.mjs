import { DOLLY_STATIC_SOURCES } from "../dist/dolly-images.mjs";
import { boundedAssetBody, decodeStaticAsset, sha256 } from "./static-asset.mjs";

const base = new URL("../", import.meta.url);
const sources = new Map(DOLLY_STATIC_SOURCES.map(source => [new URL(source.path.slice(1), base).href, source]));
document.addEventListener("click", async event => {
  const link = event.target.closest("a.source"), source = sources.get(link?.href);
  if (event.button !== 0 || !source || source.byteLength <= 25 * 1024 * 1024) return;
  event.preventDefault();
  if (link.dataset.downloading) return;
  link.dataset.downloading = "true";
  const status = document.createElement("span");
  status.setAttribute("role", "status");
  status.textContent = " (downloading…)";
  link.after(status);
  try {
    const init = { credentials: "omit", redirect: "error", signal: AbortSignal.timeout(120000) };
    const response = await decodeStaticAsset(await fetch(link.href, init), link.href, init, source.byteLength);
    const bytes = await boundedAssetBody(response, source.byteLength, init.signal);
    if (bytes.length !== source.byteLength || await sha256(bytes) !== source.sha256) throw new Error("source integrity mismatch");
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
    const download = document.createElement("a");
    download.href = url;
    download.download = source.path.split("/").at(-1);
    download.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.remove();
  } catch (error) { status.textContent = ` (download failed: ${error.message})`; }
  finally { delete link.dataset.downloading; }
});
