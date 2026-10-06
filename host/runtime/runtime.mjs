import { DollyProcessSupervisor } from "../../src/process-supervisor.mjs";
import { DOLLY_ERRNO as E } from "../../src/process-constants.mjs";
import { DOLLY_TERMINAL_WORD_RESULT_SEQUENCE, DOLLY_TERMINAL_WORD_RESULT_STATUS, DOLLY_TERMINAL_WORD_FOREGROUND_PID,
  DOLLY_TERMINAL_WORD_FOREGROUND_INTERRUPTIBLE, DOLLY_TERMINAL_WORD_INTERRUPT_SEQUENCE,
  DOLLY_TERMINAL_WORD_INTERRUPT_TARGET_PID } from "./abi.mjs";

export function check() {
  if (!globalThis.crossOriginIsolated) return "cross-origin isolation is required";
  try { new WebAssembly.Memory({ initial: 1n, maximum: 1n, shared: true, address: "i64" }); }
  catch { return "shared WebAssembly memory64 is unavailable"; }
  return null;
}

// Bootstrap text only feeds the page's 1 MiB log; a longer write is refused.
const maxBootstrapMessage = 1024 * 1024;
// What crypto.getRandomValues fills in one call.
const maxEntropy = 65536;

// The terminal mailbox (abi/dolly-supervisor-0.wat): the foreground command,
// shell results and the page's interrupt request, with or without a display.
class TerminalMailbox {
  static resultSequence = DOLLY_TERMINAL_WORD_RESULT_SEQUENCE;
  static resultStatus = DOLLY_TERMINAL_WORD_RESULT_STATUS;
  static foregroundPid = DOLLY_TERMINAL_WORD_FOREGROUND_PID;
  static foregroundInterruptible = DOLLY_TERMINAL_WORD_FOREGROUND_INTERRUPTIBLE;
  static interruptSequence = DOLLY_TERMINAL_WORD_INTERRUPT_SEQUENCE;
  static interruptTargetPid = DOLLY_TERMINAL_WORD_INTERRUPT_TARGET_PID;

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
  // owns the terminal. False (ISIG clear) lets the key reach it as input.
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
    page: { get terminal() { return terminal; }, get foregroundPid() { return terminal.foregroundPid(); } },
    start(message) { terminal = new TerminalMailbox(message.memory, message.address); },
  };
}

export function worker({ send, applicationBase, abi, service }) {
  const memory = new WebAssembly.Memory({ initial: 1024n, maximum: 131072n, shared: true, address: "i64" });
  let supervisor, threadProvider;
  // The bytes a kernel import names, or null: inside kernel memory, at most `limit`.
  const span = (address, length, limit) => {
    const [start, size] = [address, length].map(Number);
    return start >= 0 && size >= 0 && size <= limit && start <= memory.buffer.byteLength - size
      ? new Uint8Array(memory.buffer, start, size) : null;
  };
  return {
    memory,
    bindings: {
      "env.memory": memory,
      "env.dolly_bootstrap_write_bytes": (address, length) => {
        const bytes = span(address, length, maxBootstrapMessage);
        if (!bytes) return -E.EINVAL;
        send({ type: "bootstrap-bytes", bytes: bytes.slice() });
        return 0;
      },
      "env.dolly_clock_realtime": () => Date.now(),
      "env.dolly_clock_monotonic": () => performance.now(),
      // Web Crypto rejects views of shared memory: fill a private buffer, then copy.
      "env.dolly_entropy": (address, length) => {
        const bytes = span(address, length, maxEntropy);
        if (!bytes) return -E.EINVAL;
        bytes.set(crypto.getRandomValues(new Uint8Array(bytes.length)));
        return 0;
      },
    },
    setThreadProvider(provider) {
      if (supervisor || threadProvider) throw new Error("thread provider already initialized");
      threadProvider = provider;
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
