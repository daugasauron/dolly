import { DOLLY_ERRNO } from "./process-constants.mjs";

import { DOLLY_THREAD_EXIT, DOLLY_THREAD_SPAWN } from "../host/threads/abi.mjs";
import {
  DOLLY_PROCESS_CLOCK_MONOTONIC, DOLLY_PROCESS_CLOCK_REALTIME, DOLLY_PROCESS_CLOCK_TIME,
  DOLLY_PROCESS_EXIT, DOLLY_PROCESS_INTERRUPT_POLL,
  DOLLY_PROCESS_PACKET_LIMIT,
} from "./process-constants.mjs";

const PROCESS_EXIT = Symbol("Dolly process exit");
const THREAD_EXIT = Symbol("Dolly thread exit");
const UNSTARTED = Symbol("Dolly thread ended before it started");
// The supervisor's answer to a call whose process it is ending, and this
// Worker's to the gate for a call that ended its thread, on which the gate
// traps (abi/dolly-process-gate-0.wat).
const deferredResult = -(1n << 63n);
// Chromium releases the address space of a terminated Worker's memory some
// time after terminate(): a memory it cannot reserve is asked for again for
// a while before the process is refused.
const reservationRetryMilliseconds = 50;
const reservationPatienceMilliseconds = 5000;

const configuration = await new Promise((resolve, reject) => {
  const timeout = setTimeout(
    () => reject(new Error("Dolly process configuration was not provided")),
    10_000,
  );
  self.addEventListener("message", function configure(event) {
    if (event.data?.type !== "configure") return;
    self.removeEventListener("message", configure);
    clearTimeout(timeout);
    resolve(event.data);
  });
});

if (!(configuration.module instanceof WebAssembly.Module) ||
    !(configuration.gateModule instanceof WebAssembly.Module) ||
    !(configuration.kernelMemory instanceof WebAssembly.Memory) ||
    !(configuration.control instanceof SharedArrayBuffer) ||
    !Array.isArray(configuration.local) ||
    configuration.control.byteLength !== 32 ||
    !Number.isFinite(configuration.clockOrigin) ||
    !Number.isSafeInteger(configuration.mailbox) || configuration.mailbox <= 0 ||
    typeof configuration.memory?.initial !== "bigint" || typeof configuration.memory?.maximum !== "bigint" ||
    (configuration.port !== undefined && !(configuration.port instanceof MessagePort)) ||
    !Number.isInteger(configuration.pid) || configuration.pid <= 0) {
  throw new Error("Dolly process received an invalid configuration");
}

const control = new Int32Array(configuration.control);
const mailbox = BigInt(configuration.mailbox);
const maximumBytes = configuration.memory.maximum * 65536n;
const clockOffset = performance.timeOrigin - configuration.clockOrigin;
// When this thread last returned from the kernel without EINTR. For a
// millisecond after that, clock reads and interrupt polls are answered here
// and a pending signal waits for the next kernel entry.
let lastSignalCheck = -Infinity;
let threadResult;
// PROCESS_EXIT or THREAD_EXIT once a call has ended this thread. The program is
// left by the gate's trap, not by an exception thrown into it: Wasm exception
// handling catches a JavaScript one, and a destructor, a noexcept frame or the
// landing pads of Rust's unwinding library would run the program on after its
// exit, its other threads gone.
let ending = null;
const ended = how => { ending = how; return deferredResult; };
let instance;
let memory, gate;
// Host modules the executable records that are served in this Worker, without
// entering the kernel (configuration.local: the loader and FFI of dso@0).
let localModules = [];
// A module that keeps this thread's Worker in step with the others' (dso@0 in a
// host using threads@0) runs each wait for the supervisor's answer.
let awaitHost = wait => wait();
// The channels this Worker sent a thread's memory on, each with the word the
// thread's Worker sets once it has the memory. Firefox drops what was posted
// on a port whose sender closes it, or ends, before the receiver has started
// (measured 2026-11-02, Firefox 155; Chrome 156 delivers it), so a channel is
// closed at a later call, once that word is set, and this Worker leaves only
// once every thread it spawned has its memory.
const openChannels = [];
const receiverPatienceMilliseconds = 10_000;
function closeReceivedChannels() {
  for (let index = openChannels.length; index--;) {
    const { port, received } = openChannels[index];
    if (Atomics.load(received, 0)) { port.close(); openChannels.splice(index, 1); }
  }
}
// The supervisor ends this Worker once it reports that its thread ended while
// the process lives on: the threads it spawned have their memory first. When
// the process ends, the supervisor has ended them already.
function reportThreadFinished() {
  for (const { received } of openChannels) {
    while (Atomics.load(received, 0) === 0 &&
           Atomics.wait(received, 0, 0, receiverPatienceMilliseconds) !== "timed-out");
  }
  self.postMessage({ type: "thread-finished", pid: configuration.pid, tid: configuration.tid, result: threadResult });
}

// The process's memory lives in its Workers alone, so that it goes when they
// end: the first Worker makes it, and a thread's receives it from the Worker
// that spawned the thread (tasks/20261101-102515-retained-process-memory).
async function processMemory() {
  if (configuration.port) {
    // A thread's start word (control word 5): the supervisor sets 2 when it ends
    // the thread before the program runs here, and this Worker ends.
    const ended = Atomics.waitAsync(control, 5, 0);
    const { memory, received } = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("the process memory was not provided")), 10_000);
      configuration.port.onmessage = ({ data }) => { clearTimeout(timeout); resolve(data ?? {}); };
      Promise.resolve(ended.value).then(() => { clearTimeout(timeout); reject(UNSTARTED); });
    });
    configuration.port.close();
    if (!(memory instanceof WebAssembly.Memory) || !(received instanceof Int32Array)) {
      throw new TypeError("Dolly thread received an invalid memory");
    }
    Atomics.store(received, 0, 1);
    Atomics.notify(received, 0);
    return memory;
  }
  const { initial, maximum } = configuration.memory;
  for (let waited = 0; ; waited += reservationRetryMilliseconds) {
    try {
      return new WebAssembly.Memory({ initial, maximum, shared: true, address: "i64" });
    } catch (error) {
      if (!(error instanceof RangeError) || waited >= reservationPatienceMilliseconds) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, reservationRetryMilliseconds));
  }
}
// A packet range inside the process's memory, or null.
function packetRange(addressValue, sizeValue) {
  const address = Number(addressValue);
  const size = Number(sizeValue);
  const length = memory.buffer.byteLength;
  return !Number.isSafeInteger(address) || !Number.isSafeInteger(size) ||
      address < 0 || size < 0 || address > length - size ||
      (size !== 0 && address === 0) ? null : { address, size };
}

function decodeResult() {
  const low = BigInt(Atomics.load(control, 2) >>> 0);
  const high = BigInt(Atomics.load(control, 3) >>> 0);
  return BigInt.asIntN(64, low | (high << 32n));
}

function clockResponse(clock, response, now) {
  const nanoseconds = Math.round(
    (clock === DOLLY_PROCESS_CLOCK_REALTIME ? Date.now() : now + clockOffset) * 1e6);
  new DataView(memory.buffer, response.address, 8)
    .setBigUint64(0, BigInt(nanoseconds), true);
  return 8n;
}

// The request goes into the mailbox under control word 4, which the
// supervisor seals (2) before it frees the mailbox of a Worker it ends: a
// Worker ended mid-copy cannot write into memory the kernel has reused. A
// sealed Worker is being terminated: false, and the call ends its thread.
function copyRequest(request) {
  if (Atomics.compareExchange(control, 4, 0, 1) !== 0) return false;
  try {
    gate.exports.request(BigInt(request.address), mailbox, BigInt(request.size));
  } finally {
    Atomics.store(control, 4, 0);
    Atomics.notify(control, 4);
  }
  return true;
}

// Chrome checks a copy, fill or atomic access of a shared memory against each
// thread's own record of its size, which another thread's growth updates
// late: the memory takes its maximum before a second thread starts and never
// grows while two run (tasks/20261030-090000-chrome-grown-memory). The thread
// that spawns does it, so its own record is current at once; a reservation
// the browser refuses fails this spawn, and the next one asks again.
function reserveMaximum() {
  const size = BigInt(memory.buffer.byteLength);
  if (size >= maximumBytes) return true;
  try { memory.grow(configuration.memory.maximum - size / 65536n); } catch { return false; }
  return true;
}

function call(operation, requestAddressValue, requestSizeValue,
              responseAddressValue, responseCapacityValue) {
  // A malformed call is the program's error: it gets an errno and keeps running.
  operation >>>= 0;
  const request = packetRange(requestAddressValue, requestSizeValue);
  const response = packetRange(responseAddressValue, responseCapacityValue);
  if (!request || !response) return -BigInt(DOLLY_ERRNO.EFAULT);
  for (const module of localModules) {
    if (module.handles(operation)) return module.call(operation, request, response);
  }
  const exitingResult = operation === DOLLY_THREAD_EXIT && request.size === 8
    ? new DataView(memory.buffer, request.address, 8).getBigUint64(0, true) : undefined;
  let clock;
  if (operation === DOLLY_PROCESS_CLOCK_TIME && request.size === 16 && response.size >= 8 &&
      response.size <= DOLLY_PROCESS_PACKET_LIMIT) {
    const packet = new DataView(memory.buffer, request.address, 16);
    const id = packet.getUint32(0, true);
    if ((id === DOLLY_PROCESS_CLOCK_REALTIME || id === DOLLY_PROCESS_CLOCK_MONOTONIC) &&
        packet.getUint32(4, true) === 0) clock = id;
    const now = performance.now();
    // Frequent clock reads and interrupt polls need no worker round trip. Still
    // enter the kernel at least once per millisecond so such loops deliver
    // pending signals.
    if (clock !== undefined && now - lastSignalCheck < 1) return clockResponse(clock, response, now);
  }
  if (operation === DOLLY_PROCESS_INTERRUPT_POLL && request.size === 0 && response.size >= 4 &&
      performance.now() - lastSignalCheck < 1) {
    new DataView(memory.buffer, response.address, 4).setInt32(0, 0, true);
    return 4n;
  }
  if (request.size > DOLLY_PROCESS_PACKET_LIMIT || response.size > DOLLY_PROCESS_PACKET_LIMIT) {
    return -BigInt(DOLLY_ERRNO.E2BIG);
  }
  // The size the spawn budget counts: a threaded process's before its reservation.
  const memoryBytes = memory.buffer.byteLength;
  // A new thread's Worker gets the memory from this one, over a channel the
  // supervisor hands it without opening.
  let channel;
  if (openChannels.length) closeReceivedChannels();
  if (operation === DOLLY_THREAD_SPAWN && configuration.threaded) {
    if (!reserveMaximum()) return -BigInt(DOLLY_ERRNO.EAGAIN);
    channel = new MessageChannel();
  }
  const result = awaitHost(() => {
    // Positive 31-bit sequences wrap from 2^31 - 1 back to one.
    const sequence = Atomics.load(control, 0) % 0x7fffffff + 1;
    Atomics.store(control, 0, sequence);
    if (!copyRequest(request)) return deferredResult;
    self.postMessage({
      type: "syscall",
      pid: configuration.pid, tid: configuration.tid,
      sequence,
      operation,
      requestAddress: request.address,
      requestSize: request.size,
      responseAddress: response.address,
      responseCapacity: response.size,
      memoryBytes,
      port: channel?.port1,
    }, channel ? [channel.port1] : []);
    for (;;) {
      const observed = Atomics.load(control, 1);
      if (observed === sequence) break;
      // Wait for exactly the value we observed. If the supervisor responds
      // between the load and this call, Atomics.wait returns "not-equal"
      // instead of sleeping after the notification has already happened.
      Atomics.wait(control, 1, observed);
    }
    return decodeResult();
  });
  if (channel) {
    if (result < 0n) channel.port2.close();
    else {
      const received = new Int32Array(new SharedArrayBuffer(4));
      channel.port2.postMessage({ memory, received });
      openChannels.push({ port: channel.port2, received });
    }
  }
  if (result === deferredResult) return ended(PROCESS_EXIT);
  if (result > 0n) gate.exports.response(mailbox, BigInt(response.address), result);
  lastSignalCheck = result === -BigInt(DOLLY_ERRNO.EINTR) ? -Infinity : performance.now();
  if (operation === DOLLY_THREAD_EXIT && result >= 0n) {
    threadResult = exitingResult;
    for (const module of localModules) module.leaving?.();
    return ended(THREAD_EXIT);
  }
  // Sample the same clock after kernel checks too: Firefox rounds Worker
  // time origins, so alternating the two clocks can otherwise move backwards.
  if (clock !== undefined && result === 8n) return clockResponse(clock, response, lastSignalCheck);
  if (operation === DOLLY_PROCESS_EXIT && result >= 0n) return ended(PROCESS_EXIT);
  return result;
}

try {
  memory = await processMemory();
  // The start word is 1 from here, unless the supervisor has just set 2.
  if (configuration.port && Atomics.compareExchange(control, 5, 0, 1) !== 0) throw UNSTARTED;
  // The trusted copier between this memory and the mailbox, and the program's
  // call import (abi/dolly-process-gate-0.wat).
  gate = new WebAssembly.Instance(configuration.gateModule, {
    process: { memory, call }, kernel: { memory: configuration.kernelMemory },
  });
  instance = await WebAssembly.instantiate(configuration.module, {
    env: { memory },
    dolly_process_0: { call: gate.exports.call },
  });
  if (typeof instance.exports._start !== "function") {
    throw new TypeError("Dolly process does not export _start");
  }
  localModules = await Promise.all(configuration.local.map(async ({ bundle, configuration: options }) => {
    const url = URL.createObjectURL(bundle);
    try {
      return (await import(url)).serve({ ...options, instance, memory,
        processInterface: configuration.processInterface, threaded: configuration.threaded,
        stack: { promisingEntry: configuration.promisingEntry, depths: configuration.stackDepths } });
    } finally { URL.revokeObjectURL(url); }
  }));
  awaitHost = localModules.find(module => module.awaitHost)?.awaitHost ?? awaitHost;
  self.postMessage({ type: "started", pid: configuration.pid, tid: configuration.tid });
  // Through JSPI where that stack is the larger one (src/process-supervisor.mjs).
  const enter = configuration.promisingEntry ? WebAssembly.promising : entry => entry;
  if (configuration.argument !== undefined) {
    threadResult = await enter(instance.exports.dolly_thread_start)(configuration.tid, configuration.argument);
    reportThreadFinished();
  } else {
    await enter(instance.exports._start)();
    self.postMessage({ type: "finished", pid: configuration.pid, tid: configuration.tid });
  }
} catch (caught) {
  if (caught === UNSTARTED) {
    // Nobody waits for a thread ended before it started.
  } else if (ending === THREAD_EXIT && configuration.threaded && typeof threadResult === "bigint") {
    reportThreadFinished();
  } else if (ending === PROCESS_EXIT) {
    self.postMessage({ type: "finished", pid: configuration.pid, tid: configuration.tid });
  } else {
    // A trap on a stack stack@0 made ends its caller with a trap of its own;
    // the provider learns the first one's reason a moment later.
    await null;
    const error = localModules.map(module => module.failure).find(Boolean) ?? caught;
    self.postMessage({
      type: "failed",
      pid: configuration.pid, tid: configuration.tid,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack ?? "" : "",
    });
  }
} finally {
  // No guest callback/event loop exists. Completion means no future Wasm entry;
  // join may reclaim this stack even before Worker.terminate releases resources.
  self.close();
}
