import { instantiateKernelPlugin } from "../../src/kernel-plugin.mjs";
import { NetworkTransport } from "../../src/http-broker.mjs";
import { DollyHttpPolicy } from "../../src/http-policy.mjs";
import { DOLLY_KERNEL_PLUGIN_ABI_DIGEST } from "../../dist/dolly-kernel-plugin-abi.mjs";

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
  return { imports: names(kernel).length, pluginRejections: 3, policyDeniedBeforeFetch: true,
    nonConsumingDeadline: true };
}
