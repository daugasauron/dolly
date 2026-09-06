import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { documentationLinks, packageDocumentation, verifyDocumentationLinks } from "../scripts/package-documentation.mjs";

test("documentation packaging closes local links without exposing private source", async t => {
  const root = await mkdtemp(resolve(tmpdir(), "dolly-docs-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = resolve(root, "project"), site = resolve(root, "site");
  for (const path of ["docs", "src", "abi"]) await mkdir(resolve(project, path), { recursive: true });
  await writeFile(resolve(project, "docs/a.md"), "[b](b.md#heading) [ABI](../abi/README.md)");
  await writeFile(resolve(project, "docs/b.md"), "[a](a.md) [source](../src/dolly.c)");
  await writeFile(resolve(project, "abi/README.md"), "[a](../docs/a.md)");
  await writeFile(resolve(project, "src/dolly.c"), "public source\n");
  assert.deepEqual(documentationLinks("[web](https://example.test/) [a](a.md#part) ```[not a link](x)```"), ["a.md"]);
  const copied = await packageDocumentation(project, site, ["docs/a.md"]);
  assert.deepEqual([...copied].sort(), ["abi/README.md", "docs/a.md", "docs/b.md", "src/dolly.c"]);
  await verifyDocumentationLinks(site);
  assert.equal(await readFile(resolve(site, "src/dolly.c"), "utf8"), "public source\n");
  await rm(resolve(site, "docs/b.md"));
  await assert.rejects(verifyDocumentationLinks(site), { code: "ENOENT" });
  for (const link of ["../AGENTS.md", "../.pi/private.md", "../src/compiler.cpp", "../../outside"]) {
    await writeFile(resolve(project, "docs/a.md"), `[private](${link})`);
    await assert.rejects(packageDocumentation(project, site, ["docs/a.md"]), /unpublished source|escapes the site/);
  }
});
