import { DOLLY_PROCESS_ABI_DIGEST } from "../dist/dolly-process-abi.mjs";
import { DOLLY_ERRNO } from "./process-constants.mjs";
import { parseWasmInterface } from "./wasm-interface.mjs";
import { validateProcessInterface } from "./process-abi.mjs";
import { validateThreadProfile } from "../host/threads/threads.mjs";
import { DOLLY_THREAD_SPAWN } from "../host/threads/abi.mjs";
import { executableHostRequirements, checkHostAbi } from "../host/requirements.mjs";
import {
  DOLLY_PROCESS_EXIT, DOLLY_PROCESS_PACKET_LIMIT as packetLimit, DOLLY_PROCESS_SIGALRM, DOLLY_PROCESS_SIGINT,
  DOLLY_PROCESS_SIGKILL, DOLLY_PROCESS_SIGNAL, DOLLY_PROCESS_SIGNAL_ACKNOWLEDGE,
  DOLLY_PROCESS_SIGWINCH, DOLLY_PROCESS_SIZEOF, DOLLY_PROCESS_SPAWN,
  DOLLY_PROCESS_SPAWN_FOREGROUND, DOLLY_PROCESS_SPAWN_INHERIT_ENVIRONMENT,
  DOLLY_PROCESS_SPAWN_INTERACTIVE,
} from "./process-constants.mjs";
import { hex } from "./static-asset.mjs";

const encoder = new TextEncoder();
const spawnHeaderSize = DOLLY_PROCESS_SIZEOF.dolly_process_spawn_request;
// The kernel's deferred-call result; processes never observe it.
const deferredResult = -(1n << 63n);
const interruptedSystemCall = -BigInt(DOLLY_ERRNO.EINTR);
// Trusted bound on concurrent process Workers, independent of kernel records.
const processWorkerLimit = 32;
const interruptGraceMilliseconds = 500;
const compiledModuleCacheEntries = 64;
const compiledModuleCacheBytes = 256 * 1024 * 1024;
const compilationNoticeMilliseconds = 250;
const largeInteractiveProcessBytes = 128 * 1024 * 1024;
const workerReclamationMilliseconds = 500;

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

// Root processes run argv[0], inherit the kernel environment and map
// descriptors 0-2 onto themselves.
function encodeSpawn(arguments_, flags) {
  if (!Array.isArray(arguments_) || arguments_.length === 0) {
    throw new TypeError("a process needs argv[0]");
  }
  const [path] = arguments_;
  if (typeof path !== "string" || !path.startsWith("/") || path.includes("\0")) {
    throw new TypeError("a process path must be absolute");
  }
  const pathBytes = encoder.encode(path);
  const argumentBytes = encodeStrings(arguments_, "process arguments");
  const size = spawnHeaderSize + pathBytes.length + argumentBytes.length + 3 * 8;
  if (pathBytes.length > 4096 || size > packetLimit) {
    throw new RangeError("process spawn packet is too large");
  }
  const packet = new Uint8Array(size);
  const view = new DataView(packet.buffer);
  view.setUint32(0, flags | DOLLY_PROCESS_SPAWN_INHERIT_ENVIRONMENT, true);
  view.setUint32(4, arguments_.length, true);
  view.setUint32(16, 3, true);
  view.setUint32(28, pathBytes.length, true);
  view.setBigUint64(32, BigInt(argumentBytes.length), true);
  view.setBigUint64(48, 0xffffffffffffffffn, true);
  packet.set(pathBytes, spawnHeaderSize);
  packet.set(argumentBytes, spawnHeaderSize + pathBytes.length);
  for (let descriptor = 0; descriptor < 3; ++descriptor) {
    view.setUint32(size - 24 + descriptor * 8, descriptor, true);
    view.setUint32(size - 20 + descriptor * 8, descriptor, true);
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
  constructor(dolly, kernelMemory, gateModule, workerUrl, processContract, hostAbi, serviceHost, threadContract, threadHost, processModules) {
    if (!(kernelMemory instanceof WebAssembly.Memory) ||
        !(gateModule instanceof WebAssembly.Module) || !(workerUrl instanceof URL)) {
      throw new TypeError("invalid Dolly process supervisor configuration");
    }
    this.dolly = dolly;
    this.kernelMemory = kernelMemory;
    this.gateModule = gateModule;
    this.workerUrl = workerUrl;
    this.processContract = processContract;
    this.hostAbi = hostAbi;
    this.serviceHost = serviceHost;
    this.threadContract = threadContract;
    this.threadHost = threadHost;
    this.processModules = processModules;
    this.processes = new Map();
    this.deferred = new Map();
    this.compiledModules = new Map();
    this.compiledModuleBytes = 0;
    this.launchChain = Promise.resolve();
    this.mailboxAddress = Number(dolly._dolly_process_mailbox_address());
    this.mailboxCapacity = packetLimit;
    if (!Number.isSafeInteger(this.mailboxAddress) || this.mailboxAddress <= 0 ||
        this.mailboxAddress > kernelMemory.buffer.byteLength - this.mailboxCapacity) {
      throw new Error("Dolly kernel supplied an invalid process mailbox");
    }
    this.serviceTimer = setInterval(() => this.#serviceTick(), 16);
  }

  static async create(dolly, kernelMemory, applicationBase, hostAbi, serviceHost, threadHost, processModules) {
    const [gateBytes, contractBytes, threadBytes, workerBytes] = await Promise.all([
      "dolly-process-gate-0.wasm", "dolly-process-0.wasm", "dolly-threads-0.wasm",
      "dolly-process-worker.mjs",
    ].map(async name => {
      const response = await fetch(new URL(`dist/${name}`, applicationBase), {
        cache: "no-store", credentials: "same-origin", redirect: "error",
      });
      if (!response.ok) throw new Error(`Dolly ${name} returned HTTP ${response.status}`);
      return response.arrayBuffer();
    }));
    const gateModule = await WebAssembly.compile(gateBytes);
    // Fresh Workers share trusted code bytes, never process memory or JS state.
    const workerUrl = new URL(URL.createObjectURL(new Blob([workerBytes], { type: "text/javascript" })));
    try {
      const supervisor = new DollyProcessSupervisor(
        dolly, kernelMemory, gateModule, workerUrl,
        parseWasmInterface(contractBytes, "dolly-process-0"),
        hostAbi, serviceHost, parseWasmInterface(threadBytes, "dolly-threads-0"), threadHost, processModules,
      );
      supervisor.releaseWorkerSource = () => URL.revokeObjectURL(workerUrl.href);
      return supervisor;
    } catch (error) {
      URL.revokeObjectURL(workerUrl.href);
      throw error;
    }
  }

  spawn(arguments_, { foreground = false } = {}) {
    if (this.processes.size >= processWorkerLimit) throw new Error("Dolly process limit reached");
    const packet = encodeSpawn(arguments_, foreground ? DOLLY_PROCESS_SPAWN_FOREGROUND : 0);
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
      failure: null, interactive: (flags & DOLLY_PROCESS_SPAWN_INTERACTIVE) !== 0, retiring: false,
      interruptTimer: null, deadlineTimer: null, retirementTimer: null,
      reclamationDeadline: 0, tid: 0, threads: new Map(), threaded: false,
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
    this.serviceHost();
    const interrupted = this.dolly._dolly_process_take_interrupt();
    if (interrupted > 0) this.#interruptForeground(interrupted);
    for (let pid; (pid = this.dolly._dolly_process_take_alarm()) > 0;) {
      this.#deliverSignal(this.processes.get(pid), DOLLY_PROCESS_SIGALRM);
    }
    this.serviceDeferred();
  }

  #interruptForeground(pid) {
    const process = this.processes.get(pid);
    if (!process || process.retiring) return;
    const descendants = [...this.processes.values()].filter(
      (candidate) => !candidate.retiring && candidate.pid !== pid &&
        this.#descendantDepth(candidate, pid) !== 0,
    );
    // Like a job-control shell, an interactive owner's running commands take
    // SIGINT in its place; without any it takes SIGINT itself.
    for (const target of process.interactive && descendants.length ? descendants : [process, ...descendants]) {
      this.#deliverSignal(target);
    }
  }

  #deliverSignal(process, signalNumber = DOLLY_PROCESS_SIGINT) {
    if (!process || process.retiring || this.processes.get(process.pid) !== process) return false;
    const result = this.dolly._dolly_process_signal(process.pid, signalNumber);
    // Resize notification is not an interrupt request and must never acquire
    // a forced-termination deadline, including before program entry.
    if (signalNumber === DOLLY_PROCESS_SIGWINCH && (result !== 0 || !process.started)) return result === 0;
    if (signalNumber === DOLLY_PROCESS_SIGKILL || result !== 0 || !process.started) {
      return this.#forceExit(process.pid, 128 + signalNumber, signalNumber);
    }
    const receiver = process.threaded
      ? [...process.threads.values()].sort((a, b) => a.tid - b.tid)[0] : process;
    const deferred = this.deferred.get(receiver);
    // A deferred EXIT is past signal handling; the kernel completes it.
    if (deferred && deferred.message.operation !== DOLLY_PROCESS_EXIT) {
      this.#clearDeferred(receiver);
      this.#signal(receiver, deferred.message.sequence, interruptedSystemCall);
    }
    if (signalNumber !== DOLLY_PROCESS_SIGWINCH && process.interruptTimer === null) {
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
        // Only a kernel that cannot name its next launch reaches this point.
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
    let threaded;
    let local;
    let prepared = false;
    try {
      const parsed = parseWasmInterface(bytes);
      memoryRequirements = validateProcessInterface(this.processContract, parsed, DOLLY_PROCESS_ABI_DIGEST);
      const requirements = executableHostRequirements(parsed);
      checkHostAbi(requirements, this.hostAbi);
      threaded = validateThreadProfile(parsed, requirements, this.threadContract);
      local = [...requirements.keys()].filter(requirement => this.processModules.has(requirement));
      // Such a module keeps one Worker's state, such as its function table.
      if (threaded && local.length) throw new TypeError(`a program using threads@0 cannot use ${local.join(", ")}`);
      module = await WebAssembly.compile(bytes);
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
    const compiled = { module, memoryRequirements, processInterface, threaded, local, byteLength: bytes.byteLength };
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
    for (let pid; (pid = this.dolly._dolly_process_next_launch()) !== 0;) {
      const process = this.processes.get(pid);
      try {
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
        const { module, memoryRequirements, processInterface, threaded, local } = await this.#compileProcess(bytes);
        if (!this.#canLaunch(process)) continue;
        const memory = createProcessMemory(memoryRequirements);
        process.memory = memory;
        const gate = new WebAssembly.Instance(this.gateModule, {
          process: { memory },
          kernel: { memory: this.kernelMemory },
        });
        Object.assign(process, { gate, module, processInterface, threaded, local });
        if (threaded) {
          if (!this.threadHost) throw new Error("threads@0 is unavailable");
          const tid = this.dolly._dolly_threads_attach(pid);
          if (tid <= 0) throw new Error(`kernel could not reserve main thread: ${tid}`);
          process.tid = tid;
          process.threads.set(tid, process);
        }
        this.#launchWorker(process, process);
      } catch (error) {
        // A failed launch ends only its own process; exiting it in the kernel
        // also stops next_launch from naming it again.
        if (process) this.#fail(process, error);
        else this.dolly._dolly_process_worker_exited(pid, 126, 0);
      }
    }
  }

  #launchWorker(process, thread, argument = undefined) {
    const { pid, module, memory, processInterface, threaded, local } = process;
    const control = new SharedArrayBuffer(16);
    const name = `dolly-process-${pid}-thread-${thread.tid}`;
    const worker = threaded ? this.threadHost.create(pid, this.workerUrl, name)
      : new Worker(this.workerUrl, { type: "module", name });
    if (!worker) throw new Error("thread Worker capacity exhausted");
    thread.worker = worker;
    thread.control = new Int32Array(control);
    thread.messageHandler = event => this.#message(process, event.data, thread);
    thread.errorHandler = event => this.#fail(process, new Error(event.message || `${name} failed`));
    thread.messageErrorHandler = () => this.#fail(process, new Error(`${name} message could not be decoded`));
    worker.addEventListener("message", thread.messageHandler);
    worker.addEventListener("error", thread.errorHandler, { once: true });
    worker.addEventListener("messageerror", thread.messageErrorHandler, { once: true });
    // local: the modules this executable records that are served in its own
    // Worker (host/dso), each as the bundle to import and its configuration.
    worker.postMessage({ type: "configure", pid, tid: thread.tid, argument, threaded, module, memory, control,
      clockOrigin: performance.timeOrigin, processInterface, local: local.map(requirement => this.processModules.get(requirement)) });
  }

  #canLaunch(process) {
    if (this.processes.get(process.pid) !== process || process.retiring) return false;
    // An ancestor's EXIT can reach the kernel before its Worker posts finished.
    if (this.dolly._dolly_process_exited(process.pid) !== 0) {
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
    if (remaining >= 0) {
      process.deadlineTimer = setTimeout(() => this.#forceExit(process.pid, 124), Math.ceil(remaining));
    }
  }

  #clearTimers(process) {
    if (process.interruptTimer !== null) clearTimeout(process.interruptTimer);
    if (process.deadlineTimer !== null) clearTimeout(process.deadlineTimer);
    if (process.retirementTimer !== null) clearTimeout(process.retirementTimer);
    process.interruptTimer = null;
    process.deadlineTimer = null;
    process.retirementTimer = null;
  }

  #clearDeferred(thread) {
    const pending = this.deferred.get(thread);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.deferred.delete(thread);
  }

  #syscall(process, message, retry = false, thread = process) {
    this.#clearDeferred(thread);
    const values = [
      message.sequence,
      message.operation,
      message.requestAddress,
      message.requestSize,
      message.responseAddress,
      message.responseCapacity,
    ];
    if (message.pid !== process.pid || message.tid !== thread.tid ||
        values.some((value) => !Number.isSafeInteger(value) || value < 0) ||
        message.requestSize > packetLimit || message.responseCapacity > packetLimit ||
        Atomics.load(thread.control, 0) !== message.sequence ||
        Atomics.load(thread.control, 1) === message.sequence) {
      this.#fail(process, new Error(`process ${process.pid} sent an invalid syscall`));
      return;
    }
    let result;
    let signalDelivery;
    let threadArgument;
    try {
      process.gate.exports.request(
        BigInt(message.requestAddress),
        BigInt(this.mailboxAddress),
        BigInt(message.requestSize),
      );
      if (message.operation === DOLLY_THREAD_SPAWN && message.requestSize === 8)
        threadArgument = new DataView(this.kernelMemory.buffer, this.mailboxAddress, 8).getBigUint64(0, true);
      const args = [process.pid, message.operation, BigInt(message.requestSize), BigInt(message.responseCapacity)];
      if (process.threaded) args.splice(1, 0, thread.tid);
      const exhausted = message.operation === DOLLY_PROCESS_SPAWN
        ? this.processes.size >= processWorkerLimit
        : process.threaded && message.operation === DOLLY_THREAD_SPAWN && !this.threadHost.available(process.pid);
      // Firefox can enter a direct Wasm call twice. Use the generic call path
      // so a completed syscall is never replayed against its response packet.
      result = exhausted ? -BigInt(DOLLY_ERRNO.EAGAIN)
        : Reflect.apply(process.threaded ? this.dolly._dolly_threads_dispatch : this.dolly._dolly_process_dispatch,
          this.dolly, args);
      if (result === deferredResult) {
        const deferred = { process, thread, message, timer: null };
        this.deferred.set(thread, deferred);
        const remaining = this.dolly._dolly_process_deferred_milliseconds();
        if (remaining >= 0 && remaining <= 16) {
          deferred.timer = setTimeout(() => {
            if (this.deferred.get(thread) === deferred) this.#syscall(process, message, true, thread);
          }, Math.ceil(remaining));
        }
        if (message.operation === DOLLY_PROCESS_EXIT && process.interruptTimer !== null) {
          // The parent has finished cleanup; signalled children retain their
          // own deadlines while the kernel waits for them to finish theirs.
          clearTimeout(process.interruptTimer);
          process.interruptTimer = null;
        }
        return;
      }
      if (message.operation === DOLLY_PROCESS_EXIT && result === 0n) {
        // The kernel reclaimed every thread. Stop the others now; the caller
        // unwinds and reports "finished" like a single-threaded process.
        for (const other of [...process.threads.values()]) {
          if (other !== thread) this.#disposeThread(process, other);
        }
      } else if (result >= 0n) {
        if (result > BigInt(message.responseCapacity)) {
          throw new Error(`kernel overfilled process ${process.pid} response`);
        }
        process.gate.exports.response(
          BigInt(this.mailboxAddress),
          BigInt(message.responseAddress),
          result,
        );
        if (message.operation === DOLLY_THREAD_SPAWN) {
          if (result !== 8n || threadArgument === undefined) throw new Error("invalid kernel thread response");
          const response = new DataView(this.kernelMemory.buffer, this.mailboxAddress, 8);
          const tid = response.getUint32(0, true);
          if (!tid || tid > 0x7fffffff || response.getUint32(4, true) || process.threads.has(tid))
            throw new Error("invalid kernel thread identity");
          const child = { tid, worker: null, control: null };
          process.threads.set(tid, child);
          try { this.#launchWorker(process, child, threadArgument); }
          catch (error) {
            this.#disposeThread(process, child);
            this.dolly._dolly_threads_unstarted(process.pid, tid);
            result = -BigInt(DOLLY_ERRNO.EAGAIN);
          }
        }
        if (message.operation === DOLLY_PROCESS_SPAWN) {
          if (result !== 8n) throw new Error("invalid kernel spawn response");
          const response = new DataView(this.kernelMemory.buffer, this.mailboxAddress, 8);
          const pid = response.getUint32(0, true);
          if (pid === 0 || pid > 0x7fffffff || response.getUint32(4, true) !== 0) {
            throw new Error("invalid kernel spawn identity");
          }
          this.#registerProcess(pid, process.pid);
        }
        if (message.operation === DOLLY_PROCESS_SIGNAL) {
          if (result !== 8n) throw new Error("invalid kernel signal response");
          const response = new DataView(this.kernelMemory.buffer, this.mailboxAddress, 8);
          signalDelivery = { pid: response.getUint32(0, true), signal: response.getUint32(4, true) };
          if (signalDelivery.pid === 0 || signalDelivery.pid > 0x7fffffff) {
            throw new Error("invalid kernel signal target");
          }
        }
      }
    } catch (error) {
      this.#fail(process, error);
      return;
    }
    this.#signal(thread, message.sequence, result);
    if (message.operation === DOLLY_PROCESS_SIGNAL_ACKNOWLEDGE && result === 4n &&
        new DataView(this.kernelMemory.buffer, this.mailboxAddress, 4).getInt32(0, true) === 0 &&
        process.interruptTimer !== null) {
      clearTimeout(process.interruptTimer);
      process.interruptTimer = null;
    }
    if (signalDelivery?.signal) {
      this.#deliverSignal(this.processes.get(signalDelivery.pid), signalDelivery.signal);
    }
    if (retry) return;
    this.#scheduleLaunches();
    // A pipe write or close can complete another thread's blocked read or poll,
    // such as an async runtime's waker: retry now, not at the next tick.
    if (this.dolly._dolly_process_take_wakeup()) this.serviceDeferred();
  }

  #message(process, message, thread = process) {
    if (this.processes.get(process.pid) !== process || process.retiring ||
        (process.threaded && process.threads.get(thread.tid) !== thread)) return;
    if (message?.pid !== process.pid || message?.tid !== thread.tid) {
      this.#fail(process, new Error(`process ${process.pid} sent a mismatched identity`));
    } else if (message.type === "started") {
      if (thread !== process) return;
      if (this.dolly._dolly_process_worker_started(process.pid) !== 0) {
        this.#fail(process, new Error(`kernel rejected process ${process.pid} start`));
      } else {
        process.started = true;
      }
    } else if (message.type === "syscall") {
      this.#syscall(process, message, false, thread);
    } else if (message.type === "thread-finished") {
      if (!process.threaded || typeof message.result !== "bigint") {
        this.#fail(process, new Error("invalid thread completion")); return;
      }
      // The trusted Worker wrapper has unwound Wasm and will never re-enter it.
      // Remove its event handlers/resources before making its stack joinable.
      this.#disposeThread(process, thread);
      const last = this.dolly._dolly_threads_retired(process.pid, thread.tid, message.result);
      if (last < 0) this.#fail(process, new Error("kernel rejected thread retirement"));
      else if (last) this.#forceExit(process.pid, 0);
      else this.serviceDeferred();
    } else if (message.type === "finished") {
      // _start returned (status zero), or EXIT has already recorded the status.
      this.dolly._dolly_process_worker_exited(process.pid, 0, 0);
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
    this.#stop(process);
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

  // A refusal or failure is reported to the program that asked: one line on
  // the process's own stderr, then status 126.
  #fail(process, error) {
    if (process.retiring || this.processes.get(process.pid) !== process) return;
    const detail = error instanceof Error ? error : new Error(String(error));
    const line = encoder.encode(`dolly: process ${process.pid} ` +
      `${process.started ? "failed" : "was refused"}: ${terminalFailureReason(detail)}\n`);
    new Uint8Array(this.kernelMemory.buffer, this.mailboxAddress, line.length).set(line);
    this.dolly._dolly_process_worker_failed(process.pid, BigInt(line.length));
    detail.message = `Dolly process ${process.pid} failed: ${detail.message}`;
    process.failure = detail;
    if (!process.reject) console.error(detail.stack ?? detail.message);
    this.#retire(process);
  }

  #forceExit(pid, status, signalNumber = 0) {
    const process = this.processes.get(pid);
    if (!process) return false;
    if (process.retiring) return true;
    this.dolly._dolly_process_worker_exited(pid, status, signalNumber);
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
      reclamationDeadline = Math.max(reclamationDeadline, this.#reclamationDeadline(process));
      this.#stop(process);
    }
    return { descendants, reclamationDeadline };
  }

  #disposeThread(process, thread) {
    this.#clearDeferred(thread);
    if (thread.worker) {
      thread.worker.removeEventListener("message", thread.messageHandler);
      thread.worker.removeEventListener("error", thread.errorHandler);
      thread.worker.removeEventListener("messageerror", thread.messageErrorHandler);
      if (process.threaded) this.threadHost.release(thread.worker);
      else thread.worker.terminate();
    }
    thread.worker = null;
    thread.control = null;
    thread.messageHandler = thread.errorHandler = thread.messageErrorHandler = null;
    process.threads.delete(thread.tid);
  }

  // Ends a process's Workers and timers; the kernel keeps its record until collected.
  #stop(process) {
    process.retiring = true;
    this.#clearTimers(process);
    this.#disposeWorker(process);
  }

  #disposeWorker(process) {
    for (const thread of [...process.threads.values()]) this.#disposeThread(process, thread);
    this.#disposeThread(process, process);
    process.gate = process.memory = process.module = process.processInterface = null;
  }

  serviceDeferred() {
    for (const deferred of [...this.deferred.values()]) {
      const { process, thread, message } = deferred;
      // An earlier retry in this pass may have ended this thread: a completed
      // EXIT stops the other threads of its process.
      if (this.deferred.get(thread) !== deferred) continue;
      if (this.processes.get(process.pid) === process && !process.retiring) {
        this.#syscall(process, message, true, thread);
      } else this.#clearDeferred(thread);
    }
  }

  dispose() {
    clearInterval(this.serviceTimer);
    for (const process of this.processes.values()) {
      this.#stop(process);
      process.reject?.(new Error("Dolly runtime closed"));
    }
    this.processes.clear();
    this.deferred.clear();
    this.compiledModules.clear();
    this.compiledModuleBytes = 0;
    this.releaseWorkerSource?.();
    this.releaseWorkerSource = undefined;
  }
}
