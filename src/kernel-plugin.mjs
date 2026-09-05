import { DOLLY_KERNEL_PLUGIN_ABI_DIGEST } from "../dist/dolly-kernel-plugin-abi.mjs";

// Boot-only Wasm linking, not a browser capability imported by the guest.
// Inputs are bytes and real kernel Wasm exports. No paths, URLs, JavaScript
// callbacks, dependency loading, or ambient symbol lookup enter this module.
const functions = [
  "fopen", "fseek", "dolly_fclose", "ftell", "malloc", "fread", "free",
  "dolly_assert_fail", "realloc", "strcmp", "strncmp", "write",
  "__errno_location", "lseek", "preadv", "close", "fstat", "unlinkat",
  "openat", "realpath", "readv",
];
const maximumBytes = 64 * 1024 * 1024;

function allocationRequirements(module) {
  const sections = WebAssembly.Module.customSections(module, "dylink.0");
  if (sections.length !== 1) throw new TypeError("plugin needs one dylink.0 record");
  const bytes = new Uint8Array(sections[0]);
  let offset = 0;
  const integer = () => {
    let value = 0n;
    for (let shift = 0n; shift < 64n; shift += 7n) {
      if (offset === bytes.length) throw new TypeError("truncated plugin allocation record");
      const byte = bytes[offset++];
      value |= BigInt(byte & 127) << shift;
      if (!(byte & 128)) return value;
    }
    throw new TypeError("invalid plugin allocation integer");
  };
  // This profile has exactly the memory/table allocation subsection, with no
  // NEEDED libraries, runtime paths, or other loader extensions.
  if (integer() !== 1n) throw new TypeError("unsupported plugin linking record");
  const length = integer();
  if (length !== BigInt(bytes.length - offset)) throw new TypeError("invalid plugin record size");
  const size = integer();
  const alignment = integer();
  const tableSize = integer();
  const tableAlignment = integer();
  if (offset !== bytes.length || size > BigInt(maximumBytes) || alignment > 20n ||
      tableSize > 65536n || tableAlignment !== 0n) {
    throw new TypeError("unsupported plugin allocation requirements");
  }
  return { size, alignment: 1n << alignment, tableSize };
}

export function instantiateKernelPlugin(bytes, kernel, memory) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 8 || bytes.length > maximumBytes) {
    throw new TypeError("invalid resident plugin bytes");
  }
  const module = new WebAssembly.Module(bytes);
  const stamps = WebAssembly.Module.customSections(module, "dolly.abi");
  const hex = (data) => [...new Uint8Array(data)].map(x => x.toString(16).padStart(2, "0")).join("");
  if (stamps.length !== 1 || hex(stamps[0]) !== DOLLY_KERNEL_PLUGIN_ABI_DIGEST) {
    throw new TypeError("resident plugin has the wrong ABI stamp");
  }
  for (const { name } of WebAssembly.Module.exports(module)) {
    if (name.startsWith("__em_js__") || /^__(?:start|stop)_em_(?:asm|js)$/.test(name)) {
      throw new TypeError("resident plugins cannot contain JavaScript bindings");
    }
  }
  const table = kernel.__indirect_function_table;
  const env = {
    memory,
    __indirect_function_table: table,
    __stack_pointer: kernel.__stack_pointer,
    __memory_base: undefined,
    __table_base: undefined,
    ...Object.fromEntries(functions.map(name => [name, kernel[name]])),
  };
  for (const imported of WebAssembly.Module.imports(module)) {
    if (imported.module !== "env" || !Object.hasOwn(env, imported.name)) {
      throw new TypeError(`unsupported resident plugin import: ${imported.module}.${imported.name}`);
    }
  }
  const { size, alignment, tableSize } = allocationRequirements(module);
  const allocation = kernel.malloc(size + alignment);
  if (allocation === 0n) throw new RangeError("resident plugin allocation failed");
  const base = (allocation + alignment - 1n) & -alignment;
  const end = base + size;
  if (base < 0n || end > BigInt(memory.buffer.byteLength)) {
    throw new RangeError("resident plugin allocation is outside kernel memory");
  }
  // Code, table entries, and static data are resident until the kernel dies.
  // In particular, never free storage after a partially instantiated module
  // might have installed table entries pointing at it.
  new Uint8Array(memory.buffer, Number(base), Number(size)).fill(0);
  env.__memory_base = new WebAssembly.Global({ value: "i64" }, base);
  env.__table_base = new WebAssembly.Global({ value: "i64" }, table.grow(tableSize));
  // These are actual Wasm function exports, not JS forwarding wrappers. The
  // engine checks their exact function types at this instantiation boundary.
  const instance = new WebAssembly.Instance(module, { env });
  instance.exports.__wasm_apply_data_relocs?.();
  instance.exports.__wasm_call_ctors?.();
  return instance;
}
