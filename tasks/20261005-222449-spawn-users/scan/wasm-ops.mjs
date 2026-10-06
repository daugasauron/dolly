// Static scan of a Dolly Wasm binary: which constant operation numbers reach
// the dolly_process_0.call import, directly or through wrapper functions.
const text = new TextDecoder();
const UNKNOWN = -1;

function effects() {
  const pops = new Int8Array(256).fill(UNKNOWN), pushes = new Int8Array(256).fill(UNKNOWN);
  const set = (from, to, p, q) => { for (let op = from; op <= to; op += 1) { pops[op] = p; pushes[op] = q; } };
  set(0x01, 0x01, 0, 0);
  set(0x1a, 0x1a, 1, 0); set(0x1b, 0x1b, 3, 1);
  set(0x20, 0x20, 0, 1); set(0x21, 0x21, 1, 0); set(0x22, 0x22, 1, 1);
  set(0x23, 0x23, 0, 1); set(0x24, 0x24, 1, 0);
  set(0x28, 0x35, 1, 1); set(0x36, 0x3e, 2, 0);
  set(0x3f, 0x3f, 0, 1); set(0x40, 0x40, 1, 1);
  set(0x41, 0x44, 0, 1);
  set(0x45, 0x45, 1, 1); set(0x46, 0x4f, 2, 1); set(0x50, 0x50, 1, 1); set(0x51, 0x5a, 2, 1);
  set(0x5b, 0x66, 2, 1);
  set(0x67, 0x69, 1, 1); set(0x6a, 0x78, 2, 1); set(0x79, 0x7b, 1, 1); set(0x7c, 0x8a, 2, 1);
  set(0x8b, 0x91, 1, 1); set(0x92, 0x98, 2, 1); set(0x99, 0x9f, 1, 1); set(0xa0, 0xa6, 2, 1);
  set(0xa7, 0xc4, 1, 1);
  return { pops, pushes };
}
const EFFECT = effects();

export function scan(bytes) {
  let at = 0;
  const u8 = () => bytes[at++];
  const leb = () => { // unsigned, as a Number (values here stay below 2^53)
    let result = 0, scale = 1, byte;
    do { byte = bytes[at++]; result += (byte & 0x7f) * scale; scale *= 128; } while (byte & 0x80);
    return result;
  };
  const skipLeb = () => { while (bytes[at++] & 0x80); };
  const sleb32 = () => {
    let result = 0, shift = 0, byte;
    do { byte = bytes[at++]; if (shift < 32) result |= (byte & 0x7f) << shift; shift += 7; } while (byte & 0x80);
    if (shift < 32 && (byte & 0x40)) result |= -1 << shift;
    return result;
  };
  const name = () => { const length = leb(); const value = text.decode(bytes.subarray(at, at + length)); at += length; return value; };
  if (bytes.length < 8 || bytes[0] !== 0 || bytes[1] !== 0x61 || bytes[2] !== 0x73 || bytes[3] !== 0x6d) return null;
  at = 8;
  const result = { size: bytes.length, customs: [], host: [], imports: [], exports: 0, start: false,
    processCall: -1, functions: 0, names: null, dataCount: 0 };
  const types = [];          // [params, results] counts
  const functionTypes = [];  // per function index
  let code = null;
  const elementFunctions = new Set(), exportedFunctions = new Set();
  while (at < bytes.length) {
    const id = u8(), size = leb(), end = at + size;
    if (id === 0) {
      const label = name();
      result.customs.push(label);
      if (label === "dolly.host") {
        for (let offset = at; offset + 72 <= end; offset += 72) {
          const raw = bytes.subarray(offset, offset + 32), zero = raw.indexOf(0);
          result.host.push(`${text.decode(raw.subarray(0, zero))}@${bytes[offset + 32] | bytes[offset + 33] << 8}`);
        }
      } else if (label === "name") {
        result.names = new Map();
        while (at < end) {
          const kind = u8(), length = leb(), stop = at + length;
          if (kind === 1) { for (let count = leb(); count > 0; count -= 1) { const index = leb(); result.names.set(index, name()); } }
          at = stop;
        }
      }
    } else if (id === 1) {
      for (let count = leb(); count > 0; count -= 1) {
        const form = u8();
        if (form !== 0x60) { types.push(null); at = end; break; }
        const params = leb(); const paramTypes = bytes.subarray(at, at + params); at += params;
        const results = leb(); at += results;
        types.push({ params, results, first: paramTypes });
      }
    } else if (id === 2) {
      for (let count = leb(); count > 0; count -= 1) {
        const module = name(), field = name(), kind = u8();
        if (kind === 0) {
          const type = leb();
          if (module === "dolly_process_0" && field === "call") result.processCall = functionTypes.length;
          functionTypes.push(type);
          result.imports.push(`${module}.${field}`);
        } else if (kind === 1) { u8(); const flags = u8(); skipLeb(); if (flags & 1) skipLeb(); result.imports.push(`${module}.${field}:table`); }
        else if (kind === 2) { const flags = u8(); skipLeb(); if (flags & 1) skipLeb(); result.imports.push(`${module}.${field}:memory`); }
        else if (kind === 3) { u8(); u8(); result.imports.push(`${module}.${field}:global`); }
        else if (kind === 4) { u8(); skipLeb(); result.imports.push(`${module}.${field}:tag`); }
      }
    } else if (id === 3) {
      for (let count = leb(); count > 0; count -= 1) functionTypes.push(leb());
    } else if (id === 7) {
      for (let count = leb(); count > 0; count -= 1) {
        const field = name(); const kind = u8(); const index = leb();
        result.exports += 1;
        if (kind === 0) exportedFunctions.add(index);
        if (kind === 0 && field === "_start") result.start = true;
      }
    } else if (id === 9) {
      const expr = () => { for (;;) { const code = u8(); if (code === 0x0b) return; if (code === 0x41 || code === 0x42 || code === 0x23 || code === 0xd2) skipLeb(); else if (code === 0xd0) skipLeb(); } };
      const funcExpr = () => { const code = u8(); let index = -1; if (code === 0xd2) index = leb(); else if (code === 0xd0) skipLeb(); else if (code === 0x23) skipLeb(); if (u8() !== 0x0b) throw new Error("unsupported element expression"); return index; };
      try {
        for (let count = leb(); count > 0; count -= 1) {
          const flags = leb();
          if (flags === 2 || flags === 6) skipLeb();
          if (flags === 0 || flags === 2 || flags === 4 || flags === 6) expr();
          if (flags === 1 || flags === 2 || flags === 3 || flags === 5 || flags === 6 || flags === 7) u8();
          for (let items = leb(); items > 0; items -= 1) elementFunctions.add(flags < 4 ? leb() : funcExpr());
        }
      } catch (error) { result.elementError = String(error.message); }
    } else if (id === 10) code = [at, end];
    at = end;
  }
  result.functions = functionTypes.length;
  result.ops = []; result.unresolved = 0; result.candidates = []; result.wrappers = 0; result.sites = {};
  if (result.processCall < 0 || !code) return result;

  const importCount = result.imports.filter(entry => !entry.includes(":")).length;
  const targets = new Map([[result.processCall, 0]]); // function index -> operand index of the operation
  const ops = new Set(), candidates = new Set(), sites = new Map();
  let capacity = 4096;
  let op = new Uint8Array(capacity), imm = new Int32Array(capacity), pop = new Int8Array(capacity), push = new Int8Array(capacity);
  const grow = () => {
    capacity *= 2;
    const next = [new Uint8Array(capacity), new Int32Array(capacity), new Int8Array(capacity), new Int8Array(capacity)];
    next[0].set(op); next[1].set(imm); next[2].set(pop); next[3].set(push);
    [op, imm, pop, push] = next;
  };
  const memarg = () => { const align = leb(); if (align & 0x40) skipLeb(); skipLeb(); };

  function pass(wanted) {
    const found = new Map();
    at = code[0];
    const bodies = leb();
    for (let body = 0; body < bodies; body += 1) {
      const self = importCount + body, size = leb(), end = at + size;
      for (let groups = leb(); groups > 0; groups -= 1) { skipLeb(); const type = u8(); if (type === 0x63 || type === 0x64) skipLeb(); }
      let count = 0, calls = null;
      while (at < end) {
        const code = u8();
        if (count === capacity) grow();
        let value = 0, p = EFFECT.pops[code], q = EFFECT.pushes[code];
        switch (code) {
          case 0x02: case 0x03: case 0x04: case 0x06: sleb32(); break;
          case 0x0c: case 0x0d: case 0x07: case 0x08: case 0x09: case 0x18: case 0xd5: case 0xd6: skipLeb(); break;
          case 0x0e: for (let labels = leb() + 1; labels > 0; labels -= 1) skipLeb(); break;
          case 0x10: case 0x12: {
            value = leb();
            const type = types[functionTypes[value]];
            if (type && code === 0x10) { p = type.params; q = type.results; }
            if (wanted.has(value)) (calls ??= []).push(count);
            break;
          }
          case 0x11: case 0x13: {
            const type = types[leb()]; skipLeb();
            if (type && code === 0x11) { p = type.params + 1; q = type.results; }
            break;
          }
          case 0x14: case 0x15: skipLeb(); break;
          case 0x1c: for (let n = leb(); n > 0; n -= 1) u8(); break;
          case 0x1f: { sleb32(); for (let n = leb(); n > 0; n -= 1) { const kind = u8(); if (kind < 2) skipLeb(); skipLeb(); } break; }
          case 0x20: case 0x21: case 0x22: value = leb(); break;
          case 0x23: case 0x24: case 0x25: case 0x26: skipLeb(); break;
          case 0x3f: case 0x40: skipLeb(); break;
          case 0x41: value = sleb32(); break;
          case 0x42: skipLeb(); break;
          case 0x43: at += 4; break;
          case 0x44: at += 8; break;
          case 0xd0: sleb32(); break;
          case 0xd2: skipLeb(); break;
          case 0xfc: {
            const sub = leb();
            if (sub <= 7) { p = 1; q = 1; }
            else if (sub === 8 || sub === 10 || sub === 12 || sub === 14) { skipLeb(); skipLeb(); if (sub === 8 || sub === 10) { p = 3; q = 0; } }
            else { skipLeb(); if (sub === 11) { p = 3; q = 0; } }
            break;
          }
          case 0xfd: {
            const sub = leb();
            if (sub <= 11 || sub === 92 || sub === 93) memarg();
            else if (sub === 12 || sub === 13) at += 16;
            else if (sub >= 21 && sub <= 34) at += 1;
            else if (sub >= 84 && sub <= 91) { memarg(); at += 1; }
            break;
          }
          case 0xfe: { const sub = leb(); if (sub === 3) at += 1; else memarg(); break; }
          default:
            if (code >= 0x28 && code <= 0x3e) memarg();
        }
        op[count] = code; imm[count] = value; pop[count] = p; push[count] = q;
        count += 1;
      }
      if (at !== end) throw new Error(`function ${self} decoded past its body`);
      if (!calls) continue;
      const ownType = types[functionTypes[self]];
      for (const site of calls) {
        const target = imm[site], operand = wanted.get(target);
        let need = types[functionTypes[target]].params - 1 - operand, index = site - 1, resolved = true;
        while (need > 0 && index >= 0) {
          if (pop[index] === UNKNOWN || push[index] > need) { resolved = false; break; }
          need += pop[index] - push[index];
          index -= 1;
        }
        if (index < 0) resolved = false;
        if (resolved && op[index] === 0x41) {
          ops.add(imm[index]);
          const label = result.names?.get(self) ?? `#${self}`;
          if (!sites.has(imm[index])) sites.set(imm[index], new Set());
          sites.get(imm[index]).add(label);
        } else if (resolved && op[index] === 0x20 && ownType && imm[index] < ownType.params && ownType.first[imm[index]] === 0x7f) {
          if (!targets.has(self)) found.set(self, imm[index]);
        } else {
          result.unresolved += 1;
          for (let back = Math.max(0, site - 48); back < site; back += 1) {
            if (op[back] === 0x41 && imm[back] >= 1 && imm[back] <= 255) candidates.add(imm[back]);
          }
        }
      }
    }
    return found;
  }

  let wanted = targets;
  for (let round = 0; round < 5 && wanted.size; round += 1) {
    const found = pass(wanted);
    for (const [index, operand] of found) targets.set(index, operand);
    wanted = found;
  }
  result.wrappers = targets.size - 1;
  result.indirect = [...targets.keys()].filter(index => elementFunctions.has(index) || exportedFunctions.has(index))
    .map(index => `${result.names?.get(index) ?? "#" + index}${elementFunctions.has(index) ? ":table" : ""}${exportedFunctions.has(index) ? ":export" : ""}`);
  result.ops = [...ops].sort((a, b) => a - b);
  result.candidates = [...candidates].sort((a, b) => a - b);
  for (const [number, labels] of sites) result.sites[number] = [...labels].slice(0, 6);
  return result;
}
