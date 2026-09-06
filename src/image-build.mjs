import { DOLLY_IMAGES, DOLLY_STATIC_SOURCES } from "../dist/dolly-images.mjs";
import { inspectDollyfile } from "./dollyfile-view.mjs";
import { imageInputs, imageInputsMatch } from "./image-inputs.mjs";
import { describeImageArtifact, loadImageArtifact, saveImageArtifact,
  loadPackagedSnapshotMetadata, loadPackagedSystemSnapshot, sha256 } from "./image-artifact.mjs";

// Only explicit image references schedule builds. Modules still execute in
// order inside their caller's userspace; this traversal makes no input guesses.
export async function prepareImageArtifacts(image, customSource, build, report) {
  const definitions = new Map(DOLLY_IMAGES.map(definition => [definition.image, definition]));
  const sources = new Map(DOLLY_STATIC_SOURCES.map(source => [source.path, source]));
  const applicationBase = new URL("../", import.meta.url);
  const artifacts = new Map(), active = new Set();
  async function customReferences(source, stack = []) {
    if (stack.length >= 16) throw new Error("recipe depth exceeds 16");
    const recipe = inspectDollyfile(source);
    const references = [...recipe.artifacts];
    for (const use of recipe.uses) {
      if (stack.includes(use.location)) throw new Error(`recipe cycle at ${use.location}`);
      const admitted = sources.get(use.location);
      if (admitted?.sha256 !== use.sha256) throw new Error(`${use.location}: module is not in this release; regenerate routes after adding it`);
      const response = await fetch(new URL(use.location.slice(1), applicationBase), { credentials: "same-origin", redirect: "error" });
      if (!response.ok) throw new Error(`${use.location}: HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength !== admitted.byteLength || await sha256(bytes) !== use.sha256) throw new Error(`${use.location}: module pin mismatch`);
      references.push(...await customReferences(new TextDecoder().decode(bytes), [...stack, use.location]));
    }
    return references;
  }
  async function resolve(reference) {
    if (artifacts.has(reference.sha256)) return artifacts.get(reference.sha256);
    const definition = DOLLY_IMAGES.find(candidate => `/${candidate.dollyfile}` === reference.location && candidate.sha256 === reference.sha256);
    if (!definition) throw new Error(`${reference.location}: image pin is not present in this release`);
    if (active.has(definition.image)) throw new Error(`image cycle at ${definition.image}`);
    active.add(definition.image);
    const dependencies = new Map();
    for (const dependency of definition.artifacts) dependencies.set(dependency.sha256, await resolve(dependency));
    const inputs = imageInputs([...dependencies.values()]);
    let artifact = await loadImageArtifact(definition.sha256, inputs);
    if (artifact) report(`reusing local ${definition.image} artifact`);
    if (!artifact) {
      try {
        const metadata = await loadPackagedSnapshotMetadata(definition.image);
        if (!imageInputsMatch(metadata.inputs, inputs)) throw new Error("published image inputs changed");
        artifact = await describeImageArtifact(await loadPackagedSystemSnapshot(definition.image, metadata), definition.sha256, inputs);
        report(`reusing published ${definition.image} artifact`);
        await saveImageArtifact(artifact, `/${definition.dollyfile}`);
      } catch {
        report(`building missing ${definition.image} artifact`);
        const result = await build(definition.image, [...dependencies.values()]);
        if (!imageInputsMatch(result.inputs, inputs)) throw new Error("built image inputs changed");
        artifact = await describeImageArtifact(result.bytes, definition.sha256, inputs);
      }
    }
    active.delete(definition.image);
    artifacts.set(definition.sha256, artifact);
    return artifact;
  }
  const references = image === "custom" ? await customReferences(customSource) : definitions.get(image).artifacts;
  const selected = new Map();
  for (const reference of references) selected.set(reference.sha256, await resolve(reference));
  return [...selected.values()];
}
