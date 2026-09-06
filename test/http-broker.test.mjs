import assert from "node:assert/strict";
import test from "node:test";
import { NetworkTransport } from "../src/http-broker.mjs";
import { DollyHttpPolicy } from "../src/http-policy.mjs";

const target = "https://fixture.example/allowed";
function fixture(configuration = {}, fetchRequest) {
  const policy = new DollyHttpPolicy({
    rules: [{ origin: new URL(target).origin, path: "/allowed", methods: ["GET", "POST"],
      timeoutMilliseconds: 1000, ...configuration }],
  });
  const broker = new NetworkTransport(new SharedArrayBuffer(65536 + 128), 64, 65536,
    policy, { fetchRequest, baseURL: target });
  const store = (field, value) => Atomics.store(broker.words, broker.word + field, value);
  const load = field => Atomics.load(broker.words, broker.word + field);
  const request = (overrides = {}, sequence = 1) => {
    store(NetworkTransport.sequence, sequence);
    store(NetworkTransport.state, 1);
    return broker.request({ method: "GET", url: target, headers: "", body: null,
      flags: 0, sequence, ...overrides });
  };
  return { broker, store, load, request };
}

async function bounded(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("broker did not settle")), 2000);
    })]);
  } finally { clearTimeout(timer); }
}

async function consume(f, request) {
  const records = [];
  const drain = () => {
    if (f.load(NetworkTransport.state) !== 2) return;
    const length = f.load(NetworkTransport.length);
    const eof = f.load(NetworkTransport.eof);
    records.push({ kind: f.load(NetworkTransport.kind), eof,
      bytes: f.broker.bytes.slice(f.broker.address + 64, f.broker.address + 64 + length) });
    Atomics.compareExchange(f.broker.words, f.broker.word, 2, eof ? 0 : 1);
    Atomics.notify(f.broker.words, f.broker.word);
  };
  const interval = setInterval(drain, 1);
  try { await bounded(request); drain(); return records; }
  finally { clearInterval(interval); }
}

test("the default HTTP provider preserves the browser Fetch receiver", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", function () {
    assert.ok(this === globalThis, "native Fetch requires its browser global receiver");
    return Promise.resolve(new Response("ok"));
  });
  const f = fixture();
  const records = await consume(f, f.request());
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(records.at(-1)?.eof, 1);
});

test("HTTP authorization happens before any fetch", async () => {
  let calls = 0;
  const f = fixture({}, async () => { calls++; return new Response("ok"); });
  await bounded(f.request({ url: "https://different.example/allowed" }));
  assert.equal(calls, 0);
  assert.equal(f.load(NetworkTransport.state), 3);
  assert.equal(f.broker.active, false);
});

test("the HTTP provider forwards only explicit sandbox credentials, with no redirects or ambient credentials", async () => {
  let options;
  const f = fixture({ credentialHeaders: ["authorization"] }, async (url, supplied) => {
    assert.equal(url.href, target);
    options = supplied;
    return new Response("result", { headers: { "authorization": "never-return-this", "x-result": "yes" } });
  });
  const records = await consume(f, f.request({ method: "POST", body: Uint8Array.of(1, 2),
    headers: "Authorization: Bearer fixture\r\nCookie: ambient=no\r\nUser-Agent: native\r\n" }));
  assert.equal(options.credentials, "omit");
  assert.equal(options.redirect, "error");
  assert.equal(options.referrerPolicy, "no-referrer");
  assert.equal(options.headers.get("authorization"), "Bearer fixture");
  assert.equal(options.headers.has("cookie"), false);
  assert.equal(options.headers.has("user-agent"), false);
  const decoder = new TextDecoder();
  assert.equal(records.filter(x => x.kind === 3).map(x => decoder.decode(x.bytes)).join(""), "result");
  assert.equal(records.some(x => decoder.decode(x.bytes).includes("never-return-this")), false);
  assert.equal(records.at(-1).eof, 1);
});

test("HTTP request and response limits are enforced by the provider", async () => {
  let calls = 0;
  const f = fixture({ maxRequestBytes: 1, maxResponseBytes: 1 }, async () => {
    calls++; return new Response("too large");
  });
  await bounded(f.request({ method: "POST", body: Uint8Array.of(1, 2) }));
  assert.equal(calls, 0);
  await consume(f, f.request({}, 2));
  assert.equal(calls, 1);
  assert.equal(f.load(NetworkTransport.state), 3);
  assert.equal(f.broker.active, false);
});

test("a non-consuming mailbox cannot retain HTTP resources past the host deadline", async () => {
  let signal;
  const f = fixture({ timeoutMilliseconds: 20 }, async (_url, options) => {
    signal = options.signal; return new Response("not consumed");
  });
  await bounded(f.request());
  assert.equal(signal.aborted, true);
  assert.equal(f.broker.active, false);
  assert.equal(f.broker.activeToken, 0);
  assert.equal(f.load(NetworkTransport.state), 3);
  // A late acknowledgement of the old chunk must not erase terminal failure.
  assert.equal(Atomics.compareExchange(f.broker.words, f.broker.word, 2, 1), 3);
  assert.equal(f.load(NetworkTransport.state), 3);
});

test("interrupting an old HTTP request does not abort or overwrite its successor", async () => {
  const signals = [];
  const f = fixture({}, async (_url, options) => {
    signals.push(options.signal); return new Response("ok");
  });
  const old = f.request();
  f.broker.interrupt();
  const next = f.request({}, 2);
  await bounded(old);
  assert.equal(signals[0].aborted, true);
  assert.equal(signals[1].aborted, false);
  const records = await consume(f, next);
  assert.equal(records.at(-1).eof, 1);
  assert.equal(f.broker.completedRequestCount, 2);
});

test("a queued publication cannot write after interruption", async () => {
  const f = fixture();
  f.broker.activeToken = 1;
  f.store(NetworkTransport.sequence, 1);
  f.store(NetworkTransport.state, 1);
  const pending = f.broker.publish(1, 1, Uint8Array.of(42), 200, false, 0, 3);
  f.broker.interrupt();
  f.store(NetworkTransport.sequence, 2);
  f.store(NetworkTransport.state, 1);
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(f.load(NetworkTransport.state), 1);
  assert.equal(f.load(NetworkTransport.length), 0);
  assert.equal(f.broker.bytes[f.broker.address + NetworkTransport.headerSize], 0);
});
