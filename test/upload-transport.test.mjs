import assert from "node:assert/strict";
import test from "node:test";
import { UploadTransport, UPLOAD_CANCEL_QUIET_MILLISECONDS } from "../host/upload/transport.mjs";
import { DOLLY_UPLOAD_CHUNK_CAPACITY as capacity, DOLLY_UPLOAD_MAX_SIZE } from "../host/upload/abi.mjs";
import { DOLLY_ERRNO as errno } from "../dist/dolly-errno.mjs";

const pause = () => new Promise(resolve => setTimeout(resolve, 5));
async function until(predicate) {
  for (let tries = 0; tries < 400; tries++) {
    if (predicate()) return;
    await pause();
  }
  throw new Error("upload test timed out");
}
function fixture(choose) {
  const transport = new UploadTransport(new SharedArrayBuffer(capacity + 128), 64, choose);
  return { transport, words: transport.words };
}
async function consume(transport) {
  const { words } = transport;
  const chunks = [];
  let error;
  for (;;) {
    await until(() => Atomics.load(words, 3) !== Atomics.load(words, 4));
    const sequence = Atomics.load(words, 3);
    chunks.push(transport.bytes.slice(0, Atomics.load(words, 5)));
    error = Atomics.load(words, 6);
    const eof = Atomics.load(words, 7);
    Atomics.store(words, 4, sequence);
    Atomics.notify(words, 4);
    if (!eof) continue;
    const bytes = Buffer.concat(chunks);
    // The kernel accepts EOF only at the size announced with every chunk.
    if (!error) assert.equal(Atomics.load(words, 9), bytes.length);
    return { bytes, error };
  }
}

test("upload admits a fixed mailbox, never guest-selected paths or buffer sizes", () => {
  const memory = new SharedArrayBuffer(capacity + 128);
  for (const address of [0, -1, 65, 132, NaN, Infinity, 2 ** 53, 64n]) {
    assert.throws(() => new UploadTransport(memory, address, () => {}));
  }
  assert.throws(() => new UploadTransport(new ArrayBuffer(capacity + 128), 64, () => {}));
});

test("user selection transfers binary chunks with backpressure and empty files", async () => {
  const bytes = Uint8Array.from({ length: 2 * capacity + 150000 }, (_, index) => index & 255);
  let calls = 0;
  const { transport, words } = fixture(() => { calls++; return new Blob([calls === 1 ? bytes : ""]); });
  await transport.poll();
  assert.equal(calls, 0);
  Atomics.store(words, 0, 1);
  const first = transport.poll();
  await until(() => Atomics.load(words, 3) === 1);
  await transport.poll();
  assert.equal(calls, 1, "only one file chooser can be active");
  assert.equal(Atomics.load(words, 2), 0, "unconsumed chunks cannot finish a transfer");
  assert.deepEqual(await consume(transport), { bytes: Buffer.from(bytes), error: 0 });
  await first;
  assert.equal(Atomics.load(words, 2), 1);
  Atomics.store(words, 0, 2);
  const second = transport.poll();
  assert.deepEqual(await consume(transport), { bytes: Buffer.alloc(0), error: 0 });
  await second;
  assert.equal(Atomics.load(words, 2), 2);
});

test("picker cancellation, size bounds and read failures reach Wasm as errno", async () => {
  for (const [choose, error] of [
    [() => null, errno.ECANCELED],
    [() => ({ size: DOLLY_UPLOAD_MAX_SIZE + 1, __proto__: Blob.prototype }), errno.EFBIG],
    [() => { throw new Error("PC path must not leak in errors"); }, errno.EIO],
  ]) {
    const { transport, words } = fixture(choose);
    Atomics.store(words, 0, 1);
    const pending = transport.poll();
    assert.deepEqual(await consume(transport), { bytes: Buffer.alloc(0), error });
    await pending;
  }
});

test("the user's Cancel during a transfer ends the stream with ECANCELED", async () => {
  let controller, calls = 0;
  const { transport, words } = fixture(received => { controller = received; calls++; return new Blob([new Uint8Array(3 * capacity)]); });
  Atomics.store(words, 0, 1);
  const pending = transport.poll();
  await until(() => Atomics.load(words, 3) === 1);
  controller.abort();
  const { bytes, error } = await consume(transport);
  assert.equal(error, errno.ECANCELED);
  assert.ok(bytes.length < 3 * capacity, "a cancelled upload completed");
  await pending;
  Atomics.store(words, 0, 2);
  const next = transport.poll();
  assert.equal((await consume(transport)).error, errno.ECANCELED);
  await next;
  assert.equal(calls, 1, "the picker reopened right after a cancel");
});

test("process cancellation retires the chooser before a new request", async () => {
  let signal;
  const { transport, words } = fixture(controller => {
    signal = controller.signal;
    return new Promise(resolve => signal.addEventListener("abort", () => resolve(null), { once: true }));
  });
  Atomics.store(words, 0, 1);
  const pending = transport.poll();
  await until(() => signal);
  Atomics.store(words, 1, 1);
  transport.retire();
  await pending;
  assert.equal(signal.aborted, true);
  assert.equal(Atomics.load(words, 2), 1);
  assert.equal(Atomics.load(words, 3), 0, "cancellation publishes no file bytes");
  transport.chooseFile = () => new Blob(["next"]);
  Atomics.store(words, 0, 2);
  const next = transport.poll();
  assert.equal((await consume(transport)).bytes.toString(), "next");
  await next;
});

test("cancellation during a file read cannot leak a late chunk into the next request", async () => {
  let finishRead;
  const blob = new Blob(["late"]);
  blob.stream = () => new ReadableStream({ type: "bytes", pull: source => new Promise(resolve => {
    finishRead = () => { source.enqueue(new TextEncoder().encode("late")); resolve(); };
  }) });
  const { transport, words } = fixture(() => blob);
  Atomics.store(words, 0, 1);
  const pending = transport.poll();
  await until(() => finishRead);
  Atomics.store(words, 1, 1);
  transport.retire();
  assert.equal(Atomics.load(words, 2), 0, "slot remains owned until the pending read is retired");
  finishRead();
  await pending;
  assert.equal(Atomics.load(words, 3), 0);
  assert.equal(Atomics.load(words, 2), 1);
});

test("a user cancel refuses immediate repeat requests without reopening the picker", async (t) => {
  let now = 1000;
  t.mock.method(performance, "now", () => now);
  let calls = 0;
  const { transport, words } = fixture(() => { calls++; return calls === 1 ? null : new Blob(["later"]); });
  for (const sequence of [1, 2]) {
    Atomics.store(words, 0, sequence);
    const pending = transport.poll();
    assert.deepEqual(await consume(transport), { bytes: Buffer.alloc(0), error: errno.ECANCELED });
    await pending;
  }
  assert.equal(calls, 1, "the picker stayed closed during the quiet period");
  now += UPLOAD_CANCEL_QUIET_MILLISECONDS;
  Atomics.store(words, 0, 3);
  const pending = transport.poll();
  assert.equal((await consume(transport)).bytes.toString(), "later");
  await pending;
});
