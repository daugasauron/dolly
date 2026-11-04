import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import catalog from "../../../dist/dolly-images.json" with { type: "json" };

test("prepared CPython configuration keeps bootstrap paths independent of the builder's home", {
  skip: !catalog.staticSources.some(source => source.path === "/dist/static/python/cpython.tar.gz"),
}, () => {
  const archive = new URL("../../../dist/static/python/cpython.tar.gz", import.meta.url).pathname;
  for (const name of ["Makefile", "Makefile.pre", "config.status"]) {
    const configuration = execFileSync("tar", ["-xOf", archive, `usr/src/python/${name}`], { encoding: "utf8" });
    assert.ok(configuration.includes("--with-build-python=/opt/dolly-build-python/bin/python3.14"), name);
    assert.equal(/\/(?:home|Users)\/|\/src\/build\/generated\/cpython-source\./.test(configuration), false, name);
  }
});

test("images retain neither CPython's test suite nor build-time bytecode", async () => {
  for (const { image } of catalog.images) {
    const { default: { manifest } } = await import(
      new URL(`../../../dist/dolly-${image}-system-snapshot.json`, import.meta.url), { with: { type: "json" } });
    assert.equal(manifest.some(path => path.startsWith("/usr/lib/python3.14/") &&
      (path.startsWith("/usr/lib/python3.14/test/") || /\/__pycache__(?:\/|$)|\.pyc$/.test(path))), false, image);
  }
});
