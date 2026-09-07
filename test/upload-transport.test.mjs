import assert from "node:assert/strict";
import test from "node:test";
import { UploadTransport, UPLOAD_MAX_BYTES } from "../src/upload-transport.mjs";
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
  const transport = new UploadTransport(new SharedArrayBuffer(65536 + 128), 64, choose);
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
    if (eof) return { bytes: Buffer.concat(chunks), error };
  }
}

test("upload admits a fixed mailbox, never guest-selected paths or buffer sizes", () => {
  const memory = new SharedArrayBuffer(65536 + 128);
  for (const address of [0, -1, 65, 132, NaN, Infinity, 2 ** 53, 64n]) {
    assert.throws(() => new UploadTransport(memory, address, () => {}));
  }
  assert.throws(() => new UploadTransport(new ArrayBuffer(65536 + 128), 64, () => {}));
});

test("user selection transfers binary chunks with backpressure and empty files", async () => {
  const bytes = Uint8Array.from({ length: 150000 }, (_, index) => index & 255);
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
    [() => new Blob([new Uint8Array(UPLOAD_MAX_BYTES + 1)]), errno.EFBIG],
    [() => { throw new Error("PC path must not leak in errors"); }, errno.EIO],
  ]) {
    const { transport, words } = fixture(choose);
    Atomics.store(words, 0, 1);
    const pending = transport.poll();
    assert.deepEqual(await consume(transport), { bytes: Buffer.alloc(0), error });
    await pending;
  }
});

test("process cancellation retires the chooser before a new request", async () => {
  let signal;
  const { transport, words } = fixture(received => {
    signal = received;
    return new Promise(resolve => signal.addEventListener("abort", () => resolve(null), { once: true }));
  });
  Atomics.store(words, 0, 1);
  const pending = transport.poll();
  await until(() => signal);
  Atomics.store(words, 1, 1);
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
  blob.slice = () => ({ arrayBuffer: () => new Promise(resolve => { finishRead = resolve; }) });
  const { transport, words } = fixture(() => blob);
  Atomics.store(words, 0, 1);
  const pending = transport.poll();
  await until(() => finishRead);
  Atomics.store(words, 1, 1);
  assert.equal(Atomics.load(words, 2), 0, "slot remains owned until the pending read is retired");
  finishRead(new TextEncoder().encode("late").buffer);
  await pending;
  assert.equal(Atomics.load(words, 3), 0);
  assert.equal(Atomics.load(words, 2), 1);
});
