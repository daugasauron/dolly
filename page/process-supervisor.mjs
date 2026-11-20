import { DOLLY_PROCESS_ABI_DIGEST } from "./generated.mjs";
import { DOLLY_ERRNO } from "./process-constants.mjs";
import { callFields, callFieldsOffset, controlBytes, controlWord } from "./process-control.mjs";
import { castThunkTargets, exportFunctionsByTable, exportIndex, parseWasmInterface } from "./wasm-interface.mjs";
import { validateProcessInterface } from "./process-abi.mjs";
import { executableHostRequirements, checkHostAbi } from "../host/requirements.mjs";
import {
  DOLLY_PROCESS_EXEC, DOLLY_PROCESS_EXIT, DOLLY_PROCESS_PACKET_LIMIT as packetLimit,
  DOLLY_PROCESS_SIGWINCH, DOLLY_PROCESS_OFFSETOF, DOLLY_PROCESS_SIZEOF, DOLLY_PROCESS_SPAWN,
  DOLLY_PROCESS_SPAWN_FOREGROUND, DOLLY_PROCESS_SPAWN_INHERIT_ENVIRONMENT,
  DOLLY_PROCESS_SPAWN_INTERACTIVE,
} from "./process-constants.mjs";
import { hex } from "./static-asset.mjs";
import { DOLLY_FS_BLOCK_SIZE, DOLLY_PROCESS_EVENT_KIND_SHIFT, DOLLY_PROCESS_EVENT_VALUE_SHIFT, DOLLY_PROCESS_EVENT_LAUNCH, DOLLY_PROCESS_EVENT_INTERRUPT,
  DOLLY_PROCESS_EVENT_TERMINATE, DOLLY_PROCESS_EVENT_WAKE } from "../host/runtime/abi.mjs";

const encoder = new TextEncoder();
const spawnHeaderSize = DOLLY_PROCESS_SIZEOF.dolly_process_spawn_request;
const spawnField = DOLLY_PROCESS_OFFSETOF.dolly_process_spawn_request;
const mappingField = DOLLY_PROCESS_OFFSETOF.dolly_process_fd_mapping;
const mappingSize = DOLLY_PROCESS_SIZEOF.dolly_process_fd_mapping;
// The kernel's deferred-call result; processes never observe it.
const deferredResult = -(1n << 63n);
const interruptedSystemCall = -BigInt(DOLLY_ERRNO.EINTR);
// Trusted bounds on concurrent process Workers, independent of kernel
// records: a spawn is admitted while the processes' committed Wasm memory is
// under the budget or the spawning process has no live child, and the count,
// the kernel's table, is the backstop. It stays below what Chromium reserves:
// the memory of a 61st process of 8 GiB was refused.
const processWorkerLimit = 56;
const processMemoryBudgetBytes = 4 * 1024 * 1024 * 1024;
// A spawn the count refuses waits as long as a Worker asks again for a memory
// Chromium cannot reserve yet (page/process-worker.mjs), like any blocking
// call, asked again whenever a process ends and at each service tick; then it
// fails EAGAIN, a full process table's answer. A spawn the budget refuses
// waits until a process ends, however long: make and Cargo end a build at a
// spawn's EAGAIN. So a pipeline started over the budget waits forever if its
// first stage fills the pipe before the next stage is admitted; a signal
// (Ctrl+C) ends the wait.
const reservationPatienceMilliseconds = 5000;
// A Worker ended mid-copy into its mailbox finishes the copy within
// microseconds; one that holds the mailbox this long keeps it.
const mailboxSealMilliseconds = 1000;
const compiledModuleCacheEntries = 64;
const compiledModuleCacheBytes = 256 * 1024 * 1024;
// File versions known to hold a cached module's bytes (dolly_process_image_version).
const compiledVersionEntries = 1024;
const compilationNoticeMilliseconds = 250;
// A large executable's module is compiled and held in a Worker of its own,
// which goes once neither the cache nor a process holds the module: a Module
// held here would go only at this Worker's next collection, which compiled
// code does not hasten. Four 96 MB executables launched in turn kept five
// compiled in Firefox, where the cache held two. An idle Worker costs about
// 2.5 MB, so a small module is compiled and held here.
const heldModuleBytes = 16 * 1024 * 1024;
// It reaches the supervisor on the port the page sends it first (pageWorker).
const holderUrl = URL.createObjectURL(new Blob([`let module, supervisor;
onmessage = async ({ data: { supervisor: port, bytes, port: channel } }) => {
  if (port) return void (supervisor = port, port.onmessage = onmessage);
  if (channel) return channel.postMessage(module);
  try {
    module = await WebAssembly.compile(bytes);
    supervisor.postMessage(null);
  } catch (error) {
    supervisor.postMessage(String(error?.message ?? error));
  } finally {
    bytes.transfer(0);
  }
};`], { type: "text/javascript" }));
// The Worker holding the module compiled from BYTES, which it takes.
function compileHeld(bytes, pageWorker) {
  const holder = pageWorker(holderUrl, { name: "dolly-module" });
  return new Promise((resolve, reject) => {
    const fail = message => { holder.terminate(); reject(new Error(message)); };
    holder.addEventListener("message", ({ data }) => data === null ? resolve(holder) : fail(data));
    holder.addEventListener("error", event => { event.preventDefault(); fail(event.message || "module Worker failed"); });
    holder.postMessage({ bytes: bytes.buffer }, [bytes.buffer]);
  });
}
const largeInteractiveProcessBytes = 128 * 1024 * 1024;
const workerReclamationMilliseconds = 500;

// How many calls a recursion nests before this thread's stack ends, entered
// with enter. Each call counts itself in memory and holds sixteen values it
// loaded there across the next call, so its frame is as large in a baseline
// compiler as in an optimizing one: a one-local recursion read anything from
// 0.4 to 2.4 times in Firefox as its tiers changed.
// (func $dive (result i64) (local i64 x 16) count++; load them; dive() + their sum)
const diver = "AGFzbQEAAAABBQFgAAF+AwIBAAUDAQABBxECBm1lbW9yeQIABGRpdmUAAAq/AQG8AQEQfkEAQQAoAgBBAWo2AgBBCCkDACEAQRAp" +
  "AwAhAUEYKQMAIQJBICkDACEDQSgpAwAhBEEwKQMAIQVBOCkDACEGQcAAKQMAIQdByAApAwAhCEHQACkDACEJQdgAKQMAIQpB4AAp" +
  "AwAhC0HoACkDACEMQfAAKQMAIQ1B+AApAwAhDkGAASkDACEPEAAgAHwgAXwgAnwgA3wgBHwgBXwgBnwgB3wgCHwgCXwgCnwgC3wg" +
  "DHwgDXwgDnwgD3wL";
async function stackDepth(enter) {
  const { memory, dive } = new WebAssembly.Instance(new WebAssembly.Module(
    Uint8Array.from(atob(diver), character => character.charCodeAt(0)))).exports;
  try { await enter(dive)(); } catch { /* The stack ended: that is the measurement. */ }
  return new Uint32Array(memory.buffer, 0, 1)[0];
}

export function terminalFailureReason(error) {
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
// With `standard`, the child's descriptors 0, 1 and 2 are the kernel's own:
// the display's terminal, or the bootstrap log without one.
function encodeSpawn(arguments_, flags, standard = true) {
  if (!Array.isArray(arguments_) || arguments_.length === 0) {
    throw new TypeError("a process needs argv[0]");
  }
  const [path] = arguments_;
  if (typeof path !== "string" || !path.startsWith("/") || path.includes("\0")) {
    throw new TypeError("a process path must be absolute");
  }
  const pathBytes = encoder.encode(path);
  const argumentBytes = encodeStrings(arguments_, "process arguments");
  const mappings = standard ? 3 : 0;
  const size = spawnHeaderSize + pathBytes.length + argumentBytes.length + mappings * mappingSize;
  if (pathBytes.length > 4096 || size > packetLimit) {
    throw new RangeError("process spawn packet is too large");
  }
  const packet = new Uint8Array(size);
  const view = new DataView(packet.buffer);
  view.setUint32(spawnField.flags, flags | DOLLY_PROCESS_SPAWN_INHERIT_ENVIRONMENT, true);
  view.setUint32(spawnField.argument_count, arguments_.length, true);
  view.setUint32(spawnField.mapping_count, mappings, true);
  view.setUint32(spawnField.path_size, pathBytes.length, true);
  view.setBigUint64(spawnField.argument_bytes, BigInt(argumentBytes.length), true);
  view.setBigUint64(spawnField.deadline_nanoseconds, 0xffffffffffffffffn, true);
  packet.set(pathBytes, spawnHeaderSize);
  packet.set(argumentBytes, spawnHeaderSize + pathBytes.length);
  for (let descriptor = 0; descriptor < mappings; ++descriptor) {
    const mapping = size - mappings * mappingSize + descriptor * mappingSize;
    view.setUint32(mapping + mappingField.source_descriptor, descriptor, true);
    view.setUint32(mapping + mappingField.target_descriptor, descriptor, true);
  }
  return packet;
}

// A process's memory lives in its own Workers alone, never in this one: a
// shared memory's pages go when the last agent holding it drops it, and a
// living Worker drops one only when it collects garbage, which a small heap
// rarely needs. So each
// Worker makes or receives the memory, holds the gate and copies its requests
// into a mailbox of its own in kernel memory, and the memory goes with the
// Worker. This Worker only names that mailbox to the kernel.
export class DollyProcessSupervisor {
  constructor(kernel, kernelMemory, gateModule, workerUrl, processContract, hostAbi, serviceHost, threadHost, processModules, pageWorker) {
    if (!(kernelMemory instanceof WebAssembly.Memory) ||
        !(gateModule instanceof WebAssembly.Module) || !(workerUrl instanceof URL)) {
      throw new TypeError("invalid Dolly process supervisor configuration");
    }
    this.kernel = kernel;
    this.kernelMemory = kernelMemory;
    this.gateModule = gateModule;
    this.workerUrl = workerUrl;
    this.processContract = processContract;
    this.hostAbi = hostAbi;
    this.serviceHost = serviceHost;
    this.threadHost = threadHost;
    this.processModules = processModules;
    // A Worker the page makes (host/runtime/runtime.mjs pageWorkers).
    this.pageWorker = pageWorker;
    this.processes = new Map();
    this.deferred = new Map();
    this.compiledModules = new Map();
    this.compiledModuleBytes = 0;
    this.compiledVersions = new Map();
    this.launchChain = Promise.resolve();
    // The processes the kernel announced for launch, in order.
    this.launches = [];
    this.mailboxAddress = Number(kernel.dolly_process_mailbox_address());
    this.mailboxCapacity = packetLimit;
    if (!Number.isSafeInteger(this.mailboxAddress) || this.mailboxAddress <= 0 ||
        this.mailboxAddress > kernelMemory.buffer.byteLength - this.mailboxCapacity) {
      throw new Error("Dolly kernel supplied an invalid process mailbox");
    }
    this.serviceTimer = setInterval(() => this.#serviceTick(), 16);
  }

  static async create(kernel, kernelMemory, runtimeBase, hostAbi, serviceHost, threadHost, processModules, pageWorker) {
    const [gateBytes, contractBytes, workerBytes] = await Promise.all([
      "dolly-process-gate-0.wasm", "dolly-process-0.wasm", "dolly-process-worker.mjs",
    ].map(async name => {
      const response = await fetch(new URL(`dist/${name}`, runtimeBase), {
        credentials: "same-origin", redirect: "error",
      });
      if (!response.ok) throw new Error(`Dolly ${name} returned HTTP ${response.status}`);
      return response.arrayBuffer();
    }));
    const gateModule = await WebAssembly.compile(gateBytes);
    // Fresh Workers share trusted code bytes, never process memory or JS state.
    const workerUrl = new URL(URL.createObjectURL(new Blob([workerBytes], { type: "text/javascript" })));
    try {
      const supervisor = new DollyProcessSupervisor(
        kernel, kernelMemory, gateModule, workerUrl,
        parseWasmInterface(contractBytes, "dolly-process-0"),
        hostAbi, serviceHost, threadHost, processModules, pageWorker,
      );
      supervisor.releaseWorkerSource = () => URL.revokeObjectURL(workerUrl.href);
      // Entered through JSPI (WebAssembly.promising), a process runs on a
      // stack of its own. Chrome's holds about 950 KB where a Worker's holds
      // 500 KB, which Clang needs: an executable asks for it with a
      // dolly.process.stack section, and only the compiler carries one
      // (programs/compiler-main.c). Every other program is entered
      // directly: a Codex build crashed Chrome's tab twice on that stack,
      // and Firefox 155 reports every
      // Worker terminated inside such a call as an uncaught exception that no
      // listener receives. Firefox's holds no more, so the entry is also taken
      // only where it is measured half again as deep (Chrome 151: 1.90
      // times, Firefox 155: 1.01, each in 48 measurements of 48). stack@0
      // sizes the room of each stack by the same measurements.
      supervisor.stackDepths = { direct: await stackDepth(entry => entry),
        promising: WebAssembly.promising ? await stackDepth(WebAssembly.promising) : 0 };
      supervisor.promisingEntry = supervisor.stackDepths.promising > 1.5 * supervisor.stackDepths.direct;
      return supervisor;
    } catch (error) {
      URL.revokeObjectURL(workerUrl.href);
      throw error;
    }
  }

  // The module that provides threads was disabled and its Workers are
  // terminated: the programs that ran on them end here, each told why on its
  // own stderr.
  withdrawThreads() {
    this.threadHost = undefined;
    for (const process of [...this.processes.values()]) {
      if (process.threaded) this.#fail(process, new Error("its threads' module was disabled"));
    }
  }

  // What a spawn waits for, "count" or "budget", or null when it is admitted.
  // The budget bounds fan-out (make -j, xargs -P), not a chain: refusing the
  // one child a process waits for (zig build-exe's cc, cc's wasm-opt) would
  // stop a build the machine can hold, so a parent with no live child is
  // admitted under the count alone. The page's own spawns have parent 0.
  #spawnWait(parent) {
    if (this.processes.size >= processWorkerLimit) return "count";
    let committed = 0, fanning = false;
    for (const process of this.processes.values()) {
      committed += process.memoryBytes;
      fanning ||= process.parent === parent && !process.retiring;
    }
    return committed < processMemoryBudgetBytes || !fanning ? null : "budget";
  }

  // A root process on the standard streams of the boot, or, with `start`, on
  // those a module gives it: start(size) spawns the packet of that size in the
  // supervisor's mailbox, which maps no stream, and returns the PID or -errno.
  spawn(arguments_, { foreground = false, start } = {}) {
    if (this.#spawnWait(0)) throw new Error("Dolly process limit reached");
    const packet = encodeSpawn(arguments_, foreground ? DOLLY_PROCESS_SPAWN_FOREGROUND : 0, start === undefined);
    new Uint8Array(
      this.kernelMemory.buffer,
      this.mailboxAddress,
      packet.length,
    ).set(packet);
    const pid = (start ?? (size => this.kernel.dolly_process_spawn_serialized(size)))(BigInt(packet.length));
    if (pid < 0) {
      const errno = Object.keys(DOLLY_ERRNO).find(name => DOLLY_ERRNO[name] === -pid) ?? `errno ${-pid}`;
      throw new Error(`cannot start ${arguments_[0]}: ${errno}`);
    }
    const completion = new Promise((resolve, reject) => {
      this.#registerProcess(pid, 0, resolve, reject);
    });
    this.#serviceEvents();
    return completion;
  }

  #registerProcess(pid, parent, resolve = null, reject = null) {
    const flags = this.kernel.dolly_process_spawn_flags(pid);
    if (pid <= 0 || this.processes.has(pid) || flags < 0 ||
        this.kernel.dolly_process_parent(pid) !== parent) {
      throw new Error(`kernel supplied invalid process ${pid}`);
    }
    const process = {
      pid, parent, resolve, reject, worker: null, control: null, mailbox: 0,
      memoryBytes: 0, messageHandler: null, errorHandler: null,
      messageErrorHandler: null, started: false,
      failure: null, interactive: (flags & DOLLY_PROCESS_SPAWN_INTERACTIVE) !== 0, retiring: false,
      retirementTimer: null, reclamationDeadline: 0, tid: 0, threads: new Map(), threaded: false,
      execution: null,
    };
    this.processes.set(pid, process);
  }

  #serviceTick() {
    this.serviceHost();
    this.#serviceEvents();
    this.serviceDeferred();
  }

  // The kernel decides what happens to processes and the supervisor carries
  // it out (dolly_process_next_event), asked after each dispatch and each
  // ending, at each tick and when what the kernel has due comes due.
  #serviceEvents() {
    for (let event; (event = this.kernel.dolly_process_next_event()) !== 0n;) {
      const kind = Number(event >> BigInt(DOLLY_PROCESS_EVENT_KIND_SHIFT)),
        value = Number((event >> BigInt(DOLLY_PROCESS_EVENT_VALUE_SHIFT)) & 0xffffn), pid = Number(event & 0xffffffffn);
      if (kind === DOLLY_PROCESS_EVENT_LAUNCH) this.#announced(pid);
      else if (kind === DOLLY_PROCESS_EVENT_INTERRUPT) this.#interrupt(this.processes.get(pid), value);
      else if (kind === DOLLY_PROCESS_EVENT_TERMINATE) this.#terminated(pid);
      else if (kind === DOLLY_PROCESS_EVENT_WAKE) this.serviceDeferred();
      else throw new Error(`kernel supplied unknown event ${kind}`);
    }
    const due = this.kernel.dolly_process_service_milliseconds();
    clearTimeout(this.serviceDue);
    this.serviceDue = due >= 0 ? setTimeout(() => this.#serviceEvents(), Math.ceil(due)) : undefined;
  }

  // A spawned process to prepare: one the page spawned is known already.
  #announced(pid) {
    if (!this.processes.has(pid)) this.#registerProcess(pid, this.kernel.dolly_process_parent(pid));
    this.launches.push(pid);
    this.#scheduleLaunches();
  }

  // The kernel ended the process: its Workers stop, and it retires. One never
  // announced has none.
  #terminated(pid) {
    const process = this.processes.get(pid);
    if (process) {
      if (!process.retiring) this.#retire(process);
    } else if (this.kernel.dolly_process_worker_retired(pid) !== 0) {
      throw new Error(`kernel rejected the retirement of process ${pid}`);
    }
  }

  // A signal reached a running process: its blocked call returns EINTR, and
  // an EXEC in progress is refused unless the signal is a resize.
  #interrupt(process, signalNumber) {
    if (!process || process.retiring || !process.started) return;
    const receiver = process.threaded
      ? [...process.threads.values()].sort((a, b) => a.tid - b.tid)[0] : process;
    const deferred = this.deferred.get(receiver);
    if (deferred) {
      this.#clearDeferred(receiver);
      this.#signal(receiver, deferred.message.sequence, interruptedSystemCall);
    }
    // The old program takes the signal and calls EXEC again, as after any
    // interrupted call; a resize waits for the new program.
    if (process.execution?.thread === receiver && signalNumber !== DOLLY_PROCESS_SIGWINCH) {
      const { message } = process.execution;
      process.execution = null;
      this.kernel.dolly_process_exec_refused(process.pid, 0n);
      this.#signal(receiver, message.sequence, interruptedSystemCall);
    }
  }

  #scheduleLaunches() {
    this.launchChain = this.launchChain
      .then(() => this.#launchPending())
      .catch((error) => {
        // Only a kernel that cannot name its next launch reaches this point.
        for (const process of [...this.processes.values()]) this.#fail(process, error);
      });
  }

  // The module for the executable the kernel opened for a process: the one
  // compiled from the same version of its file's bytes, which takes no read,
  // or one compiled from the bytes, found by their SHA-256 or compiled now.
  async #compiledImage(pid) {
    const version = BigInt(this.kernel.dolly_process_image_version(pid));
    const known = version !== 0n && this.#knownModule(this.compiledVersions.get(version));
    if (known) {
      if (this.kernel.dolly_process_image_consumed(pid) !== 0) {
        throw new Error(`kernel did not release executable ${pid}`);
      }
      return known;
    }
    const compiled = await this.#compileProcess(this.#takeImage(pid), pid);
    if (version !== 0n) {
      this.compiledVersions.delete(version);
      this.compiledVersions.set(version, compiled.key);
      if (this.compiledVersions.size > compiledVersionEntries) {
        this.compiledVersions.delete(this.compiledVersions.keys().next().value);
      }
    }
    return compiled;
  }

  // The module compiled from the bytes KEY names, made the most recently used:
  // the cache's, or one the cache let go that a process still runs. A second
  // copy would be compiled in full: in Firefox, whose Workers share one budget
  // of code memory, three copies of rustc (254.5 MiB) left none for its linker.
  #knownModule(key) {
    const running = [...this.processes.values()].map(process => process.compiled).filter(Boolean);
    const known = this.compiledModules.get(key) ?? running.find(compiled => compiled.key === key);
    if (known) this.#remember(known);
    return known;
  }

  // Makes a module the cache's most recently used, if it fits.
  #remember(compiled) {
    if (this.compiledModules.delete(compiled.key)) this.compiledModuleBytes -= compiled.byteLength;
    if (compiled.byteLength > compiledModuleCacheBytes) return;
    this.#evict(compiled.byteLength);
    this.compiledModules.set(compiled.key, compiled);
    this.compiledModuleBytes += compiled.byteLength;
  }

  // The notices of a slow compile go to process `pid`, whose launch started it.
  async #compileProcess(bytes, pid) {
    const byteLength = bytes.byteLength;
    const digest = hex(await crypto.subtle.digest("SHA-256", bytes));
    const key = `${byteLength}:${digest}`;
    const known = this.#knownModule(key);
    if (known) return known;
    // What this module will replace in the cache goes before it is compiled.
    if (byteLength <= compiledModuleCacheBytes) this.#evict(byteLength);

    const started = performance.now();
    let noticeShown = false;
    const notice = setTimeout(() => {
      noticeShown = true;
      const mebibytes = (byteLength / (1024 * 1024)).toFixed(1);
      this.#writeTerminal(pid,
        `\ndolly: preparing ${mebibytes} MiB WebAssembly executable for this session...\n`,
      );
    }, compilationNoticeMilliseconds);
    let module;
    let memoryRequirements;
    let processInterface;
    let threaded;
    let largeStack;
    let requirements;
    let prepared = false;
    try {
      const parsed = parseWasmInterface(bytes);
      memoryRequirements = validateProcessInterface(this.processContract, parsed, DOLLY_PROCESS_ABI_DIGEST);
      requirements = executableHostRequirements(parsed);
      checkHostAbi(requirements, this.hostAbi);
      threaded = this.threadHost?.threaded(parsed, requirements) ?? false;
      largeStack = parsed.customSections.includes("dolly.process.stack");
      // The runtime calls _start and Dolly's own exports (dolly_thread_start,
      // __dolly_dso_allocate) by name; dso@0 finds the others in the table.
      const byTable = exportFunctionsByTable(bytes, parsed, { has: name => name === "_start" || /^(__)?dolly_/.test(name) });
      const thunks = parsed.castEmulationParameters ? castThunkTargets(bytes, parsed) : undefined;
      if (byTable) {
        // The copy is compiled (compileHeld takes it): the bytes read go now,
        // not at this Worker's next collection, which Firefox makes seconds later.
        bytes.buffer.transfer(0);
        bytes = byTable.bytes;
      }
      module = bytes.byteLength >= heldModuleBytes ? await compileHeld(bytes, this.pageWorker) : await WebAssembly.compile(bytes);
      processInterface = { imports: parsed.imports, exports: exportIndex(parsed.exports, byTable?.slots, thunks),
        castEmulationParameters: parsed.castEmulationParameters };
      prepared = true;
    } finally {
      clearTimeout(notice);
      if (noticeShown) {
        this.#writeTerminal(pid,
          prepared
            ? `dolly: executable ready in ${((performance.now() - started) / 1000).toFixed(1)}s\n`
            : "dolly: executable preparation failed\n",
        );
      }
    }
    const compiled = { key, module, memoryRequirements, processInterface, threaded, largeStack, requirements, byteLength };
    this.#remember(compiled);
    return compiled;
  }

  // Evicts the least recently used modules until one of byteLength fits.
  #evict(byteLength) {
    while (this.compiledModules.size && (this.compiledModules.size >= compiledModuleCacheEntries ||
           this.compiledModuleBytes + byteLength > compiledModuleCacheBytes)) {
      const [oldestKey, oldest] = this.compiledModules.entries().next().value;
      this.compiledModules.delete(oldestKey);
      this.compiledModuleBytes -= oldest.byteLength;
      this.#release(oldest);
    }
  }

  // Ends the Worker of a held module (heldModuleBytes) that neither the cache
  // nor a process holds.
  #release(compiled) {
    if (compiled.module instanceof WebAssembly.Module || this.compiledModules.get(compiled.key) === compiled) return;
    for (const process of this.processes.values()) if (process.compiled === compiled) return;
    compiled.module.terminate();
  }

  #writeTerminal(pid, text) {
    const bytes = encoder.encode(text);
    const address = this.kernel.malloc(BigInt(Math.max(1, bytes.byteLength)));
    if (address === 0 || address === 0n) return;
    try {
      new Uint8Array(
        this.kernelMemory.buffer, Number(address), bytes.byteLength,
      ).set(bytes);
      this.kernel.dolly_terminal_write_bytes(
        pid, BigInt(address), BigInt(bytes.byteLength),
      );
    } finally {
      this.kernel.free(BigInt(address));
    }
  }

  async #launchPending() {
    for (let pid; (pid = this.launches.shift()) !== undefined;) {
      const process = this.processes.get(pid);
      // Ended before its turn: retired already.
      if (!process || process.retiring) continue;
      let compiled;
      try {
        compiled = await this.#compiledImage(pid);
        if (this.#canLaunch(process)) this.#start(process, compiled, this.#admit(compiled));
      } catch (error) {
        // A failed launch ends only its own process.
        this.#fail(process, error);
      } finally {
        if (compiled) this.#release(compiled);
      }
    }
  }

  // The bytes of the executable the kernel opened for a process, copied from
  // the file's own blocks (the kernel makes no copy), which it then closes.
  // One copy: Web Crypto rejects views of shared memory.
  #takeImage(pid) {
    const size = Number(this.kernel.dolly_process_image_size(pid));
    if (size < 0) throw new Error(`cannot read the executable of process ${pid}: ${size}`);
    if (!Number.isSafeInteger(size) || size < 8) throw new Error(`kernel supplied an invalid executable for process ${pid}`);
    const bytes = new Uint8Array(size);
    for (let offset = 0; offset < size; offset += DOLLY_FS_BLOCK_SIZE) {
      const length = Math.min(DOLLY_FS_BLOCK_SIZE, size - offset);
      const address = Number(this.kernel.dolly_process_image_block(pid, BigInt(offset / DOLLY_FS_BLOCK_SIZE)));
      if (!Number.isSafeInteger(address) || address <= 0 || address > this.kernelMemory.buffer.byteLength - length) {
        throw new Error(`kernel supplied an invalid executable for process ${pid}`);
      }
      bytes.set(new Uint8Array(this.kernelMemory.buffer, address, length), offset);
    }
    if (this.kernel.dolly_process_image_consumed(pid) !== 0) {
      throw new Error(`kernel did not release executable ${pid}`);
    }
    return bytes;
  }

  // Checked at every launch, not only when compiled: nena@0 may have disabled
  // a module since. Returns the modules served in this executable's own
  // Workers, each thread's among them (dso@0, stack@0).
  #admit({ requirements, threaded }) {
    checkHostAbi(requirements, this.hostAbi);
    const local = [...requirements.keys()].filter(requirement => this.processModules.has(requirement));
    if (threaded && !this.threadHost) throw new Error("no module provides its threads");
    return local;
  }

  #start(process, compiled, local) {
    const { memoryRequirements, processInterface, threaded, largeStack } = compiled;
    Object.assign(process, { memoryRequirements, memoryBytes: Number(memoryRequirements.initial) * 65536,
      compiled, processInterface, threaded, largeStack, local });
    if (threaded) {
      const tid = this.threadHost.attach(process.pid);
      if (tid <= 0) throw new Error(`kernel could not reserve main thread: ${tid}`);
      process.tid = tid;
      process.threads.set(tid, process);
    }
    this.#launchWorker(process, process);
  }

  // EXEC: the kernel has read the new program and the old one waits in the
  // call while it is compiled and admitted. A refusal returns to the old
  // program with ENOEXEC, after one line on its stderr; past the commit the
  // old program's Workers go and the process starts again, its pid and
  // record kept.
  async #exec(process, thread, message) {
    const execution = { thread, message };
    process.execution = execution;
    let compiled, local;
    const unused = () => compiled && this.#release(compiled);
    try {
      compiled = await this.#compiledImage(process.pid);
      if (process.execution === execution) local = this.#admit(compiled);
    } catch (error) {
      unused();
      if (process.execution !== execution) return;
      process.execution = null;
      const line = encoder.encode(`dolly: process ${process.pid} cannot run its new program: ` +
        `${terminalFailureReason(error)}\n`);
      new Uint8Array(this.kernelMemory.buffer, this.mailboxAddress, line.length).set(line);
      this.kernel.dolly_process_exec_refused(process.pid, BigInt(line.length));
      this.#signal(thread, message.sequence, -BigInt(DOLLY_ERRNO.ENOEXEC));
      return;
    }
    if (process.execution !== execution) return unused();
    process.execution = null;
    const committed = this.kernel.dolly_process_exec_commit(process.pid);
    if (committed < 0) {
      unused();
      this.#fail(process, new Error(`kernel rejected process ${process.pid} exec: ${committed}`));
      return;
    }
    // The old program's memory goes with its Workers. Termination has no
    // completion event: a large interactive one gets the time it gets before
    // a parent may start its replacement (#reclamationDeadline).
    const delay = this.#reclamationDeadline(process) - performance.now();
    this.#disposeWorker(process, compiled);
    Object.assign(process, { started: false, threaded: false, tid: 0, threads: new Map() });
    // Its descriptors with CLOEXEC are closed: a reader of their pipes goes on now.
    this.#serviceEvents();
    const start = () => {
      try {
        if (this.#canLaunch(process)) this.#start(process, compiled, local);
      } catch (error) { this.#fail(process, error); } finally { this.#release(compiled); }
    };
    if (delay > 0) setTimeout(start, delay);
    else start();
  }

  // port: for a thread, the channel the spawning Worker sends the memory on.
  #launchWorker(process, thread, argument = undefined, port = undefined) {
    const { pid, compiled: { module }, memoryRequirements, processInterface, threaded, local } = process;
    const name = `dolly-process-${pid}-thread-${thread.tid}`;
    const worker = threaded ? this.threadHost.create(pid, this.workerUrl, name)
      : this.pageWorker(this.workerUrl, { type: "module", name });
    if (!worker) throw new Error("thread Worker capacity exhausted");
    const control = new SharedArrayBuffer(controlBytes);
    thread.mailbox = Number(this.kernel.malloc(BigInt(packetLimit)));
    if (!thread.mailbox) { worker.terminate(); throw new Error("kernel memory for a process mailbox"); }
    if (this.kernel.dolly_process_worker_mailbox(pid, thread.tid, BigInt(thread.mailbox)) !== 0) {
      worker.terminate();
      this.kernel.free(BigInt(thread.mailbox));
      thread.mailbox = 0;
      throw new Error(`kernel does not know thread ${thread.tid} of process ${pid}`);
    }
    thread.worker = worker;
    thread.control = new Int32Array(control);
    thread.messageHandler = event => this.#message(process, event.data, thread);
    // Cancelled, or the browser reports the Worker's uncaught error again in
    // this Worker, whose end it would be (page/browser.mjs).
    thread.errorHandler = event => { event.preventDefault(); this.#fail(process, new Error(event.message || `${name} failed`)); };
    thread.messageErrorHandler = () => this.#fail(process, new Error(`${name} message could not be decoded`));
    worker.addEventListener("message", thread.messageHandler);
    worker.addEventListener("error", thread.errorHandler, { once: true });
    worker.addEventListener("messageerror", thread.messageErrorHandler, { once: true });
    // The doorbell: the Worker's start, then each call, in their order.
    const fields = new Float64Array(control, callFieldsOffset, callFields.length), ring = (observed, started) =>
      void Promise.resolve(Atomics.waitAsync(thread.control, controlWord.doorbell, observed).value).then(() => {
        if (thread.worker !== worker) return;
        if (!started && Atomics.load(thread.control, controlWord.started)) {
          started = true;
          this.#message(process, { type: "started", pid, tid: thread.tid }, thread);
        }
        const sequence = Atomics.load(thread.control, controlWord.doorbell);
        if (sequence !== observed) this.#message(process, { type: "syscall", pid, tid: thread.tid, sequence,
          ...Object.fromEntries(callFields.map((name, index) => [name, fields[index]])) }, thread);
        ring(sequence, started);
      });
    ring(0, false);
    // local: the modules this executable records that are served in its own
    // Worker (host/dso), each as the bundle it imports and its configuration.
    // A held module comes from its Worker, on a channel of this Worker's own,
    // which the thread keeps: once this Worker collects the ports it handed on,
    // Firefox forgets what the holder posted that the thread's Worker has not
    // read yet, and the Worker gets a messageerror (measured 2026-11-17, Firefox 155).
    const channel = module instanceof WebAssembly.Module ? null : new MessageChannel();
    thread.moduleChannel = channel;
    channel && module.postMessage({ port: channel.port1 }, [channel.port1]);
    worker.postMessage({ type: "configure", pid, tid: thread.tid, argument, threaded, control,
      threadOperations: threaded ? this.threadHost.operations : undefined, threadEntry: threaded ? this.threadHost.entry : undefined,
      module: channel ? channel.port2 : module,
      memory: memoryRequirements, port, mailbox: thread.mailbox, kernelMemory: this.kernelMemory, gateModule: this.gateModule,
      promisingEntry: this.promisingEntry && process.largeStack, stackDepths: this.stackDepths,
      clockOrigin: performance.timeOrigin, processInterface, local: local.map(requirement => this.processModules.get(requirement)) },
    [port, channel?.port2].filter(Boolean));
  }

  #canLaunch(process) {
    if (this.processes.get(process.pid) !== process || process.retiring) return false;
    // An ancestor's EXIT can reach the kernel before its Worker posts finished.
    if (this.kernel.dolly_process_exited(process.pid) !== 0) {
      this.#retire(process);
      return false;
    }
    return true;
  }

  #signal(process, sequence, result) {
    const encoded = BigInt.asUintN(64, result);
    Atomics.store(process.control, controlWord.resultLow, Number(encoded & 0xffffffffn));
    Atomics.store(process.control, controlWord.resultHigh, Number((encoded >> 32n) & 0xffffffffn));
    Atomics.store(process.control, controlWord.answered, sequence);
    Atomics.notify(process.control, controlWord.answered);
  }

  #clearTimers(process) {
    if (process.retirementTimer !== null) clearTimeout(process.retirementTimer);
    process.retirementTimer = null;
  }

  #clearDeferred(thread) {
    const pending = this.deferred.get(thread);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.deferred.delete(thread);
  }

  // The thread's Worker has copied the request into its mailbox (thread.mailbox)
  // and reads the response from it once answered; what this reads of the
  // mailbox, it reads before it answers.
  #syscall(process, message, retry = false, thread = process) {
    const pending = this.deferred.get(thread);
    this.#clearDeferred(thread);
    const values = [
      message.sequence,
      message.operation,
      message.requestAddress,
      message.requestSize,
      message.responseAddress,
      message.responseCapacity,
      message.memoryBytes,
    ];
    const spawnsThread = process.threaded && message.operation === this.threadHost?.operations.spawn;
    if (message.pid !== process.pid || message.tid !== thread.tid ||
        values.some((value) => !Number.isSafeInteger(value) || value < 0) ||
        message.requestSize > packetLimit || message.responseCapacity > packetLimit ||
        spawnsThread !== (message.port instanceof MessagePort) ||
        Atomics.load(thread.control, controlWord.call) !== message.sequence ||
        Atomics.load(thread.control, controlWord.answered) === message.sequence) {
      this.#fail(process, new Error(`process ${process.pid} sent an invalid syscall`));
      return;
    }
    // The size the budget counts: a threaded process's memory takes its maximum
    // as it starts (page/process-worker.mjs), and it counts its initial size.
    if (!process.threaded) process.memoryBytes = message.memoryBytes;
    let result;
    let threadArgument;
    let portTaken = false;
    try {
      // A deferred call is retried against the request still in the mailbox:
      // a handler that defers has written nothing (kernel/process-kernel.h).
      const mailbox = () => new DataView(this.kernelMemory.buffer, thread.mailbox, 8);
      if (spawnsThread && message.requestSize === 8)
        threadArgument = mailbox().getBigUint64(0, true);
      const args = [process.pid, message.operation, BigInt(message.requestSize), BigInt(message.responseCapacity)];
      if (process.threaded) args.splice(1, 0, thread.tid);
      const waiting = message.operation === DOLLY_PROCESS_SPAWN ? this.#spawnWait(process.pid) : null;
      const now = performance.now(), since = waiting === "count" ? pending?.refusedSince ?? now : undefined;
      if (waiting === "budget" || waiting === "count" && now - since < reservationPatienceMilliseconds) {
        this.deferred.set(thread, { process, thread, message, timer: null, refusedSince: since });
        return;
      }
      const exhausted = waiting === "count" || spawnsThread && !this.threadHost?.available(process.pid);
      // Firefox can enter a direct Wasm call twice. Use the generic call path
      // so a completed syscall is never replayed against its response packet.
      result = exhausted ? -BigInt(DOLLY_ERRNO.EAGAIN)
        : process.threaded ? this.threadHost.dispatch(args) : Reflect.apply(this.kernel.dolly_process_dispatch, this.kernel, args);
      if (result === deferredResult) {
        const deferred = { process, thread, message, timer: null };
        this.deferred.set(thread, deferred);
        const remaining = this.kernel.dolly_process_deferred_milliseconds();
        if (remaining >= 0 && remaining <= 16) {
          deferred.timer = setTimeout(() => {
            if (this.deferred.get(thread) === deferred) this.#syscall(process, message, true, thread);
          }, Math.ceil(remaining));
        }
        return;
      }
      if (message.operation === DOLLY_PROCESS_EXEC && message.requestSize !== 0 && result === 0n) {
        this.#exec(process, thread, message).catch(error => this.#fail(process, error));
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
        if (spawnsThread) {
          if (result !== 8n || threadArgument === undefined) throw new Error("invalid kernel thread response");
          const tid = mailbox().getUint32(0, true);
          if (!tid || tid > 0x7fffffff || mailbox().getUint32(4, true) || process.threads.has(tid))
            throw new Error("invalid kernel thread identity");
          const child = { tid, worker: null, control: null, mailbox: 0 };
          process.threads.set(tid, child);
          try { this.#launchWorker(process, child, threadArgument, message.port); portTaken = true; }
          catch (error) {
            this.#disposeThread(process, child);
            this.threadHost.unstarted(process.pid, tid);
            result = -BigInt(DOLLY_ERRNO.EAGAIN);
          }
        }
      }
    } catch (error) {
      message.port?.close();
      this.#fail(process, error);
      return;
    }
    if (!portTaken) message.port?.close();
    this.#signal(thread, message.sequence, result);
    // What the call set in motion: a spawn's launch, a signal's delivery, and
    // a pipe write or close that completes another thread's blocked read or
    // poll, such as an async runtime's waker, retried now, not at the next tick.
    this.#serviceEvents();
  }

  #message(process, message, thread = process) {
    if (this.processes.get(process.pid) !== process || process.retiring ||
        (process.threaded && process.threads.get(thread.tid) !== thread)) return;
    if (message?.pid !== process.pid || message?.tid !== thread.tid) {
      this.#fail(process, new Error(`process ${process.pid} sent a mismatched identity`));
    } else if (message.type === "started") {
      if (thread !== process) return;
      if (this.kernel.dolly_process_worker_started(process.pid) !== 0) {
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
      // Withdrawn since, the module has ended the process already.
      const last = this.threadHost?.retired(process.pid, thread.tid, message.result) ?? -1;
      if (last < 0) this.#fail(process, new Error("kernel rejected thread retirement"));
      else if (last) this.#forceExit(process.pid, 0);
      else this.serviceDeferred();
    } else if (message.type === "finished") {
      // _start returned (status zero), or EXIT has already recorded the status.
      this.#recordExit(process.pid, 0, 0);
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
      process.interactive && process.memoryBytes >= largeInteractiveProcessBytes
        ? performance.now() + workerReclamationMilliseconds : 0);
  }

  #retire(process) {
    process.retiring = true;
    // Its children live on: the kernel has given them parent 0.
    for (const child of this.processes.values()) if (child.parent === process.pid) child.parent = 0;
    process.reclamationDeadline = this.#reclamationDeadline(process);
    this.#stop(process);
    // The kernel has closed the process's descriptors: a reader of its pipe or
    // a waiter for its lock proceeds now, not at the next tick; a signal that
    // ended it has reached its descendants.
    this.#serviceEvents();
    const retired = () => {
      process.retirementTimer = null;
      if (this.processes.get(process.pid) !== process) return;
      this.#acknowledgeRetirement(process);
      if (process.resolve) this.#finish(process);
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
    const result = this.kernel.dolly_process_worker_retired(process.pid);
    if (result !== 0) {
      throw new Error(`kernel rejected process ${process.pid} retirement: ${result}`);
    }
    this.processes.delete(process.pid);
  }

  // Resolves how a root process ended, as the kernel recorded it: whoever ended
  // it (the program, the supervisor or the kernel itself), the wait record and
  // this are one fact.
  #finish(process) {
    const ending = this.kernel.dolly_process_collect(process.pid);
    const status = ending < 0 ? ending : ending & 255;
    // The modules see what the process left, such as its last terminal
    // output, before anyone learns that it ended.
    this.serviceHost();
    if (process.failure) {
      process.failure.status = status;
      process.reject(process.failure);
    } else if (!Number.isInteger(ending) || ending < 0) {
      process.reject(new Error(`kernel returned invalid status for process ${process.pid}`));
    } else {
      process.resolve({ status, signal: ending >> 8 });
    }
  }

  // A refusal or failure is reported to the program that asked: one line on
  // the process's own stderr, then status 126.
  #fail(process, error) {
    if (process.retiring || this.processes.get(process.pid) !== process) return;
    const detail = error instanceof Error ? error : new Error(String(error));
    const reason = terminalFailureReason(detail);
    const line = encoder.encode(`dolly: process ${process.pid} ` +
      `${process.started ? "failed" : "was refused"}: ${reason}\n`);
    new Uint8Array(this.kernelMemory.buffer, this.mailboxAddress, line.length).set(line);
    const recorded = this.kernel.dolly_process_worker_failed(process.pid, BigInt(line.length));
    if (recorded !== 0) throw new Error(`kernel refused the failure of process ${process.pid} (${recorded})`);
    detail.message = `Dolly process ${process.pid} failed: ${detail.message}`;
    process.failure = Object.assign(detail, { reason });
    if (!process.reject) console.error(detail.stack ?? detail.message);
    this.#retire(process);
  }

  #forceExit(pid, status, signalNumber = 0) {
    const process = this.processes.get(pid);
    if (!process) return false;
    if (process.retiring) return true;
    this.#recordExit(pid, status, signalNumber);
    this.#retire(process);
    return true;
  }

  // The kernel refuses only a process it never had or an impossible status.
  #recordExit(pid, status, signalNumber) {
    const result = this.kernel.dolly_process_worker_exited(pid, status, signalNumber);
    if (result !== 0) throw new Error(`kernel refused the exit of process ${pid} (${result})`);
  }

  #disposeThread(process, thread) {
    this.#clearDeferred(thread);
    if (thread.worker) {
      thread.worker.removeEventListener("message", thread.messageHandler);
      thread.worker.removeEventListener("error", thread.errorHandler);
      thread.worker.removeEventListener("messageerror", thread.messageErrorHandler);
      // Chrome keeps a Worker terminated inside Atomics.wait, and its memory,
      // for two seconds. Answered with the deferred result, which no program
      // is handed, a waiting Worker leaves Wasm and closes itself. Its doorbell's
      // waiter (#launchWorker) is woken to end.
      if (thread.control) {
        this.#signal(thread, Atomics.load(thread.control, controlWord.call), deferredResult);
        Atomics.notify(thread.control, controlWord.doorbell);
      }
      // Chrome keeps what was posted to a Worker terminated before it runs, the
      // memory a thread's Worker is sent among it, until this Worker collects
      // garbage. One that has not started (its start word still 0) is told so
      // and ends itself (page/process-worker.mjs processMemory).
      const unstarted = thread !== process && Atomics.compareExchange(thread.control, controlWord.start, 0, 2) === 0;
      if (unstarted) Atomics.notify(thread.control, controlWord.start);
      // threads@0 disabled since has already terminated its Workers.
      if (process.threaded && this.threadHost) this.threadHost.release(thread.worker, !unstarted);
      else thread.worker.terminate();
    }
    // The Worker copies a request into its mailbox under the copy word
    // (page/process-worker.mjs copyRequest); sealed, it copies no more, and the
    // mailbox goes back to the kernel. Termination has no completion event: a
    // Worker ended inside a copy finishes it first.
    if (thread.mailbox) {
      this.kernel.dolly_process_worker_mailbox(process.pid, thread.tid, 0n);
      while (Atomics.compareExchange(thread.control, controlWord.copy, 0, 2) === 1 &&
             Atomics.wait(thread.control, controlWord.copy, 1, mailboxSealMilliseconds) !== "timed-out");
      if (Atomics.load(thread.control, controlWord.copy) === 2) this.kernel.free(BigInt(thread.mailbox));
    }
    thread.mailbox = 0;
    thread.worker = null;
    thread.control = null;
    thread.messageHandler = thread.errorHandler = thread.messageErrorHandler = thread.moduleChannel = null;
    process.threads.delete(thread.tid);
  }

  // Ends a process's Workers and timers; the kernel keeps its record until collected.
  #stop(process) {
    process.retiring = true;
    process.execution = null;
    this.#clearTimers(process);
    this.#disposeWorker(process);
  }

  // next: the module an exec starts next, which stays even if it is this one.
  #disposeWorker(process, next = null) {
    for (const thread of [...process.threads.values()]) this.#disposeThread(process, thread);
    this.#disposeThread(process, process);
    const { compiled } = process;
    process.compiled = process.processInterface = null;
    if (compiled && compiled !== next) this.#release(compiled);
  }

  serviceDeferred() {
    // A retry that wakes others asks for one more pass, after this one.
    if (this.servicingDeferred) { this.deferredAgain = true; return; }
    this.servicingDeferred = true;
    try {
      do {
        this.deferredAgain = false;
        for (const deferred of [...this.deferred.values()]) {
          const { process, thread, message } = deferred;
          // An earlier retry in this pass may have ended this thread: a completed
          // EXIT stops the other threads of its process.
          if (this.deferred.get(thread) !== deferred) continue;
          if (this.processes.get(process.pid) === process && !process.retiring) {
            this.#syscall(process, message, true, thread);
          } else this.#clearDeferred(thread);
        }
      } while (this.deferredAgain);
    } finally {
      this.servicingDeferred = false;
    }
  }

  dispose() {
    clearInterval(this.serviceTimer);
    clearTimeout(this.serviceDue);
    for (const process of this.processes.values()) {
      this.#stop(process);
      process.reject?.(new Error("Dolly runtime closed"));
    }
    this.processes.clear();
    this.deferred.clear();
    for (const compiled of this.compiledModules.values()) if (!(compiled.module instanceof WebAssembly.Module)) compiled.module.terminate();
    this.compiledModules.clear();
    this.compiledModuleBytes = 0;
    this.compiledVersions.clear();
    this.releaseWorkerSource?.();
    this.releaseWorkerSource = undefined;
  }
}
