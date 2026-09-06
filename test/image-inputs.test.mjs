import assert from "node:assert/strict";
import test from "node:test";
import { imageInputs, imageInputsMatch } from "../src/image-inputs.mjs";

test("image reuse binds actual upstream bytes, independent of repeated COPY order", () => {
  const first = { recipeSha256: "a".repeat(64), sha256: "1".repeat(64) };
  const second = { recipeSha256: "b".repeat(64), sha256: "2".repeat(64) };
  assert.equal(imageInputsMatch([first, second, first], [second, first]), true);
  assert.equal(imageInputsMatch([first], [{ ...first, sha256: "3".repeat(64) }]), false);
  assert.equal(imageInputsMatch(undefined, [first]), false);
  assert.equal(imageInputsMatch(undefined, []), true);
  assert.throws(() => imageInputs([first, { ...first, sha256: second.sha256 }]), /conflicting/);
  assert.throws(() => imageInputs([{ ...first, sha256: "missing" }]), /digest/);
  assert.throws(() => imageInputs(new Array(257).fill(first)), /invalid/);
});
