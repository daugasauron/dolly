import { DOLLY_ERRNO } from "../../dist/dolly-errno.mjs";
import { DollyProcessSupervisor } from "../../src/process-supervisor.mjs";

export function check() {
  if (!globalThis.crossOriginIsolated) return "cross-origin isolation is required";
  try { new WebAssembly.Memory({ initial: 1n, maximum: 1n, shared: true, address: "i64" }); }
  catch { return "shared WebAssembly memory64 is unavailable"; }
  return null;
}

// Bootstrap text only feeds the page's 1 MiB log; one write never sends more.
const maxBootstrapMessage = 1024 * 1024;

// The terminal mailbox (abi/dolly-supervisor-0.wat): the foreground command,
// shell results and the page's interrupt request, with or without a display.
class TerminalMailbox {
  static resultSequence = 0;
  static resultStatus = 1;
  static foregroundPid = 2;
  static foregroundInterruptible = 3;
  static interruptSequence = 4;
  static interruptTargetPid = 5;

  constructor(buffer, address) {
    if (!(buffer instanceof SharedArrayBuffer) || !Number.isSafeInteger(address) ||
        address <= 0 || address % 4 !== 0 || address > buffer.byteLength - 24) {
      throw new Error("Dolly supplied an invalid terminal mailbox");
    }
    this.words = new Int32Array(buffer, address, 6);
  }

  currentResultSequence() {
    return Atomics.load(this.words, TerminalMailbox.resultSequence);
  }

  async waitForResult(sequence) {
    while (Atomics.load(this.words, TerminalMailbox.resultSequence) === sequence) {
      const waiting = Atomics.waitAsync(this.words, TerminalMailbox.resultSequence, sequence);
      if (waiting.async) await waiting.value;
    }
    return Atomics.load(this.words, TerminalMailbox.resultStatus);
  }

  foregroundPid() {
    return Atomics.load(this.words, TerminalMailbox.foregroundPid);
  }

  foregroundInterruptible() {
    return Atomics.load(this.words, TerminalMailbox.foregroundInterruptible) !== 0;
  }

  // Ctrl-C: Wasm interrupts the foreground command read here only if it still
  // owns the terminal. False lets the key reach the interactive shell.
  interruptForeground() {
    const pid = this.foregroundPid();
    if (pid <= 0 || !this.foregroundInterruptible()) return false;
    Atomics.store(this.words, TerminalMailbox.interruptTargetPid, pid);
    Atomics.add(this.words, TerminalMailbox.interruptSequence, 1);
    return true;
  }
}

export function browser() {
  let terminal;
  return {
    get terminal() { return terminal; },
    start(message) { terminal = new TerminalMailbox(message.memory, message.address); },
  };
}

export function worker({ send, applicationBase, abi, service }) {
  const memory = new WebAssembly.Memory({ initial: 1024n, maximum: 131072n, shared: true, address: "i64" });
  let supervisor, threadProvider;
  const text = value => `${String(value).slice(-maxBootstrapMessage)}\n`;
  return {
    memory,
    setThreadProvider(provider) {
      if (supervisor || threadProvider) throw new Error("thread provider already initialized");
      threadProvider = provider;
    },
    options: {
      wasmMemory: memory,
      bootstrapWriteBytes: bytes => send({ type: "bootstrap-bytes",
        bytes: bytes.length > maxBootstrapMessage ? bytes.slice(-maxBootstrapMessage) : bytes }),
      print: value => send({ type: "bootstrap", text: text(value) }),
      printErr: value => send({ type: "bootstrap", text: text(value), error: true }),
    },
    async supervisor(dolly) {
      return supervisor ??= await DollyProcessSupervisor.create(dolly, memory, applicationBase, abi, service, threadProvider);
    },
    start({ dolly }) {
      return { memory: memory.buffer, address: Number(dolly._dolly_terminal_mailbox_address()) };
    },
    serviceDeferred() { supervisor?.serviceDeferred(); },
    dispose() { supervisor?.dispose(); },
  };
}

export function installOutputDevices(dolly) {
  for (const [path, number] of [["/dev/dolly-stdout", 1], ["/dev/dolly-stderr", 2]]) {
    const device = dolly.FS.makedev(80, number);
    dolly.FS.registerDevice(device, {
      read() { return 0; },
      write(_stream, buffer, offset, length) {
        if (buffer.length - offset < length) {
          throw Object.assign(new Error("invalid WasmFS device write range"), { errno: DOLLY_ERRNO.EFAULT });
        }
        dolly._dolly_terminal_write_bytes(BigInt(buffer.byteOffset + offset), BigInt(length));
        return length;
      },
    });
    dolly.FS.mkdev(path, 0o222, device);
  }
}
