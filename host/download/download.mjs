import { DOLLY_ERRNO as E } from "../../dist/dolly-errno.mjs";
import { DOLLY_DOWNLOAD_OPEN, DOLLY_DOWNLOAD_WRITE, DOLLY_DOWNLOAD_CLOSE, DOLLY_DOWNLOAD_ABORT,
  DOLLY_DOWNLOAD_CHUNK_CAPACITY, DOLLY_DOWNLOAD_MAX_SIZE } from "./abi.mjs";
export { DOLLY_DOWNLOAD_ABI_DIGEST as digest } from "./abi.mjs";

// Offers awaiting the user's Save/Dismiss click, the open stream included; more fail with EBUSY.
const maxPending = 4;
const maxRetainedUrls = 4;
// No separators, controls or bidi controls that could disguise the saved name.
function validName(name) {
  return typeof name === "string" && name.length > 0 && name.length <= 255 &&
    name !== "." && name !== ".." &&
    !/[\/\\\u0000-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(name);
}
const sizeLabel = bytes => bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KiB`
  : `${(bytes / 1024 / 1024).toFixed(1)} MiB`;

// Wasm can only ask. Each file reaches the browser's download manager through
// one user click on its Save button, never automatically.
export function browser({ keyboard }) {
  const pending = new Int32Array(new SharedArrayBuffer(4));
  const panel = document.createElement("ul");
  panel.id = "downloads";
  panel.setAttribute("aria-label", "Files Dolly offers to save");
  panel.hidden = true;
  document.body.append(panel);
  const urls = [];
  // The item of the stream the Worker is still receiving.
  let preparing = null;
  function revoke(url) {
    const index = urls.indexOf(url);
    if (index >= 0) urls.splice(index, 1);
    URL.revokeObjectURL(url);
  }
  function save(name, file) {
    const url = URL.createObjectURL(file);
    urls.push(url);
    if (urls.length > maxRetainedUrls) revoke(urls[0]);
    setTimeout(() => revoke(url), 60_000);
    const link = document.createElement("a");
    link.href = url; link.download = name;
    link.click();
  }
  function remove(item) {
    item.remove();
    panel.hidden = panel.childElementCount === 0;
  }
  return {
    configuration: { pending: pending.buffer },
    messages: {
      "download-progress"({ name, size }) {
        if (!validName(name) || !Number.isSafeInteger(size)) throw new Error("Dolly supplied an invalid download");
        if (!preparing) {
          preparing = document.createElement("li");
          preparing.dataset.name = name;
          panel.append(preparing);
          panel.hidden = false;
        }
        preparing.textContent = `Preparing ${name} (${sizeLabel(size)})`;
      },
      "download-abort"() {
        if (preparing) remove(preparing);
        preparing = null;
      },
      download({ name, file }) {
        if (!validName(name) || !(file instanceof Blob) || file.size > DOLLY_DOWNLOAD_MAX_SIZE) {
          throw new Error("Dolly supplied an invalid download request");
        }
        const item = preparing ?? document.createElement("li");
        preparing = null;
        item.dataset.name = name;
        const button = (label, action) => {
          const element = document.createElement("button");
          element.type = "button";
          element.textContent = label;
          element.addEventListener("click", () => {
            action();
            remove(item);
            Atomics.sub(pending, 0, 1);
            keyboard?.focus({ preventScroll: true });
          }, { once: true });
          return element;
        };
        item.replaceChildren(button(`Save ${name} (${sizeLabel(file.size)})`, () => save(name, file)),
          button("Dismiss", () => {}));
        panel.append(item);
        panel.hidden = false;
        document.documentElement.dataset.downloadName = name;
      },
    },
    claimsKey: event => panel.contains(event.target),
    dispose() { panel.remove(); for (const url of [...urls]) revoke(url); },
  };
}

// Each chunk becomes a Blob part at once through one staging buffer (a Blob
// copies its parts), so the Worker allocates nothing per chunk; the browser's
// Blob storage holds the file until it is saved.
export function worker({ send, get, configuration }) {
  const decode = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  const pending = new Int32Array(configuration.pending);
  const staging = new Uint8Array(DOLLY_DOWNLOAD_CHUNK_CAPACITY);
  let stream = null;
  return { bindings: { "env.dolly_download_dispatch": (operation, address, length) => {
    const memory = get("runtime").memory.buffer;
    const [start, size] = [address, length].map(Number);
    if (![start, size].every(Number.isSafeInteger) || start < 0 || size < 0 ||
        start > memory.byteLength - size) return -E.EINVAL;
    const span = new Uint8Array(memory, start, size);
    if (operation === DOLLY_DOWNLOAD_OPEN) {
      if (size < 1 || size > 255) return -E.EINVAL;
      let name;
      try { name = decode.decode(span.slice()); }
      catch { return -E.EINVAL; }
      if (!validName(name)) return -E.EINVAL;
      if (stream) return -E.EBUSY;
      if (Atomics.add(pending, 0, 1) >= maxPending) {
        Atomics.sub(pending, 0, 1);
        return -E.EBUSY;
      }
      stream = { name, parts: [], size: 0 };
      send({ type: "download-progress", name, size: 0 });
      return 0;
    }
    if (!stream) return -E.EBADF;
    if (operation === DOLLY_DOWNLOAD_WRITE) {
      if (size < 1 || size > DOLLY_DOWNLOAD_CHUNK_CAPACITY) return -E.EINVAL;
      if (size > DOLLY_DOWNLOAD_MAX_SIZE - stream.size) return -E.EFBIG;
      staging.set(span);
      stream.parts.push(new Blob([staging.subarray(0, size)]));
      stream.size += size;
      send({ type: "download-progress", name: stream.name, size: stream.size });
      return 0;
    }
    if (size !== 0 || ![DOLLY_DOWNLOAD_CLOSE, DOLLY_DOWNLOAD_ABORT].includes(operation)) return -E.EINVAL;
    if (operation === DOLLY_DOWNLOAD_CLOSE) {
      send({ type: "download", name: stream.name,
        file: new Blob(stream.parts, { type: "application/octet-stream" }) });
    } else {
      Atomics.sub(pending, 0, 1);
      send({ type: "download-abort" });
    }
    stream = null;
    return 0;
  } } };
}
