#!/usr/bin/env node
// DOLLY 7 to DOLLY 8, mechanically and as often as asked: the version leaves every site path.
//   node tasks/20261116-140453-buildtime-01/convert-dolly8.mjs
// In every file git knows or would add (tasks/, the npm changelog and upgrade guide and
// docs/dollyfile.md, which tell the history, aside):
//   - "DOLLY 7" becomes "DOLLY 8": recipes, and the recipes tests and tools write;
//   - a FROM, INSTALL, USE, COPY or SOURCE row at the start of a line loses the /vX.Y.Z of
//     its site path: recipes, the Studio's examples, the examples of a README.
// Then every catalog recipe is parsed (a versioned site path that is left fails here, naming
// its row) and the pins are written again, since every recipe's bytes changed. A second run
// changes nothing. One-time: remove it with the task's close.
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const kept = path => path.startsWith("tasks/") || ["docs/npm-changelog.md", "docs/npm-upgrading.md", "docs/dollyfile.md"].includes(path);
const reference = /^((?:FROM|INSTALL|USE|COPY|SOURCE)[ \t]+["']?)\/v\d+\.\d+\.\d+\//gm;

let converted = 0;
for (const path of execFileSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8" }).split("\0")) {
  if (path === "" || kept(path)) continue;
  const bytes = await readFile(resolve(root, path)).catch(() => null);
  if (bytes === null || bytes.includes(0)) continue;
  const before = bytes.toString("utf8");
  if (!Buffer.from(before, "utf8").equals(bytes)) continue;
  const after = before.replace(/\bDOLLY 7\b/g, "DOLLY 8").replace(reference, "$1/");
  if (after === before) continue;
  await writeFile(resolve(root, path), after);
  converted++;
}

const { inspectDollyfile } = await import(resolve(root, "site/dollyfile-view.mjs"));
const { recipeFiles } = await import(resolve(root, "scripts/recipe-files.mjs"));
const { updateRecipePins } = await import(resolve(root, "scripts/update-recipe-pins.mjs"));
for (const path of (await recipeFiles(root)).values()) {
  const recipe = inspectDollyfile(await readFile(resolve(root, path), "utf8"), path);
  for (const { location, line } of [...recipe.sources, ...recipe.artifacts]) {
    if (/^\/v\d+\.\d+\.\d+\//.test(location)) throw new Error(`${path}:${line}: ${location} still names a version`);
  }
}
const pinned = await updateRecipePins(root);
console.log(`convert-dolly8: ${converted} files converted, ${pinned.recipes} recipes pinned`);
