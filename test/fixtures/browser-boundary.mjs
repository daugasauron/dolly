function check(condition, message) {
  if (!condition) throw new Error(message);
}
function rejects(action, pattern) {
  try { action(); } catch (error) {
    check(pattern.test(String(error)), `unexpected rejection: ${error}`);
    return;
  }
  throw new Error("expected rejection");
}
function uleb(value) {
  const bytes = [];
  do { const low = value & 127; value >>>= 7; bytes.push(low | (value ? 128 : 0)); } while (value);
  return bytes;
}

export async function runBrowserBoundaryChecks(assetRoot) {
  const asset = path => new URL(path, assetRoot).href;
  const { instantiateKernelPlugin } = await import(asset("src/kernel-plugin.mjs"));
  const { NetworkTransport, DOLLY_HTTP_MAILBOX_VERSION, DOLLY_HTTP_SLOT_COUNT } = await import(asset("src/http-broker.mjs"));
  const { DollyHttpPolicy, restrictDollyHttpPolicy, httpPolicyConfigurations } = await import(asset("src/http-policy.mjs"));
  const { DOLLY_KERNEL_PLUGIN_ABI_DIGEST } = await import(asset("dist/dolly-kernel-plugin-abi.mjs"));
  const { DOLLY_ERRNO: errno } = await import(asset("dist/dolly-errno.mjs"));
  const fixtureOrigin = new URL(import.meta.url).origin;
  const kernel = await WebAssembly.compileStreaming(fetch(asset("dist/dolly.wasm")));
  const contract = await WebAssembly.compileStreaming(fetch(asset("dist/dolly-browser-0.wasm")));
  const names = module => WebAssembly.Module.imports(module).map(x => `${x.module}.${x.name}`).sort();
  check(JSON.stringify(names(kernel)) === JSON.stringify(names(contract)), "outer import set changed");
  check(!names(kernel).some(x => /dlopen|dlsym/.test(x)), "kernel exposes a general loader");
  const http = await WebAssembly.instantiateStreaming(fetch(asset("dist/dolly-http-0.wasm")), { env: {
    memory: new WebAssembly.Memory({ initial: 1024n, maximum: 131072n, shared: true, address: "i64" }),
    dolly_http_dispatch: () => 0,
  } });
  check(http.instance.exports.dolly_http_mailbox_version() === DOLLY_HTTP_MAILBOX_VERSION &&
    http.instance.exports.dolly_http_slot_count() === DOLLY_HTTP_SLOT_COUNT &&
    http.instance.exports.dolly_http_chunk_capacity() === 65536, "HTTP transport constants differ from canonical Wasm");

  // A normal Dolly process is not a resident plugin. Adding the expected
  // compatibility tag must not grant its syscall import to a kernel plugin.
  const processBytes = new Uint8Array(await (await fetch(asset("dist/dolly-process-0.wasm"))).arrayBuffer());
  const name = new TextEncoder().encode("dolly.abi");
  const digest = DOLLY_KERNEL_PLUGIN_ABI_DIGEST.match(/../g).map(x => parseInt(x, 16));
  const payload = [...uleb(name.length), ...name, ...digest];
  const tagged = Uint8Array.from([...processBytes, 0, ...uleb(payload.length), ...payload]);
  rejects(() => instantiateKernelPlugin(tagged, {}, null), /unsupported resident plugin import/);
  rejects(() => instantiateKernelPlugin(processBytes, {}, null), /wrong ABI stamp/);
  rejects(() => instantiateKernelPlugin(Uint8Array.of(0), {}, null), /invalid resident plugin bytes/);

  const policy = new DollyHttpPolicy({ rules: [{ origin: fixtureOrigin,
    path: "/fixture/http.txt", methods: ["GET"], timeoutMilliseconds: 1000 }] });
  let calls = 0, signal, received = false;
  const broker = new NetworkTransport(new SharedArrayBuffer(64 + DOLLY_HTTP_SLOT_COUNT * (65536 + 64)), 64, 65536, policy, {
    baseURL: location.href,
  });
  const word = broker.address / 4;
  const words = broker.words;
  const handle = generation => (generation - 1) * DOLLY_HTTP_SLOT_COUNT + 1;
  const settled = async () => {
    while (broker.active) await new Promise(resolve => setTimeout(resolve, 1));
  };
  const fetchRequest = broker.fetchRequest.bind(broker);
  broker.fetchRequest = async (url, options) => {
    calls++; signal = options.signal;
    const response = await fetchRequest(url, options);
    received = true;
    return response;
  };
  const begin = (generation, path) => {
    const sequence = handle(generation);
    Atomics.store(words, word + NetworkTransport.sequence, sequence);
    Atomics.store(words, word, 1);
    return broker.request({ method: "GET", url: new URL(path, fixtureOrigin).href,
      headers: "", body: null, flags: 0, sequence });
  };
  await begin(1, "/not-allowed");
  check(calls === 0, "denied request reached fetch");
  check(Atomics.load(words, word + NetworkTransport.error) === errno.EACCES,
    "policy denial lost its errno");
  const waiting = begin(2, "/fixture/http.txt");
  let timer;
  try {
    await Promise.race([waiting, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("HTTP mailbox timeout stalled")), 2000);
    })]);
  } finally { clearTimeout(timer); }
  check(received, "fixture response never reached mailbox backpressure");
  check(calls === 1 && signal.aborted, "HTTP timeout did not release its request");
  check(!broker.active, "HTTP slot remains active");
  check(Atomics.load(words, word) === 3, "missing terminal failure state");
  check(Atomics.load(words, word + NetworkTransport.error) === errno.ETIMEDOUT,
    "deadline lost its errno");
  broker.policy.maxRequests = 2;
  await begin(3, "/fixture/http.txt");
  check(calls === 1 && Atomics.load(words, word + NetworkTransport.error) === errno.EDQUOT,
    "quota exhaustion was not distinguished before Fetch");
  broker.policy = new DollyHttpPolicy(undefined);
  await begin(4, "http://127.0.0.1:1/"); // Browsers reject this unsafe port opaquely.
  check(Atomics.load(words, word + NetworkTransport.error) === errno.EIO,
    "native Fetch failure lost its transport errno");
  const cancelled = begin(5, "/fixture/http.txt");
  await broker.dispatch({ sequence: handle(5), method: 0n, methodSize: 0n, url: 0n, urlSize: 0n,
    headers: 0n, headersSize: 0n, body: 0n, bodySize: 0n, flags: 0 });
  await cancelled;
  check(Atomics.load(words, word + NetworkTransport.error) === errno.ECANCELED,
    "interruption lost its cancellation errno");
  await checkAdmissionQueue(broker, errno, asset("src/http-broker.mjs"));
  const observations = [];
  broker.policy = new DollyHttpPolicy({ rules: [{ origin: fixtureOrigin,
    path: "/fixture/http.txt", methods: ["GET"] }] });
  broker.fetchRequest = async (url, options) => {
    observations.push(options.headers.get("x-value"));
    throw new Error("metadata probe stops before real Fetch");
  };
  for (const [fields, valid] of [
    [{ method: "\uFEFFGET" }, false], [{ url: `\uFEFF${fixtureOrigin}/fixture/http.txt` }, false],
    [{ headers: "\uFEFFX-Value: value" }, false], [{ headers: "X-Value: \uFEFFvalue" }, false],
    [{ headers: " X-Value: value" }, false], [{ headers: "X-Value\u00A0: value" }, false],
    [{ headers: "X-Value: \t\u00A0value\u00A0\t " }, true],
  ]) {
    const memory = new SharedArrayBuffer(1024), bytes = new Uint8Array(memory);
    const request = { memory, flags: 0, sequence: handle(6) };
    let offset = 8;
    for (const [name, value] of Object.entries({ method: "GET",
      url: `${fixtureOrigin}/fixture/http.txt`, headers: "", body: "", ...fields })) {
      const data = new TextEncoder().encode(value);
      request[name] = BigInt(offset); request[`${name}Size`] = BigInt(data.length);
      bytes.set(data, offset); offset += data.length;
    }
    Atomics.store(words, word + NetworkTransport.sequence, handle(6));
    Atomics.store(words, word, 1);
    check(await broker.dispatch(request) === 0, "literal metadata admission failed");
    await settled();
    check(observations.length === (valid ? 1 : 0), `metadata was rewritten before Fetch: ${JSON.stringify(fields)}`);
    check(Atomics.load(words, word + NetworkTransport.error) ===
      (valid ? errno.EIO : fields.url ? errno.EACCES : errno.EINVAL), "literal metadata lost its errno");
  }
  check(observations[0] === "\u00A0value\u00A0", "Unicode header whitespace was stripped");

  broker.fetchRequest = fetchRequest;
  const unrestricted = new DollyHttpPolicy();
  for (let index = 0; index < 300; index++) unrestricted.authorize(new URL(fixtureOrigin), "GET", new Headers(), 0);
  const restricted = new DollyHttpPolicy({ rules: [{ origin: fixtureOrigin,
    path: "/fixture/http-redirect", methods: ["POST"] }] });
  const inherited = parent => restrictDollyHttpPolicy(new DollyHttpPolicy(), httpPolicyConfigurations(parent));
  const observed = async () => (await fetch(new URL("/fixture/http-observations", fixtureOrigin))).json();
  let sequence = 10;
  for (const [policy, flags, status, follows] of [
    [unrestricted, 2, 307, true], [unrestricted, 2, 302, true], [unrestricted, 0, 307, false],
    [restricted, 2, 307, false], [inherited(unrestricted), 2, 307, true],
    [inherited(restricted), 2, 307, false],
  ]) {
    const before = (await observed()).length, chunks = [];
    broker.policy = policy;
    Atomics.store(words, word + NetworkTransport.sequence, handle(++sequence));
    Atomics.store(words, word, 1);
    const request = broker.request({ method: "POST", url: `${fixtureOrigin}/fixture/http-redirect?status=${status}`,
      headers: "Authorization: Bearer sandbox-fixture\r\nX-API-Key: sandbox-fixture", body: new TextEncoder().encode("sandbox-body"), flags, sequence: handle(sequence) });
    const drain = setInterval(() => {
      if (Atomics.load(words, word) !== 2) return;
      const length = Atomics.load(words, word + NetworkTransport.length);
      if (Atomics.load(words, word + NetworkTransport.kind) === 3) {
        chunks.push(new TextDecoder().decode(broker.bytes.slice(broker.address + 64, broker.address + 64 + length)));
      }
      Atomics.compareExchange(words, word, 2, 1);
      Atomics.notify(words, word);
    }, 1);
    try { await request; } finally { clearInterval(drain); }
    const after = await observed();
    check(after.length === before + (follows ? 1 : 0), `redirect destination contacted incorrectly: flags=${flags}, follows=${follows}`);
    if (follows) {
      check(JSON.stringify(JSON.parse(chunks.join(""))) === JSON.stringify(after.at(-1)), "redirected response did not reach the mailbox");
      const result = after.at(-1);
      check(result.method === (status === 302 ? "GET" : "POST"), "redirect method changed incorrectly");
      check(result.body === (status === 302 ? "" : "sandbox-body"), "redirect body changed incorrectly");
      check(result.authorization === null && result.apiKey === "sandbox-fixture", "cross-origin credential handling changed");
      check(result.cookie === null && result.referer === null, "redirect leaked ambient browser state");
    } else check(Atomics.load(words, word + NetworkTransport.error) === errno.EIO, "redirect rejection lost its error");
  }
  return { assetRoot, imports: names(kernel).length, pluginRejections: 3, policyDeniedBeforeFetch: true,
    nonConsumingDeadline: true, boundedAdmission: true, typedErrors: true, literalMetadata: true, defaultRedirects: true };
}

async function checkAdmissionQueue(broker, errno, brokerUrl) {
  const fixture = new URL("./http-admission-worker.mjs", import.meta.url);
  fixture.searchParams.set("broker", brokerUrl);
  const source = URL.createObjectURL(new Blob([`import ${JSON.stringify(fixture.href)};`], { type: "text/javascript" }));
  let worker, control, requests = 0, results = 0, pending = 0, timeout;
  try {
    worker = new Worker(source, { type: "module" });
    await new Promise((resolve, reject) => {
      timeout = setTimeout(() => reject(Error("HTTP admission probe stalled")), 10_000);
      worker.onerror = reject;
      worker.onmessage = async ({ data }) => {
        try {
          if (data.type === "ready") control = new Int32Array(data.control);
          if (data.type === "request") {
            requests++; pending++;
            check(pending === 1, "guest flooded pending admission messages");
            if (requests === 1) await new Promise(done => setTimeout(done, 100));
            const result = await broker.dispatch(data.request);
            check(result === -errno.E2BIG, "oversized guest request was not rejected");
            pending--;
            Atomics.store(control, 1, result);
            Atomics.store(control, 0, 0);
            Atomics.notify(control, 0);
          }
          if (data.type === "result") { check(data.result === -errno.E2BIG, "import lost admission errno"); results++; }
          if (data.type === "done") { check(requests === 100 && results === 100, "missing admission results"); resolve(); }
        } catch (error) { reject(error); }
      };
    });
  } finally { clearTimeout(timeout); worker?.terminate(); URL.revokeObjectURL(source); }
}
