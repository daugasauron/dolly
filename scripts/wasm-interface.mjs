import { readFile } from "node:fs/promises";

const decoder = new TextDecoder("utf-8", { fatal: true });
const valueTypes = new Map([
  [0x7f, "i32"],
  [0x7e, "i64"],
  [0x7d, "f32"],
  [0x7c, "f64"],
  [0x7b, "v128"],
  [0x70, "funcref"],
  [0x6f, "externref"],
]);

class Reader {
  constructor(bytes, label = "WebAssembly binary") {
    this.bytes = bytes;
    this.offset = 0;
    this.label = label;
  }

  get done() {
    return this.offset === this.bytes.length;
  }

  fail(message) {
    throw new Error(`${this.label} at byte ${this.offset}: ${message}`);
  }

  u8() {
    if (this.offset >= this.bytes.length) this.fail("unexpected end of file");
    return this.bytes[this.offset++];
  }

  take(length) {
    if (!Number.isSafeInteger(length) || length < 0 || this.offset + length > this.bytes.length) {
      this.fail(`invalid byte range of length ${length}`);
    }
    const result = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return result;
  }

  subreader(length, label) {
    return new Reader(this.take(length), label);
  }

  unsigned(bits = 32) {
    let result = 0n;
    let shift = 0n;
    const limit = Math.ceil(bits / 7);
    for (let index = 0; index < limit; index += 1) {
      const byte = this.u8();
      result |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) {
        if (result >= (1n << BigInt(bits))) this.fail(`unsigned LEB exceeds ${bits} bits`);
        return result;
      }
      shift += 7n;
    }
    this.fail(`unterminated unsigned ${bits}-bit LEB`);
  }

  signed(bits = 32) {
    let result = 0n;
    let shift = 0n;
    let byte = 0;
    const limit = Math.ceil(bits / 7);
    for (let index = 0; index < limit; index += 1) {
      byte = this.u8();
      result |= BigInt(byte & 0x7f) << shift;
      shift += 7n;
      if ((byte & 0x80) === 0) {
        if ((byte & 0x40) !== 0 && shift < BigInt(bits)) result |= (-1n) << shift;
        return result;
      }
    }
    this.fail(`unterminated signed ${bits}-bit LEB`);
  }

  u32() {
    return Number(this.unsigned(32));
  }

  string() {
    const length = this.u32();
    try {
      return decoder.decode(this.take(length));
    } catch {
      this.fail("invalid UTF-8 string");
    }
  }
}

function readValueType(reader) {
  const byte = reader.u8();
  const type = valueTypes.get(byte);
  if (!type) reader.fail(`unsupported value type 0x${byte.toString(16)}`);
  return type;
}

function readVector(reader, readElement) {
  const count = reader.u32();
  return Array.from({ length: count }, () => readElement(reader));
}

function readLimits(reader) {
  const flags = reader.u32();
  if ((flags & ~0x7) !== 0) reader.fail(`unsupported limits flags 0x${flags.toString(16)}`);
  const hasMaximum = (flags & 0x1) !== 0;
  const shared = (flags & 0x2) !== 0;
  const address64 = (flags & 0x4) !== 0;
  const readBound = () => reader.unsigned(address64 ? 64 : 32);
  const minimum = readBound();
  const maximum = hasMaximum ? readBound() : null;
  if (shared && maximum === null) reader.fail("shared limits require a maximum");
  return { minimum, maximum, shared, address64 };
}

function readTableType(reader) {
  return { kind: "table", element: readValueType(reader), ...readLimits(reader) };
}

function readMemoryType(reader) {
  return { kind: "memory", ...readLimits(reader) };
}

function readGlobalType(reader) {
  return { kind: "global", value: readValueType(reader), mutable: reader.u8() !== 0 };
}

function skipConstantExpression(reader) {
  for (;;) {
    const opcode = reader.u8();
    switch (opcode) {
      case 0x0b:
        return;
      case 0x41:
        reader.signed(32);
        break;
      case 0x42:
        reader.signed(64);
        break;
      case 0x43:
        reader.take(4);
        break;
      case 0x44:
        reader.take(8);
        break;
      case 0x23:
      case 0xd2:
        reader.u32();
        break;
      case 0xd0:
        readValueType(reader);
        break;
      case 0x6a: // i32.add
      case 0x6b: // i32.sub
      case 0x6c: // i32.mul
      case 0x7c: // i64.add
      case 0x7d: // i64.sub
      case 0x7e: // i64.mul
        break;
      default:
        reader.fail(`unsupported constant-expression opcode 0x${opcode.toString(16)}`);
    }
  }
}

function functionType(types, index, reader) {
  const type = types[index];
  if (!type) reader.fail(`function references missing type ${index}`);
  return type;
}

export function parseWasmInterface(input, label = "WebAssembly binary") {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const reader = new Reader(bytes, label);
  const expectedHeader = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];
  for (const byte of expectedHeader) {
    if (reader.u8() !== byte) reader.fail("invalid WebAssembly header");
  }

  const types = [];
  const imports = [];
  const definedFunctionTypes = [];
  const importedTables = [];
  const definedTables = [];
  const importedMemories = [];
  const definedMemories = [];
  const importedGlobals = [];
  const definedGlobals = [];
  const rawExports = [];
  const customSections = [];
  const customSectionData = [];
  const sections = [];
  let hasStart = false;

  while (!reader.done) {
    const id = reader.u8();
    const size = reader.u32();
    const section = reader.subreader(size, `${label} section ${id}`);
    sections.push(id);

    if (id === 0) {
      const name = section.string();
      customSections.push(name);
      customSectionData.push({ name, data: section.take(section.bytes.length - section.offset) });
      sections[sections.length - 1] = `custom:${name}`;
    } else if (id === 1) {
      types.push(...readVector(section, (item) => {
        if (item.u8() !== 0x60) item.fail("only function types are supported");
        return {
          kind: "func",
          params: readVector(item, readValueType),
          results: readVector(item, readValueType),
        };
      }));
    } else if (id === 2) {
      imports.push(...readVector(section, (item) => {
        const module = item.string();
        const name = item.string();
        const externalKind = item.u8();
        let type;
        if (externalKind === 0) {
          const typeIndex = item.u32();
          type = functionType(types, typeIndex, item);
        } else if (externalKind === 1) {
          type = readTableType(item);
          importedTables.push(type);
        } else if (externalKind === 2) {
          type = readMemoryType(item);
          importedMemories.push(type);
        } else if (externalKind === 3) {
          type = readGlobalType(item);
          importedGlobals.push(type);
        } else if (externalKind === 4) {
          const attribute = item.u32();
          const typeIndex = item.u32();
          type = { kind: "tag", attribute, type: functionType(types, typeIndex, item) };
        } else {
          item.fail(`unknown import kind ${externalKind}`);
        }
        return { module, name, type };
      }));
    } else if (id === 3) {
      definedFunctionTypes.push(...readVector(section, (item) => item.u32()));
    } else if (id === 4) {
      definedTables.push(...readVector(section, readTableType));
    } else if (id === 5) {
      definedMemories.push(...readVector(section, readMemoryType));
    } else if (id === 6) {
      definedGlobals.push(...readVector(section, (item) => {
        const type = readGlobalType(item);
        skipConstantExpression(item);
        return type;
      }));
    } else if (id === 7) {
      rawExports.push(...readVector(section, (item) => ({
        name: item.string(),
        externalKind: item.u8(),
        index: item.u32(),
      })));
    } else if (id === 8) {
      section.u32();
      hasStart = true;
    } else {
      section.take(section.bytes.length - section.offset);
    }

    if (!section.done) section.fail("section has trailing bytes");
  }

  const importedFunctions = imports.filter((entry) => entry.type.kind === "func").map((entry) => entry.type);
  const functions = [
    ...importedFunctions,
    ...definedFunctionTypes.map((index) => functionType(types, index, reader)),
  ];
  const tables = [...importedTables, ...definedTables];
  const memories = [...importedMemories, ...definedMemories];
  const globals = [...importedGlobals, ...definedGlobals];
  const collections = [functions, tables, memories, globals];
  const kindNames = ["func", "table", "memory", "global", "tag"];
  const exports = rawExports.map(({ name, externalKind, index }) => {
    const collection = collections[externalKind];
    const type = collection?.[index];
    if (!type) reader.fail(`export ${name} references unknown ${kindNames[externalKind] ?? externalKind} ${index}`);
    return { name, type };
  });

  return {
    label,
    imports,
    exports,
    customSections,
    customSectionData,
    sections,
    hasStart,
    counts: {
      types: types.length,
      importedFunctions: importedFunctions.length,
      definedFunctions: definedFunctionTypes.length,
    },
  };
}

function encodeUnsigned(value) {
  let remaining = BigInt(value);
  const bytes = [];
  do {
    let byte = Number(remaining & 0x7fn);
    remaining >>= 7n;
    if (remaining !== 0n) byte |= 0x80;
    bytes.push(byte);
  } while (remaining !== 0n);
  return Uint8Array.from(bytes);
}

function joinBytes(parts) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

export function appendCustomSection(input, name, data) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const encodedName = new TextEncoder().encode(name);
  const payload = joinBytes([encodeUnsigned(encodedName.length), encodedName, data]);
  const section = joinBytes([Uint8Array.of(0), encodeUnsigned(payload.length), payload]);
  return joinBytes([bytes, section]);
}

export async function readWasmInterface(path) {
  return parseWasmInterface(await readFile(path), path);
}

function formatLimits(type) {
  const width = type.address64 ? "64" : "32";
  const maximum = type.maximum === null ? "*" : type.maximum;
  return `${width}(min=${type.minimum},max=${maximum}${type.shared ? ",shared" : ""})`;
}

export function formatWasmType(type) {
  if (type.kind === "func") {
    return `func(${type.params.join(",")})->(${type.results.join(",")})`;
  }
  if (type.kind === "global") {
    return `global(${type.mutable ? "mut " : ""}${type.value})`;
  }
  if (type.kind === "memory") return `memory${formatLimits(type)}`;
  if (type.kind === "table") return `table${formatLimits(type)}:${type.element}`;
  if (type.kind === "tag") return `tag(${formatWasmType(type.type)})`;
  throw new Error(`unknown WebAssembly type kind ${type.kind}`);
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function sameWasmType(left, right) {
  if (left.kind !== right.kind) return false;
  if (left.kind === "func") {
    return arraysEqual(left.params, right.params) && arraysEqual(left.results, right.results);
  }
  if (left.kind === "global") return left.value === right.value && left.mutable === right.mutable;
  if (left.kind === "memory") {
    return left.address64 === right.address64
      && left.shared === right.shared
      && left.minimum === right.minimum
      && left.maximum === right.maximum;
  }
  if (left.kind === "table") {
    return left.element === right.element
      && left.address64 === right.address64
      && left.minimum === right.minimum
      && left.maximum === right.maximum;
  }
  return false;
}

export function providerSatisfiesImport(provider, required, { dynamicTable = false } = {}) {
  if (provider.kind !== required.kind) return false;
  if (provider.kind === "func" || provider.kind === "global") return sameWasmType(provider, required);
  if (provider.kind === "memory" || provider.kind === "table") {
    if (provider.address64 !== required.address64 || provider.shared !== required.shared) return false;
    if (provider.kind === "table" && provider.element !== required.element) return false;
    if (!dynamicTable && provider.minimum < required.minimum) return false;
    if (required.maximum !== null) {
      if (provider.maximum === null || provider.maximum > required.maximum) return false;
    }
    return true;
  }
  return false;
}
