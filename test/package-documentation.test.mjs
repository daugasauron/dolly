import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { documentationLinks, packageDocumentation, verifyDocumentationLinks } from "../scripts/package-documentation.mjs";
import { discoverImageDefinitions } from "../scripts/image-definitions.mjs";

// A throwaway git checkout: packaging publishes only tracked files.
async function checkout(root, files, untracked = {}) {
  const project = resolve(root, "project");
  for (const [path, contents] of Object.entries({ ...files, ...untracked })) {
    await mkdir(dirname(resolve(project, path)), { recursive: true });
    await writeFile(resolve(project, path), contents);
  }
  execFileSync("git", ["init", "-q"], { cwd: project });
  execFileSync("git", ["add", "--", ...Object.keys(files)], { cwd: project });
  return project;
}

test("documentation packaging publishes linked tracked text files outside demos", async t => {
  const root = await mkdtemp(resolve(tmpdir(), "dolly-docs-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const site = resolve(root, "site");
  const project = await checkout(root, {
    "docs/a.md": "[b](b.md#heading) [ABI](../abi/README.md) [unselected image](../Dollyfile-extra)",
    "Dollyfile-extra": "DOLLY 4\nIMAGE extra\n",
    "docs/b.md": "[a](a.md) [source](../src/dolly.c) [issues](../tasks/README.md)",
    "abi/README.md": "[a](../docs/a.md)",
    "src/dolly.c": "public source\n",
    "tasks/README.md": "[issue](20260913-120000-proof/TASK.md)",
    "tasks/20260913-120000-proof/TASK.md": "[source](../../src/dolly.c) [results](evidence.json)",
    "tasks/20260913-120000-proof/evidence.json": '{"passed":true}\n',
    "demos/game/README.md": "demo documentation",
    "font.bin": "binary\0bytes",
  }, { ".pi/private.md": "untracked" });
  assert.deepEqual(documentationLinks("[web](https://example.test/) [a](a.md#part) ```[not a link](x)```"), ["a.md"]);
  const copied = await packageDocumentation(project, site, ["docs/a.md"]);
  assert.deepEqual([...copied].sort(), ["Dollyfile-extra", "abi/README.md", "docs/a.md", "docs/b.md", "src/dolly.c", "tasks/20260913-120000-proof/TASK.md", "tasks/20260913-120000-proof/evidence.json", "tasks/README.md"]);
  await verifyDocumentationLinks(site);
  assert.equal(await readFile(resolve(site, "src/dolly.c"), "utf8"), "public source\n");
  assert.deepEqual(JSON.parse(await readFile(resolve(site, "tasks/20260913-120000-proof/evidence.json"), "utf8")), { passed: true });
  await rm(resolve(site, "docs/b.md"));
  await assert.rejects(verifyDocumentationLinks(site), { code: "ENOENT" });
  for (const link of ["../.pi/private.md", "../demos/game/README.md", "../font.bin", "../missing.md", "../../outside"]) {
    await writeFile(resolve(project, "docs/a.md"), `[private](${link})`);
    await assert.rejects(packageDocumentation(project, site, ["docs/a.md"]), /unpublished source|binary file|escapes the site/);
  }
});

test("partial releases include recipe examples without selecting their images or requiring default", async t => {
  const root = await mkdtemp(resolve(tmpdir(), "dolly-docs-images-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const site = resolve(root, "site");
  const example = "DOLLY 4\nIMAGE example\nENTRY /bin/slop\n";
  const project = await checkout(root, {
    "Dollyfile-example": example,
    "abi/README.md": "ABI",
    "docs/a.md": "[example](../Dollyfile-example#part) [ABI](../abi/README.md)\n```\n[unchanged](../Dollyfile-example)\n```\n",
  });
  await mkdir(site);
  await writeFile(resolve(site, "Dollyfile-selected"), "DOLLY 4\nIMAGE selected\nENTRY /bin/slop\n");
  await packageDocumentation(project, site, ["docs/a.md"]);
  await verifyDocumentationLinks(site);
  assert.equal(await readFile(resolve(site, "Dollyfile-example.txt"), "utf8"), example);
  assert.match(await readFile(resolve(site, "docs/a.md"), "utf8"), /Dollyfile-example\.txt#part/);
  assert.match(await readFile(resolve(site, "docs/a.md"), "utf8"), /```\n\[unchanged\]\(\.\.\/Dollyfile-example\)\n```/);
  assert.deepEqual((await discoverImageDefinitions(site)).map(item => item.image), ["selected"]);
  await rm(resolve(site, "Dollyfile-selected"));
  await assert.rejects(discoverImageDefinitions(site), /No Dollyfile/);
});
