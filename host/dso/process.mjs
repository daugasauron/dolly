/*
 * The dso@0 provider inside the process Worker of an executable that records
 * dso@0: the loader of process-local shared objects and the FFI dispatcher.
 * It sees one process's private memory, instance and function table, and adds
 * no browser capability or import to the executable.
 */
import { DOLLY_PROCESS_ABI_DIGEST } from "../../dist/dolly-process-abi.mjs";
import { DOLLY_ERRNO } from "../../src/process-constants.mjs";
import { parseWasmInterface, Reader } from "../../src/wasm-interface.mjs";
import { executableHostRequirements, checkHostAbi } from "../requirements.mjs";
import { DOLLY_DSO_CLOSE, DOLLY_DSO_ERROR_CAPACITY, DOLLY_DSO_GLOBAL, DOLLY_DSO_LIMIT, DOLLY_DSO_OPEN,
  DOLLY_DSO_SYMBOL } from "./abi.mjs";
import { createProcessFfi } from "./ffi.mjs";
import { requireDsoType, validateDsoHost, validateDsoInterface } from "./interface.mjs";

const DSO_RESPONSE_SIZE = 16 + DOLLY_DSO_ERROR_CAPACITY;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

// One Worker runs one process: serve() sets these once, before _start.
let configuration;
let instance;
let processTable;
let processSymbols;
let dsoHostValidated = false;
let nextDsoHandle = 2n;
const loadedDsos = new Map();
const globalDsos = [];
const functionIndices = new WeakMap();

function dylinkRequirements(module) {
  const sections = WebAssembly.Module.customSections(module, "dylink.0");
  if (sections.length !== 1) throw new TypeError("shared object needs one dylink.0 section");
  const reader = new Reader(new Uint8Array(sections[0]), "dylink.0");
  let requirements;
  const needed = [];
  const weakImports = new Set();
  while (!reader.done) {
    const id = Number(reader.unsigned(8));
    const section = reader.subreader(reader.u32(), "dylink.0 subsection");
    if (id === 1) {
      if (requirements) throw new TypeError("duplicate dylink memory metadata");
      requirements = { memorySize: section.unsigned(64), memoryAlignment: section.unsigned(32),
        tableSize: section.unsigned(64), tableAlignment: section.unsigned(32) };
    } else if (id === 2) {
      for (let count = section.u32(); count > 0; --count) {
        const name = section.string();
        if (!name || name.includes("/") || name.includes("..")) {
          throw new TypeError("unsafe dylink dependency name");
        }
        needed.push(name);
      }
    } else if (id === 4) {
      for (let count = section.u32(); count > 0; --count) {
        const moduleName = section.string();
        const symbolName = section.string();
        const flags = section.unsigned(32);
        // WebAssembly dynamic-linking symbol flags use the low two bits for
        // binding and 1 for weak binding. Preserve the import namespace in the
        // key instead of assuming that equal spellings from env and GOT agree.
        if ((flags & 3n) === 1n) weakImports.add(`${moduleName}\0${symbolName}`);
      }
    }
  }
  if (!requirements) throw new TypeError("shared object lacks dylink memory metadata");
  if (requirements.memorySize > BigInt(DOLLY_DSO_LIMIT) ||
      requirements.memoryAlignment > 31n ||
      requirements.tableSize > 0xffffffffn ||
      requirements.tableAlignment > 31n) {
    throw new RangeError("shared object requirements are out of range");
  }
  return { ...requirements, needed, weakImports };
}

// The process table is 64-bit addressed: its length and indices are BigInts.
function growTable(delta) {
  if (delta === 0n) return processTable.length;
  if (delta > 0xffffffffn) throw new RangeError("shared object table is too large");
  return processTable.grow(delta);
}

function setTable(index, value) {
  processTable.set(index, value);
}

function functionIndex(value) {
  const previous = functionIndices.get(value);
  if (previous !== undefined) return previous;
  const index = growTable(1n);
  setTable(index, value);
  functionIndices.set(value, index);
  return index;
}

function typedSymbols(exports, values, memoryBase = 0n) {
  return new Map([...exports].map(entry => {
    let value = values[entry.name];
    // Side-module data exports are offsets; dlsym and GOT.mem need addresses.
    if (memoryBase !== 0n && entry.type.kind === "global" &&
        entry.type.value === "i64" && !entry.type.mutable) {
      value = new WebAssembly.Global({ value: "i64", mutable: false }, memoryBase + value.value);
    }
    return [entry.name, { type: entry.type, value }];
  }));
}

function globalSymbol(name) {
  const main = processSymbols.get(name);
  if (main !== undefined) return main;
  for (const dso of globalDsos) {
    const value = dso.symbols.get(name);
    if (value !== undefined) return value;
  }
  return undefined;
}

function symbolAddress({ value }) {
  if (typeof value === "function") return functionIndex(value);
  if (value instanceof WebAssembly.Global) {
    const raw = value.value;
    return typeof raw === "bigint" ? raw : BigInt(raw);
  }
  throw new TypeError("symbol is not a callable or data address");
}

function aligned(value, power) {
  const alignment = 1n << power;
  return (value + alignment - 1n) & -alignment;
}

function instantiateDso(bytes, flags) {
  // Parse and instantiate the same private copy, not a live shared-memory view.
  bytes = bytes.slice();
  const contract = configuration.contract;
  const source = parseWasmInterface(bytes);
  const parsed = validateDsoInterface(contract, source, DOLLY_PROCESS_ABI_DIGEST);
  checkHostAbi(executableHostRequirements(source), configuration.hostAbi);
  const module = new WebAssembly.Module(bytes);
  const requirements = dylinkRequirements(module);
  if (requirements.needed.length !== 0) {
    throw new TypeError(
      `shared object has unloaded dependencies: ${requirements.needed.join(", ")}`,
    );
  }
  const currentTable = processTable.length;
  const tableBase = aligned(currentTable, requirements.tableAlignment);
  const infrastructure = new Map(contract.imports.filter(entry => entry.module === "env")
    .map(entry => [entry.name, entry.type]));
  infrastructure.set("memory", {
    ...configuration.processInterface.imports.find(entry => entry.type.kind === "memory").type,
    minimum: BigInt(configuration.memory.buffer.byteLength / 65536),
  });
  infrastructure.set("__indirect_function_table", {
    ...processSymbols.get("__indirect_function_table").type,
    minimum: tableBase + requirements.tableSize,
  });
  const bindings = new Map();
  for (const [key, imported] of parsed.imports) {
    if (imported.module === "env" && infrastructure.has(imported.name)) {
      requireDsoType(infrastructure.get(imported.name), imported.type, imported.name);
      continue;
    }
    const symbol = parsed.exports.get(imported.name) ?? globalSymbol(imported.name);
    const weak = requirements.weakImports.has(key);
    if (!symbol && !weak) throw new TypeError(`undefined symbol: ${imported.name}`);
    if (symbol) {
      if (imported.module === "env") requireDsoType(symbol.type, imported.type, imported.name);
      else if (imported.module === "GOT.mem") {
        requireDsoType(symbol.type, infrastructure.get("__memory_base"), `GOT.mem.${imported.name}`);
      } else if (symbol.type.kind !== "func") {
        throw new TypeError(`DSO GOT.func.${imported.name}: expected a function symbol`);
      }
    }
    bindings.set(key, symbol);
  }
  const memoryAlignment = 1n << requirements.memoryAlignment;
  const memoryBase = instance.exports.__dolly_dso_allocate(
    requirements.memorySize, memoryAlignment,
  );
  if (typeof memoryBase !== "bigint" || memoryBase === 0n) {
    throw new RangeError("process could not reserve shared-object memory");
  }
  growTable(tableBase - currentTable + requirements.tableSize);

  const imports = {
    env: Object.assign(Object.create(null), {
      memory: configuration.memory,
      __memory_base: new WebAssembly.Global({ value: "i64", mutable: false }, memoryBase),
      __table_base: new WebAssembly.Global({ value: "i64", mutable: false }, tableBase),
      __stack_pointer: instance.exports.__stack_pointer,
      __indirect_function_table: processTable,
    }),
    "GOT.mem": Object.create(null),
    "GOT.func": Object.create(null),
  };
  const relocations = [];
  const pendingFunctions = [];
  let dsoInstance;
  let dsoSymbols;
  function resolveFunction(pending) {
    const symbol = dsoSymbols?.get(pending.name) ?? globalSymbol(pending.name);
    requireDsoType(symbol?.type, pending.type, pending.name);
    return symbol.value;
  }
  for (const [key, imported] of parsed.imports) {
    if (imported.module === "env" && !Object.hasOwn(imports.env, imported.name)) {
      const symbol = bindings.get(key);
      if (symbol?.value !== undefined) {
        imports.env[imported.name] = symbol.value;
      } else if (imported.type.kind === "func") {
        // wasm-ld may emit a preemptible weak definition as both an export and
        // an import. Like an ELF/Emscripten loader, defer that import until the
        // instance exists. Local definitions win, matching the compiler's
        // -Bsymbolic policy. The closure remains the import, so cache the
        // resolved function rather than repeating symbol lookup on every call.
        const pending = {
          name: imported.name,
          type: imported.type,
          weak: requirements.weakImports.has(key),
          value: undefined,
        };
        imports.env[imported.name] = (...arguments_) => {
          pending.value ??= resolveFunction(pending);
          return pending.value(...arguments_);
        };
        pendingFunctions.push(pending);
      } else {
        throw new TypeError(`undefined symbol: ${imported.name}`);
      }
    } else if (imported.module === "GOT.mem" || imported.module === "GOT.func") {
      const global = new WebAssembly.Global({ value: "i64", mutable: true }, 0n);
      imports[imported.module][imported.name] = global;
      relocations.push({
        module: imported.module,
        name: imported.name,
        global,
        weak: requirements.weakImports.has(key),
      });
    }
  }
  for (const relocation of relocations) {
    if (parsed.exports.has(relocation.name)) continue;
    const existing = globalSymbol(relocation.name);
    if (existing !== undefined) relocation.global.value = symbolAddress(existing);
  }
  dsoInstance = new WebAssembly.Instance(module, imports);
  dsoSymbols = typedSymbols(parsed.exports.values(), dsoInstance.exports, memoryBase);
  for (const pending of pendingFunctions) {
    if (pending.weak && !globalSymbol(pending.name) && !dsoSymbols.has(pending.name)) continue;
    pending.value = resolveFunction(pending);
  }
  for (const relocation of relocations) {
    const symbol = dsoSymbols.get(relocation.name) ?? globalSymbol(relocation.name);
    if (symbol !== undefined) relocation.global.value = symbolAddress(symbol);
    else if (relocation.weak) {
      relocation.global.value = 0n;
    } else {
      throw new TypeError(`undefined ${relocation.module} symbol: ${relocation.name}`);
    }
  }
  // wasm-ld emits dynamic relocations for pointers stored in a side module's
  // data segments. Instantiation copies the unrelocated bytes into the shared
  // memory; the loader must apply those relocations after every GOT entry has
  // been resolved and before constructors or exported functions can observe
  // the data. This is part of the WebAssembly dynamic-linking contract, not an
  // Emscripten convenience hook.
  const applyDataRelocations = dsoInstance.exports.__wasm_apply_data_relocs;
  if (applyDataRelocations !== undefined) applyDataRelocations();
  const handle = nextDsoHandle++;
  const record = { handle, module, instance: dsoInstance, symbols: dsoSymbols, flags, references: 1 };
  loadedDsos.set(handle, record);
  if ((flags & DOLLY_DSO_GLOBAL) !== 0) globalDsos.push(record);
  const constructors = dsoInstance.exports.__wasm_call_ctors;
  if (constructors !== undefined) constructors();
  return handle;
}

function writeDsoResponse(response, value = 0n, error = 0, message = "") {
  if (response.size < DSO_RESPONSE_SIZE) return -BigInt(DOLLY_ERRNO.ENOBUFS);
  const bytes = encoder.encode(message);
  const messageSize = Math.min(bytes.length, DOLLY_DSO_ERROR_CAPACITY);
  const output = new Uint8Array(configuration.memory.buffer, response.address,
                                DSO_RESPONSE_SIZE);
  output.fill(0);
  const view = new DataView(configuration.memory.buffer, response.address,
                            DSO_RESPONSE_SIZE);
  view.setBigUint64(0, BigInt.asUintN(64, value), true);
  view.setInt32(8, error, true);
  view.setUint32(12, messageSize, true);
  output.set(bytes.subarray(0, messageSize), 16);
  return BigInt(DSO_RESPONSE_SIZE);
}

function processDsoCall(operation, request, response) {
  // This is an optional process-local facility, not an executable requirement.
  // A freestanding _start needs neither a table nor libc's allocator.
  if (!(processTable instanceof WebAssembly.Table) ||
      !(instance?.exports.__stack_pointer instanceof WebAssembly.Global) ||
      typeof instance.exports.__dolly_dso_allocate !== "function") {
    return writeDsoResponse(response, 0n, DOLLY_ERRNO.ENOSYS,
      "process does not provide a dynamic-link namespace");
  }
  try {
    if (!dsoHostValidated) {
      validateDsoHost(configuration.contract, processSymbols);
      dsoHostValidated = true;
    }
    const view = new DataView(configuration.memory.buffer, request.address, request.size);
    if (operation === DOLLY_DSO_OPEN) {
      if (request.size < 16) throw new TypeError("short DSO_OPEN packet");
      const flags = view.getUint32(0, true);
      const reserved = view.getUint32(4, true);
      const size = view.getBigUint64(8, true);
      if ((flags & ~DOLLY_DSO_GLOBAL) !== 0 || reserved !== 0 ||
          size !== BigInt(request.size - 16) || size > BigInt(DOLLY_DSO_LIMIT)) {
        throw new TypeError("invalid DSO_OPEN packet");
      }
      const handle = size === 0n ? 1n : instantiateDso(
        new Uint8Array(configuration.memory.buffer, request.address + 16, Number(size)),
        flags,
      );
      return writeDsoResponse(response, handle);
    }
    if (operation === DOLLY_DSO_SYMBOL) {
      if (request.size < 16) throw new TypeError("short DSO_SYMBOL packet");
      const handle = view.getBigUint64(0, true);
      const nameSize = view.getUint32(8, true);
      if (view.getUint32(12, true) !== 0 || nameSize !== request.size - 16 ||
          nameSize === 0) throw new TypeError("invalid DSO_SYMBOL packet");
      const name = decoder.decode(Uint8Array.from(new Uint8Array(
        configuration.memory.buffer, request.address + 16, nameSize,
      )));
      let value;
      if (handle === 0n) value = globalSymbol(name);
      else if (handle === 1n) value = processSymbols.get(name);
      else {
        const dso = loadedDsos.get(handle);
        if (!dso) return writeDsoResponse(response, 0n, DOLLY_ERRNO.EBADF, "invalid DSO handle");
        value = dso.symbols.get(name);
      }
      if (value === undefined) {
        return writeDsoResponse(response, 0n, DOLLY_ERRNO.ENOENT, `undefined symbol: ${name}`);
      }
      return writeDsoResponse(response, symbolAddress(value));
    }
    if (operation === DOLLY_DSO_CLOSE) {
      if (request.size !== 8) throw new TypeError("invalid DSO_CLOSE packet");
      const handle = view.getBigUint64(0, true);
      if (handle === 1n) return writeDsoResponse(response);
      const dso = loadedDsos.get(handle);
      if (!dso) return writeDsoResponse(response, 0n, DOLLY_ERRNO.EBADF, "invalid DSO handle");
      if (dso.references !== 0) --dso.references;
      // Version 0 intentionally retains code/static storage until process exit.
      // The entire namespace and its private memory are reclaimed together.
      return writeDsoResponse(response);
    }
    return writeDsoResponse(response, 0n, DOLLY_ERRNO.ENOSYS, "unknown process-local operation");
  } catch (error) {
    return writeDsoResponse(
      response, 0n, error instanceof RangeError ? DOLLY_ERRNO.ENOMEM : DOLLY_ERRNO.ENOEXEC,
      error instanceof Error ? error.message : String(error),
    );
  }
}

// memory, instance and processInterface are the process's; contract is the
// parsed dolly-dso-0 and hostAbi the modules the image admits, which a loaded
// library's own records are checked against.
export function serve(context) {
  configuration = context;
  instance = context.instance;
  processTable = instance.exports.__indirect_function_table;
  processSymbols = typedSymbols(configuration.processInterface.exports, instance.exports);
  const ffi = createProcessFfi({
    memory: configuration.memory,
    getInstance: () => instance,
    getTable: () => processTable,
    growTable,
    setTable,
  });
  return {
    handles: operation => (operation >= DOLLY_DSO_OPEN && operation <= DOLLY_DSO_CLOSE) || ffi.handles(operation),
    call: (operation, request, response) => ffi.handles(operation)
      ? ffi.call(operation, request, response) : processDsoCall(operation, request, response),
  };
}
