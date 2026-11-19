import { DollyProcessSupervisor } from "../../page/process-supervisor.mjs";
import { createLeaseBridge } from "./lease-bridge.mjs";
import { instantiateKernelPlugin } from "../../page/kernel-plugin.mjs";
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
// What the kernel reads of a build's input in one call: its window.
const maxBuildInputRead = 8 * 1024 * 1024;

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
// Worker, which decides on what it holds then. And the Workers the runtime
// Worker's processes run in, which the page makes for it (pageWorkers below).
export function browser({ ask, send }) {
  let foreground = { pid: 0, interrupt: 0 };
  const terminal = {
    foregroundPid: () => foreground.pid,
    foregroundInterruptKey: () => foreground.interrupt,
    foregroundInterruptible: () => foreground.interrupt !== 0,
    currentResultSequence: () => ask({ type: "terminal-result-sequence" }),
    waitForResult: sequence => ask({ type: "terminal-result", sequence }),
    interruptForeground: key => ask({ type: "terminal-interrupt", key }),
  };
  const workers = new Map();
  return {
    terminal,
    page: { terminal, get foregroundPid() { return foreground.pid; } },
    messages: {
      "terminal-foreground"({ pid, interrupt }) { foreground = { pid, interrupt }; },
      "worker-start"({ id, url, options, port }) {
        // Only from the runtime Worker's own code: the process Worker's bundle or a module holder.
        if (new URL(url).protocol !== "blob:") throw new Error("a process Worker's code is a blob: URL");
        const worker = new Worker(url, options);
        workers.set(id, worker);
        worker.onerror = event => { event.preventDefault(); send({ type: "worker-error", id, message: event.message }); };
        worker.postMessage({ supervisor: port }, [port]);
      },
      "worker-end"({ id }) {
        workers.get(id)?.terminate();
        workers.delete(id);
      },
    },
    dispose() { for (const worker of workers.values()) worker.terminate(); },
  };
}

// A Worker the page makes for this one, which reaches it on the port the page
// sends it first: in Firefox 159, new Worker() in a Worker whose other Workers
// were ending waited for good, one launch in a few under load
// (tasks/20261117-090000-dh-34); the page's never did. A process's, a thread's, a module
// holder and packages@0's are the page's. It has a Worker's postMessage,
// terminate and events.
function pageWorkers(send) {
  const workers = new Map();
  let last = 0;
  return {
    create(url, options) {
      const id = ++last, { port1, port2 } = new MessageChannel(), worker = new EventTarget();
      port1.onmessage = ({ data }) => worker.dispatchEvent(new MessageEvent("message", { data }));
      port1.onmessageerror = () => worker.dispatchEvent(new Event("messageerror"));
      worker.postMessage = (message, transfer) => port1.postMessage(message, transfer);
      worker.terminate = () => {
        port1.close();
        if (workers.delete(id)) send({ type: "worker-end", id });
      };
      workers.set(id, worker);
      send({ type: "worker-start", id, url: String(url), options, port: port2 }, [port2]);
      return worker;
    },
    failed(id, message) { workers.get(id)?.dispatchEvent(new ErrorEvent("error", { message, cancelable: true })); },
  };
}

export function worker({ send, runtimeBase, abi, service }) {
  const memory = new WebAssembly.Memory({ initial: 1024n, maximum: 131072n, shared: true, address: "i64" });
  // The kernel's memory grows in a Worker of its own (grower.mjs) while this
  // one waits. Chrome counts a shared memory as external memory of the isolate
  // that grows it; past twice its heap limit it then collects between every
  // message of this one, and every system call takes fifteen times as long.
  // A process's memory never reaches this Worker (process-supervisor.mjs).
  const growerUrl = new URL("./grower.mjs", import.meta.url);
  const grower = new Worker(growerUrl, { type: "module", name: "dolly-memory" });
  const control = new SharedArrayBuffer(16), values = new BigInt64Array(control), word = new Int32Array(control);
  // Once the grower holds the memory and waits on the word.
  const growing = new Promise((resolve, reject) => {
    grower.onmessage = resolve;
    grower.onerror = event => reject(new Error(event.message || "the memory Worker failed"));
  });
  grower.postMessage({ memory, control });
  // The old size in pages, or -1: this thread sees the new size when it returns.
  const grow = pages => {
    values[0] = pages;
    Atomics.store(word, 2, 1);
    Atomics.notify(word, 2);
    // A notify can be the grower's for the last growth, whose wait found it
    // done already: this one is done when the word says so.
    while (Atomics.load(word, 2) === 1) Atomics.wait(word, 2, 1);
    const old = values[0];
    // This thread learns of the growth by an interrupt, which a wait that
    // found it done already does not take: take it before the kernel touches
    // the new pages, as a loop does at each turn.
    if (old >= 0n) while (BigInt(memory.buffer.byteLength) < (old + pages) * 65536n);
    return old;
  };
  let supervisor, threadProvider, terminal, reported = "";
  // The Blobs of a build's input images, which the build Worker sets: the
  // kernel reads them as files (dolly_build_input), never anything else.
  let buildInputs = [];
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
  const workers = pageWorkers(send);
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
      "worker-error": ({ id, message }) => workers.failed(id, message),
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
      "env.dolly_memory_grow": grow,
      // Web Crypto rejects views of shared memory: fill a private buffer, then copy.
      "env.dolly_entropy": (address, length) => {
        const bytes = span(address, length, maxEntropy);
        if (!bytes) return -E.EINVAL;
        bytes.set(crypto.getRandomValues(new Uint8Array(bytes.length)));
        return 0;
      },
      // Synchronous: the kernel reads inside a system call.
      "env.dolly_build_input_read": (input, offset, address, length) => {
        const blob = buildInputs[input], bytes = span(address, length, maxBuildInputRead), start = Number(offset);
        if (!blob || !bytes || start < 0 || start > blob.size - bytes.length) return -E.EINVAL;
        try { bytes.set(new Uint8Array(new FileReaderSync().readAsArrayBuffer(blob.slice(start, start + bytes.length)))); }
        catch { return -E.EIO; }
        return 0;
      },
    },
    setBuildInputs(blobs) { buildInputs = blobs; },
    // A Worker the page makes, from a blob: URL (pageWorkers above).
    pageWorker: workers.create,
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
      return supervisor ??= await DollyProcessSupervisor.create(kernel, memory, runtimeBase, abi, service, threadProvider, processModules,
        workers.create);
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
    // The Worker side of a device a module leases per process (kernel/device-lease.c).
    leaseBridge(lease, mailbox, send) {
      return createLeaseBridge(lease, memory, mailbox, send, () => supervisor?.serviceDeferred());
    },
    dispose() { supervisor?.dispose(); grower.terminate(); },
  };
}
