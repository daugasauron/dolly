// The docs package in an image that installs it: every file its recipe names
// is under /usr/share/doc/dolly (the SOURCE pins prove the bytes at build).
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { browserTest, composed } from "./browser.mjs";
import { inspectDollyfile } from "../src/dollyfile-view.mjs";

const { sources } = inspectDollyfile(await readFile(new URL("../Dollyfile-dolly-docs", import.meta.url), "utf8"), "Dollyfile-dolly-docs");
await browserTest("docs", { image: "minimal" }, async ({ open }) => {
  const { submit, text } = await open(await composed(["runtime", "display", "input"], ["core", "display", "dolly-docs"]));
  const files = sources.map(({ destination }) => destination);
  assert.equal(await submit(`(for file in ${files.join(" ")}; do test -s "$file" || exit 1; done)`), 0, await text());
  assert.equal(await submit("test -e /usr/share/doc/dolly/docs/deployment.md"), 1);
});
