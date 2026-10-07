// The sysroot image against the seed: every member of the process sysroot's
// libraries is rebuilt inside Dolly to the same sections.
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { decodeSnapshotRecords } from "../../../src/snapshot-records.mjs";

const read = async name => decodeSnapshotRecords(await readFile(new URL(`../../../dist/${name}`, import.meta.url)));

// A GNU archive's members by name; a lone object is its own member.
function members(name, file) {
  if (file.toString("latin1", 0, 8) !== "!<arch>\n") return new Map([[name, file]]);
  const result = new Map();
  let names = "";
  for (let offset = 8; offset < file.length;) {
    const field = file.toString("latin1", offset, offset + 16).trimEnd();
    const size = Number(file.toString("latin1", offset + 48, offset + 58));
    const body = file.subarray(offset + 60, offset + 60 + size);
    offset += 60 + size + (size & 1);
    if (field === "//") names = body.toString("latin1");
    else if (field !== "/") {
      const long = field.startsWith("/") ? names.slice(Number(field.slice(1))) : field;
      result.set(long.slice(0, long.indexOf("/")), body);
    }
  }
  return result;
}

const kinds = [, "type", "import", "function", "table", "memory", "global", "export", "start", "element", "code",
  "data", "datacount", "tag"];

// A Wasm object's sections; a custom section goes by its own name.
function sections(object) {
  const result = new Map();
  const leb = at => {
    let value = 0;
    for (let shift = 0; ; shift += 7) {
      const byte = object[at++];
      value += (byte & 0x7f) * 2 ** shift;
      if (!(byte & 0x80)) return [value, at];
    }
  };
  for (let offset = 8; offset < object.length;) {
    const id = object[offset];
    const [size, start] = leb(offset + 1);
    offset = start + size;
    if (id !== 0) result.set(kinds[id], object.subarray(start, offset));
    else {
      const [length, name] = leb(start);
      result.set(object.toString("latin1", name, name + length), object.subarray(name + length, offset));
    }
  }
  return result;
}

// Who compiled it and from which path: the two Clang builds spell their
// repository differently, and every DWARF string offset follows.
const provenance = name => name === "producers" || name.includes(".debug_");
// cc has no assembler. File-scope asm gives these members their code, with the
// compiler's own feature list and none of the assembler's line tables.
const assembled = /^(emscripten_(thread_state|memcpy_bulkmem|memset_bulkmem)|threads-start)\.o$/;

test("the sysroot image rebuilds the seed's process sysroot to the same code and data", async () => {
  const seed = await read("dolly.data");
  const image = await read("dolly-sysroot-system.snapshot");
  let compared = 0;
  for (const [path, record] of seed) {
    // The compiler-rt builtins are the llvm-runtimes image's.
    if (!/^\/usr\/lib\/dolly\/process\/.*\.[ao]$/.test(path) || path.includes("builtins")) continue;
    const name = path.slice("/usr/lib/dolly/process/".length);
    const built = image.get("/usr/lib/sysroot/" + name);
    assert.ok(built, `the image has no ${name}`);
    const rebuilt = members(name, Buffer.from(built.data));
    for (const [member, object] of members(name, Buffer.from(record.data))) {
      assert.ok(rebuilt.has(member), `${name} has no ${member}`);
      const shipped = sections(object);
      const ours = sections(rebuilt.get(member));
      for (const section of new Set([...shipped.keys(), ...ours.keys()])) {
        if (provenance(section) || (assembled.test(member) && ["target_features", "linking"].includes(section))) continue;
        assert.ok(shipped.has(section) && ours.has(section) && shipped.get(section).equals(ours.get(section)),
          `${name}(${member}) differs in ${section}`);
      }
      compared++;
    }
  }
  assert.ok(compared > 2000, `${compared} members compared`);
});
