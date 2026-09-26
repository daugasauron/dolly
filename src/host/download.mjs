import { DOLLY_ERRNO as E } from "../../dist/dolly-errno.mjs";

export const contract = Object.freeze({ name: "download", version: 0, header: "dolly/download.h",
  abi: ["dolly-download-0"], dependencies: ["runtime@0"], imports: ["env.dolly_download_dispatch"] });
const maximum = 64 * 1024 * 1024;
function validName(name) {
  return typeof name === "string" && name.length > 0 && name.length <= 255 &&
    name !== "." && name !== ".." && !/[\/\\\u0000-\u001f\u007f]/u.test(name);
}

export function browser() {
  const urls = new Map();
  let count = 0;
  function release(url) { clearTimeout(urls.get(url)); urls.delete(url); URL.revokeObjectURL(url); }
  return {
    messages: {
      download({ name, bytes }) {
        if (!validName(name) || !(bytes instanceof ArrayBuffer) || bytes.byteLength > maximum) {
          throw new Error("Dolly supplied an invalid download request");
        }
        const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
        urls.set(url, setTimeout(() => release(url), 60_000));
        const link = document.createElement("a");
        link.hidden = true; link.href = url; link.download = name;
        document.body.append(link); link.click(); link.remove();
        document.documentElement.dataset.downloadCount = String(++count);
        document.documentElement.dataset.downloadName = name;
      },
    },
    dispose() { for (const url of urls.keys()) release(url); },
  };
}

export function worker({ send, get }) {
  const decode = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
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
    const bytes = new Uint8Array(memory, data, size).slice();
    send({ type: "download", name, bytes: bytes.buffer }, [bytes.buffer]);
    return 0;
  } } };
}
