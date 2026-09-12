import { DOLLY_PROCESS_ABI_DIGEST } from "../dist/dolly-process-abi.mjs";
import { DOLLY_ERRNO } from "../dist/dolly-errno.mjs";
import { parseWasmInterface } from "./wasm-interface.mjs";
import { validateProcessInterface } from "./process-abi.mjs";

const encoder = new TextEncoder();
const packetLimit = 1024 * 1024;
const spawnHeaderSize = 56;
const inheritEnvironment = 1;
const spawnForeground = 2;
const spawnInteractive = 4;
const deferredResult = -(1n << 63n);
const processSpawn = 64;
const processSignal = 68;
const signalAcknowledge = 69;
const supportedSignals = [0, 1, 2, 3, 6, 9, 13, 15, 28];
const sigint = 2;
const sigwinch = 28;
const interruptedSystemCall = -BigInt(DOLLY_ERRNO.EINTR);
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

function encodeSpawn(path, arguments_, environment, descriptors, flags) {
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
    argumentBytes.length + environmentBytes.length + 3 * 8;
  if (pathBytes.length === 0 || pathBytes.length > 4096 || size > packetLimit) {
    throw new RangeError("process spawn packet is too large");
  }
  if (!Array.isArray(descriptors) || descriptors.length !== 3 ||
      descriptors.some((value) => !Number.isInteger(value) || value < 0 || value > 0x7fffffff)) {
    throw new TypeError("process descriptors must contain stdin, stdout, and stderr");
  }

  const packet = new Uint8Array(size);
  const view = new DataView(packet.buffer);
  view.setUint32(0, flags | (environment === undefined ? inheritEnvironment : 0), true);
  view.setUint32(4, arguments_.length, true);
  view.setUint32(8, environment?.length ?? 0, true);
  view.setUint32(12, 0, true);
  view.setUint32(16, descriptors.length, true);
  view.setUint32(20, 0, true); // Root spawns use explicit descriptor mappings only.
  view.setUint32(24, 0, true);
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
  offset += environmentBytes.length;
  for (let target = 0; target < descriptors.length; ++target) {
    view.setUint32(offset, descriptors[target], true);
    view.setUint32(offset + 4, target, true);
    offset += 8;
  }
  return packet;
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
  constructor(dolly, kernelMemory, gateModule, workerUrl, processContract, dsoContract) {
    if (!(kernelMemory instanceof WebAssembly.Memory) ||
        !(gateModule instanceof WebAssembly.Module) || !(workerUrl instanceof URL)) {
      throw new TypeError("invalid Dolly process supervisor configuration");
    }
    this.dolly = dolly;
    this.kernelMemory = kernelMemory;
    this.gateModule = gateModule;
    this.workerUrl = workerUrl;
    this.processContract = processContract;
    this.dsoContract = dsoContract;
    this.processes = new Map();
    this.deferred = new Map();
    this.compiledModules = new Map();
    this.compiledModuleBytes = 0;
    this.launchChain = Promise.resolve();
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
    const [gateBytes, contractBytes, dsoBytes] = await Promise.all([
      "dolly-process-gate-0.wasm", "dolly-process-0.wasm", "dolly-process-dso-0.wasm",
    ].map(async name => {
      const response = await fetch(new URL(`dist/${name}`, applicationBase), {
        cache: "no-store", credentials: "same-origin", redirect: "error",
      });
      if (!response.ok) throw new Error(`Dolly ${name} returned HTTP ${response.status}`);
      return response.arrayBuffer();
    }));
    const gateModule = await WebAssembly.compile(gateBytes);
    return new DollyProcessSupervisor(
      dolly,
      kernelMemory,
      gateModule,
      new URL("./process-worker.mjs", import.meta.url),
      parseWasmInterface(contractBytes, "dolly-process-0"),
      parseWasmInterface(dsoBytes, "dolly-process-dso-0"),
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
    const flags = (foreground ? spawnForeground : 0) | (interactive ? spawnInteractive : 0);
    const packet = encodeSpawn(path, arguments_, environment, descriptors, flags);
    new Uint8Array(
      this.kernelMemory.buffer,
      this.mailboxAddress,
      packet.length,
    ).set(packet);
    const pid = this.dolly._dolly_process_spawn_serialized(BigInt(packet.length));
    if (pid < 0) throw new Error(`Dolly process spawn failed with errno ${-pid}`);
    const completion = new Promise((resolve, reject) => {
      this.#registerProcess(pid, 0, resolve, reject);
    });
    this.#scheduleLaunches();
    return completion;
  }

  #registerProcess(pid, parent, resolve = null, reject = null) {
    const flags = this.dolly._dolly_process_spawn_flags(pid);
    if (pid <= 0 || this.processes.has(pid) || flags < 0 ||
        this.dolly._dolly_process_parent(pid) !== parent) {
      throw new Error(`kernel supplied invalid process ${pid}`);
    }
    const process = {
      pid, parent, resolve, reject, worker: null, gate: null, control: null,
      memory: null, messageHandler: null, errorHandler: null,
      messageErrorHandler: null, started: false,
      failure: null, interactive: (flags & spawnInteractive) !== 0, retiring: false,
      interruptTimer: null, deadlineTimer: null, retirementTimer: null,
      reclamationDeadline: 0,
    };
    this.processes.set(pid, process);
    this.#armDeadline(process);
  }

  #descendantDepth(process, ancestorPid) {
    let candidate = process;
    for (let depth = 0; depth < this.processes.size; ++depth) {
      if (candidate.parent === ancestorPid) return depth + 1;
      if (candidate.parent === 0) return 0;
      candidate = this.processes.get(candidate.parent);
      if (!candidate) return 0;
    }
    return 0;
  }

  #serviceTick() {
    this.dolly._dolly_session_service();
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
    if (!process || process.retiring) return false;
    const descendants = [...this.processes.values()].filter(
      (candidate) => !candidate.retiring && candidate.pid !== pid &&
        this.#descendantDepth(candidate, pid) !== 0,
    );
    const now = performance.now();
    for (const target of process.interactive ? descendants : [process, ...descendants]) {
      if (now - (target.terminalInterruptAt ?? -Infinity) < 1000) {
        this.#forceExit(target.pid, 130, sigint);
      } else {
        target.terminalInterruptAt = now;
        this.#deliverSignal(target);
      }
    }
    return !process.interactive || descendants.length !== 0;
  }

  #deliverSignal(process, signalNumber = sigint) {
    if (!process || process.retiring || this.processes.get(process.pid) !== process) return false;
    const result = this.dolly._dolly_process_signal(process.pid, signalNumber);
    // Resize notification is not an interrupt request and must never acquire
    // a forced-termination deadline, including before program entry.
    if (signalNumber === sigwinch && (result !== 0 || !process.started)) return result === 0;
    if (signalNumber === 9 || result !== 0 || !process.started) {
      return this.#forceExit(process.pid, 128 + signalNumber, signalNumber);
    }
    const deferred = this.deferred.get(process.pid);
    if (deferred) {
      this.deferred.delete(process.pid);
      this.#signal(process, deferred.message.sequence, interruptedSystemCall);
    }
    if (signalNumber !== sigwinch && process.interruptTimer === null) {
      process.interruptTimer = setTimeout(() => {
        process.interruptTimer = null;
        this.#forceExit(process.pid, 128 + signalNumber, signalNumber);
      }, interruptGraceMilliseconds);
    }
    return true;
  }

  #scheduleLaunches() {
    this.launchChain = this.launchChain
      .then(() => this.#launchPending())
      .catch((error) => {
        for (const process of [...this.processes.values()]) this.#fail(process, error);
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
    let processInterface;
    let prepared = false;
    try {
      module = await WebAssembly.compile(bytes);
      const parsed = parseWasmInterface(bytes);
      memoryRequirements = validateProcessInterface(this.processContract, parsed, DOLLY_PROCESS_ABI_DIGEST);
      processInterface = { imports: parsed.imports, exports: parsed.exports };
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
    const compiled = { module, memoryRequirements, processInterface, byteLength: bytes.byteLength };
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
      const process = this.processes.get(pid);
      if (!process) throw new Error(`kernel supplied unregistered process ${pid}`);
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
        const { module, memoryRequirements, processInterface } = await this.#compileProcess(bytes);
        if (!this.#canLaunch(process)) continue;
        const memory = createProcessMemory(memoryRequirements);
        process.memory = memory;
        const gate = new WebAssembly.Instance(this.gateModule, {
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
        worker.postMessage({ type: "configure", pid, module, memory, control,
          processInterface, dsoContract: this.dsoContract });
      } catch (error) {
        this.#fail(process, error);
      }
    }
  }

  #canLaunch(process) {
    if (this.processes.get(process.pid) !== process || process.retiring) return false;
    // An ancestor's EXIT can reach the kernel before its Worker posts finished.
    if (this.dolly._dolly_process_deadline_remaining(process.pid) === -2) {
      this.#retire(process);
      return false;
    }
    return true;
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
    if (process.retirementTimer !== null) clearTimeout(process.retirementTimer);
    process.interruptTimer = null;
    process.deadlineTimer = null;
    process.retirementTimer = null;
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
    let signalDelivery;
    try {
      process.gate.exports.request(
        BigInt(message.requestAddress),
        BigInt(this.mailboxAddress),
        BigInt(message.requestSize),
      );
      // Firefox can enter a direct Wasm call twice. Use the generic call path
      // so a completed syscall is never replayed against its response packet.
      result = Reflect.apply(this.dolly._dolly_process_dispatch, this.dolly, [
        process.pid,
        message.operation,
        BigInt(message.requestSize),
        BigInt(message.responseCapacity),
      ]);
      if (result === deferredResult) {
        this.deferred.set(process.pid, { process, message });
        if (message.operation === 5 && process.interruptTimer !== null) {
          // The parent has finished cleanup; signalled children retain their
          // own deadlines while the kernel waits for them to finish theirs.
          clearTimeout(process.interruptTimer);
          process.interruptTimer = null;
        }
        return;
      }
      if (result >= 0n) {
        if (result > BigInt(message.responseCapacity)) {
          throw new Error(`kernel overfilled process ${process.pid} response`);
        }
        if (message.operation === processSpawn) {
          if (result !== 8n) throw new Error("invalid kernel spawn response");
          const response = new DataView(this.kernelMemory.buffer, this.mailboxAddress, 8);
          const pid = response.getUint32(0, true);
          if (pid === 0 || pid > 0x7fffffff || response.getUint32(4, true) !== 0) {
            throw new Error("invalid kernel spawn identity");
          }
          this.#registerProcess(pid, process.pid);
        }
        if (message.operation === processSignal) {
          if (result !== 8n) throw new Error("invalid kernel signal response");
          const response = new DataView(this.kernelMemory.buffer, this.mailboxAddress, 8);
          signalDelivery = { pid: response.getUint32(0, true), signal: response.getUint32(4, true) };
          if (signalDelivery.pid === 0 || signalDelivery.pid > 0x7fffffff ||
              !supportedSignals.includes(signalDelivery.signal)) {
            throw new Error("invalid kernel signal target");
          }
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
    if (message.operation === signalAcknowledge && result === 4n &&
        new DataView(this.kernelMemory.buffer, this.mailboxAddress, 4).getInt32(0, true) === 0 &&
        process.interruptTimer !== null) {
      clearTimeout(process.interruptTimer);
      process.interruptTimer = null;
    }
    if (signalDelivery?.signal) {
      this.#deliverSignal(this.processes.get(signalDelivery.pid), signalDelivery.signal);
    }
    if (!retry) this.#scheduleLaunches();
  }

  #message(process, message) {
    if (this.processes.get(process.pid) !== process || process.retiring) return;
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
      this.dolly._dolly_process_worker_failed(process.pid, message.status ?? 0, 0);
      this.#retire(process);
    } else if (message.type === "failed") {
      const detail = message.stack ? `${message.message}\n${message.stack}` : message.message;
      this.#fail(process, new Error(detail || `process ${process.pid} failed`));
    } else {
      this.#fail(process, new Error(`process ${process.pid} sent an unknown message`));
    }
  }

  #reclamationDeadline(process) {
    return Math.max(process.reclamationDeadline,
      process.interactive && (process.memory?.buffer.byteLength ?? 0) >= largeInteractiveProcessBytes
        ? performance.now() + workerReclamationMilliseconds : 0);
  }

  #retire(process) {
    process.retiring = true;
    const { descendants, reclamationDeadline } = this.#terminateDescendantWorkers(process.pid);
    process.reclamationDeadline = Math.max(
      this.#reclamationDeadline(process), reclamationDeadline,
    );
    this.#clearTimers(process);
    this.#disposeWorker(process);
    this.deferred.delete(process.pid);
    const retired = () => {
      process.retirementTimer = null;
      if (this.processes.get(process.pid) !== process) return;
      for (const descendant of descendants) {
        this.#acknowledgeRetirement(descendant);
        this.dolly._dolly_process_collect(descendant.pid);
      }
      this.#acknowledgeRetirement(process);
      if (process.parent === 0) this.#finish(process);
      else this.serviceDeferred();
    };
    // Worker.terminate() has no completion event. Drop all references, then allow
    // one bounded reclamation window for large interactive memories before WAIT
    // can let a surviving parent launch their replacement.
    const delay = process.reclamationDeadline - performance.now();
    if (delay > 0) process.retirementTimer = setTimeout(retired, delay);
    else retired();
  }

  #acknowledgeRetirement(process) {
    const result = this.dolly._dolly_process_worker_retired(process.pid);
    if (result !== 0) {
      throw new Error(`kernel rejected process ${process.pid} retirement: ${result}`);
    }
    this.processes.delete(process.pid);
  }

  #finish(process) {
    const status = this.dolly._dolly_process_collect(process.pid);
    if (process.failure) {
      process.failure.status = status;
      process.reject(process.failure);
    } else if (!Number.isInteger(status) || status < 0 || status > 255) {
      process.reject(new Error(`kernel returned invalid status for process ${process.pid}`));
    } else {
      process.resolve(status);
    }
  }

  #fail(process, error) {
    if (process.retiring || this.processes.get(process.pid) !== process) return;
    const detail = error instanceof Error ? error : new Error(String(error));
    const stage = process.started ? "while running" : "during startup";
    this.#writeTerminal(
      `\r\ndolly: process ${process.pid} Worker failed ${stage}: ` +
        `${terminalFailureReason(detail)}\r\n`,
    );
    detail.message = `Dolly process ${process.pid} failed: ${detail.message}`;
    process.failure = detail;
    this.dolly._dolly_process_worker_failed(process.pid, 126, 0);
    if (!process.reject) console.error(detail.stack ?? detail.message);
    this.#retire(process);
  }

  interrupt(pid) {
    return this.#forceExit(pid, 130, sigint);
  }

  #forceExit(pid, status, signalNumber = 0) {
    const process = this.processes.get(pid);
    if (!process) return false;
    if (process.retiring) return true;
    this.dolly._dolly_process_worker_failed(pid, status, signalNumber);
    this.#retire(process);
    return true;
  }

  #terminateDescendantWorkers(parentPid) {
    const descendants = [...this.processes.values()]
      .map((process) => ({ process, depth: this.#descendantDepth(process, parentPid) }))
      .filter(({ depth }) => depth !== 0)
      .sort((left, right) => right.depth - left.depth)
      .map(({ process }) => process);
    let reclamationDeadline = 0;
    for (const process of descendants) {
      process.retiring = true;
      reclamationDeadline = Math.max(reclamationDeadline, this.#reclamationDeadline(process));
      this.#clearTimers(process);
      this.#disposeWorker(process);
      this.deferred.delete(process.pid);
    }
    return { descendants, reclamationDeadline };
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
      if (this.processes.get(process.pid) === process && !process.retiring) {
        this.#syscall(process, message, true);
      } else this.deferred.delete(process.pid);
    }
  }
}
