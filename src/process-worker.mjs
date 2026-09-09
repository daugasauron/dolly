import { DOLLY_PROCESS_ABI_DIGEST } from "../dist/dolly-process-abi.mjs";
import { DOLLY_ERRNO } from "../dist/dolly-errno.mjs";
import { createProcessFfi } from "./process-ffi.mjs";
import { parseWasmInterface } from "./wasm-interface.mjs";
import { requireDsoType, validateDsoHost, validateDsoInterface } from "./process-abi.mjs";

const PROCESS_EXIT = Symbol("Dolly process exit");
const DSO_OPEN = 112;
const DSO_SYMBOL = 113;
const DSO_CLOSE = 114;
const DSO_GLOBAL = 1;
const DSO_RESPONSE_SIZE = 256;
const DSO_ERROR_CAPACITY = 240;
const DSO_LIMIT = 512 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

const configuration = await new Promise((resolve, reject) => {
  const timeout = setTimeout(
    () => reject(new Error("Dolly process configuration was not provided")),
    10_000,
  );
  self.addEventListener("message", function configure(event) {
    if (event.data?.type !== "configure") return;
    self.removeEventListener("message", configure);
    clearTimeout(timeout);
    resolve(event.data);
  });
});

if (!(configuration.module instanceof WebAssembly.Module) ||
    !(configuration.memory instanceof WebAssembly.Memory) ||
    !(configuration.control instanceof SharedArrayBuffer) ||
    configuration.control.byteLength !== 16 ||
    !Number.isInteger(configuration.pid) || configuration.pid <= 0) {
  throw new Error("Dolly process received an invalid configuration");
}

const control = new Int32Array(configuration.control);
let exited = false;
let instance;
let processTable;
let processFfi;
let processSymbols;
let dsoHostValidated = false;
let nextDsoHandle = 2n;
const loadedDsos = new Map();
const globalDsos = [];
const functionIndices = new WeakMap();

function checkedRange(addressValue, sizeValue) {
  const address = Number(addressValue);
  const size = Number(sizeValue);
  const length = configuration.memory.buffer.byteLength;
  if (!Number.isSafeInteger(address) || !Number.isSafeInteger(size) ||
      address < 0 || size < 0 || address > length - size ||
      (size !== 0 && address === 0)) {
    throw new WebAssembly.RuntimeError("Dolly process supplied an invalid syscall range");
  }
  return { address, size };
}

function decodeResult() {
  const low = BigInt(Atomics.load(control, 2) >>> 0);
  const high = BigInt(Atomics.load(control, 3) >>> 0);
  return BigInt.asIntN(64, low | (high << 32n));
}

function readUleb(bytes, cursor, bits = 64) {
  let value = 0n;
  let shift = 0n;
  const maximum = Math.ceil(bits / 7);
  for (let count = 0; count < maximum; ++count) {
    if (cursor.offset >= bytes.length) throw new TypeError("truncated dylink metadata");
    const byte = bytes[cursor.offset++];
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) {
      if (value >= (1n << BigInt(bits))) throw new TypeError("oversized dylink integer");
      return value;
    }
    shift += 7n;
  }
  throw new TypeError("invalid dylink integer");
}

function readDylinkString(bytes, cursor, end) {
  const length = Number(readUleb(bytes.subarray(0, end), cursor, 32));
  if (!Number.isSafeInteger(length) || length > end - cursor.offset) {
    throw new TypeError("invalid dylink string");
  }
  const value = decoder.decode(bytes.subarray(cursor.offset, cursor.offset + length));
  cursor.offset += length;
  return value;
}

function dylinkRequirements(module) {
  const sections = WebAssembly.Module.customSections(module, "dylink.0");
  if (sections.length !== 1) throw new TypeError("shared object needs one dylink.0 section");
  const bytes = new Uint8Array(sections[0]);
  const cursor = { offset: 0 };
  let requirements;
  const needed = [];
  const weakImports = new Set();
  while (cursor.offset < bytes.length) {
    const id = Number(readUleb(bytes, cursor, 8));
    const size = Number(readUleb(bytes, cursor, 32));
    if (!Number.isSafeInteger(size) || size > bytes.length - cursor.offset) {
      throw new TypeError("invalid dylink subsection size");
    }
    const end = cursor.offset + size;
    if (id === 1) {
      if (requirements) throw new TypeError("duplicate dylink memory metadata");
      const memorySize = readUleb(bytes.subarray(0, end), cursor);
      const memoryAlignment = readUleb(bytes.subarray(0, end), cursor, 32);
      const tableSize = readUleb(bytes.subarray(0, end), cursor);
      const tableAlignment = readUleb(bytes.subarray(0, end), cursor, 32);
      requirements = { memorySize, memoryAlignment, tableSize, tableAlignment };
    } else if (id === 2) {
      const count = Number(readUleb(bytes.subarray(0, end), cursor, 32));
      for (let index = 0; index < count; ++index) {
        const name = readDylinkString(bytes, cursor, end);
        if (!name || name.includes("/") || name.includes("..")) {
          throw new TypeError("unsafe dylink dependency name");
        }
        needed.push(name);
      }
    } else if (id === 4) {
      const count = Number(readUleb(bytes.subarray(0, end), cursor, 32));
      for (let index = 0; index < count; ++index) {
        const moduleName = readDylinkString(bytes, cursor, end);
        const symbolName = readDylinkString(bytes, cursor, end);
        const flags = readUleb(bytes.subarray(0, end), cursor, 32);
        // WebAssembly dynamic-linking symbol flags use the low two bits for
        // binding and 1 for weak binding. Preserve the import namespace in the
        // key instead of assuming that equal spellings from env and GOT agree.
        if ((flags & 3n) === 1n) weakImports.add(`${moduleName}\0${symbolName}`);
      }
    }
    if (cursor.offset > end) throw new TypeError("overfilled dylink subsection");
    cursor.offset = end;
  }
  if (!requirements) throw new TypeError("shared object lacks dylink memory metadata");
  if (requirements.memorySize > BigInt(DSO_LIMIT) ||
      requirements.memoryAlignment > 31n ||
      requirements.tableSize > 0xffffffffn ||
      requirements.tableAlignment > 31n) {
    throw new RangeError("shared object requirements are out of range");
  }
  return { ...requirements, needed, weakImports };
}

function tableLength() {
  const length = processTable.length;
  return typeof length === "bigint" ? length : BigInt(length);
}

function growTable(delta) {
  if (delta === 0n) return tableLength();
  if (delta > 0xffffffffn) throw new RangeError("shared object table is too large");
  try {
    return BigInt(processTable.grow(Number(delta)));
  } catch (numberError) {
    try {
      return BigInt(processTable.grow(delta));
    } catch {
      throw numberError;
    }
  }
}

function setTable(index, value) {
  try {
    processTable.set(Number(index), value);
  } catch (numberError) {
    try {
      processTable.set(index, value);
    } catch {
      throw numberError;
    }
  }
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
  const module = new WebAssembly.Module(bytes);
  const contract = configuration.dsoContract;
  const parsed = validateDsoInterface(contract, parseWasmInterface(bytes), DOLLY_PROCESS_ABI_DIGEST);
  const requirements = dylinkRequirements(module);
  if (requirements.needed.length !== 0) {
    throw new TypeError(
      `shared object has unloaded dependencies: ${requirements.needed.join(", ")}`,
    );
  }
  const currentTable = tableLength();
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
  if ((flags & DSO_GLOBAL) !== 0) globalDsos.push(record);
  const constructors = dsoInstance.exports.__wasm_call_ctors;
  if (constructors !== undefined) constructors();
  return handle;
}

function writeDsoResponse(response, value = 0n, error = 0, message = "") {
  if (response.size < DSO_RESPONSE_SIZE) return -BigInt(DOLLY_ERRNO.ENOBUFS);
  const bytes = encoder.encode(message);
  const messageSize = Math.min(bytes.length, DSO_ERROR_CAPACITY);
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
      validateDsoHost(configuration.dsoContract, processSymbols);
      dsoHostValidated = true;
    }
    const view = new DataView(configuration.memory.buffer, request.address, request.size);
    if (operation === DSO_OPEN) {
      if (request.size < 16) throw new TypeError("short DSO_OPEN packet");
      const flags = view.getUint32(0, true);
      const reserved = view.getUint32(4, true);
      const size = view.getBigUint64(8, true);
      if ((flags & ~DSO_GLOBAL) !== 0 || reserved !== 0 ||
          size !== BigInt(request.size - 16) || size > BigInt(DSO_LIMIT)) {
        throw new TypeError("invalid DSO_OPEN packet");
      }
      const handle = size === 0n ? 1n : instantiateDso(
        new Uint8Array(configuration.memory.buffer, request.address + 16, Number(size)),
        flags,
      );
      return writeDsoResponse(response, handle);
    }
    if (operation === DSO_SYMBOL) {
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
    if (operation === DSO_CLOSE) {
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

function call(operation, requestAddressValue, requestSizeValue,
              responseAddressValue, responseCapacityValue) {
  if (!Number.isInteger(operation) || operation < 0) {
    throw new WebAssembly.RuntimeError("Dolly process supplied an invalid operation");
  }
  const request = checkedRange(requestAddressValue, requestSizeValue);
  const response = checkedRange(responseAddressValue, responseCapacityValue);
  if (operation === DSO_OPEN || operation === DSO_SYMBOL || operation === DSO_CLOSE) {
    return processDsoCall(operation, request, response);
  }
  if (processFfi?.handles(operation)) {
    return processFfi.call(operation, request, response);
  }
  const sequence = (Atomics.add(control, 0, 1) + 1) | 0;
  self.postMessage({
    type: "syscall",
    pid: configuration.pid,
    sequence,
    operation,
    requestAddress: request.address,
    requestSize: request.size,
    responseAddress: response.address,
    responseCapacity: response.size,
  });
  for (;;) {
    const observed = Atomics.load(control, 1);
    if (observed === sequence) break;
    // Wait for exactly the value we observed. If the supervisor responds
    // between the load and this call, Atomics.wait returns "not-equal"
    // instead of sleeping after the notification has already happened.
    Atomics.wait(control, 1, observed);
  }
  const result = decodeResult();
  if (operation === 5 && result >= 0n) {
    exited = true;
    throw PROCESS_EXIT;
  }
  return result;
}

try {
  instance = await WebAssembly.instantiate(configuration.module, {
    env: { memory: configuration.memory },
    dolly_process_0: { call },
  });
  if (typeof instance.exports._start !== "function") {
    throw new TypeError("Dolly process does not export _start");
  }
  processTable = instance.exports.__indirect_function_table;
  processSymbols = typedSymbols(configuration.processInterface.exports, instance.exports);
  processFfi = createProcessFfi({
    memory: configuration.memory,
    getInstance: () => instance,
    getTable: () => processTable,
    growTable,
    setTable,
  });
  self.postMessage({ type: "started", pid: configuration.pid });
  instance.exports._start();
  self.postMessage({ type: "finished", pid: configuration.pid, status: 0 });
} catch (error) {
  if (error === PROCESS_EXIT && exited) {
    self.postMessage({ type: "finished", pid: configuration.pid });
  } else {
    self.postMessage({
      type: "failed",
      pid: configuration.pid,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack ?? "" : "",
    });
  }
}
