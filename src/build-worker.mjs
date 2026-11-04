// The site's runtime Worker (worker-image.mjs): it builds an image from its
// recipe, from the compiler seed or the base image the page hands it, caches
// it and runs it, telling the page its identity, or, for the image builder,
// hands the page the cached artifact (buildOnly); or it restores a custom
// image the site built before. Images cross to and from Wasm memory a piece
// at a time: the page holds them as Blobs, never in a JS heap.
import { DOLLY_IMAGE_BUILD_ID } from "../dist/dolly-image-build-id.mjs";
import { imageBase, imageDefinition } from "./images.mjs";
import { scanSnapshotRecords, MAX_SNAPSHOT_BYTES as snapshotSizeLimit } from "./snapshot-records.mjs";
import { describeImageArtifact, saveImageArtifact, sha256 } from "./image-artifact.mjs";
import { imageInputs } from "./image-inputs.mjs";
import { inspectDollyfile, MAX_DOLLYFILE_BYTES, recipeRows } from "./dollyfile-view.mjs";
import { checkedCustomArtifact } from "./custom-image.mjs";
import { siteReference, decodeStaticAsset } from "./static-asset.mjs";
import { checkedMemoryRange, kernelArtifact, runImage } from "./worker-image.mjs";

const encoder = new TextEncoder();
const PIECE = 8 * 1024 * 1024;

// The kernel's capture of the image, TOTAL bytes, as unshared copies of the
// pieces it reads into the staging window of PIECE bytes.
function* capturedPieces(kernel, memory, total) {
  const window = checkedMemoryRange(memory, kernel.dolly_snapshot_restore_address(BigInt(PIECE)), PIECE);
  let produced = 0;
  for (;;) {
    const size = Number(kernel.dolly_snapshot_capture_read());
    if (size === 0) break;
    if (size > window.size || size > total - produced) throw new Error("Wasm published an invalid system snapshot piece");
    produced += size;
    yield new Uint8Array(memory.buffer, window.address, size).slice();
  }
  if (produced !== total) throw new Error("Dolly system snapshot capture failed");
}

// A catalog recipe as this site publishes it, checked against its pin.
async function catalogRecipe(definition) {
  const response = await fetch(new URL(definition.dollyfile, imageBase), { credentials: "same-origin", redirect: "error" });
  const bytes = response.ok ? await response.arrayBuffer() : new ArrayBuffer(0);
  if (await sha256(bytes) !== definition.sha256) throw new Error(`${definition.dollyfile} does not match its pin`);
  return inspectDollyfile(new TextDecoder().decode(bytes), definition.dollyfile);
}

await runImage(async (config, host) => {
  const { image, mode, customSource } = config;
  const definition = imageDefinition(image);
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
  const prepareRecipe = (files, rows) => {
    files.write("/etc/dolly/recipe.locator", locator);
    if (custom) files.write("/etc/dolly/upload.Dollyfile", customSource);
    if (rows !== undefined) files.write("/etc/dolly/recipe.rows", rows);
  };
  // Copies a whole snapshot, a Blob, into the kernel's checked staging range a
  // piece at a time; its size.
  const stageSnapshot = async (kernel, memory, blob) => {
    const range = checkedMemoryRange(memory, kernel.dolly_snapshot_restore_address(BigInt(blob.size)), blob.size);
    for (let offset = 0; offset < range.size; offset += PIECE) {
      const piece = new Uint8Array(await blob.slice(offset, Math.min(offset + PIECE, range.size)).arrayBuffer());
      new Uint8Array(memory.buffer, range.address + offset, piece.length).set(piece);
    }
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
      async restore({ kernel, memory, stage }) {
        stage("loading precompiled userspace snapshot...");
        const size = await stageSnapshot(kernel, memory, artifact.bytes);
        artifact.bytes = undefined;
        return { status: kernel.dolly_bootstrap_snapshot(BigInt(size)) };
      },
    };
  }

  const declared = recipe.hostRequirements;
  const recipeSha256 = custom ? await sha256(encoder.encode(customSource)) : definition.sha256;
  // /bin/dollyfile executes the rows this page's parser compiles.
  const rows = recipeRows(custom ? recipe : await catalogRecipe(definition), recipeSha256);
  const baseReference = custom ? recipe.from : definition.artifacts.find(reference => reference.operation === "from");
  const artifacts = new Map();
  if (config.artifacts !== undefined && (!Array.isArray(config.artifacts) || config.artifacts.length > 256)) {
    throw new Error("invalid build artifacts");
  }
  for (const candidate of config.artifacts ?? []) {
    if (candidate?.buildId !== DOLLY_IMAGE_BUILD_ID || !/^[0-9a-f]{64}$/.test(candidate.recipeSha256) ||
        !(candidate.bytes instanceof Blob)) throw new Error("build artifact integrity mismatch");
    const artifact = await describeImageArtifact(candidate.bytes, candidate.recipeSha256);
    if (artifact.sha256 !== candidate.sha256) throw new Error("build artifact integrity mismatch");
    artifacts.set(candidate.recipeSha256, artifact);
  }
  config.artifacts = undefined;
  // A build runs the engine and its tools with the build host's modules, and
  // the programs of the images it reads with their modules: one the build host
  // does not enable answers ENOSYS.
  host.admit([...declared, ...host.enabled, ...[...artifacts.values()].flatMap(artifact => artifact.hostRequirements)]);
  const inputs = imageInputs([...artifacts.values()]);
  const base = baseReference ? artifacts.get(baseReference.sha256) : null;
  if (baseReference && !base) throw new Error("base image artifact was not provided");
  let seed = null, built = false;
  return {
    name: image,
    async prepare({ files, stage }) {
      // A root build starts from the compiler seed, a snapshot like any image.
      if (!base) {
        stage("loading root compiler seed...");
        // Static hosts may serve the seed as verified parts.
        const url = kernelArtifact("dolly.data");
        seed = await (await decodeStaticAsset(await fetch(url), url, {}, snapshotSizeLimit)).blob();
      }
      prepareRecipe(files, rows);
      for (const artifact of artifacts.values()) {
        const path = `/etc/dolly/artifacts/${artifact.recipeSha256}.snapshot`;
        for (let offset = 0; offset === 0 || offset < artifact.bytes.size; offset += PIECE) {
          const piece = new Uint8Array(await artifact.bytes.slice(offset, offset + PIECE).arrayBuffer());
          if (offset === 0) files.write(path, piece); else files.append(path, piece);
        }
        if (artifact !== base) artifact.bytes = null;
      }
      // The kernel restores a snapshot against the list of its paths.
      const manifest = base?.manifest ?? [...(await scanSnapshotRecords(seed.stream(), () => false)).records.keys()];
      files.write("/etc/dolly/image.manifest", `${manifest.join("\n")}\n`);
    },
    async restore({ kernel, memory, files, stage }) {
      stage("building userspace from the Dollyfile...");
      let status;
      if (base) {
        stage(`loading builder from ${baseReference.location}...`);
        status = kernel.dolly_process_bootstrap_resume_prepare(BigInt(await stageSnapshot(kernel, memory, base.bytes)), 1);
        base.bytes = null;
      } else {
        status = kernel.dolly_process_bootstrap_prepare(BigInt(await stageSnapshot(kernel, memory, seed)));
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
      const total = Number(kernel.dolly_snapshot_capture_begin());
      if (total === 0 || total > snapshotSizeLimit) throw new Error("Dolly system snapshot capture failed");
      const artifact = await describeImageArtifact(capturedPieces(kernel, memory, total), recipeSha256, inputs);
      stage("caching completed image...");
      const saved = await saveImageArtifact(artifact, custom ? `custom:${recipe.image}` : `/${definition.dollyfile}`);
      stage(saved ? "saved completed image artifact" : "image built; local cache unavailable");
      if (config.buildOnly) {
        self.postMessage({ type: "image-built", artifact });
        return { status };
      }
      // The image runs here with its own modules. The page keeps its identity,
      // which a session saved on it names, not its bytes.
      host.require(artifact.hostRequirements);
      host.admit(artifact.hostRequirements);
      const { buildId, sha256: digest, byteLength } = artifact;
      self.postMessage({ type: "image-built", artifact: { buildId, recipeSha256, sha256: digest, byteLength, inputs: artifact.inputs } });
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
