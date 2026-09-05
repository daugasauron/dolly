import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { decodeSystemSnapshot, resolveSnapshotFile, validateSnapshotEntry } from "../scripts/system-snapshot-format.mjs";
import { readWasmInterface } from "../scripts/wasm-interface.mjs";
import { DOLLY_PROCESS_ABI_DIGEST } from "../dist/dolly-process-abi.mjs";
import { decodeImageEntry } from "../src/image-entry.mjs";

function snapshot(records) {
  const header = Buffer.alloc(16);
  header.write("DOLLYSNP"); header.writeUInt32LE(2, 8); header.writeUInt32LE(records.length, 12);
  return Buffer.concat([header, ...records.flatMap(([path, kind, input = ""]) => {
    const name = Buffer.from(path), data = Buffer.from(input), record = Buffer.alloc(16);
    record.writeUInt32LE(kind); record.writeUInt32LE(name.length, 4);
    record.writeBigUInt64LE(BigInt(data.length), 8);
    return [record, name, data];
  })]);
}

test("snapshot records preserve empty directories, symlinks, and file bytes", () => {
  const parsed = decodeSystemSnapshot(snapshot([
    ["/tree", 1], ["/tree/cycle", 3, "cycle"], ["/tree/dangling", 3, "missing"],
    ["/tree/empty", 1], ["/tree/file", 2, Buffer.from([0, 255, 42])], ["/tree/link", 3, "file"],
  ]));
  assert.equal(parsed.entries.size, 6);
  assert.equal(parsed.files.size, 1);
  assert.equal(parsed.entries.get("/tree/empty").kind, 1);
  assert.deepEqual(resolveSnapshotFile(parsed, "/tree/link"), Buffer.from([0, 255, 42]));
  assert.throws(() => resolveSnapshotFile(parsed, "/tree/dangling"), /not retained/);
  assert.throws(() => resolveSnapshotFile(parsed, "/tree/cycle"), /symlink loop/);
  assert.throws(() => resolveSnapshotFile(parsed, "/tree/empty"), /not retained/);
});

test("snapshot resolution follows each symlink before evaluating dot-dot", () => {
  const parsed = decodeSystemSnapshot(snapshot([
    ["/a/file", 2, "correct"], ["/a/sub", 1], ["/alias", 3, "a/sub"],
    ["/entry", 3, "alias/../file"], ["/file", 2, "wrong"], ["/rooted", 3, "/entry"],
  ]));
  assert.equal(resolveSnapshotFile(parsed, "/rooted").toString(), "correct");
  assert.throws(() => resolveSnapshotFile(parsed, "/file/../a/file"), /not a directory/);
});

test("snapshot rejects malformed kinds, paths, parent graphs, lengths and ordering", () => {
  const unicode = [["/\ue000", 2], ["/𐀀", 2]];
  assert.deepEqual(decodeSystemSnapshot(snapshot(unicode)).manifest, unicode.map(([path]) => path));
  assert.throws(() => decodeSystemSnapshot(snapshot([...unicode].reverse())));
  for (const records of [
    [["/file", 4]], [["/dir", 1, "data"]], [["/link", 3]], [["/link", 3, "x\0y"]],
    [["/", 1]], [["/dir/", 1]], [["/a/../b", 2]], [["/a\0b", 2]], [["/a\nb", 2]],
    [["/b", 2], ["/a", 2]], [["/a", 2], ["/a", 2]],
    [["/a", 3, "b"], ["/a/file", 2]], [["/a", 2], ["/a/file", 2]],
  ]) assert.throws(() => decodeSystemSnapshot(snapshot(records)));
  const bytes = snapshot([["/file", 2, "data"]]);
  assert.throws(() => decodeSystemSnapshot(bytes.subarray(0, -1)), /truncated/);
  assert.throws(() => decodeSystemSnapshot(Buffer.concat([bytes, Buffer.of(0)])), /trailing/);
  bytes.writeUInt32LE(1, 8);
  assert.throws(() => decodeSystemSnapshot(bytes), /header/);
});

test("ENTRY admission validates retained bytes against the real process contract", async () => {
  const contract = await readWasmInterface(new URL("../dist/dolly-process-0.wasm", import.meta.url));
  const executable = await readFile(new URL("../build/process-minimal.wasm", import.meta.url));
  const control = Buffer.alloc(24);
  control.write("DOLLYENT"); control.writeUInt32LE(1, 8); control.writeUInt32LE(1, 12);
  control.writeUInt32LE(4, 16); control.write("/app", 20);
  const validate = records => validateSnapshotEntry(decodeSystemSnapshot(snapshot(records)),
    contract, DOLLY_PROCESS_ABI_DIGEST);
  assert.deepEqual(validate([["/app", 2, executable], ["/etc/dolly/entry", 2, control]]), ["/app"]);
  const withEmptyArgument = Buffer.concat([control, Buffer.alloc(4)]);
  withEmptyArgument.writeUInt32LE(2, 12);
  assert.deepEqual(validate([["/app", 2, executable], ["/etc/dolly/entry", 2, withEmptyArgument]]), ["/app", ""]);
  assert.deepEqual(decodeImageEntry(withEmptyArgument), ["/app", ""]);
  assert.throws(() => decodeImageEntry(withEmptyArgument.subarray(0, -1)), /truncated/);
  assert.deepEqual(validate([["/app", 3, "program"], ["/etc/dolly/entry", 2, control],
    ["/program", 2, executable]]), ["/app"]);
  assert.throws(() => validate([["/etc/dolly/entry", 2, control]]), /not retained/);
  assert.throws(() => validate([["/app", 2, "not wasm"], ["/etc/dolly/entry", 2, control]]));
  const invalid = await readFile(new URL("../build/process-wrong-call.wasm", import.meta.url));
  assert.throws(() => validate([["/app", 2, invalid], ["/etc/dolly/entry", 2, control]]), /call/);
  control[23] = 0;
  assert.throws(() => validate([["/etc/dolly/entry", 2, control]]), /NUL argument/);
});
