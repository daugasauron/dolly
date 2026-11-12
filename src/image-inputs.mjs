import { Sha256 } from "./sha256.mjs";

// Recipe pins identify instructions; artifact digests identify their results.
export function imageInputs(artifacts = []) {
  if (!Array.isArray(artifacts) || artifacts.length > 256) throw new Error("invalid image inputs");
  const inputs = new Map();
  for (const artifact of artifacts) {
    const { recipeSha256, sha256 } = artifact ?? {};
    if (!/^[0-9a-f]{64}$/.test(recipeSha256) || !/^[0-9a-f]{64}$/.test(sha256)) {
      throw new Error("invalid image input digest");
    }
    if (inputs.has(recipeSha256) && inputs.get(recipeSha256).sha256 !== sha256) {
      throw new Error("conflicting image inputs");
    }
    inputs.set(recipeSha256, { recipeSha256, sha256 });
  }
  return [...inputs.values()].sort((a, b) => a.recipeSha256.localeCompare(b.recipeSha256));
}

export function imageInputsMatch(actual, expected) {
  return JSON.stringify(imageInputs(actual)) === JSON.stringify(imageInputs(expected));
}

// The catalog's digest of an image's recipe records (its metadata's recipes),
// one line each, "SHA256 BYTES PATH\n", in their order: a start checks the
// records against the catalog without the catalog repeating them.
export function recipesDigest(recipes) {
  const hash = new Sha256();
  hash.update(new TextEncoder().encode(recipes.map(({ sha256, byteLength, sourcePath }) => `${sha256} ${byteLength} ${sourcePath}\n`).join("")));
  return hash.hex();
}
