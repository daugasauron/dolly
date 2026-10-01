import assert from "node:assert/strict";
import * as net from "node:net";
import test from "node:test";
import { janisContext } from "./fixtures/janis-context.mjs";

test("Janis IP classification matches Node for literals, compression, mapped addresses and invalid input", () => {
  const actual = janisContext().__janisBuiltin("net");
  const cases = [undefined, null, 123, {}, ["127.0.0.1"], "", "localhost", "127.1", "127.0.0.1",
    "0.0.0.0", "255.255.255.255", "256.0.0.1", "01.2.3.4", "1.2.3.4/24", "127.0.0.1\n",
    "::", "::1", "[::1]", "::1\n", "1::2::3", "1:2:3:4:5:6:192.0.2.1", "::ffff:192.0.2.1",
    "::ffff:192.000.2.1", "fe80::1%eth0", "fe80::1%eth_0", "fe80::1%", "fe80::1%eth0:2"];
  for (let start = 0; start < 8; start++) for (let count = 1; count <= 8 - start; count++) {
    const parts = ["2001", "db8", "0", "a", "12", "ffff", "9", "1"];
    const address = parts.slice(0, start).join(":") + "::" + parts.slice(start + count).join(":");
    for (const suffix of ["", "%en0", "%a-b.c:2", "%bad_zone", ":", "::", "/64"])
      cases.push(address + suffix);
    cases.push(address.replace("::", ":::"), address.replace("::", "::gggg:"));
  }
  for (const value of cases) for (const name of ["isIP", "isIPv4", "isIPv6"])
    assert.equal(actual[name](value), net[name](value), `${name}(${JSON.stringify(value)})`);
});

test("unsupported readline terminal operations fail explicitly", () => {
  const readline = janisContext().__janisBuiltin("readline");
  for (const name of ["emitKeypressEvents", "clearLine", "cursorTo", "moveCursor"])
    assert.throws(() => readline[name](), { code: "ENOSYS" });
});

test("chmod reaches the substrate with a numeric mode", async () => {
  const calls = [];
  const fs = janisContext({ fsChmod: (path, mode) => { calls.push([path, mode]); } }).__janisBuiltin("fs");
  fs.chmodSync("/workspace/file", 0o755);
  await fs.promises.chmod("/workspace/file", "644");
  assert.deepEqual(calls, [["/workspace/file", 0o755], ["/workspace/file", 0o644]]);
});

test("raw mode reaches the terminal, so Ctrl+C becomes input, only for a TTY stdin", () => {
  const calls = [];
  for (const tty of [false, true]) {
    const { process } = janisContext({ isatty: () => tty, setRawMode: raw => calls.push(raw) });
    assert.equal(process.stdin.setRawMode(true).isRaw, true);
    assert.equal(process.stdin.setRawMode(false).isRaw, false);
  }
  assert.deepEqual(calls, [true, false]);
});

test("unsupported host resource queries fail explicitly", async () => {
  const janis = janisContext();
  const os = janis.__janisBuiltin("os");
  for (const name of ["cpus", "totalmem", "freemem"]) assert.throws(() => os[name](), { code: "ENOSYS" });
  assert.throws(() => janis.process.memoryUsage(), { code: "ENOSYS" });
  await assert.rejects(janis.fetch("https://example.test/", { redirect: "manual" }), { name: "TypeError" });
});

test("util.inspect and format name functions and undefined", () => {
  const { inspect, format } = janisContext().__janisBuiltin("util");
  assert.equal(inspect(function named() {}), "[Function: named]");
  assert.equal(inspect(() => {}), "[Function: (anonymous)]");
  assert.equal(format(undefined), "undefined");
  assert.equal(format("%s", undefined), "undefined");
});

test("stream pipeline and finished settle on completion or the first error", async () => {
  const stream = janisContext().__janisBuiltin("stream");
  const promises = janisContext().__janisBuiltin("stream/promises");
  const received = [];
  const sink = new stream.Writable();
  sink._write = (chunk, _encoding, callback) => { received.push(String(chunk)); callback(); };
  const completed = new Promise((resolve) => stream.pipeline(stream.Readable.from(["a", "b"]), sink, resolve));
  assert.equal(received.length, 0);
  assert.equal(await completed, undefined);
  assert.deepEqual(received, ["a", "b"]);

  const failing = new stream.PassThrough();
  const failure = new Error("source failed");
  const pending = promises.pipeline(failing, new stream.Writable());
  failing.emit("error", failure);
  await assert.rejects(pending, failure);
  const closed = new stream.Readable();
  const early = promises.finished(closed);
  closed.destroy();
  await assert.rejects(early, { code: "ERR_STREAM_PREMATURE_CLOSE" });
});

test("performance and process clocks measure elapsed time, not the epoch", () => {
  const { performance, process } = janisContext();
  assert.ok(performance.now() < 60e3 && process.uptime() < 60 && process.hrtime.bigint() < 60e9);
  const [seconds, nanoseconds] = process.hrtime(process.hrtime());
  assert.ok(seconds === 0 && nanoseconds >= 0 && nanoseconds < 1e9);
});
