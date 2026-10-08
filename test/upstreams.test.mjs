import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { discoverImageDefinitions } from "../scripts/image-definitions.mjs";
import { sourcePins, upstreamRows } from "../scripts/upstreams.mjs";
import { siteReference } from "../src/static-asset.mjs";

const projectDir = resolve(import.meta.dirname, "..");
const spdxExpression = /^\(?[A-Za-z0-9.+-]+\)?(?: (?:AND|OR|WITH) \(?[A-Za-z0-9.+-]+\)?)*$/;

test("every recipe SOURCE and source pin has a licensed upstream entry, and every entry is used", async () => {
  const rows = await upstreamRows(projectDir, await discoverImageDefinitions(projectDir));
  const pins = await sourcePins(projectDir);
  const claimed = new Set(rows.flatMap(row => row.pins ?? []));
  for (const key of pins.keys()) assert.ok(claimed.has(key), `source pin ${key} has no entry in config/upstreams.json`);
  for (const row of rows) {
    for (const key of row.pins ?? []) assert.ok(pins.has(key), `${row.name}: unknown source pin ${key}`);
    for (const pattern of row.patterns) {
      assert.ok([...row.locations].some(location => pattern.test(location)), `${row.name}: ${pattern} matches no SOURCE`);
    }
    assert.ok(row.locations.size || row.pins?.length || row.seed, `${row.name} matches no SOURCE, pin or seed input`);
    assert.ok(row.npm || spdxExpression.test(row.licence), `${row.name}: licence is not an SPDX expression`);
    assert.ok(row.npm || /^https:\/\//.test(row.repository), `${row.name}: no repository`);
  }
});

test("a SOURCE without an upstream entry fails the inventory", async () => {
  const definition = { image: "example", filename: "Dollyfile-example",
    parsed: { sources: [{ location: siteReference("dist/static/unlisted.tar"), line: 7 }] } };
  await assert.rejects(upstreamRows(projectDir, [definition]), /Dollyfile-example:7: .*unlisted\.tar has no entry/);
});
