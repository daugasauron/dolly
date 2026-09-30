import assert from "node:assert/strict";
import { janisContext } from "./fixtures/janis-context.mjs";
import test from "node:test";

test("Janis computes SHA-256, MD5 and HMAC known answers", async () => {
  const { createHash: janisHash, createHmac: janisHmac } = janisContext().__janisBuiltin("crypto");

  assert.equal(
    janisHash("sha256").update("abc").digest("hex"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.equal(janisHash("md5").update("abc").digest("hex"), "900150983cd24fb0d6963f7d28e17f72");
  assert.equal(
    janisHmac("sha256", "key").update("The quick brown fox jumps over the lazy dog").digest("hex"),
    "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8",
  );
});
