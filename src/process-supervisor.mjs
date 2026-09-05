import { DOLLY_PROCESS_ABI_DIGEST } from "../dist/dolly-process-abi.mjs";

const encoder = new TextEncoder();
const packetLimit = 1024 * 1024;
const spawnHeaderSize = 56;
const inheritEnvironment = 1;
const deferredResult = -(1n << 63n);
const interruptPoll = 66;
const sigint = 2;
const interruptedSystemCall = -4n;
const interruptGraceMilliseconds = 500;
const compiledModuleCacheEntries = 64;
const compiledModuleCacheBytes = 256 * 1024 * 1024;
const compilationNoticeMilliseconds = 250;
const largeInteractiveProcessBytes = 128 * 1024 * 1024;
const workerReclamationMilliseconds = 500;

function hex(bytes) {
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function terminalFailureReason(error) {
  const message = error instanceof Error ? error.message : String(error);
  const firstLine = message.split(/[\r\n]/, 1)[0]
    .replace(/[^\x20-\x7e]/g, "?")
    .slice(0, 512);
  return firstLine || "unknown Worker failure";
}

function encodeStrings(strings, label) {
  if (!Array.isArray(strings)) throw new TypeError(`${label} must be an array`);
  const encoded = [];
  let size = 0;
  for (const value of strings) {
    if (typeof value !== "string" || value.includes("\0")) {
      throw new TypeError(`${label} contains an invalid string`);
    }
    const bytes = encoder.encode(value);
    if (bytes.length + 1 > packetLimit - size) throw new RangeError(`${label} is too large`);
    encoded.push(bytes);
    size += bytes.length + 1;
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const bytes of encoded) {
    output.set(bytes, offset);
    offset += bytes.length + 1;
  }
  return output;
}

function encodeSpawn(path, arguments_, environment, descriptors) {
  if (typeof path !== "string" || !path.startsWith("/") || path.includes("\0")) {
    throw new TypeError("a process path must be absolute");
  }
  if (!Array.isArray(arguments_) || arguments_.length === 0) {
    throw new TypeError("a process needs argv[0]");
  }
  const pathBytes = encoder.encode(path);
  const argumentBytes = encodeStrings(arguments_, "process arguments");
  const environmentBytes = environment === undefined
    ? new Uint8Array() : encodeStrings(environment, "process environment");
  const size = spawnHeaderSize + pathBytes.length +
    argumentBytes.length + environmentBytes.length;
  if (pathBytes.length === 0 || pathBytes.length > 4096 || size > packetLimit) {
    throw new RangeError("process spawn packet is too large");
  }
  if (!Array.isArray(descriptors) || descriptors.length !== 3 ||
      descriptors.some((value) => !Number.isInteger(value) || value < 0)) {
    throw new TypeError("process descriptors must contain stdin, stdout, and stderr");
  }

  const packet = new Uint8Array(size);
  const view = new DataView(packet.buffer);
  view.setUint32(0, environment === undefined ? inheritEnvironment : 0, true);
  view.setUint32(4, arguments_.length, true);
  view.setUint32(8, environment?.length ?? 0, true);
  view.setUint32(12, 0, true);
  view.setUint32(16, descriptors[0], true);
  view.setUint32(20, descriptors[1], true);
  view.setUint32(24, descriptors[2], true);
  view.setUint32(28, pathBytes.length, true);
  view.setBigUint64(32, BigInt(argumentBytes.length), true);
  view.setBigUint64(40, BigInt(environmentBytes.length), true);
  view.setBigUint64(48, 0xffffffffffffffffn, true);
  let offset = spawnHeaderSize;
  packet.set(pathBytes, offset);
  offset += pathBytes.length;
  packet.set(argumentBytes, offset);
  offset += argumentBytes.length;
  packet.set(environmentBytes, offset);
  return packet;
}

function processMemoryRequirements(module) {
  const sections = WebAssembly.Module.customSections(module, "dolly.process.memory");
  if (sections.length !== 1 || sections[0].byteLength !== 16) {
    throw new TypeError("process executable has invalid memory requirements");
  }
  const view = new DataView(sections[0]);
  const initial = view.getBigUint64(0, true);
  const maximum = view.getBigUint64(8, true);
  if (initial < 1n || maximum < initial || maximum > 131072n) {
    throw new TypeError("process executable memory requirements are out of range");
  }
  return { initial, maximum };
}

function validateProcessModule(module) {
  const imports = WebAssembly.Module.imports(module);
  if (imports.length !== 2 ||
      imports[0].module !== "env" || imports[0].name !== "memory" ||
      imports[0].kind !== "memory" ||
      imports[1].module !== "dolly_process_0" || imports[1].name !== "call" ||
      imports[1].kind !== "function") {
    throw new TypeError("process executable imports do not match dolly-process-0");
  }
  const entry = WebAssembly.Module.exports(module).find(
    (item) => item.name === "_start" && item.kind === "function",
  );
  if (!entry) throw new TypeError("process executable does not export _start");
  const stamps = WebAssembly.Module.customSections(module, "dolly.process");
  if (stamps.length !== 1 || hex(stamps[0]) !== DOLLY_PROCESS_ABI_DIGEST) {
    throw new TypeError("process executable has the wrong dolly.process stamp");
  }
  return processMemoryRequirements(module);
}

function createProcessMemory({ initial, maximum }) {
  return new WebAssembly.Memory({
    initial,
    maximum,
    shared: true,
    address: "i64",
  });
}

export class DollyProcessSupervisor {
  constructor(dolly, kernelMemory, gateModule, workerUrl) {
    if (!(kernelMemory instanceof WebAssembly.Memory) ||
        !(gateModule instanceof WebAssembly.Module) || !(workerUrl instanceof URL)) {
      throw new TypeError("invalid Dolly process supervisor configuration");
    }
    this.dolly = dolly;
    this.kernelMemory = kernelMemory;
    this.gateModule = gateModule;
    this.workerUrl = workerUrl;
    this.processes = new Map();
    this.deferred = new Map();
    this.compiledModules = new Map();
    this.compiledModuleBytes = 0;
    this.launchChain = Promise.resolve();
    this.foregroundRootPid = 0;
    this.mailboxAddress = Number(dolly._dolly_process_mailbox_address());
    this.mailboxCapacity = Number(dolly._dolly_process_mailbox_capacity());
    if (dolly._dolly_process_supervisor_version() !== 0 ||
        !Number.isSafeInteger(this.mailboxAddress) || this.mailboxAddress <= 0 ||
        this.mailboxCapacity !== packetLimit ||
        this.mailboxAddress > kernelMemory.buffer.byteLength - this.mailboxCapacity) {
      throw new Error("Dolly kernel supplied an invalid process mailbox");
    }
    this.serviceTimer = setInterval(() => this.#serviceTick(), 16);
  }

  static async create(dolly, kernelMemory, applicationBase) {
    const response = await fetch(new URL("dist/dolly-process-gate-0.wasm", applicationBase), {
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
    });
    if (!response.ok) throw new Error(`Dolly process gate returned HTTP ${response.status}`);
    const gateModule = await WebAssembly.compile(await response.arrayBuffer());
    return new DollyProcessSupervisor(
      dolly,
      kernelMemory,
      gateModule,
      new URL("./process-worker.mjs", import.meta.url),
    );
  }

  spawn(path, arguments_, {
    environment = undefined,
    descriptors = [0, 1, 2],
    foreground = false,
    interactive = false,
  } = {}) {
    if (typeof foreground !== "boolean" || typeof interactive !== "boolean" ||
        (interactive && !foreground)) {
      throw new TypeError("invalid process foreground options");
    }
    if (foreground && this.foregroundRootPid !== 0) {
      throw new Error("Dolly already has a foreground process tree");
    }
    const packet = encodeSpawn(path, arguments_, environment, descriptors);
    new Uint8Array(
      this.kernelMemory.buffer,
      this.mailboxAddress,
      packet.length,
    ).set(packet);
    const pid = this.dolly._dolly_process_spawn_serialized(BigInt(packet.length));
    if (pid < 0) throw new Error(`Dolly process spawn failed with errno ${-pid}`);
    const completion = new Promise((resolve, reject) => {
      this.processes.set(pid, {
        pid, parent: 0, resolve, reject, worker: null, gate: null, control: null,
        memory: null, messageHandler: null, errorHandler: null,
        messageErrorHandler: null, started: false,
        failure: null, foregroundRoot: foreground, interactive,
        interruptTimer: null, deadlineTimer: null,
      });
    });
    if (foreground) {
      this.foregroundRootPid = pid;
      this.#updateForeground();
    }
    this.#scheduleLaunches();
    return completion;
  }

  #descendsFrom(process, ancestorPid) {
    let candidate = process;
    for (let depth = 0; depth < this.processes.size; ++depth) {
      if (candidate.parent === ancestorPid) return true;
      if (candidate.parent === 0) return false;
      candidate = this.processes.get(candidate.parent);
      if (!candidate) return false;
    }
    return false;
  }

  #updateForeground() {
    if (this.foregroundRootPid === 0) return;
    const root = this.processes.get(this.foregroundRootPid);
    if (!root) {
      this.dolly._dolly_process_foreground_clear(this.foregroundRootPid);
      this.foregroundRootPid = 0;
      return;
    }
    const hasForegroundJob = root.interactive && [...this.processes.values()].some(
      (process) => process.pid !== root.pid && this.#descendsFrom(process, root.pid),
    );
    const status = this.dolly._dolly_process_foreground_set(
      root.pid, root.interactive ? Number(hasForegroundJob) : 1,
    );
    if (status !== 0) throw new Error(`Dolly rejected foreground process ${root.pid}`);
  }

  #serviceTick() {
    const displayStatus = this.dolly._dolly_terminal_present_pending();
    if (displayStatus !== 0) {
      throw new Error(`Dolly terminal presentation failed with status ${displayStatus}`);
    }
    const interrupted = this.dolly._dolly_process_take_interrupt();
    if (interrupted > 0) this.#interruptForeground(interrupted);
    this.serviceDeferred();
  }

  #interruptForeground(pid) {
    const process = this.processes.get(pid);
    if (!process) return false;
    if (!process.foregroundRoot || !process.interactive) return this.#deliverSignal(process);
    const descendants = [...this.processes.values()].filter(
      (candidate) => candidate.pid !== pid && this.#descendsFrom(candidate, pid),
    );
    if (descendants.length === 0) return this.#deliverSignal(process);
    for (const child of descendants) this.#deliverSignal(child);
    return true;
  }

  #deliverSignal(process) {
    if (!this.processes.has(process.pid)) return false;
    if (this.dolly._dolly_process_signal(process.pid, sigint) !== 0) {
      return this.interrupt(process.pid);
    }
    const deferred = this.deferred.get(process.pid);
    if (deferred) {
      this.deferred.delete(process.pid);
      this.#signal(process, deferred.message.sequence, interruptedSystemCall);
    }
    if (process.interruptTimer === null) {
      process.interruptTimer = setTimeout(() => {
        process.interruptTimer = null;
        this.interrupt(process.pid);
      }, interruptGraceMilliseconds);
    }
    return true;
  }

  #scheduleLaunches() {
    this.launchChain = this.launchChain
      .then(() => this.#launchPending())
      .catch((error) => {
        for (const process of this.processes.values()) {
          this.#clearTimers(process);
          if (process.reject) process.reject(error);
          this.#disposeWorker(process);
          this.dolly._dolly_process_worker_failed(process.pid, 126);
        }
        for (const process of this.processes.values()) {
          this.dolly._dolly_process_collect(process.pid);
        }
        this.deferred.clear();
        this.processes.clear();
        this.#updateForeground();
      });
  }

  async #compileProcess(bytes) {
    const digest = hex(await crypto.subtle.digest("SHA-256", bytes));
    const key = `${bytes.byteLength}:${digest}`;
    const cached = this.compiledModules.get(key);
    if (cached) {
      this.compiledModules.delete(key);
      this.compiledModules.set(key, cached);
      return cached;
    }

    const started = performance.now();
    let noticeShown = false;
    const notice = setTimeout(() => {
      noticeShown = true;
      const mebibytes = (bytes.byteLength / (1024 * 1024)).toFixed(1);
      this.#writeTerminal(
        `\r\ndolly: preparing ${mebibytes} MiB WebAssembly executable for this session...\r\n`,
      );
    }, compilationNoticeMilliseconds);
    let module;
    let memoryRequirements;
    let prepared = false;
    try {
      module = await WebAssembly.compile(bytes);
      memoryRequirements = validateProcessModule(module);
      prepared = true;
    } finally {
      clearTimeout(notice);
      if (noticeShown) {
        this.#writeTerminal(
          prepared
            ? `dolly: executable ready in ${((performance.now() - started) / 1000).toFixed(1)}s\r\n`
            : "dolly: executable preparation failed\r\n",
        );
      }
    }
    const compiled = { module, memoryRequirements, byteLength: bytes.byteLength };
    if (bytes.byteLength <= compiledModuleCacheBytes) {
      this.compiledModules.set(key, compiled);
      this.compiledModuleBytes += bytes.byteLength;
      while (this.compiledModules.size > compiledModuleCacheEntries ||
             this.compiledModuleBytes > compiledModuleCacheBytes) {
        const oldestKey = this.compiledModules.keys().next().value;
        const oldest = this.compiledModules.get(oldestKey);
        this.compiledModules.delete(oldestKey);
        this.compiledModuleBytes -= oldest.byteLength;
      }
    }
    return compiled;
  }

  #writeTerminal(text) {
    const bytes = encoder.encode(text);
    const address = this.dolly._malloc(BigInt(Math.max(1, bytes.byteLength)));
    if (address === 0 || address === 0n) return;
    try {
      new Uint8Array(
        this.kernelMemory.buffer, Number(address), bytes.byteLength,
      ).set(bytes);
      this.dolly._dolly_terminal_write_bytes(
        BigInt(address), BigInt(bytes.byteLength),
      );
    } finally {
      this.dolly._free(BigInt(address));
    }
  }

  async #launchPending() {
    for (;;) {
      const pid = this.dolly._dolly_process_next_launch();
      if (pid === 0) return;
      let process = this.processes.get(pid);
      if (!process) {
        const parent = this.dolly._dolly_process_parent(pid);
        if (parent <= 0) throw new Error(`kernel supplied an invalid parent for process ${pid}`);
        process = {
          pid, parent, resolve: null, reject: null, worker: null, gate: null, control: null,
          memory: null, messageHandler: null, errorHandler: null,
          messageErrorHandler: null, started: false,
          failure: null, foregroundRoot: false, interactive: false,
          interruptTimer: null, deadlineTimer: null,
        };
        this.processes.set(pid, process);
      }
      const address = Number(this.dolly._dolly_process_image_address(pid));
      const size = Number(this.dolly._dolly_process_image_size(pid));
      if (!Number.isSafeInteger(address) || !Number.isSafeInteger(size) ||
          address <= 0 || size < 8 || address > this.kernelMemory.buffer.byteLength - size) {
        throw new Error(`kernel supplied an invalid executable for process ${pid}`);
      }
      const bytes = new Uint8Array(size);
      bytes.set(new Uint8Array(this.kernelMemory.buffer, address, size));
      if (this.dolly._dolly_process_image_consumed(pid) !== 0) {
        throw new Error(`kernel did not release executable ${pid}`);
      }
      try {
        const { module, memoryRequirements } = await this.#compileProcess(bytes);
        const memory = createProcessMemory(memoryRequirements);
        const gate = await WebAssembly.instantiate(this.gateModule, {
          process: { memory },
          kernel: { memory: this.kernelMemory },
        });
        const control = new SharedArrayBuffer(16);
        const worker = new Worker(this.workerUrl, {
          type: "module",
          name: `dolly-process-${pid}`,
        });
        process.worker = worker;
        process.gate = gate;
        process.control = new Int32Array(control);
        process.memory = memory;
        process.messageHandler = (event) => this.#message(process, event.data);
        process.errorHandler = (event) => {
          this.#fail(process, new Error(event.message || `process ${pid} Worker failed`));
        };
        process.messageErrorHandler = () => {
          this.#fail(process, new Error(`process ${pid} Worker message could not be decoded`));
        };
        worker.addEventListener("message", process.messageHandler);
        worker.addEventListener("error", process.errorHandler, { once: true });
        worker.addEventListener("messageerror", process.messageErrorHandler, { once: true });
        worker.postMessage({ type: "configure", pid, module, memory, control });
        this.#armDeadline(process);
        this.#updateForeground();
      } catch (error) {
        this.#fail(process, error);
      }
    }
  }

  #signal(process, sequence, result) {
    const encoded = BigInt.asUintN(64, result);
    Atomics.store(process.control, 2, Number(encoded & 0xffffffffn));
    Atomics.store(process.control, 3, Number((encoded >> 32n) & 0xffffffffn));
    Atomics.store(process.control, 1, sequence);
    Atomics.notify(process.control, 1);
  }

  #armDeadline(process) {
    const remaining = this.dolly._dolly_process_deadline_remaining(process.pid);
    if (remaining === -1) return;
    if (!Number.isFinite(remaining) || remaining < 0 || remaining > 86_400_000) {
      this.#fail(process, new Error(`kernel supplied an invalid deadline for process ${process.pid}`));
      return;
    }
    process.deadlineTimer = setTimeout(
      () => this.#forceExit(process.pid, 124),
      Math.ceil(remaining),
    );
  }

  #clearTimers(process) {
    if (process.interruptTimer !== null) clearTimeout(process.interruptTimer);
    if (process.deadlineTimer !== null) clearTimeout(process.deadlineTimer);
    process.interruptTimer = null;
    process.deadlineTimer = null;
  }

  #syscall(process, message, retry = false) {
    const values = [
      message.sequence,
      message.operation,
      message.requestAddress,
      message.requestSize,
      message.responseAddress,
      message.responseCapacity,
    ];
    if (message.pid !== process.pid ||
        values.some((value) => !Number.isSafeInteger(value) || value < 0) ||
        message.requestSize > packetLimit || message.responseCapacity > packetLimit ||
        Atomics.load(process.control, 0) !== message.sequence ||
        Atomics.load(process.control, 1) === message.sequence) {
      this.#fail(process, new Error(`process ${process.pid} sent an invalid syscall`));
      return;
    }
    let result;
    try {
      process.gate.exports.request(
        BigInt(message.requestAddress),
        BigInt(this.mailboxAddress),
        BigInt(message.requestSize),
      );
      result = this.dolly._dolly_process_dispatch(
        process.pid,
        message.operation,
        BigInt(message.requestSize),
        BigInt(message.responseCapacity),
      );
      if (result === deferredResult) {
        this.deferred.set(process.pid, { process, message });
        return;
      }
      if (result >= 0n) {
        if (result > BigInt(message.responseCapacity)) {
          throw new Error(`kernel overfilled process ${process.pid} response`);
        }
        process.gate.exports.response(
          BigInt(this.mailboxAddress),
          BigInt(message.responseAddress),
          result,
        );
      }
    } catch (error) {
      this.#fail(process, error);
      return;
    }
    this.deferred.delete(process.pid);
    this.#signal(process, message.sequence, result);
    if (message.operation === interruptPoll && process.interruptTimer !== null) {
      clearTimeout(process.interruptTimer);
      process.interruptTimer = null;
    }
    if (!retry) this.#scheduleLaunches();
  }

  #message(process, message) {
    if (message?.pid !== process.pid) {
      this.#fail(process, new Error(`process ${process.pid} sent a mismatched identity`));
    } else if (message.type === "started") {
      if (this.dolly._dolly_process_worker_started(process.pid) !== 0) {
        this.#fail(process, new Error(`kernel rejected process ${process.pid} start`));
      } else {
        process.started = true;
      }
    } else if (message.type === "syscall") {
      this.#syscall(process, message);
    } else if (message.type === "finished") {
      this.dolly._dolly_process_worker_failed(process.pid, message.status ?? 0);
      this.#terminateDescendantWorkers(process.pid, 126);
      if (process.parent === 0) {
        const status = this.dolly._dolly_process_collect(process.pid);
        this.#finish(process, status);
      } else {
        this.#clearTimers(process);
        this.#disposeWorker(process);
        this.deferred.delete(process.pid);
        this.processes.delete(process.pid);
        this.#updateForeground();
        this.serviceDeferred();
      }
    } else if (message.type === "failed") {
      const detail = message.stack ? `${message.message}\n${message.stack}` : message.message;
      this.#fail(process, new Error(detail || `process ${process.pid} failed`));
    } else {
      this.#fail(process, new Error(`process ${process.pid} sent an unknown message`));
    }
  }

  #finish(process, status) {
    const residentBytes = process.memory?.buffer.byteLength ?? 0;
    const needsReclamationWindow = process.interactive &&
      residentBytes >= largeInteractiveProcessBytes;
    this.#clearTimers(process);
    this.#disposeWorker(process);
    this.processes.delete(process.pid);
    this.#updateForeground();
    const settle = () => {
      if (process.failure) {
        process.reject(process.failure);
      } else if (!Number.isInteger(status) || status < 0 || status > 255) {
        process.reject(new Error(`kernel returned invalid status for process ${process.pid}`));
      } else {
        process.resolve(status);
      }
    };
    // Dedicated Worker termination has no completion event. Large QuickJS/Pi
    // memories otherwise remain charged long enough for an immediately
    // launched recovery process to stall in Chromium. References are already
    // cleared above; one bounded event-loop window lets the browser reclaim
    // the detached memory before the caller starts another interactive root.
    if (needsReclamationWindow) setTimeout(settle, workerReclamationMilliseconds);
    else settle();
  }

  #fail(process, error) {
    if (!this.processes.has(process.pid)) return;
    const detail = error instanceof Error ? error : new Error(String(error));
    const stage = process.started ? "while running" : "during startup";
    this.#writeTerminal(
      `\r\ndolly: process ${process.pid} Worker failed ${stage}: ` +
        `${terminalFailureReason(detail)}\r\n`,
    );
    detail.message = `Dolly process ${process.pid} failed: ${detail.message}`;
    this.#clearTimers(process);
    this.#disposeWorker(process);
    this.dolly._dolly_process_worker_failed(process.pid, 126);
    this.#terminateDescendantWorkers(process.pid, 126);
    const status = process.parent === 0
      ? this.dolly._dolly_process_collect(process.pid) : 126;
    this.processes.delete(process.pid);
    this.#updateForeground();
    detail.status = status;
    if (process.reject) process.reject(detail);
    else {
      console.error(detail.stack ?? detail.message);
      this.serviceDeferred();
    }
  }

  interrupt(pid) {
    return this.#forceExit(pid, 130);
  }

  #forceExit(pid, status) {
    const process = this.processes.get(pid);
    if (!process) return false;
    this.#clearTimers(process);
    this.#disposeWorker(process);
    this.dolly._dolly_process_worker_failed(pid, status);
    this.#terminateDescendantWorkers(pid, status);
    this.processes.delete(pid);
    this.deferred.delete(pid);
    if (process.parent === 0) {
      const status = this.dolly._dolly_process_collect(pid);
      process.resolve(status);
    } else {
      this.serviceDeferred();
    }
    this.#updateForeground();
    return true;
  }

  #terminateDescendantWorkers(parentPid, status) {
    const descendants = [];
    for (const process of this.processes.values()) {
      let candidate = process;
      for (let depth = 0; depth < this.processes.size; ++depth) {
        if (candidate.parent === parentPid) {
          descendants.push(process);
          break;
        }
        if (candidate.parent === 0) break;
        candidate = this.processes.get(candidate.parent);
        if (!candidate) break;
      }
    }
    for (const process of descendants) {
      this.#clearTimers(process);
      this.#disposeWorker(process);
      this.dolly._dolly_process_worker_failed(process.pid, status);
      this.dolly._dolly_process_collect(process.pid);
      this.deferred.delete(process.pid);
      this.processes.delete(process.pid);
      if (process.reject) {
        process.reject(new Error(`Dolly process ${process.pid} was terminated with its parent`));
      }
    }
  }

  #disposeWorker(process) {
    const worker = process.worker;
    if (worker) {
      if (process.messageHandler) {
        worker.removeEventListener("message", process.messageHandler);
      }
      if (process.errorHandler) {
        worker.removeEventListener("error", process.errorHandler);
      }
      if (process.messageErrorHandler) {
        worker.removeEventListener("messageerror", process.messageErrorHandler);
      }
      worker.terminate();
    }
    process.worker = null;
    process.gate = null;
    process.control = null;
    process.memory = null;
    process.messageHandler = null;
    process.errorHandler = null;
    process.messageErrorHandler = null;
  }

  serviceDeferred() {
    for (const { process, message } of [...this.deferred.values()]) {
      if (this.processes.has(process.pid)) this.#syscall(process, message, true);
      else this.deferred.delete(process.pid);
    }
  }
}
