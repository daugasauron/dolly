import { DOLLY_ERRNO as errno } from "../../dist/dolly-errno.mjs";
import { DOLLY_UPLOAD_CHUNK_CAPACITY as chunkCapacity, DOLLY_UPLOAD_MAX_SIZE } from "./abi.mjs";

// After the user cancels, requests are refused briefly so the page stays usable.
export const UPLOAD_CANCEL_QUIET_MILLISECONDS = 2000;
const mebibytes = bytes => (bytes / 1048576).toFixed(1);

// Mailbox v1: user-selected bytes only, one chunk at a time. The browser never
// receives a path. chooseFile(controller) resolves to the file or null; the
// user's Cancel aborts the controller, before or during the transfer.
export class UploadTransport {
  constructor(buffer, address, chooseFile, showProgress = () => {}) {
    if (!(buffer instanceof SharedArrayBuffer) || !Number.isSafeInteger(address) ||
        address <= 0 || address % 4 || address > buffer.byteLength - 64 - chunkCapacity) {
      throw new TypeError("invalid upload mailbox");
    }
    this.words = new Int32Array(buffer, address, 16);
    this.bytes = new Uint8Array(buffer, address + 64, chunkCapacity);
    this.chooseFile = chooseFile;
    this.showProgress = showProgress;
    this.active = null;
    this.quietUntil = 0;
    Atomics.store(this.words, 8, 1);
  }

  async poll() {
    const words = this.words;
    const sequence = Atomics.load(words, 0);
    if (this.active || sequence === Atomics.load(words, 2)) return;
    const controller = new AbortController();
    this.active = controller;
    // The kernel retired this request: its process ended or a new one began.
    const retired = () => Atomics.load(words, 0) !== sequence || Atomics.load(words, 1) === sequence;
    const timer = setInterval(() => { if (retired()) controller.abort(); }, 25);
    let size = 0;
    const publish = async (bytes, eof, error = 0) => {
      // The kernel notifies the consumed word after writing each chunk.
      for (let consumed; (consumed = Atomics.load(words, 4)) !== Atomics.load(words, 3);) {
        if (retired()) return;
        await Atomics.waitAsync(words, 4, consumed, 25).value;
      }
      if (retired()) return;
      this.bytes.set(bytes);
      Atomics.store(words, 5, bytes.length);
      Atomics.store(words, 6, error);
      Atomics.store(words, 7, eof ? 1 : 0);
      Atomics.store(words, 9, size);
      Atomics.add(words, 3, 1);
    };
    // The user's Cancel, in the picker or during the transfer.
    const cancel = () => {
      if (!retired()) this.quietUntil = performance.now() + UPLOAD_CANCEL_QUIET_MILLISECONDS;
      return publish(new Uint8Array(), true, errno.ECANCELED);
    };
    try {
      if (retired()) return;
      if (performance.now() < this.quietUntil) {
        await publish(new Uint8Array(), true, errno.ECANCELED);
        return;
      }
      const file = await this.chooseFile(controller);
      if (!file) await cancel();
      else if (!(file instanceof Blob) || file.size > DOLLY_UPLOAD_MAX_SIZE) {
        await publish(new Uint8Array(), true, errno.EFBIG);
      } else {
        // One reused staging buffer: reading allocates nothing per chunk.
        const reader = file.stream().getReader({ mode: "byob" });
        let staging = new ArrayBuffer(chunkCapacity), sent = 0;
        size = file.size;
        do {
          const length = Math.min(chunkCapacity, size - sent);
          for (let filled = 0; filled < length;) {
            const { value, done } = await reader.read(new Uint8Array(staging, filled, length - filled));
            if (done) throw new Error("the file changed while uploading");
            staging = value.buffer;
            filled += value.length;
          }
          if (controller.signal.aborted) {
            void reader.cancel().catch(() => {});
            break;
          }
          sent += length;
          await publish(new Uint8Array(staging, 0, length), sent === size);
          this.showProgress(sent, size);
        } while (sent < size);
        if (sent < size) await cancel();
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

// One modal dialog per request: the picker, then progress until the transfer ends.
export function chooseUploadFile(controller) {
  return new Promise(resolve => {
    const { signal } = controller;
    if (signal.aborted) { resolve(null); return; }
    const dialog = document.createElement("dialog");
    dialog.id = "file-upload";
    dialog.innerHTML = `<form method="dialog"><p>Upload one file into Dolly</p>
      <p>Up to ${DOLLY_UPLOAD_MAX_SIZE / 1073741824} GiB. Only the file you choose enters the sandbox.</p>
      <input type="file" aria-label="Choose file to upload"><progress hidden></progress>
      <output></output><button>Cancel</button></form>`;
    const cancel = event => { event?.preventDefault(); controller.abort(); };
    dialog.addEventListener("cancel", cancel);
    dialog.querySelector("form").addEventListener("submit", cancel);
    const [title, note] = dialog.querySelectorAll("p");
    const input = dialog.querySelector("input");
    input.addEventListener("cancel", cancel);
    input.addEventListener("change", () => {
      const file = input.files[0];
      if (!file) { cancel(); return; }
      title.textContent = `Uploading ${file.name}`;
      note.hidden = input.hidden = true;
      dialog.querySelector("progress").hidden = false;
      showUploadProgress(0, file.size);
      resolve(file);
    });
    signal.addEventListener("abort", () => { dialog.close(); dialog.remove(); resolve(null); }, { once: true });
    document.body.append(dialog);
    if (document.pointerLockElement) document.exitPointerLock();
    dialog.showModal();
  });
}

export function showUploadProgress(sent, size) {
  const progress = document.querySelector("#file-upload progress");
  if (!progress) return;
  progress.max = size;
  progress.value = sent;
  document.querySelector("#file-upload output").textContent = `${mebibytes(sent)} of ${mebibytes(size)} MiB`;
}
