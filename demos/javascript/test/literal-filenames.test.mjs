import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const names = ["plain", "$&", "$$", "$'", "$`", "東京"];

test("Janis package wildcard substitutions preserve literal filenames", async () => {
  const source = await readFile(new URL("../janis.js", import.meta.url), "utf8");
  const map = runInNewContext(source.slice(source.indexOf("function janisExportTarget("),
    source.indexOf("function janisPackageExport(")) + "\njanisMappedTarget");
  for (const name of names) {
    assert.equal(map({ "./*": "./src/*.js" }, `./${name}`, ["default"]), `./src/${name}.js`);
    assert.equal(map({ "#*": "./src/*/*.js" }, `#${name}`, ["default"]), `./src/${name}/${name}.js`);
  }
});
