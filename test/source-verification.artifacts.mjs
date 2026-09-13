import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { DOLLY_STATIC_SOURCES } from "../dist/dolly-images.mjs";

test("prepared CPython configuration keeps bootstrap paths independent of the builder's home", {
  skip: !DOLLY_STATIC_SOURCES.some(source => source.path === "/static/python/cpython.tar.gz"),
}, () => {
  const archive = new URL("../dist/static/python/cpython.tar.gz", import.meta.url).pathname;
  for (const name of ["Makefile", "Makefile.pre", "config.status"]) {
    const configuration = execFileSync("tar", ["-xOf", archive, `usr/src/python/${name}`], { encoding: "utf8" });
    assert.ok(configuration.includes("--with-build-python=/opt/dolly-build-python/bin/python3.14"), name);
    assert.equal(/\/(?:home|Users)\/|\/src\/build\/generated\/cpython-source\./.test(configuration), false, name);
  }
});
