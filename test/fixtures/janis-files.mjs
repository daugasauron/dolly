import fs from "node:fs";
import fsp from "node:fs/promises";

const root = process.argv[2];
const failures = [];
function equal(actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function rejects(operation, code) {
  try { operation(); } catch (error) { equal(error.code, code); return; }
  throw new Error(`expected ${code}`);
}
async function check(name, operation) {
  try { await operation(); console.log(`JANIS-FILES PASS: ${name}`); }
  catch (error) { failures.push(name); console.error(`JANIS-FILES FAIL: ${name}: ${error.message}`); }
}

await check("environment enumeration, descriptors and deletion", () => {
  process.env.DOLLY_ENV_PROBE = 42;
  try {
    equal(process.env.DOLLY_ENV_PROBE, "42");
    equal("DOLLY_ENV_PROBE" in process.env, true);
    equal(Object.keys(process.env).includes("HOME"), true);
    equal({ ...process.env }.DOLLY_ENV_PROBE, "42");
    equal(Object.getOwnPropertyDescriptor(process.env, "DOLLY_ENV_PROBE").value, "42");
  } finally { delete process.env.DOLLY_ENV_PROBE; }
  equal("DOLLY_ENV_PROBE" in process.env, false);
  equal(Object.getOwnPropertyDescriptor(process.env, "DOLLY_ENV_PROBE"), undefined);
});
await check("Buffer slices clamp and share storage", () => {
  const bytes = Buffer.from([1, 2, 3]);
  equal([...bytes.subarray(-1)], [3]);
  bytes.subarray(-1)[0] = 9;
  equal([...bytes.slice(-2)], [2, 9]);
  equal([...bytes.subarray(-100, 100)], [1, 2, 9]);
  equal(bytes.subarray(2, 1).length, 0);
});
await check("missing opens fail and exclusive creation does not truncate", () => {
  rejects(() => fs.openSync(`${root}/absent`, "r"), "ENOENT");
  fs.writeFileSync(`${root}/exclusive`, "keep");
  rejects(() => fs.openSync(`${root}/exclusive`, "wx"), "EEXIST");
  equal(fs.readFileSync(`${root}/exclusive`, "utf8"), "keep");
  rejects(() => fs.writeFileSync(`${root}/exclusive`, "lost", { flag: "wx" }), "EEXIST");
  equal(fs.readFileSync(`${root}/exclusive`, "utf8"), "keep");
});
await check("descriptors survive rename and unlink", () => {
  const path = `${root}/open-file`;
  fs.writeFileSync(path, "abcdef");
  const fd = fs.openSync(path, "r");
  try {
    fs.renameSync(path, `${path}-moved`);
    fs.unlinkSync(`${path}-moved`);
    const bytes = Buffer.alloc(3);
    equal(fs.readSync(fd, bytes, 0, 3, null), 3);
    equal(bytes.toString(), "abc");
    equal(fs.fstatSync(fd).size, 6);
    equal(fs.fstatSync(fd).isFile(), true);
  } finally { fs.closeSync(fd); }
  rejects(() => fs.readSync(fd, Buffer.alloc(1), 0, 1, null), "EBADF");
});
await check("pread and pwrite preserve the descriptor offset", () => {
  const path = `${root}/offsets`;
  fs.writeFileSync(path, "abcde");
  const fd = fs.openSync(path, "r+");
  try {
    equal(fs.readSync(fd, Buffer.alloc(0), 0, 0), 0);
    equal(fs.writeSync(fd, Buffer.alloc(0), 0, 0), 0);
    equal(fs.writeSync(fd, Buffer.from("XY"), 0, 2, 1), 2);
    const byte = Buffer.alloc(1);
    equal(fs.readSync(fd, byte, 0, 1, 100), 0);
    equal(fs.readSync(fd, byte, 0, 1, null), 1);
    equal(byte.toString(), "a");
    equal(fs.writeSync(fd, "Q", null, "utf8"), 1);
    equal(fs.readFileSync(path, "utf8"), "aQYde");
    const view = new DataView(new ArrayBuffer(3));
    equal(fs.readSync(fd, view, { offset: 1, length: 2, position: 1 }), 2);
    equal([...new Uint8Array(view.buffer)], [0, 81, 89]);
  } finally { fs.closeSync(fd); }
});
await check("numeric flags and append", () => {
  const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL;
  equal(typeof fs.constants.O_EXCL, "number");
  rejects(() => fs.openSync(`${root}/numeric`, fs.constants.O_NONBLOCK), "ENOTSUP");
  const path = `${root}/numeric`;
  let fd = fs.openSync(path, flags);
  fs.writeSync(fd, "one"); fs.closeSync(fd);
  fd = fs.openSync(path, "a");
  fs.writeSync(fd, "two"); fs.closeSync(fd);
  equal(fs.readFileSync(path, "utf8"), "onetwo");
  rejects(() => fs.openSync(path, flags), "EEXIST");
});
await check("FileHandle uses the actual open file", async () => {
  const path = `${root}/handle`;
  fs.writeFileSync(path, "abc");
  const file = await fsp.open(path, "r+");
  try {
    fs.unlinkSync(path);
    equal((await file.stat()).size, 3);
    equal((await file.write(Buffer.from("Z"), 0, 1, 1)).bytesWritten, 1);
    const bytes = Buffer.alloc(3);
    equal((await file.read(bytes, 0, 3, 0)).bytesRead, 3);
    equal(bytes.toString(), "aZc");
  } finally { await file.close(); }
  equal(file.fd, -1);
  const replacement = fs.openSync(`${root}/numeric`, "r");
  try {
    try { await file.stat(); throw new Error("closed FileHandle reused a descriptor"); }
    catch (error) { equal(error.code, "EBADF"); }
  } finally { fs.closeSync(replacement); }
});
await check("whole-file descriptor I/O and timestamps", () => {
  const path = `${root}/whole-file`;
  fs.writeFileSync(path, "abcdef");
  const fd = fs.openSync(path, "r+");
  try {
    fs.readSync(fd, Buffer.alloc(2), 0, 2);
    equal(fs.readFileSync(fd, "utf8"), "cdef");
    fs.writeFileSync(fd, "g");
    equal(fs.fstatSync(fd).size, 7);
    equal(fs.readFileSync(path, "utf8"), "abcdefg");
    fs.utimesSync(path, 1700000000, new Date(1700000000125));
    equal(fs.statSync(path).mtimeMs, 1700000000125);
  } finally { fs.closeSync(fd); }
});
await check("stat follows symlinks and lstat/Dirent do not", () => {
  equal(fs.statSync(`${root}/link`).isFile(), true);
  equal(fs.lstatSync(`${root}/link`).isSymbolicLink(), true);
  equal(fs.readdirSync(root, { withFileTypes: true }).find(entry => entry.name === "link").isSymbolicLink(), true);
  rejects(() => fs.statSync(`${root}/dangling`), "ENOENT");
  equal(fs.lstatSync(`${root}/dangling`).isSymbolicLink(), true);
  fs.rmSync(`${root}/dangling`, { force: true });
  rejects(() => fs.lstatSync(`${root}/dangling`), "ENOENT");
  fs.mkdirSync(`${root}/keep-dir`);
  fs.writeFileSync(`${root}/keep-dir/keep`, "keep");
  fs.rmSync(`${root}/directory-link`, { recursive: true });
  equal(fs.readFileSync(`${root}/keep-dir/keep`, "utf8"), "keep");
});
await check("unsupported watches fail explicitly", () => {
  rejects(() => fs.watch(root, () => {}), "ERR_METHOD_NOT_IMPLEMENTED");
  rejects(() => fs.watchFile(`${root}/target`, () => {}), "ERR_METHOD_NOT_IMPLEMENTED");
});
if (failures.length) throw new Error(`${failures.length} Janis filesystem/environment groups failed`);
console.log("JANIS-FILES-OK");
