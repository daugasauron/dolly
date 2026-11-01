import { DollyProcessSupervisor } from "../../src/process-supervisor.mjs";
import { createLeaseBridge } from "./lease-bridge.mjs";
import { instantiateKernelPlugin } from "../../src/kernel-plugin.mjs";
import { DOLLY_ERRNO as E } from "./abi.mjs";
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

// The terminal mailbox (abi/dolly-supervisor-0.wat), the Worker's end: the
// foreground command, shell results and the page's interrupt request, with or
// without a display.
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

  // The terminal's interrupt character (termios VINTR) while it signals, or 0.
  foregroundInterruptKey() {
    return Atomics.load(this.words, TerminalMailbox.foregroundInterruptible);
  }

  foregroundInterruptible() {
    return this.foregroundInterruptKey() !== 0;
  }

  // The interrupt key, or a caller with none to give: Wasm interrupts the
  // foreground command read here only if it still owns the terminal. False
  // (ISIG clear, or another key) lets the key reach it as input.
  interruptForeground(key) {
    const pid = this.foregroundPid();
    if (pid <= 0 || !this.foregroundInterruptible() || (key !== undefined && key !== this.foregroundInterruptKey())) return false;
    Atomics.store(this.words, TerminalMailbox.interruptTargetPid, pid);
    Atomics.add(this.words, TerminalMailbox.interruptSequence, 1);
    return true;
  }
}

// The page's terminal: the foreground program and its interrupt key as the
// Worker last reported them; the shell's results and interrupts, asked of the
// Worker, which decides on what it holds then.
export function browser({ ask }) {
  let foreground = { pid: 0, interrupt: 0 };
  const terminal = {
    foregroundPid: () => foreground.pid,
    foregroundInterruptKey: () => foreground.interrupt,
    foregroundInterruptible: () => foreground.interrupt !== 0,
    currentResultSequence: () => ask({ type: "terminal-result-sequence" }),
    waitForResult: sequence => ask({ type: "terminal-result", sequence }),
    interruptForeground: key => ask({ type: "terminal-interrupt", key }),
  };
  return {
    terminal,
    page: { terminal, get foregroundPid() { return foreground.pid; } },
    messages: { "terminal-foreground"({ pid, interrupt }) { foreground = { pid, interrupt }; } },
  };
}

export function worker({ send, runtimeBase, abi, service }) {
  const memory = new WebAssembly.Memory({ initial: 1024n, maximum: 131072n, shared: true, address: "i64" });
  // The kernel's memory and a process's grow in a Worker of their own
  // (grower.mjs) while this one waits. Chrome counts a shared memory as
  // external memory of the isolate that grows it; past twice its heap limit it
  // then collects between every message of this one, and every system call
  // takes fifteen times as long.
  const grower = new Worker(new URL("./grower.mjs", import.meta.url), { type: "module", name: "dolly-memory" });
  const growing = new Promise((resolve, reject) => {
    grower.onmessage = resolve;
    grower.onerror = event => reject(new Error(event.message || "the memory Worker failed"));
  });
  // The old size in pages, or -1: this thread sees the new size when it returns.
  const grow = (target, pages) => {
    const control = new SharedArrayBuffer(16), values = new BigInt64Array(control), word = new Int32Array(control);
    values[0] = pages;
    grower.postMessage({ memory: target, control });
    while (Atomics.load(word, 2) === 0) Atomics.wait(word, 2, 0);
    const old = values[0];
    // This thread learns of the growth by an interrupt, which a wait that
    // found it done already does not take: take it before the new pages are
    // touched, as a loop does at each turn.
    if (old >= 0n) while (BigInt(target.buffer.byteLength) < (old + pages) * 65536n);
    return old;
  };
  let supervisor, threadProvider, terminal, reported = "";
  // The foreground program, sent to the page when it changes.
  function reportForeground() {
    if (!terminal) return;
    const foreground = { pid: terminal.foregroundPid(), interrupt: terminal.foregroundInterruptKey() };
    const text = JSON.stringify(foreground);
    if (text === reported) return;
    reported = text;
    send({ type: "terminal-foreground", ...foreground });
  }
  // Modules served inside the process Worker of the executables that record
  // them, by requirement: the bundle (a Blob) that Worker imports and the
  // configuration its serve() receives.
  const processModules = new Map();
  // The bytes a kernel import names, or null: inside kernel memory, at most `limit`.
  const span = (address, length, limit) => {
    const [start, size] = [address, length].map(Number);
    return start >= 0 && size >= 0 && size <= limit && start <= memory.buffer.byteLength - size
      ? new Uint8Array(memory.buffer, start, size) : null;
  };
  return {
    memory,
    // Before the kernel runs: it must not ask for memory before the Worker that grows it waits.
    growing,
    get terminal() { return terminal; },
    reportForeground,
    service: reportForeground,
    messages: {
      "terminal-result-sequence": () => terminal.currentResultSequence(),
      "terminal-result": ({ sequence }) => terminal.waitForResult(sequence),
      "terminal-interrupt": ({ key }) => terminal.interruptForeground(key),
    },
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
      "env.dolly_memory_grow": pages => grow(memory, pages),
      // Web Crypto rejects views of shared memory: fill a private buffer, then copy.
      "env.dolly_entropy": (address, length) => {
        const bytes = span(address, length, maxEntropy);
        if (!bytes) return -E.EINVAL;
        bytes.set(crypto.getRandomValues(new Uint8Array(bytes.length)));
        return 0;
      },
    },
    // Both follow their modules, which nena@0 may enable or disable while the
    // supervisor runs: undefined takes the provider or the module away.
    setThreadProvider(provider) {
      threadProvider = provider;
      if (provider) { if (supervisor) supervisor.threadHost = provider; }
      else supervisor?.withdrawThreads();
    },
    serveInProcess(requirement, module) {
      if (module) processModules.set(requirement, module); else processModules.delete(requirement);
    },
    async supervisor(kernel) {
      return supervisor ??= await DollyProcessSupervisor.create(kernel, memory, runtimeBase, abi, service, threadProvider, processModules, grow);
    },
    start({ kernel }) {
      terminal = new TerminalMailbox(memory.buffer, Number(kernel.dolly_terminal_mailbox_address()));
      reportForeground();
    },
    serviceDeferred() { supervisor?.serviceDeferred(); },
    // Services deferred work each time the page notifies words[index], a
    // module's mailbox word, until the returned function is called.
    serviceOnNotify(words, index) {
      let stopped = false;
      const wait = () => void Promise.resolve(Atomics.waitAsync(words, index, Atomics.load(words, index)).value)
        .then(() => { if (stopped) return; supervisor?.serviceDeferred(); wait(); });
      wait();
      return () => { stopped = true; };
    },
    // A resident library linked into the kernel (--dolly-kernel-plugin), such as the display's.
    kernelPlugin(bytes, kernel) { return instantiateKernelPlugin(bytes, kernel, memory); },
    // The Worker side of a device a module leases per process (src/device-lease.c).
    leaseBridge(lease, mailbox, send) {
      return createLeaseBridge(lease, memory, mailbox, send, () => supervisor?.serviceDeferred());
    },
    dispose() { supervisor?.dispose(); grower.terminate(); },
  };
}
