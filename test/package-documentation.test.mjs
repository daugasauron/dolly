import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { documentationLinks, packageDocumentation } from "../scripts/package-documentation.mjs";

const project = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

// The docs package pins these documents, and a page builds it from the site:
// a published document must be the checkout's bytes.
test("a document linking a recipe the site publishes is packaged unchanged", async () => {
  const published = await mkdtemp(resolve(tmpdir(), "dolly-docs-published-"));
  const without = await mkdtemp(resolve(tmpdir(), "dolly-docs-without-"));
  try {
    const source = await readFile(resolve(project, "docs/slop.md"));
    const recipes = [...source.toString().matchAll(/\]\(\.\.\/(Dollyfile[^)#]*)\)/g)].map(match => match[1]);
    assert.ok(recipes.length > 0);
    for (const recipe of new Set(recipes)) await copyFile(resolve(project, recipe), resolve(published, recipe));
    await packageDocumentation(project, published, ["docs/slop.md"]);
    assert.deepEqual(await readFile(resolve(published, "docs/slop.md")), source);
    // A site that lacks the recipe gets a text copy and a link to it.
    await packageDocumentation(project, without, ["docs/slop.md"]);
    assert.ok((await readFile(resolve(without, "docs/slop.md"), "utf8")).includes(`](../${recipes[0]}.txt)`));
    assert.deepEqual(await readFile(resolve(without, `${recipes[0]}.txt`)), await readFile(resolve(project, recipes[0])));
  } finally {
    await rm(published, { recursive: true, force: true });
    await rm(without, { recursive: true, force: true });
  }
});

// Task records are history and keep the links of their day.
test("a document's relative links name files of the checkout, and every demo has its row", async () => {
  const documents = execFileSync("git", ["ls-files", "*.md"], { cwd: project, encoding: "utf8" })
    .split("\n").filter(path => path && !path.startsWith("tasks/"));
  assert.ok(documents.length > 20);
  for (const path of documents) {
    for (const link of documentationLinks(await readFile(resolve(project, path), "utf8"))) {
      assert.ok(existsSync(resolve(project, dirname(path), decodeURIComponent(link))), `${path} links ${link}`);
    }
  }
  const rows = [...(await readFile(resolve(project, "demos/README.md"), "utf8")).matchAll(/^- \[([^\]]+)\]\(\1\/README\.md\)/gm)]
    .map(match => match[1]);
  const demos = (await readdir(resolve(project, "demos"), { withFileTypes: true }))
    .filter(entry => entry.isDirectory()).map(entry => entry.name);
  assert.deepEqual(rows, demos.sort());
});
