import { DOLLY_KERNEL_PLUGIN_ABI_DIGEST, DOLLY_KERNEL_PLUGIN_IMPORTS } from "../dist/dolly-kernel-plugin-abi.mjs";
import { hex } from "./static-asset.mjs";
import { Reader } from "./wasm-interface.mjs";

// Boot-only Wasm linking, not a browser capability imported by the guest.
// Inputs are bytes and real kernel Wasm exports. No paths, URLs, JavaScript
// callbacks, dependency loading, or ambient symbol lookup enter this module.
const maximumBytes = 64 * 1024 * 1024;

function allocationRequirements(module) {
  const sections = WebAssembly.Module.customSections(module, "dylink.0");
  if (sections.length !== 1) throw new TypeError("plugin needs one dylink.0 record");
  const reader = new Reader(new Uint8Array(sections[0]), "plugin dylink.0");
  // This profile has exactly the memory/table allocation subsection, with no
  // NEEDED libraries, runtime paths, or other loader extensions.
  if (reader.unsigned(8) !== 1n) throw new TypeError("unsupported plugin linking record");
  const record = reader.subreader(reader.u32(), "plugin allocation record");
  const size = record.unsigned(64);
  const alignment = record.unsigned(32);
  const tableSize = record.unsigned(64);
  const tableAlignment = record.unsigned(32);
  if (!reader.done || !record.done || size > BigInt(maximumBytes) || alignment > 20n ||
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
    ...Object.fromEntries(DOLLY_KERNEL_PLUGIN_IMPORTS.map(name => [name, kernel[name]])),
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
