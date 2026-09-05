import assert from "node:assert/strict";
import test from "node:test";
import { SessionTransport as Mailbox } from "../src/session-transport.mjs";
import { sessionLoadUrl } from "../src/session-store.mjs";

function fixture() {
  const buffer = new SharedArrayBuffer(2 * 1024 * 1024);
  const transport = new Mailbox(buffer, 64, 128, 128, 1024, 1024 * 1024, { wake() {} });
  const words = transport.words;
  const payload = new TextEncoder().encode("DOLLYSES-session-fixture");
  return {
    transport, words, payload,
    publish() {
      transport.bytes.set(payload, 1024);
      Atomics.store(words, Mailbox.totalSizeLow, payload.length);
      Atomics.store(words, Mailbox.chunkLength, payload.length);
      Atomics.store(words, Mailbox.chunkEof, 1);
      Atomics.add(words, Mailbox.chunkSequence, 1);
      Atomics.notify(words, Mailbox.chunkSequence);
    },
    complete() {
      Atomics.store(words, Mailbox.completedSequence, Atomics.load(words, Mailbox.requestSequence));
      Atomics.notify(words, Mailbox.completedSequence);
    },
  };
}

test("session URLs are named paths, including a deployment prefix", () => {
  assert.equal(sessionLoadUrl("work.1", "https://example.test/dolly/").href,
    "https://example.test/dolly/session/work.1");
  assert.throws(() => sessionLoadUrl("../secret", "https://example.test/"));
  assert.throws(() => sessionLoadUrl("index.html", "https://example.test/"));
});

test("publication and completion between observation and wait cannot lose a wake", async () => {
  const f = fixture();
  const load = Atomics.load;
  let armed = false, published = false, completed = false;
  f.transport.displayTransport.wake = () => { armed = true; };
  Atomics.load = (words, index) => {
    const observed = load(words, index);
    if (armed && words === f.words) {
      if (index === Mailbox.chunkSequence && !published) {
        published = true;
        f.publish();
      } else if (index === Mailbox.completedSequence && !completed) {
        completed = true;
        f.complete();
      }
    }
    return observed;
  };
  // Keep Node alive while exercising waitAsync's non-owning timeout handles.
  const keepalive = setInterval(() => {}, 100);
  try {
    assert.deepEqual(new Uint8Array(await f.transport.capture("proof", {
      timeoutMilliseconds: 100,
    })), f.payload);
    assert.equal(published && completed, true);
  } finally {
    Atomics.load = load;
    clearInterval(keepalive);
  }
});

test("invalid chunk cancels the producer; a subsequent request can save", async () => {
  const f = fixture();
  f.transport.displayTransport.wake = () => {
    f.publish();
    Atomics.store(f.words, Mailbox.chunkLength, 2 * 1024 * 1024);
  };
  await assert.rejects(f.transport.capture("proof"), /invalid session chunk/);
  assert.equal(Atomics.load(f.words, Mailbox.cancelledSequence), 1);
  f.complete();
  f.transport.displayTransport.wake = () => { f.publish(); f.complete(); };
  assert.deepEqual(new Uint8Array(await f.transport.capture("proof")), f.payload);
});

test("a missing producer times out, and explicit cancellation wakes a pending save", async () => {
  const f = fixture();
  const keepalive = setInterval(() => {}, 100);
  try {
    await assert.rejects(f.transport.capture("proof", { timeoutMilliseconds: 1 }), /timed out/);
    assert.equal(Atomics.load(f.words, Mailbox.cancelledSequence), 1);
    f.complete();
    const controller = new AbortController();
    const saving = f.transport.capture("proof", { signal: controller.signal });
    controller.abort(new Error("cancel test"));
    await assert.rejects(saving, /cancel test/);
    assert.equal(Atomics.load(f.words, Mailbox.cancelledSequence), 2);
  } finally {
    clearInterval(keepalive);
  }
});
