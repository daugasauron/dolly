import { formatWasmType, sameWasmType, providerSatisfiesImport } from "./wasm-interface.mjs";

function unique(entries, key) {
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
  const stamp = [...section("dolly.process")].map(x => x.toString(16).padStart(2, "0")).join("");
  if (stamp !== digest) fail("wrong dolly.process stamp");
  const key = x => `${x.module}.${x.name}`;
  const allowed = unique(contract.imports, key);
  const actual = unique(process.imports, key);
  if (allowed.size !== 2 || !allowed.has("env.memory") || !allowed.has("dolly_process_0.call")) {
    throw new TypeError("process contract must contain only memory and call");
  }
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

export function requireDsoType(actual, expected, name) {
  if (!actual || !providerSatisfiesImport(actual, expected)) {
    throw new TypeError(`DSO ${name}: expected ${formatWasmType(expected)}, got ${actual ? formatWasmType(actual) : "missing symbol"}`);
  }
}

export function validateDsoHost(contract, exports) {
  for (const name of ["__indirect_function_table", "__stack_pointer", "__dolly_dso_allocate"]) {
    requireDsoType(exports.get(name)?.type,
      contract.exports.find(entry => entry.name === name).type, name);
  }
}

// This checks a library's static profile. Linking additionally compares each
// resolved symbol with its provider's actual type, including deferred imports.
export function validateDsoInterface(contract, dso, digest) {
  const stamps = dso.customSectionData.filter(section => section.name === "dolly.process.dso");
  if (stamps.length !== 1 ||
      [...stamps[0].data].map(x => x.toString(16).padStart(2, "0")).join("") !== digest) {
    throw new TypeError("shared object has the wrong dolly.process.dso stamp");
  }
  if (dso.customSections.includes("dolly.process")) throw new TypeError("shared object must not carry a process entry stamp");
  if (dso.customSections.filter(name => name === "dylink.0").length !== 1) {
    throw new TypeError("shared object needs one dylink.0 section");
  }
  const key = entry => `${entry.module}\0${entry.name}`;
  const imports = unique(dso.imports, key);
  const exports = unique(dso.exports, entry => entry.name);
  const allowed = new Map(contract.imports.map(entry => [key(entry), entry.type]));
  if (!imports.has("env\0memory")) throw new TypeError("shared object needs exactly one memory import");
  for (const entry of imports.values()) {
    const expected = allowed.get(key(entry)) ?? allowed.get(`${entry.module}\0symbol`);
    if (expected) {
      const actual = entry.type;
      // Initial sizes vary per library; the instance's live limits are checked
      // separately before allocation. The infrastructure kinds stay fixed.
      if (expected.kind === "memory" || expected.kind === "table") {
        if (actual.kind !== expected.kind || actual.address64 !== expected.address64 ||
            actual.shared !== expected.shared || actual.element !== expected.element ||
            (expected.maximum !== null &&
              (actual.maximum === null || actual.maximum > expected.maximum))) {
          throw new TypeError(`DSO ${entry.module}.${entry.name}: incompatible ${formatWasmType(actual)}`);
        }
      } else requireDsoType(actual, expected, `${entry.module}.${entry.name}`);
    } else if (entry.module !== "env" || !["func", "tag"].includes(entry.type.kind)) {
      throw new TypeError(`shared-object import is outside the process namespace: ${entry.module}.${entry.name}`);
    }
  }
  for (const name of ["__wasm_apply_data_relocs", "__wasm_call_ctors"]) {
    if (exports.has(name)) requireDsoType(exports.get(name).type,
      contract.exports.find(entry => entry.name === name).type, name);
  }
  return { imports, exports };
}
