import assert from "node:assert/strict";
import test from "node:test";
import { NetworkTransport, DOLLY_HTTP_LIMITS } from "../src/http-broker.mjs";
import { DollyHttpPolicy, httpPolicyConfigurations, restrictDollyHttpPolicy } from "../src/http-policy.mjs";
import { localServicesTransport } from "../src/local-services.mjs";
import { DOLLY_ERRNO as errno } from "../dist/dolly-errno.mjs";

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
  assert.equal(f.load(NetworkTransport.error), errno.EACCES);
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
  assert.equal(f.load(NetworkTransport.error), errno.E2BIG);
  await consume(f, f.request({}, 2));
  assert.equal(calls, 1);
  assert.equal(f.load(NetworkTransport.state), 3);
  assert.equal(f.load(NetworkTransport.error), errno.E2BIG);
  assert.equal(f.broker.active, false);
});

test("redirects require both caller intent and unrestricted destination authority", async () => {
  const unrestricted = new DollyHttpPolicy();
  const restricted = new DollyHttpPolicy({ rules: [{ origin: new URL(target).origin }] });
  const inherited = parent => restrictDollyHttpPolicy(new DollyHttpPolicy(), httpPolicyConfigurations(parent));
  const pinned = new DollyHttpPolicy(undefined, [{ path: "/allowed", byteLength: 100 }], target);
  for (const [policy, flags, redirect] of [
    [unrestricted, 0, "error"], [unrestricted, 2, "follow"], [unrestricted, 3, "follow"],
    [restricted, 2, "error"], [pinned, 2, "error"],
    [inherited(unrestricted), 2, "follow"], [inherited(restricted), 2, "error"],
    [restrictDollyHttpPolicy(restricted, [null]), 2, "error"],
  ]) {
    let observed;
    const network = localServicesTransport(policy, undefined, async (_url, options) => {
      observed = options; return new Response("ok");
    });
    const f = fixture({}, network.fetchRequest);
    f.broker.policy = network.policy;
    const records = await consume(f, f.request({ flags, headers: "Authorization: Bearer sandbox-key" }));
    assert.equal(observed.redirect, redirect);
    assert.equal(observed.credentials, "omit");
    assert.equal(observed.referrerPolicy, "no-referrer");
    if (redirect === "follow") assert.equal(observed.headers.get("authorization"), "Bearer sandbox-key");
    assert.equal(records.at(-1).eof, 1);
  }
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
  assert.equal(f.load(NetworkTransport.error), errno.ETIMEDOUT);
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

function admission(f, overrides = {}) {
  const memory = new SharedArrayBuffer(1024);
  const bytes = new Uint8Array(memory);
  const message = { memory, flags: 0, sequence: 1 };
  let offset = 8;
  for (const [name, value] of Object.entries({ method: "GET", url: target, headers: "", body: "", ...overrides })) {
    const data = new TextEncoder().encode(value);
    message[name] = BigInt(offset);
    message[`${name}Size`] = BigInt(data.length);
    bytes.set(data, offset);
    offset += data.length;
  }
  f.store(NetworkTransport.sequence, 1);
  f.store(NetworkTransport.state, 1);
  return message;
}

test("HTTP metadata is not repaired by stripping Unicode before validation", async () => {
  for (const fields of [
    { method: "\uFEFFGET" }, { url: `\uFEFF${target}` },
    { headers: "\uFEFFX-Value: value" }, { headers: "X-Value: \uFEFFvalue" },
    { headers: "X-Value\u00A0: value" }, { headers: " X-Value: value" },
  ]) {
    let calls = 0;
    const f = fixture({}, async () => { calls++; return new Response("ok"); });
    assert.equal(await f.broker.dispatch(admission(f, fields)), 0);
    await consume(f, f.broker.pending);
    assert.equal(calls, 0, JSON.stringify(fields));
    assert.equal(f.load(NetworkTransport.error), fields.url ? errno.EACCES : errno.EINVAL);
  }
});

test("HTTP header values use Fetch whitespace normalization, not Unicode trim", async () => {
  for (const value of [" \tvalue\t ", "\u00A0value\u00A0", " \t\u00A0value\u00A0\t "]) {
    let observed;
    const f = fixture({}, async (_url, options) => {
      observed = options.headers.get("x-value"); return new Response("ok");
    });
    assert.equal(await f.broker.dispatch(admission(f, { headers: `X-Value:${value}\r\n` })), 0);
    await consume(f, f.broker.pending);
    assert.equal(observed, new Headers({ "X-Value": value }).get("x-value"));
  }
});

test("HTTP validates every span before decoding or copying any guest data", async (t) => {
  const f = fixture({}, async () => { throw Error("invalid admission reached Fetch"); });
  const message = admission(f);
  const decode = t.mock.method(TextDecoder.prototype, "decode");
  const copy = t.mock.method(Uint8Array.prototype, "slice");
  for (const [name, maximum] of Object.entries(DOLLY_HTTP_LIMITS)) {
    assert.equal(await f.broker.dispatch({ ...message, [`${name}Size`]: BigInt(maximum) + 1n }), -errno.E2BIG);
    for (const pointer of [-1n, 1n << 60n, 1025n]) {
      assert.equal(await f.broker.dispatch({ ...message, [name]: pointer }), -errno.EFAULT);
    }
  }
  assert.equal(decode.mock.callCount(), 0);
  assert.equal(copy.mock.callCount(), 0);
  assert.equal(f.broker.pending, null);
});

test("HTTP admission copies explicit spans, rejects overlap, and cancels before readmission", async () => {
  let calls = 0;
  const f = fixture({}, async (_url, options) => {
    calls++;
    return new Promise((_, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason)));
  });
  const message = admission(f);
  assert.equal(await f.broker.dispatch(message), 0);
  assert.equal(calls, 1);
  assert.equal(await f.broker.dispatch(message), -errno.EBUSY);
  const cancel = { ...message, sequence: 2 };
  for (const name of Object.keys(DOLLY_HTTP_LIMITS)) { cancel[name] = 0n; cancel[`${name}Size`] = 0n; }
  f.store(NetworkTransport.sequence, 2);
  assert.equal(await bounded(f.broker.dispatch(cancel)), 0);
  assert.equal(f.broker.pending, null);
  assert.equal(calls, 1);
  assert.equal(await f.broker.dispatch({ ...cancel, urlSize: 1n }), -errno.EINVAL);
  const bytes = new Uint8Array(message.memory);
  bytes[Number(message.method)] = 0;
  assert.equal(await f.broker.dispatch(message), -errno.EINVAL);
  bytes[Number(message.method)] = 0xff;
  assert.equal(await f.broker.dispatch(message), -errno.EINVAL);
});

test("HTTP terminal errors distinguish quota, timeout, cancellation, and opaque transport failures", async () => {
  const f = fixture({}, async () => { throw new TypeError("opaque browser rejection"); });
  await bounded(f.request());
  assert.equal(f.load(NetworkTransport.error), errno.EIO);
  f.broker.policy.maxRequests = 1;
  await bounded(f.request({}, 2));
  assert.equal(f.load(NetworkTransport.error), errno.EDQUOT);
  f.broker.activeToken = 3;
  f.broker.interrupt();
  assert.equal(f.load(NetworkTransport.state), 3);
  assert.equal(f.load(NetworkTransport.error), errno.ECANCELED);
});
