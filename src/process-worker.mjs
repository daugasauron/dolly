import { DOLLY_ERRNO } from "./process-constants.mjs";

import { DOLLY_THREAD_EXIT } from "../host/threads/abi.mjs";
import {
  DOLLY_PROCESS_CLOCK_MONOTONIC, DOLLY_PROCESS_CLOCK_REALTIME, DOLLY_PROCESS_CLOCK_TIME,
  DOLLY_PROCESS_EXIT, DOLLY_PROCESS_INTERRUPT_POLL,
  DOLLY_PROCESS_PACKET_LIMIT,
} from "./process-constants.mjs";

const PROCESS_EXIT = Symbol("Dolly process exit");
const THREAD_EXIT = Symbol("Dolly thread exit");

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
    !(configuration.memory instanceof WebAssembly.Memory) ||
    !(configuration.control instanceof SharedArrayBuffer) ||
    !Array.isArray(configuration.local) ||
    configuration.control.byteLength !== 16 ||
    !Number.isFinite(configuration.clockOrigin) ||
    !Number.isInteger(configuration.pid) || configuration.pid <= 0) {
  throw new Error("Dolly process received an invalid configuration");
}

const control = new Int32Array(configuration.control);
const clockOffset = performance.timeOrigin - configuration.clockOrigin;
// When this thread last returned from the kernel without EINTR. For a
// millisecond after that, clock reads and interrupt polls are answered here
// and a pending signal waits for the next kernel entry.
let lastSignalCheck = -Infinity;
let threadResult;
let instance;
// Host modules the executable records that are served in this Worker, without
// entering the kernel (configuration.local: the loader and FFI of dso@0).
let localModules = [];

// A packet range inside the process's memory, or null.
function packetRange(addressValue, sizeValue) {
  const address = Number(addressValue);
  const size = Number(sizeValue);
  const length = configuration.memory.buffer.byteLength;
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
  new DataView(configuration.memory.buffer, response.address, 8)
    .setBigUint64(0, BigInt(nanoseconds), true);
  return 8n;
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
    ? new DataView(configuration.memory.buffer, request.address, 8).getBigUint64(0, true) : undefined;
  let clock;
  if (operation === DOLLY_PROCESS_CLOCK_TIME && request.size === 16 && response.size >= 8 &&
      response.size <= DOLLY_PROCESS_PACKET_LIMIT) {
    const packet = new DataView(configuration.memory.buffer, request.address, 16);
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
    new DataView(configuration.memory.buffer, response.address, 4).setInt32(0, 0, true);
    return 4n;
  }
  if (request.size > DOLLY_PROCESS_PACKET_LIMIT || response.size > DOLLY_PROCESS_PACKET_LIMIT) {
    return -BigInt(DOLLY_ERRNO.E2BIG);
  }
  // Positive 31-bit sequences wrap from 2^31 - 1 back to one.
  const sequence = Atomics.load(control, 0) % 0x7fffffff + 1;
  Atomics.store(control, 0, sequence);
  self.postMessage({
    type: "syscall",
    pid: configuration.pid, tid: configuration.tid,
    sequence,
    operation,
    requestAddress: request.address,
    requestSize: request.size,
    responseAddress: response.address,
    responseCapacity: response.size,
  });
  for (;;) {
    const observed = Atomics.load(control, 1);
    if (observed === sequence) break;
    // Wait for exactly the value we observed. If the supervisor responds
    // between the load and this call, Atomics.wait returns "not-equal"
    // instead of sleeping after the notification has already happened.
    Atomics.wait(control, 1, observed);
  }
  const result = decodeResult();
  lastSignalCheck = result === -BigInt(DOLLY_ERRNO.EINTR) ? -Infinity : performance.now();
  if (operation === DOLLY_THREAD_EXIT && result >= 0n) {
    threadResult = exitingResult;
    throw THREAD_EXIT;
  }
  // Sample the same clock after kernel checks too: Firefox rounds Worker
  // time origins, so alternating the two clocks can otherwise move backwards.
  if (clock !== undefined && result === 8n) return clockResponse(clock, response, lastSignalCheck);
  if (operation === DOLLY_PROCESS_EXIT && result >= 0n) throw PROCESS_EXIT;
  return result;
}

try {
  instance = await WebAssembly.instantiate(configuration.module, {
    env: { memory: configuration.memory },
    dolly_process_0: { call },
  });
  if (typeof instance.exports._start !== "function") {
    throw new TypeError("Dolly process does not export _start");
  }
  localModules = await Promise.all(configuration.local.map(async ({ url, configuration: options }) =>
    (await import(url)).serve({ ...options, instance, memory: configuration.memory,
      processInterface: configuration.processInterface })));
  self.postMessage({ type: "started", pid: configuration.pid, tid: configuration.tid });
  if (configuration.argument !== undefined) {
    threadResult = instance.exports.dolly_thread_start(configuration.tid, configuration.argument);
    self.postMessage({ type: "thread-finished", pid: configuration.pid, tid: configuration.tid, result: threadResult });
  } else {
    instance.exports._start();
    self.postMessage({ type: "finished", pid: configuration.pid, tid: configuration.tid });
  }
} catch (error) {
  if (error === THREAD_EXIT && configuration.threaded && typeof threadResult === "bigint") {
    self.postMessage({ type: "thread-finished", pid: configuration.pid, tid: configuration.tid, result: threadResult });
  } else if (error === PROCESS_EXIT) {
    self.postMessage({ type: "finished", pid: configuration.pid, tid: configuration.tid });
  } else {
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
