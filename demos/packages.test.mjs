import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { inspectDollyfile } from "../site/dollyfile-view.mjs";
import { recipeFiles } from "../scripts/recipe-files.mjs";

// Every package of a demo is its demo's to use: a test of the demo installs it
// (`amy install NAME`, its test/amy-cases.json among them) or names it, or a
// recipe builds with it (INSTALL, USE, COPY). The core's are test/amy-browser.mjs's.
const project = resolve(import.meta.dirname, "..");

test("every package of a demo is installed or named by its tests, or built with", async () => {
  const recipes = await Promise.all([...(await recipeFiles(project)).values()].map(async path =>
    ({ demo: /^demos\/([^/]+)\//.exec(path)?.[1], recipe: inspectDollyfile(await readFile(resolve(project, path), "utf8"), path) })));
  // The packages a recipe builds with, by name.
  const builtWith = new Set(recipes.flatMap(({ recipe }) => recipe.artifacts)
    .map(({ location }) => location.split("/").pop().replace(/^Dollyfile-/, "")));
  const tests = new Map();
  const unused = [];
  for (const { demo, recipe } of recipes) {
    if (!demo || recipe.role !== "package" || builtWith.has(recipe.image)) continue;
    if (!tests.has(demo)) {
      const entries = await readdir(resolve(project, "demos", demo, "test"), { withFileTypes: true, recursive: true }).catch(() => []);
      tests.set(demo, await Promise.all(entries.filter(entry => entry.isFile() && /\.(mjs|json)$/.test(entry.name))
        .map(entry => readFile(resolve(entry.parentPath, entry.name), "utf8"))));
    }
    const named = new RegExp(`(?<![\\w-])${recipe.image.replaceAll(".", "\\.")}(?![\\w-])`);
    if (!tests.get(demo).some(text => named.test(text))) unused.push(`${demo}: ${recipe.image}`);
  }
  assert.deepEqual(unused, [], "packages of a demo that none of its tests installs or names and no recipe builds with");
});
