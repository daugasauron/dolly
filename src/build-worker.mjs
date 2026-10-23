// The site's runtime Worker (worker-image.mjs): it builds an image from its
// recipe, from the compiler seed or the base image the page hands it, and runs
// it or, for the image builder, only hands the snapshot back (buildOnly); or it
// restores a custom image the site built before.
import { DOLLY_IMAGE_BUILD_ID } from "../dist/dolly-image-build-id.mjs";
import { DOLLY_IMAGES } from "./images.mjs";
import { decodeSnapshotRecords, MAX_SNAPSHOT_BYTES as snapshotSizeLimit } from "./snapshot-records.mjs";
import { describeImageArtifact, saveImageArtifact, sha256 } from "./image-artifact.mjs";
import { imageInputs } from "./image-inputs.mjs";
import { inspectDollyfile, MAX_DOLLYFILE_BYTES } from "./dollyfile-view.mjs";
import { checkedCustomArtifact } from "./custom-image.mjs";
import { siteReference, decodeStaticAsset } from "./static-asset.mjs";
import { checkedMemoryRange, kernelArtifact, runImage } from "./worker-image.mjs";

const encoder = new TextEncoder();

await runImage(async (config, host) => {
  const { image, mode, customSource } = config;
  const definition = DOLLY_IMAGES.find(candidate => candidate.image === image);
  const custom = image === "custom";
  if (!(definition || custom) || !["snapshot", "rebuild"].includes(mode) || (mode === "snapshot" && !custom)) {
    throw new Error("invalid Dolly image selection");
  }
  if ((custom || customSource !== undefined) && (typeof customSource !== "string" ||
      encoder.encode(customSource).byteLength > MAX_DOLLYFILE_BYTES || customSource.includes("\0"))) {
    throw new Error("invalid uploaded Dollyfile");
  }
  const recipe = custom ? inspectDollyfile(customSource) : definition;
  const locator = custom ? "FILE:/etc/dolly/upload.Dollyfile" : siteReference(definition.dollyfile);
  const prepareRecipe = files => {
    files.write("/etc/dolly/recipe.locator", locator);
    if (custom) files.write("/etc/dolly/upload.Dollyfile", customSource);
  };
  // Copies a whole snapshot into the kernel's checked staging range; its size.
  const stageSnapshot = (kernel, memory, bytes) => {
    const range = checkedMemoryRange(memory, kernel.dolly_snapshot_restore_address(BigInt(bytes.byteLength)), bytes.byteLength);
    new Uint8Array(memory.buffer, range.address, range.size).set(new Uint8Array(bytes));
    return range.size;
  };
  if (mode === "snapshot") {
    const artifact = await checkedCustomArtifact(customSource, config.customArtifact);
    config.customArtifact = undefined;
    host.require(artifact.hostRequirements);
    host.admit(artifact.hostRequirements);
    return {
      name: image,
      prepare({ files }) {
        prepareRecipe(files);
        files.write("/etc/dolly/image.manifest", `${artifact.manifest.join("\n")}\n`);
      },
      restore({ kernel, memory, stage }) {
        stage("loading precompiled userspace snapshot...");
        const size = stageSnapshot(kernel, memory, artifact.bytes);
        artifact.bytes = undefined;
        return { status: kernel.dolly_bootstrap_snapshot(BigInt(size)) };
      },
    };
  }

  const declared = recipe.hostRequirements;
  const recipeSha256 = custom ? await sha256(encoder.encode(customSource)) : definition.sha256;
  const baseReference = custom ? recipe.from : definition.artifacts.find(reference => reference.operation === "from");
  const artifacts = new Map();
  if (config.artifacts !== undefined && (!Array.isArray(config.artifacts) || config.artifacts.length > 256)) {
    throw new Error("invalid build artifacts");
  }
  for (const candidate of config.artifacts ?? []) {
    if (candidate?.buildId !== DOLLY_IMAGE_BUILD_ID || !/^[0-9a-f]{64}$/.test(candidate.recipeSha256) ||
        !(candidate.bytes instanceof ArrayBuffer) || await sha256(candidate.bytes) !== candidate.sha256) {
      throw new Error("build artifact integrity mismatch");
    }
    artifacts.set(candidate.recipeSha256, await describeImageArtifact(candidate.bytes, candidate.recipeSha256));
  }
  config.artifacts = undefined;
  // A build runs the engine and its tools with the build host's modules, and
  // the programs of the images it reads with their modules: one the build host
  // does not enable answers ENOSYS.
  host.admit([...declared, ...host.enabled, ...[...artifacts.values()].flatMap(artifact => artifact.hostRequirements)]);
  const inputs = imageInputs([...artifacts.values()]);
  const base = baseReference ? artifacts.get(baseReference.sha256) : null;
  if (baseReference && !base) throw new Error("base image artifact was not provided");
  const releaseInput = artifact => {
    if (config.returnInputs) self.postMessage({ type: "build-input", recipeSha256: artifact.recipeSha256,
      bytes: artifact.bytes }, [artifact.bytes]);
    else artifact.bytes.transfer(0);
    artifact.bytes = null;
  };
  let seed = null, built = false;
  return {
    name: image,
    async prepare({ files, stage }) {
      // A root build starts from the compiler seed, a snapshot like any image.
      if (!base) {
        stage("loading root compiler seed...");
        // Static hosts may serve the seed as verified parts.
        const url = kernelArtifact("dolly.data");
        seed = await (await decodeStaticAsset(await fetch(url), url, {}, snapshotSizeLimit)).arrayBuffer();
      }
      prepareRecipe(files);
      for (const artifact of artifacts.values()) {
        files.write(`/etc/dolly/artifacts/${artifact.recipeSha256}.snapshot`, new Uint8Array(artifact.bytes));
        if (artifact !== base) releaseInput(artifact);
      }
      // The kernel restores a snapshot against the list of its paths.
      files.write("/etc/dolly/image.manifest", `${(base?.manifest ?? [...decodeSnapshotRecords(seed).keys()]).join("\n")}\n`);
    },
    async restore({ kernel, memory, files, stage }) {
      stage("building userspace from the Dollyfile...");
      let status;
      if (base) {
        stage(`loading builder from ${baseReference.location}...`);
        status = kernel.dolly_process_bootstrap_resume_prepare(BigInt(stageSnapshot(kernel, memory, base.bytes)), 1);
        releaseInput(base);
      } else {
        status = kernel.dolly_process_bootstrap_prepare(BigInt(stageSnapshot(kernel, memory, seed)));
        seed = null;
      }
      let supervisor;
      if (status === 0) {
        supervisor = await host.kernel.supervisor(kernel);
        status = (await supervisor.spawn(base ? ["/bin/dollyfile", locator] : ["/usr/libexec/dolly/process-bin/bootstrap"])).status;
      }
      for (const artifact of artifacts.values()) files.remove(`/etc/dolly/artifacts/${artifact.recipeSha256}.snapshot`);
      artifacts.clear();
      if (status !== 0) return { status };
      stage("capturing userspace image...");
      if (kernel.dolly_snapshot_capture() !== 0) throw new Error("Dolly system snapshot capture failed");
      const range = checkedMemoryRange(memory, kernel.dolly_snapshot_address(), kernel.dolly_snapshot_size());
      stage("copying completed image...");
      const copy = new Uint8Array(range.size);
      copy.set(new Uint8Array(memory.buffer, range.address, range.size));
      if (!config.buildOnly) {
        const artifact = await describeImageArtifact(copy.buffer, recipeSha256, inputs);
        host.require(artifact.hostRequirements);
        host.admit(artifact.hostRequirements);
        const saved = await saveImageArtifact(artifact, custom ? `custom:${recipe.image}` : `/${definition.dollyfile}`);
        stage(saved ? "saved completed image artifact" : "image built; local cache unavailable");
      }
      self.postMessage({ type: "system-snapshot", bytes: copy.buffer, inputs }, [copy.buffer]);
      built = true;
      return { status, supervisor };
    },
    finish({ kernel, stage }) {
      if (!built) return;
      stage("finishing image bootstrap...");
      const status = kernel.dolly_bootstrap_finish();
      if (status !== 0) throw new Error(`Dolly bootstrap failed with status ${status}`);
    },
  };
});
