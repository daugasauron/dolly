import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const sandbox = vm.createContext({ ArrayBuffer, Uint8Array, console, Dolly: {
  encode: value => new TextEncoder().encode(value),
  decode: bytes => new TextDecoder().decode(bytes),
  getenv() {}, terminalSize: () => ({ columns: 80, rows: 24 }),
  isatty: () => false, cwd: () => "/workspace", fsAccess() { throw Error("ENOENT"); },
} });
for (const file of ["dolly-node.js", "janis.js"]) {
  vm.runInContext(await readFile(new URL(`../src/runtimes/${file}`, import.meta.url), "utf8"), sandbox);
}

test("Pi can reconstruct and read a provider error Response", async () => {
  for (const status of [400, 401, 429, 502]) {
    const text = '{"error":{"message":"provider rejected this request"}}';
    const response = new sandbox.Response(text, { status, statusText: "Provider error" });
    assert.equal(response.status, status);
    assert.equal(response.statusText, "Provider error");
    assert.equal(response.ok, false);
    assert.equal(response.headers.get("content-type"), "text/plain;charset=UTF-8");
    assert.equal(response.bodyUsed, false);
    assert.equal(await response.text(), text);
    assert.equal(response.bodyUsed, true);
    await assert.rejects(response.text(), /already consumed/);
  }
});

test("Response bodies preserve binary views, streams and absent bodies", async () => {
  const bytes = Uint8Array.of(9, 0, 255, 8);
  const response = new sandbox.Response(new DataView(bytes.buffer, 1, 2), { headers: { "Content-Type": "test/bytes" } });
  bytes.fill(7);
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [0, 255]);
  assert.equal(response.headers.get("content-type"), "test/bytes");
  const stream = new sandbox.ReadableStream({ start(controller) { controller.enqueue(Uint8Array.of(79, 75)); controller.close(); } });
  const streamed = new sandbox.Response(stream);
  assert.equal(streamed.body, stream);
  assert.equal(await streamed.text(), "OK");
  for (const status of [200, 204, 205, 304]) {
    const empty = new sandbox.Response(null, { status });
    assert.equal(empty.body, null);
    assert.equal(await empty.text(), "");
    assert.equal(await empty.text(), "");
    assert.equal(empty.bodyUsed, false);
  }
  for (const status of [204, 205, 304]) assert.throws(() => new sandbox.Response("", { status }), { name: "TypeError" });
  for (const status of [0, 199, 600, NaN]) assert.throws(() => new sandbox.Response(null, { status }), { name: "RangeError" });
});
