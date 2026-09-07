import { DOLLY_ERRNO as errno } from "../dist/dolly-errno.mjs";

export const UPLOAD_MAX_BYTES = 64 * 1024 * 1024;
const chunkCapacity = 65536;
const pause = () => new Promise(resolve => setTimeout(resolve, 25));

// Mailbox v0: user-selected bytes only. The browser never receives a path.
export class UploadTransport {
  constructor(buffer, address, chooseFile) {
    if (!(buffer instanceof SharedArrayBuffer) || !Number.isSafeInteger(address) ||
        address <= 0 || address % 4 || address > buffer.byteLength - 64 - chunkCapacity) {
      throw new TypeError("invalid upload mailbox");
    }
    this.words = new Int32Array(buffer, address, 16);
    this.bytes = new Uint8Array(buffer, address + 64, chunkCapacity);
    this.chooseFile = chooseFile;
    this.active = null;
    Atomics.store(this.words, 8, 1);
  }

  async poll() {
    const words = this.words;
    const sequence = Atomics.load(words, 0);
    if (this.active || sequence === Atomics.load(words, 2)) return;
    const controller = new AbortController();
    this.active = controller;
    const cancelled = () => Atomics.load(words, 0) !== sequence ||
      Atomics.load(words, 1) === sequence || controller.signal.aborted;
    const timer = setInterval(() => { if (cancelled()) controller.abort(); }, 25);
    const publish = async (bytes, eof, error = 0) => {
      while (Atomics.load(words, 3) !== Atomics.load(words, 4)) {
        if (cancelled()) return;
        await pause();
      }
      if (cancelled()) return;
      this.bytes.set(bytes);
      Atomics.store(words, 5, bytes.length);
      Atomics.store(words, 6, error);
      Atomics.store(words, 7, eof ? 1 : 0);
      Atomics.add(words, 3, 1);
    };
    try {
      if (cancelled()) return;
      const file = await this.chooseFile(controller.signal);
      if (!file) {
        await publish(new Uint8Array(), true, errno.ECANCELED);
      } else if (!(file instanceof Blob) || file.size > UPLOAD_MAX_BYTES) {
        await publish(new Uint8Array(), true, errno.EFBIG);
      } else {
        for (let offset = 0; offset < file.size && !cancelled(); offset += chunkCapacity) {
          const bytes = new Uint8Array(await file.slice(offset, offset + chunkCapacity).arrayBuffer());
          await publish(bytes, offset + bytes.length === file.size);
        }
        if (file.size === 0) await publish(new Uint8Array(), true);
      }
    } catch {
      await publish(new Uint8Array(), true, errno.EIO);
    } finally {
      controller.abort();
      clearInterval(timer);
      Atomics.store(words, 2, sequence);
      this.active = null;
    }
  }

  close() { Atomics.store(this.words, 8, 0); this.active?.abort(); }
}

export function chooseUploadFile(signal) {
  return new Promise(resolve => {
    const dialog = document.createElement("dialog");
    dialog.id = "file-upload";
    dialog.innerHTML = `<form method="dialog"><p>Upload one file into Dolly</p>
      <p>Up to 64 MiB. Only the file you choose enters the sandbox.</p>
      <input type="file" aria-label="Choose file to upload"><button>Cancel</button></form>`;
    const finish = file => {
      signal.removeEventListener("abort", abort);
      dialog.close();
      dialog.remove();
      resolve(file);
    };
    const abort = () => finish(null);
    dialog.addEventListener("cancel", event => { event.preventDefault(); finish(null); });
    dialog.querySelector("form").addEventListener("submit", event => { event.preventDefault(); finish(null); });
    const input = dialog.querySelector("input");
    input.addEventListener("change", () => finish(input.files[0] ?? null));
    input.addEventListener("cancel", () => finish(null));
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) { finish(null); return; }
    document.body.append(dialog);
    if (document.pointerLockElement) document.exitPointerLock();
    dialog.showModal();
  });
}
