import { DOLLY_ERRNO as E } from "../../dist/dolly-errno.mjs";
export { DOLLY_DOWNLOAD_ABI_DIGEST as digest } from "./abi.mjs";

const maximum = 64 * 1024 * 1024;
// Requests awaiting the user's Save/Dismiss click; more fail with EBUSY.
const maxPending = 4;
const maxRetainedUrls = 4;
// No separators, controls or bidi controls that could disguise the saved name.
function validName(name) {
  return typeof name === "string" && name.length > 0 && name.length <= 255 &&
    name !== "." && name !== ".." &&
    !/[\/\\\u0000-\u001f\u007f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(name);
}

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
  function revoke(url) {
    const index = urls.indexOf(url);
    if (index >= 0) urls.splice(index, 1);
    URL.revokeObjectURL(url);
  }
  function save(name, bytes) {
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
    urls.push(url);
    if (urls.length > maxRetainedUrls) revoke(urls[0]);
    setTimeout(() => revoke(url), 60_000);
    const link = document.createElement("a");
    link.href = url; link.download = name;
    link.click();
  }
  return {
    configuration: { pending: pending.buffer },
    messages: {
      download({ name, bytes }) {
        if (!validName(name) || !(bytes instanceof ArrayBuffer) || bytes.byteLength > maximum) {
          throw new Error("Dolly supplied an invalid download request");
        }
        const item = document.createElement("li");
        item.dataset.name = name;
        const button = (label, action) => {
          const element = document.createElement("button");
          element.type = "button";
          element.textContent = label;
          element.addEventListener("click", () => {
            action();
            item.remove();
            panel.hidden = panel.childElementCount === 0;
            Atomics.sub(pending, 0, 1);
            keyboard?.focus({ preventScroll: true });
          }, { once: true });
          return element;
        };
        const size = bytes.byteLength < 1024 * 1024 ? `${Math.ceil(bytes.byteLength / 1024)} KiB`
          : `${(bytes.byteLength / 1024 / 1024).toFixed(1)} MiB`;
        item.append(button(`Save ${name} (${size})`, () => save(name, bytes)), button("Dismiss", () => {}));
        panel.append(item);
        panel.hidden = false;
        document.documentElement.dataset.downloadName = name;
      },
    },
    claimsKey: event => panel.contains(event.target),
    dispose() { panel.remove(); for (const url of [...urls]) revoke(url); },
  };
}

export function worker({ send, get, configuration }) {
  const decode = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  const pending = new Int32Array(configuration.pending);
  return { bindings: { "env.dolly_download_dispatch": (nameAddress, nameLength, dataAddress, dataLength) => {
    const memory = get("runtime").memory.buffer;
    const [start, length, data, size] = [nameAddress, nameLength, dataAddress, dataLength].map(Number);
    if (![start, length, data, size].every(Number.isSafeInteger) || start < 0 || data < 0 ||
        length < 1 || length > 255 || size < 0 || size > maximum ||
        start > memory.byteLength - length || data > memory.byteLength - size) return -E.EINVAL;
    let name;
    try { name = decode.decode(new Uint8Array(memory, start, length).slice()); }
    catch { return -E.EINVAL; }
    if (!validName(name)) return -E.EINVAL;
    if (Atomics.add(pending, 0, 1) >= maxPending) {
      Atomics.sub(pending, 0, 1);
      return -E.EBUSY;
    }
    const bytes = new Uint8Array(memory, data, size).slice();
    send({ type: "download", name, bytes: bytes.buffer }, [bytes.buffer]);
    return 0;
  } } };
}
