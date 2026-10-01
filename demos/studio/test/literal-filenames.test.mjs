import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { inspectDollyfile } from "../../../src/dollyfile-view.mjs";

const names = ["plain", "$&", "$$", "$'", "$`", "東京"];

test("Studio lint diagnostics preserve filenames when adding the first line number", async () => {
  const source = (await readFile(new URL("../lint.mjs", import.meta.url), "utf8")).replace(/^import .*;\n/gm, "");
  for (const name of names) {
    const label = `Dollyfile-${name}`;
    let message, status;
    runInNewContext(source, { scriptArgs: ["--stdin", label], inspectDollyfile,
      Dolly: { readFile: () => "DOLLY 6\n", exit: code => { status = code; } },
      console: { error: text => { message = text; } } });
    assert.equal(status, 1);
    assert.equal(message, `${label}:1: missing APPLICATION, TOOLCHAIN or PACKAGE`);
  }
});
