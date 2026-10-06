// The docs package (Dollyfile-dolly-docs) ships the platform's documents and machine
// contracts from the files the site publishes. Its rows are checked against
// the documents themselves: a shipped document may link only to a document or
// contract that ships too, or to one this list names as about the repository.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, normalize } from "node:path";
import test from "node:test";
import { inspectDollyfile } from "../src/dollyfile-view.mjs";
import { canonicalPath } from "../src/static-asset.mjs";
import { documentationLinks } from "../scripts/package-documentation.mjs";
import { publishedDocument } from "../scripts/host-modules.mjs";

const project = new URL("..", import.meta.url).pathname;
// About the checkout, its build or its deployment: not for an image.
const repository = new Set(["AGENTS.md", "docs/deployment.md", "docs/licences.md", "docs/sources.md",
  "src/ghostty/generated/README.md"]);

test("the docs package ships the linked documents and contracts of this checkout", async () => {
  const recipe = inspectDollyfile(await readFile(join(project, "Dollyfile-dolly-docs"), "utf8"), "Dollyfile-dolly-docs");
  const shipped = new Map();
  for (const { location, sha256, destination, line } of recipe.sources) {
    const path = canonicalPath(location);
    assert.ok(path && publishedDocument(path), `Dollyfile-dolly-docs:${line}: ${location} is not a platform document`);
    assert.equal(destination, `/usr/share/doc/dolly${path}`, `Dollyfile-dolly-docs:${line}`);
    const bytes = await readFile(join(project, path));
    assert.equal(sha256, createHash("sha256").update(bytes).digest("hex"), `Dollyfile-dolly-docs:${line}: stale pin`);
    shipped.set(path.slice(1), bytes.toString("utf8"));
  }
  assert.deepEqual(recipe.folders.map(folder => folder.path ?? folder), ["/usr/share/doc/dolly"]);
  const linked = new Set();
  for (const [path, text] of shipped) {
    if (!path.endsWith(".md")) continue;
    for (const link of documentationLinks(text)) {
      const target = normalize(join(dirname(path), decodeURIComponent(link)));
      if (!/\.(?:md|wat)$/.test(target) || repository.has(target)) continue;
      assert.ok(shipped.has(target), `${path} links to ${target}, which Dollyfile-dolly-docs does not ship`);
      linked.add(target);
    }
  }
  // Nothing rides along: every contract is one a shipped document names.
  assert.deepEqual([...shipped.keys()].filter(path => path.endsWith(".wat") && !linked.has(path)), []);
});
