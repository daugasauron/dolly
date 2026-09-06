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
