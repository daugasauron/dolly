const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const encoder = new TextEncoder();
const valueTypes = new Map([
  [0x7f, "i32"],
  [0x7e, "i64"],
  [0x7d, "f32"],
  [0x7c, "f64"],
  [0x7b, "v128"],
  [0x70, "funcref"],
  [0x6f, "externref"],
  [0x69, "exnref"],
  [0x74, "nullexnref"],
]);

export class Reader {
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

function readVector(reader, readElement, result = []) {
  const count = reader.u32();
  if (count > reader.bytes.length - reader.offset) reader.fail("vector count exceeds section size");
  for (let index = 0; index < count; index++) result.push(readElement(reader));
  return result;
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

function readTagType(reader, types) {
  const attribute = reader.u32();
  return { kind: "tag", attribute, type: functionType(types, reader.u32(), reader) };
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

// An element of an expression segment: the function a ref.func names, or
// null for ref.null.
function readElementExpression(reader) {
  const opcode = reader.u8();
  let index = null;
  if (opcode === 0xd2) index = reader.u32();
  else if (opcode === 0xd0) readValueType(reader);
  else reader.fail(`unsupported element expression opcode 0x${opcode.toString(16)}`);
  if (reader.u8() !== 0x0b) reader.fail("element expression has more than one instruction");
  return index;
}

// The functions an element segment puts into a table: an active segment's,
// none for a passive or declarative one (flag bit 0).
function readElementSegment(reader) {
  const flags = reader.u32();
  if (flags > 7) reader.fail(`unsupported element segment flags ${flags}`);
  const active = (flags & 0x1) === 0;
  if (flags === 2 || flags === 6) reader.u32();
  if (active) skipConstantExpression(reader);
  if (flags & 0x4) {
    if (flags !== 4) readValueType(reader);
    const indices = readVector(reader, readElementExpression);
    return active ? indices.filter(index => index !== null) : [];
  }
  if (flags !== 0 && reader.u8() !== 0x00) reader.fail("unsupported element kind");
  const indices = readVector(reader, item => item.u32());
  return active ? indices : [];
}

// Binaryen's --fpcast-emu leaves one signature in the table, which every
// indirect call uses: thunks of i64 parameters, sixteen or more
// (max-func-params), and an i64 result. Their parameter count, or 0.
function castEmulationParameters(tableFunctions) {
  const [type] = tableFunctions;
  const thunk = type && type.params.length >= 16 && type.params.every(param => param === "i64") &&
    type.results.length === 1 && type.results[0] === "i64";
  return thunk && tableFunctions.every(other => other === type) ? type.params.length : 0;
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
  const importedTags = [];
  const definedTags = [];
  const rawExports = [];
  const tableFunctionIndices = [];
  const customSections = [];
  const customSectionData = [];

  while (!reader.done) {
    const id = reader.u8();
    const size = reader.u32();
    const section = reader.subreader(size, `${label} section ${id}`);

    if (id === 0) {
      const name = section.string();
      customSections.push(name);
      customSectionData.push({ name, data: section.take(section.bytes.length - section.offset) });
    } else if (id === 1) {
      readVector(section, (item) => {
        if (item.u8() !== 0x60) item.fail("only function types are supported");
        return {
          kind: "func",
          params: readVector(item, readValueType),
          results: readVector(item, readValueType),
        };
      }, types);
    } else if (id === 2) {
      readVector(section, (item) => {
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
          type = readTagType(item, types);
          importedTags.push(type);
        } else {
          item.fail(`unknown import kind ${externalKind}`);
        }
        return { module, name, type };
      }, imports);
    } else if (id === 3) {
      readVector(section, (item) => item.u32(), definedFunctionTypes);
    } else if (id === 4) {
      readVector(section, readTableType, definedTables);
    } else if (id === 5) {
      readVector(section, readMemoryType, definedMemories);
    } else if (id === 6) {
      readVector(section, (item) => {
        const type = readGlobalType(item);
        skipConstantExpression(item);
        return type;
      }, definedGlobals);
    } else if (id === 7) {
      readVector(section, (item) => ({
        name: item.string(),
        externalKind: item.u8(),
        index: item.u32(),
      }), rawExports);
    } else if (id === 9) {
      // One by one: a large program's table (Mojo's, Codex's) exceeds the
      // arguments a spread may pass.
      for (const indices of readVector(section, readElementSegment)) for (const index of indices) tableFunctionIndices.push(index);
    } else if (id === 13) {
      readVector(section, item => readTagType(item, types), definedTags);
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
  const collections = [functions, tables, memories, globals, [...importedTags, ...definedTags]];
  const kindNames = ["func", "table", "memory", "global", "tag"];
  const exports = rawExports.map(({ name, externalKind, index }) => {
    const collection = collections[externalKind];
    const type = collection?.[index];
    if (!type) reader.fail(`export ${name} references unknown ${kindNames[externalKind] ?? externalKind} ${index}`);
    return externalKind === 0 ? { name, type, function: index } : { name, type };
  });

  const tableFunctions = tableFunctionIndices.map(index =>
    functions[index] ?? reader.fail(`element segment references unknown function ${index}`));

  return {
    label,
    imports,
    exports,
    castEmulationParameters: castEmulationParameters(tableFunctions),
    customSections,
    customSectionData,
  };
}

// EXPORTS (parseWasmInterface's) as every Worker of a process looks them up by
// name: the names sorted in one shared buffer, each with the index of its type
// among the distinct types. As objects, each Worker held a copy of them all,
// and dso@0 a map of them, in the 4 GiB heap all of a tab's Workers share:
// lean's 234,338 exports cost each of its Workers 67 MiB of it so. SLOTS gives
// the exports moved into a table (exportFunctionsByTable) their entries, THUNKS
// a cast-emulated program's functions their thunks' (castThunkTargets).
export function exportIndex(exports, slots = new Map(), thunks = new Map()) {
  const sorted = [...exports].sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
  const encoded = sorted.map(({ name }) => encoder.encode(name));
  const names = new Uint8Array(new SharedArrayBuffer(encoded.reduce((size, name) => size + name.length, 0)));
  const offsets = new Uint32Array(new SharedArrayBuffer(4 * (sorted.length + 1)));
  const typeIndices = new Uint32Array(new SharedArrayBuffer(4 * sorted.length));
  const tableSlots = new Int32Array(new SharedArrayBuffer(4 * sorted.length));
  const thunkSlots = new Int32Array(new SharedArrayBuffer(4 * sorted.length));
  // Exports of one function type share its object; each global has its own.
  const types = [], byObject = new Map(), byText = new Map();
  sorted.forEach(({ name, type, function: function_ }, index) => {
    names.set(encoded[index], offsets[index]);
    offsets[index + 1] = offsets[index] + encoded[index].length;
    if (!byObject.has(type)) {
      const text = JSON.stringify(type, (_, value) => typeof value === "bigint" ? `${value}n` : value);
      if (!byText.has(text)) byText.set(text, types.push(type) - 1);
      byObject.set(type, byText.get(text));
    }
    typeIndices[index] = byObject.get(type);
    tableSlots[index] = slots.get(name) ?? -1;
    thunkSlots[index] = Number(thunks.get(function_) ?? -1);
  });
  return { names, offsets, typeIndices, tableSlots, thunkSlots, types };
}

// Export NAME in INDEX (exportIndex): its type, its entry in the table of moved
// exports and its thunk's in table 0, each or -1; undefined when there is none.
export function findExport({ names, offsets, typeIndices, tableSlots, thunkSlots, types }, name) {
  for (let low = 0, high = typeIndices.length; low < high;) {
    const middle = (low + high) >>> 1, found = decoder.decode(names.slice(offsets[middle], offsets[middle + 1]));
    if (found === name) return { type: types[typeIndices[middle]], slot: tableSlots[middle], thunk: thunkSlots[middle] };
    if (found < name) low = middle + 1; else high = middle;
  }
  return undefined;
}

// In a cast-emulated program (castEmulationParameters), the function each
// thunk Binaryen put in the table calls: function index -> table index, for
// the entries of segments that fill table 0 from a constant offset. A thunk
// converts its parameters (local.get, i32.wrap_i64, f32 and f64.reinterpret)
// and calls its function.
export function castThunkTargets(bytes, parsed) {
  const reader = new Reader(bytes);
  reader.take(8);
  let segments = [], bodies, begins = new Uint32Array(), ends = begins;
  while (!reader.done) {
    const id = reader.u8(), section = reader.subreader(reader.u32(), `section ${id}`);
    if (id === 9) segments = readVector(section, item => {
      const flags = item.u32(), opcode = flags === 0 ? item.u8() : 0;
      if (flags !== 0 || (opcode !== 0x41 && opcode !== 0x42)) return null;
      const offset = BigInt(item.signed(opcode === 0x41 ? 32 : 64));
      if (item.u8() !== 0x0b) return null;
      return { offset, functions: readVector(item, entry => entry.u32()) };
    });
    if (id === 10) {
      bodies = section.bytes;
      begins = new Uint32Array(section.u32());
      ends = new Uint32Array(begins.length);
      for (let index = 0; index < begins.length; index++) {
        const size = section.u32();
        begins[index] = section.offset;
        section.take(size);
        ends[index] = section.offset;
      }
    }
  }
  const imported = parsed.imports.filter(entry => entry.type.kind === "func").length;
  const targets = new Map();
  for (const { offset, functions } of segments.filter(Boolean)) functions.forEach((thunk, position) => {
    const index = thunk - imported;
    if (index < 0 || index >= begins.length) return;
    const code = new Reader(bodies.subarray(begins[index], ends[index]));
    if (code.u32() !== 0) return;
    for (let opcode = code.u8(); !code.done; opcode = code.u8()) {
      if (opcode === 0x20) code.u32();
      else if (opcode === 0x10) {
        const target = code.u32();
        if (!targets.has(target)) targets.set(target, offset + BigInt(position));
        return;
      } else if (opcode !== 0xa7 && opcode !== 0xbe && opcode !== 0xbf) return;
    }
  });
  return targets;
}

// An instance makes an object for every function it exports when it is made:
// in Chrome 50 MiB for the 234,338 of a program linked -rdynamic, of the 4 GiB
// heap a tab's Workers share; in a table they cost 8 MiB, each entry made when
// first read (measured in Chrome 138, task 20261117-220855). BYTES with every
// function export but those KEEP names moved into a table exported as
// DOLLY_EXPORT_TABLE, and the entry of each moved one; null when none moves.
export const DOLLY_EXPORT_TABLE = "__dolly_exports";
export function exportFunctionsByTable(bytes, parsed, keep) {
  const reader = new Reader(bytes);
  reader.take(8);
  const sections = [];
  while (!reader.done) {
    const start = reader.offset, id = reader.u8(), body = reader.subreader(reader.u32(), `section ${id}`);
    sections.push({ id, body, bytes: bytes.subarray(start, reader.offset) });
  }
  const exportSection = sections.find(section => section.id === 7);
  if (!exportSection) return null;
  const kept = [], moved = [];
  readVector(exportSection.body, item => {
    const begin = item.offset, name = item.string(), kind = item.u8(), index = item.u32();
    (kind === 0 && !keep.has(name) ? moved : kept).push({ name, index, bytes: item.bytes.subarray(begin, item.offset) });
  });
  if (moved.length === 0) return null;
  const vector = (count, parts) => joinBytes([encodeUnsigned(count), ...parts]);
  const section = (id, body) => joinBytes([Uint8Array.of(id), encodeUnsigned(body.length), body]);
  const rest = reader => reader.bytes.subarray(reader.offset);
  const tables = sections.find(entry => entry.id === 4);
  const definedTables = tables ? tables.body.u32() : 0;
  const table = parsed.imports.filter(entry => entry.type.kind === "table").length + definedTables;
  const replacements = new Map([
    [4, section(4, vector(definedTables + 1, [tables ? rest(tables.body) : new Uint8Array(),
      Uint8Array.of(0x70, 0x00), encodeUnsigned(moved.length)]))],
    [7, section(7, vector(kept.length + 1, [...kept.map(entry => entry.bytes),
      encodeUnsigned(DOLLY_EXPORT_TABLE.length), encoder.encode(DOLLY_EXPORT_TABLE), Uint8Array.of(1), encodeUnsigned(table)]))],
  ]);
  const elements = sections.find(entry => entry.id === 9);
  const segment = joinBytes([Uint8Array.of(0x02), encodeUnsigned(table), Uint8Array.of(0x41, 0x00, 0x0b, 0x00),
    encodeUnsigned(moved.length), ...moved.map(entry => encodeUnsigned(entry.index))]);
  replacements.set(9, section(9, elements ? vector(elements.body.u32() + 1, [rest(elements.body), segment]) : vector(1, [segment])));
  // Sections in the order WebAssembly requires; a table and an element section
  // go where they belong when the module has none.
  const order = [1, 2, 3, 4, 5, 13, 6, 7, 8, 9, 12, 10, 11];
  const parts = [bytes.subarray(0, 8)];
  const placed = new Set();
  for (const { id, bytes: original } of sections) {
    for (const missing of [4, 9]) {
      if (id !== 0 && !placed.has(missing) && order.indexOf(id) > order.indexOf(missing)) {
        parts.push(replacements.get(missing));
        placed.add(missing);
      }
    }
    if (replacements.has(id)) {
      parts.push(replacements.get(id));
      placed.add(id);
    } else parts.push(original);
  }
  for (const missing of [4, 9]) if (!placed.has(missing)) parts.push(replacements.get(missing));
  return { bytes: joinBytes(parts), slots: new Map(moved.map(({ name }, slot) => [name, slot])) };
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
  if (left.kind === "tag") return left.attribute === right.attribute && sameWasmType(left.type, right.type);
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
  if (["func", "global", "tag"].includes(provider.kind)) return sameWasmType(provider, required);
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
