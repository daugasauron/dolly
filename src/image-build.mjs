import { DOLLY_IMAGES } from "../dist/dolly-images.mjs";
import { loadRecipeGraph } from "./dollyfile-graph.mjs";
import { imageInputs, imageInputsMatch } from "./image-inputs.mjs";
import { describeImageArtifact, loadImageArtifactDescriptor, loadImageArtifact, saveImageArtifact,
  loadPackagedSnapshotMetadata, loadPackagedSystemSnapshot } from "./image-artifact.mjs";

const applicationBase = new URL("../", import.meta.url);

// A custom recipe may reference only this release's published recipes.
function customRecipeGraph(customSource, signal) {
  return loadRecipeGraph(async location => {
    if (location === "Dollyfile") return new TextEncoder().encode(customSource);
    const response = await fetch(new URL(location.slice(1), applicationBase), { credentials: "same-origin", redirect: "error", signal });
    if (!response.ok) throw new Error(`${location}: HTTP ${response.status}; this release does not publish that recipe`);
    return response.arrayBuffer();
  }, "Dollyfile");
}

// Only explicit image references schedule builds. Modules still execute in
// order inside their caller's userspace; this traversal makes no input guesses.
export async function prepareImageArtifacts(image, customSource, build, report, signal) {
  const definitions = new Map(DOLLY_IMAGES.map(definition => [definition.image, definition]));
  const artifacts = new Map(), active = new Set();
  async function materialize(node) {
    signal?.throwIfAborted();
    if (node.artifact?.bytes.byteLength > 0) return node.artifact;
    const { definition, descriptor } = node;
    let artifact = await loadImageArtifact(descriptor);
    if (artifact) report(`reusing local ${definition.image} artifact`);
    else {
      const metadata = node.metadata ?? await loadPackagedSnapshotMetadata(definition.image);
      // A cache replacement or corruption must not substitute different bytes
      // after a consumer has already been selected using this descriptor.
      if (metadata.sha256 !== descriptor.sha256 || !imageInputsMatch(metadata.inputs, descriptor.inputs)) {
        throw new Error(`${definition.image}: selected image artifact is no longer available; retry the rebuild`);
      }
      artifact = await describeImageArtifact(await loadPackagedSystemSnapshot(definition.image, metadata, signal),
        definition.sha256, descriptor.inputs);
      report(`reusing published ${definition.image} artifact`);
      await saveImageArtifact(artifact, `/${definition.dollyfile}`);
    }
    node.artifact = artifact;
    signal?.throwIfAborted();
    return artifact;
  }
  async function resolve(reference) {
    signal?.throwIfAborted();
    if (artifacts.has(reference.sha256)) return artifacts.get(reference.sha256);
    const definition = DOLLY_IMAGES.find(candidate => `/${candidate.dollyfile}` === reference.location && candidate.sha256 === reference.sha256);
    if (!definition) throw new Error(`${reference.location}: image pin is not present in this release`);
    if (active.has(definition.image)) throw new Error(`image cycle at ${definition.image}`);
    active.add(definition.image);
    const dependencies = new Map();
    for (const dependency of definition.artifacts) dependencies.set(dependency.sha256, await resolve(dependency));
    const inputs = imageInputs([...dependencies.values()].map(node => node.descriptor));
    let descriptor = await loadImageArtifactDescriptor(definition.sha256, inputs);
    let metadata, artifact;
    if (!descriptor) {
      try {
        metadata = await loadPackagedSnapshotMetadata(definition.image);
        if (!imageInputsMatch(metadata.inputs, inputs)) throw new Error("published image inputs changed");
        descriptor = { recipeSha256: definition.sha256, sha256: metadata.sha256,
          byteLength: metadata.byteLength, inputs };
      } catch {
        report(`building missing ${definition.image} artifact`);
        const loaded = [];
        for (const dependency of dependencies.values()) loaded.push(await materialize(dependency));
        const result = await build(definition.image, loaded);
        if (!imageInputsMatch(result.inputs, inputs)) throw new Error("built image inputs changed");
        artifact = await describeImageArtifact(result.bytes, definition.sha256, inputs);
        descriptor = artifact;
      }
    }
    signal?.throwIfAborted();
    active.delete(definition.image);
    const node = { definition, descriptor, metadata, artifact };
    artifacts.set(definition.sha256, node);
    return node;
  }
  const references = image === "custom" ? (await customRecipeGraph(customSource, signal)).artifacts : definitions.get(image).artifacts;
  const selected = new Map();
  for (const reference of references) selected.set(reference.sha256, await resolve(reference));
  const loaded = [];
  for (const node of selected.values()) loaded.push(await materialize(node));
  return loaded;
}

// Resolve compatibility from pinned recipes before materializing large artifacts.
export async function loadImageHostRequirements(image, customSource) {
  if (image !== "custom") return DOLLY_IMAGES.find(definition => definition.image === image).hostRequirements ?? [];
  return (await customRecipeGraph(customSource)).root.hostRequirements;
}
