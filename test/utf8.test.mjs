import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { StringDecoder } from "node:string_decoder";
import test from "node:test";
import vm from "node:vm";
import { decoderCases, decodeChunks, utf8Vectors } from "./fixtures/utf8-cases.mjs";

const runtime = await readFile(new URL("../src/runtimes/dolly-node.js", import.meta.url), "utf8");
const janis = await readFile(new URL("../src/runtimes/janis.js", import.meta.url), "utf8");
const extension = await readFile(new URL("../src/pi/dolly-tools.js", import.meta.url), "utf8");

function context(overrides = {}) {
  const sandbox = vm.createContext({
    ArrayBuffer, SharedArrayBuffer, Uint8Array, console,
    Dolly: {
      encode: value => new TextEncoder().encode(value),
      decode: bytes => new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes),
      terminalSize: () => ({ columns: 80, rows: 24 }), getenv: () => undefined, isatty: () => false,
      cwd: () => "/workspace", chdir() {}, fsAccess() { throw new Error("ENOENT"); },
      ...overrides,
    },
  });
  vm.runInContext(runtime, sandbox);
  vm.runInContext(janis, sandbox);
  return sandbox;
}

test("UTF-8 split points, malformed input, BOM, fatal errors and flush match TextDecoder", () => {
  const { TextDecoder: Decoder } = context();
  assert.deepEqual(decoderCases(Decoder), decoderCases(TextDecoder));
  let seed = 17;
  const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
  for (let trial = 0; trial < 2000; trial++) {
    const chunks = Array.from({ length: 4 }, () =>
      Array.from({ length: random() % 8 }, () => random() >>> 24));
    assert.deepEqual(decodeChunks(Decoder, chunks), decodeChunks(TextDecoder, chunks));
  }
});

test("UTF-8 decoder accepts byte views, validates labels and resets between messages", () => {
  const { TextDecoder: Decoder } = context();
  const bytes = Uint8Array.of(0, 0xe3, 0x81, 0x82, 0);
  assert.equal(new Decoder().decode(new DataView(bytes.buffer, 1, 3)), "あ");
  assert.equal(new Decoder().decode(new Uint8Array(bytes.buffer, 1, 3)), "あ");
  for (const label of ["utf8", " UTF-8\t", "unicode-1-1-utf-8"]) {
    assert.equal(new Decoder(label).encoding, "utf-8");
  }
  assert.throws(() => new Decoder("shift_jis"), { name: "RangeError" });
  assert.throws(() => new Decoder().decode("not bytes"), { name: "TypeError" });
  const decoder = new Decoder();
  assert.equal(decoder.decode(Uint8Array.of(0xe3)), "�");
  assert.equal(decoder.decode(Uint8Array.of(0x81, 0x82)), "��");
  const shared = new SharedArrayBuffer(3);
  new Uint8Array(shared).set([0xe3, 0x81, 0x82]);
  assert.equal(decoder.decode(shared), "あ");
  const large = "日本語😀a".repeat(16384);
  assert.equal(decoder.decode(new TextEncoder().encode(large)), large);
});

test("Node StringDecoder and encoded readables retain their own UTF-8 state", () => {
  const sandbox = context();
  const Decoder = sandbox.__janisBuiltin("string_decoder").StringDecoder;
  for (const bytes of utf8Vectors) {
    const expected = new StringDecoder(); const actual = new Decoder();
    const left = []; const right = [];
    for (const byte of bytes) { left.push(actual.write(Uint8Array.of(byte))); right.push(expected.write(Buffer.from([byte]))); }
    left.push(actual.end()); right.push(expected.end());
    assert.equal(left.join(""), right.join(""));
    // Node can defer malformed-sequence errors; Dolly uses the common WHATWG
    // decoder's timing. Valid characters have identical per-chunk output.
    if (!right.join("").includes("�")) assert.deepEqual(left, right);
    assert.equal(actual.end(Buffer.from("next")), expected.end(Buffer.from("next")));
  }
  const { Readable } = sandbox.__janisBuiltin("stream");
  const out = new Readable().setEncoding("utf8");
  const err = new Readable().setEncoding("utf8");
  let result = "";
  out.on("data", text => { result += text; }); err.on("data", text => { result += text; });
  out.push(Uint8Array.of(0xe3)); err.push(Uint8Array.of(0xf0, 0x9f));
  out.push(Uint8Array.of(0x81, 0x82)); err.push(Uint8Array.of(0x98, 0x80));
  out.push(Uint8Array.of(0xe3)); out.push(null); err.push(null);
  assert.equal(result, "あ😀�");
});

test("stdin preserves split UTF-8 and flushes at EOF; binary output remains bytes", () => {
  const written = [];
  const { process } = context({ stdout: bytes => { written.push(bytes); return 1; } });
  let input = "";
  process.stdin.setEncoding("utf8").on("data", text => { input += text; });
  process.stdin.resume();
  process.stdin.publish(Uint8Array.of(0xe3));
  process.stdin.publish(Uint8Array.of(0x81, 0x82, 0xe3));
  process.stdin.finish();
  assert.equal(input, "あ�");
  const bytes = Uint8Array.of(0xe3);
  process.stdout.write(bytes);
  assert.equal(written[0], bytes);
});

test("Pi shell tool decodes interleaved stdout/stderr independently and flushes both", async () => {
  const sandbox = context({ shellStream(_command, out, err) {
    out(Uint8Array.of(0xe3)); err(Uint8Array.of(0xf0, 0x9f));
    out(Uint8Array.of(0x81, 0x82)); err(Uint8Array.of(0x98, 0x80));
    out(Uint8Array.of(0xe3)); err(Uint8Array.of(0xf0));
    return { status: 0 };
  } });
  const install = vm.runInContext(`(() => { ${extension.replace("export default ", "")}; return dollyTools; })()`, sandbox);
  const registered = new Map();
  install({ on() {}, registerCommand() {}, registerTool(tool) { registered.set(tool.name, tool); } });
  const updates = [];
  const result = await registered.get("bash").execute("test", { command: ":" }, undefined,
    value => updates.push(value.content[0].text), { cwd: "/workspace" });
  assert.equal(result.content[0].text, "あ😀��");
  assert.ok(updates.includes("あ"));
  assert.ok(updates.includes("あ😀"));
  assert.equal(result.details.status, 0);
});
