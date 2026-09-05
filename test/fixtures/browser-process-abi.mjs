import { parseWasmInterface, appendCustomSection } from "../../src/wasm-interface.mjs";
import { validateProcessInterface } from "../../src/process-abi.mjs";
import { DOLLY_PROCESS_ABI_DIGEST } from "../../dist/dolly-process-abi.mjs";
import { DOLLY_ERRNO } from "../../dist/dolly-errno.mjs";

function check(condition, message) {
  if (!condition) throw new Error(message);
}

async function runWorker(configuration) {
  const worker = new Worker(new URL("../../src/process-worker.mjs", import.meta.url), { type: "module" });
  let timer;
  try {
    await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("fixture process did not finish")), 5000);
      worker.onerror = event => reject(new Error(event.message));
      worker.onmessage = ({ data }) => {
        if (data.type === "finished" && data.status === 0) resolve();
        else if (data.type !== "started") reject(new Error(data.message ?? `unexpected process message: ${data.type}`));
      };
      worker.postMessage({ type: "configure", pid: 1, control: new SharedArrayBuffer(16), ...configuration });
    });
  } finally { clearTimeout(timer); worker.terminate(); }
}

async function runDsoChecks() {
  const fetchBytes = async path => new Uint8Array(await (await fetch(path)).arrayBuffer());
  const dsoContract = parseWasmInterface(await fetchBytes(new URL("../../dist/dolly-process-dso-0.wasm", import.meta.url)));
  const hostBytes = await fetchBytes("/fixture/process-dso-host.wasm");
  const processInterface = parseWasmInterface(hostBytes);
  const module = await WebAssembly.compile(hostBytes);
  const errors = {
    "wrong-self": /DSO answer: expected func\(i64\)->\(i64\), got func\(i32\)->\(i32\)/,
    "wrong-provider": /DSO provided: expected func\(i32\)->\(i32\), got func\(i64\)->\(i64\)/,
    "wrong-stack": /DSO env.__stack_pointer/,
    "wrong-table": /DSO env.__indirect_function_table/,
    "wrong-memory": /DSO env.memory/,
    "small-memory": /DSO memory: expected memory64/,
    "small-table": /DSO __indirect_function_table: expected table64/,
    "wrong-base": /DSO env.__memory_base/,
    "wrong-tag": /DSO exception: expected tag/,
    "wrong-got": /DSO GOT.func.answer/,
    "wrong-symbol-kind": /DSO GOT.func.data: expected a function symbol/,
    "wrong-data": /DSO GOT.mem.data/,
    "wrong-hook": /DSO __wasm_call_ctors/,
  };
  for (const name of ["types", "local", "start", ...Object.keys(errors), "bad-host"]) {
    const bytes = await fetchBytes(`/fixture/dso-${name === "bad-host" ? "types" : name}.wasm`);
    await WebAssembly.compile(bytes); // Each negative fixture is valid Wasm.
    const memory = new WebAssembly.Memory({ initial: 1n, maximum: 131072n, shared: true, address: "i64" });
    const data = new DataView(memory.buffer);
    data.setBigUint64(80, BigInt(16 + bytes.length), true);
    data.setBigUint64(1032, BigInt(bytes.length), true);
    new Uint8Array(memory.buffer, 1040, bytes.length).set(bytes);
    let configuration = { module, processInterface, memory, dsoContract };
    if (name === "bad-host") {
      const host = await fetchBytes("/fixture/process-dso-bad-host.wasm");
      configuration = { ...configuration, module: await WebAssembly.compile(host), processInterface: parseWasmInterface(host) };
    }
    await runWorker(configuration);
    const error = errors[name] ?? (name === "bad-host" ? /DSO __dolly_dso_allocate/ : undefined);
    if (error) {
      check(data.getInt32(136, true) === DOLLY_ERRNO.ENOEXEC, `${name}: expected target ENOEXEC`);
      const message = new TextDecoder().decode(new Uint8Array(memory.buffer, 144, data.getUint32(140, true)).slice());
      check(error.test(message), `${name}: unexpected error ${message}`);
      check(data.getUint32(64, true) === 0 && data.getBigUint64(68, true) === 0n,
        `${name}: rejected library allocated storage or ran constructors`);
    } else {
      check(data.getInt32(136, true) === 0, `${name}: valid DSO load failed`);
      check(data.getUint32(64, true) === 1 && data.getBigUint64(68, true) === 42n,
        `${name}: direct/GOT function resolution or constructors failed`);
      if (name === "start") check(data.getUint32(76, true) === 1, "Wasm initialization did not run");
    }
  }
  return { rejected: Object.keys(errors).length + 1, loaded: 3 };
}

export async function runProcessAbiChecks() {
  const contract = parseWasmInterface(await (await fetch(
    new URL("../../dist/dolly-process-0.wasm", import.meta.url),
  )).arrayBuffer());
  const validate = bytes => validateProcessInterface(contract, parseWasmInterface(bytes), DOLLY_PROCESS_ABI_DIGEST);
  const fetchFixture = async name => new Uint8Array(await (await fetch(
    new URL(`/fixture/process-${name}.wasm`, location.origin),
  )).arrayBuffer());
  let rejected = 0;
  const deny = (bytes, pattern) => {
    try { validate(bytes); } catch (error) {
      check(pattern.test(String(error)), `unexpected ABI error: ${error}`);
      rejected++; return;
    }
    throw new Error("incompatible process passed admission");
  };
  for (const [name, pattern] of [
    ["wrong-call", /import dolly_process_0.call must be/],
    ["wrong-start", /incompatible process export _start/],
    ["wrong-memory", /process memory is outside/],
  ]) {
    const bytes = await fetchFixture(name);
    await WebAssembly.compile(bytes); // Valid Wasm; it is the ABI that is wrong.
    deny(bytes, pattern);
  }
  const bytes = await fetchFixture("no-dso");
  const mismatch = bytes.slice();
  const record = parseWasmInterface(mismatch).customSectionData.find(x => x.name === "dolly.process.memory").data;
  new DataView(record.buffer, record.byteOffset, record.byteLength).setBigUint64(0, 2n, true);
  deny(mismatch, /memory does not match its memory import/);
  const stamp = parseWasmInterface(bytes).customSectionData.find(x => x.name === "dolly.process").data;
  deny(appendCustomSection(bytes, "dolly.process", stamp), /exactly one dolly.process section/);

  const memory = new WebAssembly.Memory({ ...validate(bytes), shared: true, address: "i64" });
  const module = await WebAssembly.compile(bytes);
  await runWorker({ module, memory, processInterface: parseWasmInterface(bytes) });
  const data = new DataView(memory.buffer);
  check(data.getInt32(136, true) === DOLLY_ERRNO.ENOSYS, "missing DSO support did not return target ENOSYS");
  check(data.getBigInt64(400, true) === -BigInt(DOLLY_ERRNO.ENOSYS), "missing FFI support did not return target ENOSYS");
  return { rejected, optionalFacilities: "ENOSYS", errno: DOLLY_ERRNO, dso: await runDsoChecks() };
}
