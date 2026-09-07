import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { inspectDollyfile } from "../src/dollyfile-view.mjs";

const names = ["plain", "$&", "$$", "$'", "$`", "東京"];

test("Janis package wildcard substitutions preserve literal filenames", async () => {
  const source = await readFile(new URL("../src/runtimes/janis.js", import.meta.url), "utf8");
  const map = runInNewContext(source.slice(source.indexOf("function janisExportTarget("),
    source.indexOf("function janisPackageExport(")) + "\njanisMappedTarget");
  for (const name of names) {
    assert.equal(map({ "./*": "./src/*.js" }, `./${name}`, ["default"]), `./src/${name}.js`);
    assert.equal(map({ "#*": "./src/*/*.js" }, `#${name}`, ["default"]), `./src/${name}/${name}.js`);
  }
});

test("Studio lint diagnostics preserve filenames when adding the first line number", async () => {
  const source = (await readFile(new URL("../src/studio/lint.mjs", import.meta.url), "utf8")).replace(/^import .*;\n/gm, "");
  for (const name of names) {
    const label = `Dollyfile-${name}`;
    let message, status;
    runInNewContext(source, { scriptArgs: ["--stdin", label], inspectDollyfile,
      Dolly: { readFile: () => "DOLLY 3\n", exit: code => { status = code; } },
      console: { error: text => { message = text; } } });
    assert.equal(status, 1);
    assert.equal(message, `${label}:1: missing IMAGE or MODULE`);
  }
});
