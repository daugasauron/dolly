import assert from "node:assert/strict";
import test from "node:test";
import { PackagesTransport, maxSnapshots } from "../host/packages/transport.mjs";
import * as A from "../host/packages/abi.mjs";
import { DOLLY_ERRNO as errno } from "../page/process-constants.mjs";

test("past a page load's snapshots packages@0 refuses with EDQUOT and tells the page", async () => {
  const memory = new SharedArrayBuffer(64 + A.DOLLY_PACKAGES_CHUNK_OFFSET + A.DOLLY_PACKAGES_CHUNK_CAPACITY);
  const imageBase = new URL("https://dolly.invalid/default/");
  let told = 0;
  const transport = new PackagesTransport(memory, 64, imageBase, () => { told += 1; });
  transport.served = maxSnapshots;
  const { words } = transport, directory = new TextEncoder().encode(imageBase.href);
  transport.directory.set(directory);
  Atomics.store(words, A.DOLLY_PACKAGES_WORD_DIRECTORY_LENGTH, directory.length);
  Atomics.store(words, A.DOLLY_PACKAGES_WORD_KIND, A.DOLLY_PACKAGES_KIND_SNAPSHOT);
  Atomics.store(words, A.DOLLY_PACKAGES_WORD_REQUEST, 1);
  transport.service();
  for (let tries = 0; Atomics.load(words, A.DOLLY_PACKAGES_WORD_COMPLETED) !== 1; tries++) {
    assert.ok(tries < 400, "the request never completed");
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.equal(Atomics.load(words, A.DOLLY_PACKAGES_WORD_ERROR), errno.EDQUOT);
  assert.equal(Atomics.load(words, A.DOLLY_PACKAGES_WORD_EOF), 1);
  assert.equal(told, 1);
});
