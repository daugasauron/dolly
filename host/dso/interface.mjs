import { formatWasmType, providerSatisfiesImport } from "../../src/wasm-interface.mjs";
import { unique } from "../../src/process-abi.mjs";
import { hex } from "../../src/static-asset.mjs";

// The side-module profile of dolly-dso-0.wat. Both the build tools and the
// loader in the process Worker call these exact validators on parsed bytes.
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
      hex(stamps[0].data) !== digest) {
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
