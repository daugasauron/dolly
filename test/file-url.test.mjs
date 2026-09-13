import assert from "node:assert/strict";
import { pathToFileURL, fileURLToPath } from "node:url";
import test from "node:test";
import { janisContext } from "./fixtures/janis-context.mjs";

test("Janis file URLs preserve literal POSIX filenames", () => {
  const url = janisContext().__janisBuiltin("url");
  for (const name of ["a#b", "a?b", "a%b", "a b", "日本語😀", "a\\b", "line\nname", "a%2Fb", "nested/file", "directory/"]) {
    const path = `/workspace/${name}`;
    const actual = url.pathToFileURL(path);
    assert.equal(actual.href, pathToFileURL(path).href, name);
    assert.equal(url.fileURLToPath(actual), path, name);
    assert.equal(url.fileURLToPath(actual.href), path, name);
    assert.equal(url.pathToFileURL(name).href, actual.href, name);
  }
  for (const input of ["file:///workspace/a%20b?query#fragment", "file://localhost/workspace/a%23b", "file:///workspace/a%5Cb"]) {
    assert.equal(url.fileURLToPath(input), fileURLToPath(input));
  }
});

test("Janis rejects malformed file URLs, encoded separators and remote hosts", () => {
  const url = janisContext().__janisBuiltin("url");
  for (const input of ["https://example.test/path", "file://remote/path", "file:///a%2fb", "file:///a%2Fb", "file:///a%", "file:///a%FF", "file://user@localhost/path", "file://localhost:80/path"]) {
    assert.throws(() => fileURLToPath(input), undefined, input);
    assert.throws(() => url.fileURLToPath(input), undefined, input);
  }
  for (const input of [null, undefined, 42, {}]) assert.throws(() => url.pathToFileURL(input));
});
