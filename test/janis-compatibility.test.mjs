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
