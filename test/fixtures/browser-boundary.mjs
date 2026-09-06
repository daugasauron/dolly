import { instantiateKernelPlugin } from "../../src/kernel-plugin.mjs";
import { NetworkTransport } from "../../src/http-broker.mjs";
import { DollyHttpPolicy } from "../../src/http-policy.mjs";
import { DOLLY_KERNEL_PLUGIN_ABI_DIGEST } from "../../dist/dolly-kernel-plugin-abi.mjs";
import { DOLLY_ERRNO as errno } from "../../dist/dolly-errno.mjs";

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

export async function runBrowserBoundaryChecks() {
  const kernel = await WebAssembly.compileStreaming(fetch(new URL("../../dist/dolly.wasm", import.meta.url)));
  const contract = await WebAssembly.compileStreaming(fetch(new URL("../../dist/dolly-browser-0.wasm", import.meta.url)));
  const names = module => WebAssembly.Module.imports(module).map(x => `${x.module}.${x.name}`).sort();
  check(JSON.stringify(names(kernel)) === JSON.stringify(names(contract)), "outer import set changed");
  check(!names(kernel).some(x => /dlopen|dlsym/.test(x)), "kernel exposes a general loader");

  // A normal Dolly process is not a resident plugin. Adding the expected
  // compatibility tag must not grant its syscall import to a kernel plugin.
  const processBytes = new Uint8Array(await (await fetch(new URL("../../dist/dolly-process-0.wasm", import.meta.url))).arrayBuffer());
  const name = new TextEncoder().encode("dolly.abi");
  const digest = DOLLY_KERNEL_PLUGIN_ABI_DIGEST.match(/../g).map(x => parseInt(x, 16));
  const payload = [...uleb(name.length), ...name, ...digest];
  const tagged = Uint8Array.from([...processBytes, 0, ...uleb(payload.length), ...payload]);
  rejects(() => instantiateKernelPlugin(tagged, {}, null), /unsupported resident plugin import/);
  rejects(() => instantiateKernelPlugin(processBytes, {}, null), /wrong ABI stamp/);
  rejects(() => instantiateKernelPlugin(Uint8Array.of(0), {}, null), /invalid resident plugin bytes/);

  const policy = new DollyHttpPolicy({ rules: [{ origin: location.origin,
    path: "/fixture/http.txt", methods: ["GET"], timeoutMilliseconds: 1000 }] });
  let calls = 0, signal, received = false;
  const broker = new NetworkTransport(new SharedArrayBuffer(65536 + 128), 64, 65536, policy, {
    baseURL: location.href,
  });
  const fetchRequest = broker.fetchRequest.bind(broker);
  broker.fetchRequest = async (url, options) => {
    calls++; signal = options.signal;
    const response = await fetchRequest(url, options);
    received = true;
    return response;
  };
  const begin = (sequence, path) => {
    Atomics.store(broker.words, broker.word + NetworkTransport.sequence, sequence);
    Atomics.store(broker.words, broker.word, 1);
    return broker.request({ method: "GET", url: new URL(path, location.origin).href,
      headers: "", body: null, flags: 0, sequence });
  };
  await begin(1, "/not-allowed");
  check(calls === 0, "denied request reached fetch");
  check(Atomics.load(broker.words, broker.word + NetworkTransport.error) === errno.EACCES,
    "policy denial lost its errno");
  const waiting = begin(2, "/fixture/http.txt");
  let timer;
  try {
    await Promise.race([waiting, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("HTTP mailbox timeout stalled")), 2000);
    })]);
  } finally { clearTimeout(timer); broker.interrupt(); }
  check(received, "fixture response never reached mailbox backpressure");
  check(calls === 1 && signal.aborted, "HTTP timeout did not release its request");
  check(!broker.active, "HTTP slot remains active");
  check(Atomics.load(broker.words, broker.word) === 3, "missing terminal failure state");
  check(Atomics.load(broker.words, broker.word + NetworkTransport.error) === errno.ETIMEDOUT,
    "deadline lost its errno");
  broker.policy.maxRequests = 2;
  await begin(3, "/fixture/http.txt");
  check(calls === 1 && Atomics.load(broker.words, broker.word + NetworkTransport.error) === errno.EDQUOT,
    "quota exhaustion was not distinguished before Fetch");
  broker.policy = new DollyHttpPolicy(undefined);
  await begin(4, "http://127.0.0.1:1/"); // Browsers reject this unsafe port opaquely.
  check(Atomics.load(broker.words, broker.word + NetworkTransport.error) === errno.EIO,
    "native Fetch failure lost its transport errno");
  const cancelled = begin(5, "/fixture/http.txt");
  broker.interrupt();
  await cancelled;
  check(Atomics.load(broker.words, broker.word + NetworkTransport.error) === errno.ECANCELED,
    "interruption lost its cancellation errno");
  await checkAdmissionQueue(broker);
  return { imports: names(kernel).length, pluginRejections: 3, policyDeniedBeforeFetch: true,
    nonConsumingDeadline: true, boundedAdmission: true, typedErrors: true };
}

async function checkAdmissionQueue(broker) {
  const worker = new Worker(new URL("./http-admission-worker.mjs", import.meta.url), { type: "module" });
  let control, requests = 0, results = 0, pending = 0, timeout;
  try {
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
  } finally { clearTimeout(timeout); worker.terminate(); }
}
