import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { NetworkTransport, DOLLY_HTTP_LIMITS, DOLLY_HTTP_SLOT_COUNT } from "../src/http-broker.mjs";
import { DollyHttpPolicy, httpPolicyConfigurations, restrictDollyHttpPolicy } from "../src/http-policy.mjs";
import { localServicesTransport } from "../src/local-services.mjs";
import { DOLLY_ERRNO as errno } from "../dist/dolly-errno.mjs";

const target = "https://fixture.example/allowed";
function fixture(configuration = {}, fetchRequest) {
  const policy = new DollyHttpPolicy({
    rules: [{ origin: new URL(target).origin, path: "/allowed", methods: ["GET", "POST"],
      timeoutMilliseconds: 1000, ...configuration }],
  });
  const broker = new NetworkTransport(new SharedArrayBuffer(64 + DOLLY_HTTP_SLOT_COUNT * (65536 + 64)), 64, 65536,
    policy, { fetchRequest, baseURL: target });
  let currentSequence = 1;
  const address = () => broker.address + ((currentSequence - 1) % DOLLY_HTTP_SLOT_COUNT) * (65536 + 64);
  const store = (field, value) => Atomics.store(broker.words, address() / 4 + field, value);
  const load = field => Atomics.load(broker.words, address() / 4 + field);
  const request = (overrides = {}, sequence = 1) => {
    currentSequence = sequence;
    store(NetworkTransport.sequence, sequence);
    store(NetworkTransport.state, 1);
    return broker.request({ method: "GET", url: target, headers: "", body: null,
      flags: 0, sequence, ...overrides });
  };
  return { broker, store, load, request, get word() { return address() / 4; }, get address() { return address(); } };
}

async function bounded(promise) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("broker did not settle")), 2000);
    })]);
  } finally { clearTimeout(timer); }
}

async function settled(f) {
  while (f.broker.active) await new Promise(resolve => setTimeout(resolve, 1));
}

async function consume(f, request) {
  const records = [];
  const drain = () => {
    if (f.load(NetworkTransport.state) !== 2) return;
    const length = f.load(NetworkTransport.length);
    const eof = f.load(NetworkTransport.eof);
    records.push({ kind: f.load(NetworkTransport.kind), eof,
      bytes: f.broker.bytes.slice(f.address + 64, f.address + 64 + length) });
    Atomics.compareExchange(f.broker.words, f.word, 2, eof ? 0 : 1);
    Atomics.notify(f.broker.words, f.word);
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

test("multipart delivery is restricted to embedding-selected sources, including inherited policy", async () => {
  const parts = [Buffer.from("first"), Buffer.from("second")], bytes = Buffer.concat(parts);
  const digest = value => createHash("sha256").update(value).digest("hex");
  const manifest = JSON.stringify({ byteLength: bytes.length, sha256: digest(bytes),
    parts: parts.map(part => ({ byteLength: part.length, sha256: digest(part) })) });
  const sources = [{ path: "/allowed", byteLength: bytes.length }];
  const pinned = new DollyHttpPolicy({ rules: [] }, sources, target);
  for (const policy of [pinned, restrictDollyHttpPolicy(pinned, [null], sources, target)]) {
    const calls = [];
    const f = fixture({}, async (url, init) => {
      calls.push(url.href);
      assert.equal(init.credentials, "omit");
      assert.equal(init.redirect, "error");
      if (calls.length === 1) return new Response(manifest, { headers: { "x-dolly-parts": "1" } });
      assert.equal(init.headers, undefined);
      return new Response(parts[calls.length - 2]);
    });
    f.broker.policy = policy;
    const records = await consume(f, f.request({ headers: "Authorization: Bearer private" }));
    assert.deepEqual(calls, [target, target + ".part-0", target + ".part-1"]);
    assert.equal(Buffer.concat(records.filter(record => record.kind === 3).map(record => record.bytes)).toString(), bytes.toString());
    await bounded(f.request({ url: target + ".part-0" }, 2));
    assert.equal(calls.length, 3);
    assert.equal(f.load(NetworkTransport.error), errno.EACCES);
  }
  let calls = 0;
  const remote = fixture({}, async () => { calls++; return new Response(manifest, { headers: { "x-dolly-parts": "1" } }); });
  const records = await consume(remote, remote.request());
  assert.equal(calls, 1, "remote response headers cannot request additional destinations");
  assert.equal(Buffer.concat(records.filter(record => record.kind === 3).map(record => record.bytes)).toString(), manifest);
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
  assert.equal(f.load(NetworkTransport.state), 3);
  assert.equal(f.load(NetworkTransport.error), errno.ETIMEDOUT);
  // A late acknowledgement of the old chunk must not erase terminal failure.
  assert.equal(Atomics.compareExchange(f.broker.words, f.word, 2, 1), 3);
  assert.equal(f.load(NetworkTransport.state), 3);
});

test("a provider ignoring abort cannot hide a deadline or release its occupied slot", async () => {
  let finish;
  const f = fixture({ timeoutMilliseconds: 20 }, () => new Promise(resolve => { finish = resolve; }));
  const pending = f.request();
  await bounded((async () => {
    while (f.load(NetworkTransport.state) !== 3) await new Promise(resolve => setTimeout(resolve, 1));
  })());
  assert.equal(f.load(NetworkTransport.error), errno.ETIMEDOUT);
  assert.equal(f.broker.active, true, "the unresolved provider still occupies its host slot");
  f.store(NetworkTransport.state, 0); // Wasm consumes the terminal error.
  finish(new Response("late"));
  await bounded(pending);
  assert.equal(f.broker.active, false);
  assert.equal(f.load(NetworkTransport.state), 0, "late completion must not resurrect an unowned terminal slot");
  assert.equal(f.load(NetworkTransport.error), errno.ETIMEDOUT);
});

test("interrupting an old HTTP request does not abort or overwrite its successor", async () => {
  const signals = [];
  const f = fixture({}, async (_url, options) => {
    signals.push(options.signal); return new Response("ok");
  });
  const old = f.request();
  await f.broker.dispatch(cancelMessage(1));
  const next = f.request({}, 2);
  await bounded(old);
  assert.equal(signals[0].aborted, true);
  assert.equal(signals[1].aborted, false);
  const records = await consume(f, next);
  assert.equal(records.at(-1).eof, 1);
  assert.equal(f.broker.completedRequestCount, 2);
});

test("a queued publication cannot write after interruption", async () => {
  const f = fixture({}, async () => new Response("old"));
  const pending = f.request();
  await f.broker.dispatch(cancelMessage(1));
  f.store(NetworkTransport.sequence, 17);
  f.store(NetworkTransport.state, 1);
  await bounded(pending);
  assert.equal(f.load(NetworkTransport.state), 1);
  assert.equal(f.load(NetworkTransport.length), 0);
  assert.equal(f.broker.bytes[f.address + NetworkTransport.headerSize], 0);
});

function admission(f, overrides = {}, sequence = 1) {
  const memory = new SharedArrayBuffer(1024);
  const bytes = new Uint8Array(memory);
  const message = { memory, flags: 0, sequence };
  let offset = 8;
  for (const [name, value] of Object.entries({ method: "GET", url: target, headers: "", body: "", ...overrides })) {
    const data = new TextEncoder().encode(value);
    message[name] = BigInt(offset);
    message[`${name}Size`] = BigInt(data.length);
    bytes.set(data, offset);
    offset += data.length;
  }
  f.store(NetworkTransport.sequence, sequence);
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
    await consume(f, settled(f));
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
    await consume(f, settled(f));
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
  assert.equal(f.broker.active, false);
});

test("HTTP admission rejects occupied slots and cancels the exact handle", async () => {
  let calls = 0;
  const f = fixture({}, async (_url, options) => {
    calls++;
    return new Promise((_, reject) => options.signal.addEventListener("abort", () => reject(options.signal.reason)));
  });
  const message = admission(f);
  assert.equal(await f.broker.dispatch(message), 0);
  assert.equal(calls, 1);
  assert.equal(await f.broker.dispatch(message), -errno.EBUSY);
  const cancel = { ...message };
  for (const name of Object.keys(DOLLY_HTTP_LIMITS)) { cancel[name] = 0n; cancel[`${name}Size`] = 0n; }
  assert.equal(await bounded(f.broker.dispatch(cancel)), 0);
  await bounded(settled(f));
  assert.equal(f.broker.active, false);
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
  f.broker.policy.maxRequests = 100;
  f.broker.fetchRequest = async () => new Response("cancel me");
  const cancelled = f.request({}, 3);
  await f.broker.dispatch(cancelMessage(3));
  await bounded(cancelled);
  assert.equal(f.load(NetworkTransport.state), 3);
  assert.equal(f.load(NetworkTransport.error), errno.ECANCELED);
});

function channel(broker, sequence) {
  const address = broker.address + ((sequence - 1) % DOLLY_HTTP_SLOT_COUNT) * (65536 + 64);
  const word = address / 4;
  return { broker, address, word,
    store: (field, value) => Atomics.store(broker.words, word + field, value),
    load: field => Atomics.load(broker.words, word + field) };
}

function cancelMessage(sequence) {
  return { sequence, flags: 0, ...Object.fromEntries(Object.keys(DOLLY_HTTP_LIMITS)
    .flatMap(name => [[name, 0n], [`${name}Size`, 0n]])) };
}

test("HTTP handles preserve their high bit across the Wasm i32 import", async () => {
  const f = fixture({}, async (_url, { signal }) => new Promise((_, reject) =>
    signal.addEventListener("abort", () => reject(signal.reason))));
  for (const sequence of [0x80000000, 0xffffffff]) {
    const view = channel(f.broker, sequence);
    const message = admission(view, {}, sequence);
    assert.equal(await f.broker.dispatch({ ...message, sequence: sequence | 0 }), 0);
    assert.equal(await f.broker.dispatch(cancelMessage(sequence | 0)), 0);
    await bounded(settled(f));
    assert.equal(view.load(NetworkTransport.state), 3);
    assert.equal(view.load(NetworkTransport.error), errno.ECANCELED);
  }
});

test("independent HTTP streams reach the provider before either response completes", async () => {
  const responses = [];
  const f = fixture({}, async () => new Promise(resolve => responses.push(resolve)));
  const channels = [channel(f.broker, 1), channel(f.broker, 2)];
  for (let index = 0; index < channels.length; index++)
    assert.equal(await f.broker.dispatch(admission(channels[index], {}, index + 1)), 0);
  assert.equal(responses.length, 2, "requests must overlap at the actual provider call");
  const consumers = channels.map(view => consume(view, settled(f)));
  responses.forEach((resolve, index) => resolve(new Response(`player-${index + 1}`)));
  const records = await Promise.all(consumers);
  assert.deepEqual(records.map(items => Buffer.concat(items.filter(x => x.kind === 3).map(x => x.bytes)).toString()),
    ["player-1", "player-2"]);
  assert.equal(f.broker.completedRequestCount, 2);
});

test("cancelled providers retain bounded host slots without blocking peers or admission", async () => {
  const providers = [];
  const f = fixture({}, async (_url, { signal }) => new Promise(resolve => providers.push({ signal, resolve })));
  const channels = Array.from({ length: DOLLY_HTTP_SLOT_COUNT }, (_, i) => channel(f.broker, i + 1));
  for (let index = 0; index < channels.length; index++) {
    assert.equal(await f.broker.dispatch(admission(channels[index], {}, index + 1)), 0);
    assert.equal(await bounded(f.broker.dispatch(cancelMessage(index + 1))), 0);
  }
  assert.equal(providers.length, DOLLY_HTTP_SLOT_COUNT);
  assert(providers.every(provider => provider.signal.aborted));
  assert.equal(await f.broker.dispatch(admission(channels[0], {}, 17)), -errno.EBUSY,
    "forging a free guest slot must not start a seventeenth provider");
  assert.equal(providers.length, DOLLY_HTTP_SLOT_COUNT);
  providers.forEach(provider => provider.resolve(new Response("late")));
  await bounded(settled(f));
  assert.equal(channels[0].load(NetworkTransport.state), 1, "old completions must not overwrite generation 17");
  assert.equal(channels[0].load(NetworkTransport.length), 0);
  const survivor = channel(f.broker, 17);
  f.broker.fetchRequest = async () => new Response("survivor");
  assert.equal(await f.broker.dispatch(admission(survivor, {}, 17)), 0);
  assert.equal(await f.broker.dispatch(cancelMessage(1)), -errno.ESTALE);
  const records = await consume(survivor, settled(f));
  assert.equal(records.at(-1).eof, 1);
});

test("cancelling one request leaves the other stream and its deadline independent", async () => {
  const signals = [];
  const f = fixture({}, async (_url, { signal }) => {
    signals.push(signal); return new Response("peer response");
  });
  const first = channel(f.broker, 1), second = channel(f.broker, 2);
  assert.equal(await f.broker.dispatch(admission(first, {}, 1)), 0);
  assert.equal(await f.broker.dispatch(admission(second, {}, 2)), 0);
  assert.equal(await f.broker.dispatch(cancelMessage(1)), 0);
  assert(signals[0].aborted);
  assert.equal(signals[1].aborted, false);
  assert.equal(first.load(NetworkTransport.error), errno.ECANCELED);
  const records = await consume(second, settled(f));
  assert.equal(Buffer.concat(records.filter(x => x.kind === 3).map(x => x.bytes)).toString(), "peer response");
});

test("concurrent requests share quota and each stalled reader has a deadline", async () => {
  let calls = 0;
  const f = fixture({ timeoutMilliseconds: 25 }, async () => { calls++; return new Response("body"); });
  f.broker.policy.maxRequests = 1;
  const first = channel(f.broker, 1), second = channel(f.broker, 2);
  assert.equal(await f.broker.dispatch(admission(first, {}, 1)), 0);
  assert.equal(await f.broker.dispatch(admission(second, {}, 2)), 0);
  await bounded(settled(f));
  assert.equal(calls, 1);
  assert.equal(second.load(NetworkTransport.error), errno.EDQUOT);
  assert.equal(first.load(NetworkTransport.error), errno.ETIMEDOUT);
  assert.equal(f.broker.active, false);
});

test("runtime teardown aborts every provider and refuses already-queued admissions", async () => {
  let calls = 0;
  const f = fixture({}, async () => { calls++; return new Response("body"); });
  const first = channel(f.broker, 1), second = channel(f.broker, 2);
  assert.equal(await f.broker.dispatch(admission(first, {}, 1)), 0);
  assert.equal(await f.broker.dispatch(admission(second, {}, 2)), 0);
  f.broker.close();
  assert.equal(await f.broker.dispatch(admission(channel(f.broker, 3), {}, 3)), -errno.ECANCELED);
  await bounded(settled(f));
  assert.equal(first.load(NetworkTransport.error), errno.ECANCELED);
  assert.equal(second.load(NetworkTransport.error), errno.ECANCELED);
  assert.equal(calls, 2);
});
