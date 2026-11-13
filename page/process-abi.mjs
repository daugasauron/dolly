import { formatWasmType, sameWasmType } from "./wasm-interface.mjs";
import { hex } from "./static-asset.mjs";

export function unique(entries, key) {
  const result = new Map();
  for (const entry of entries) {
    const name = key(entry);
    if (result.has(name)) throw new TypeError(`duplicate process interface entry ${name}`);
    result.set(name, entry);
  }
  return result;
}

// Both the build tools and browser admission call this exact validator on
// parsed bytes. The contract is assembled from abi/dolly-process-0.wat.
export function validateProcessInterface(contract, process, digest) {
  const fail = message => { throw new TypeError(`${process.label}: ${message}`); };
  const section = name => {
    const entries = process.customSectionData.filter(x => x.name === name);
    if (entries.length !== 1) fail(`expected exactly one ${name} section`);
    return entries[0].data;
  };
  if (process.customSections.includes("dylink.0")) {
    fail("a process executable must not be a side module");
  }
  const stamp = hex(section("dolly.process"));
  if (stamp !== digest) fail("wrong dolly.process stamp");
  const key = x => `${x.module}.${x.name}`;
  const allowed = unique(contract.imports, key);
  const actual = unique(process.imports, key);
  if (allowed.size !== 2 || !allowed.has("env.memory") || !allowed.has("dolly_process_0.call")) {
    throw new TypeError("process contract must contain only memory and call");
  }
  for (const name of actual.keys()) if (!allowed.has(name)) fail(`import ${name} is outside dolly-process-0`);
  if (actual.size !== allowed.size) fail("expected exactly the two dolly-process-0 imports");
  let memory;
  for (const [name, expected] of allowed) {
    const entry = actual.get(name);
    if (!entry) fail(`missing required import ${name}`);
    const type = entry.type;
    if (name === "env.memory") {
      if (type.kind !== "memory" || expected.type.kind !== "memory" ||
          type.address64 !== expected.type.address64 || type.shared !== expected.type.shared ||
          type.minimum < expected.type.minimum || type.maximum === null ||
          expected.type.maximum === null || type.maximum > expected.type.maximum ||
          type.minimum > type.maximum) {
        fail(`process memory is outside ${formatWasmType(expected.type)}`);
      }
      const bytes = section("dolly.process.memory");
      if (bytes.length !== 16) fail("expected a 16-byte dolly.process.memory section");
      const record = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      if (record.getBigUint64(0, true) !== type.minimum ||
          record.getBigUint64(8, true) !== type.maximum) {
        fail("dolly.process.memory does not match its memory import");
      }
      memory = { initial: type.minimum, maximum: type.maximum };
    } else if (!sameWasmType(type, expected.type)) {
      fail(`import ${name} must be ${formatWasmType(expected.type)}`);
    }
  }
  const exports = unique(process.exports, x => x.name);
  for (const expected of contract.exports) {
    const entry = exports.get(expected.name);
    if (!entry || !sameWasmType(entry.type, expected.type)) {
      fail(`missing or incompatible process export ${expected.name}`);
    }
  }
  return memory;
}
