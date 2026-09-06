#!/usr/bin/env node

import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, readlink, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseGeneratedConstant, publishRelease, verifyRelease, verifySite } from "./site-release.mjs";

const project = resolve(import.meta.dirname, "..");
const releases = resolve(project, "build/releases");
const current = await readlink(resolve(releases, "current"));
const original = resolve(releases, current);
assert.equal(await verifyRelease(original), current);
const temporary = await mkdtemp(resolve(project, "build/release-negative-"));
try {
  const site = resolve(temporary, "site");
  await cp(original, site, { recursive: true });
  const checkChange = async (path, changed, check, expected) => {
    const target = resolve(site, path);
    const before = await readFile(target);
    try {
      await writeFile(target, changed);
      await assert.rejects(check(), expected);
    } finally {
      await writeFile(target, before);
    }
  };
  await checkChange("dist/dolly-build-id.mjs", 'export const DOLLY_BUILD_ID = "sha256:wrong";\n',
    () => verifySite(site), /runtime build ID mismatch/);
  const defaultMetadata = "dist/dolly-default-system-snapshot.mjs";
  await checkChange(defaultMetadata, await readFile(resolve(site, "dist/dolly-python-system-snapshot.mjs")),
    () => verifySite(site), /snapshot identity mismatch/);
  const metadata = parseGeneratedConstant(await readFile(resolve(site, defaultMetadata), "utf8"), "DOLLY_SYSTEM_SNAPSHOT");
  metadata.sha256 = "0".repeat(64);
  await checkChange(defaultMetadata, `export const DOLLY_SYSTEM_SNAPSHOT = Object.freeze(${JSON.stringify(metadata)});\n`,
    () => verifySite(site), /snapshot digest mismatch/);
  await checkChange("release/acceptance.txt", "PASS without a bound manifest\n",
    () => verifyRelease(site), /acceptance is missing or belongs to different bytes/);
  await checkChange("src/browser.mjs", "changed browser code\n",
    () => publishRelease(site, releases), /file manifest mismatch/);
  assert.equal(await readlink(resolve(releases, "current")), current);
  console.log("dolly: real release rejects mixed runtime/images, false snapshot digest, unbound acceptance and changed browser code; current release preserved");
} finally {
  await rm(temporary, { recursive: true, force: true });
}
