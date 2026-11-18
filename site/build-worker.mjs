// The site's runtime Worker (worker-image.mjs): it builds an image from its
// recipe, from the base image or the engine package the page hands it or from
// the compiler seed, caches it and runs it, telling the page its identity, or,
// for the image builder, hands the page the cached artifact (buildOnly); or it
// restores a custom image the site built before. Images cross to and from Wasm
// memory a piece at a time: the page holds them as Blobs, never in a JS heap.
import { DOLLY_IMAGE_BUILD_ID } from "../page/generated.mjs";
import { DOLLY_STATIC_SOURCES, imageBase, imageDefinition } from "../page/images.mjs";
import { scanSnapshotRecords, MAX_SNAPSHOT_BYTES as snapshotSizeLimit } from "../page/snapshot-records.mjs";
import { describeImageArtifact, saveImageArtifact, sha256 } from "./image-artifact.mjs";
import { imageInputs } from "../page/image-inputs.mjs";
import { imageFileName, inspectDollyfile, MAX_DOLLYFILE_BYTES, recipeFileName, recipeRows } from "./dollyfile-view.mjs";
import { checkedCustomArtifact } from "./custom-image.mjs";
import { boundedAssetBlob, siteReference, sitePath, decodeStaticAsset } from "../page/static-asset.mjs";
import { checkedMemoryRange, kernelArtifact, runImage } from "../page/worker-image.mjs";

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

// A catalog recipe as this site publishes it, checked against its pin: its
// text and its parse.
async function catalogRecipe(definition) {
  const response = await fetch(new URL(definition.dollyfile, imageBase), { credentials: "same-origin", redirect: "error" });
  const bytes = response.ok ? await response.arrayBuffer() : new ArrayBuffer(0);
  if (await sha256(bytes) !== definition.sha256) throw new Error(`${definition.dollyfile} does not match its pin`);
  const text = new TextDecoder().decode(bytes);
  return { text, recipe: inspectDollyfile(text, definition.dollyfile) };
}

// An external URL, fetched by the page under its HTTP policy (page/network.mjs
// fetch): a Blob.
const pageFetches = new Map();
let pageFetchCount = 0;
self.addEventListener("message", ({ data }) => {
  if (data?.type !== "network-fetched" || !pageFetches.has(data.id)) return;
  const { resolve, reject } = pageFetches.get(data.id);
  pageFetches.delete(data.id);
  if (data.bytes instanceof Blob) resolve(data.bytes); else reject(new Error(data.error));
});
const pageFetch = url => new Promise((resolve, reject) => {
  pageFetches.set(++pageFetchCount, { resolve, reject });
  // At most what the engine takes of a SOURCE (dollyfile.c, MAX_SOURCE_BYTES).
  self.postMessage({ type: "network-fetch", url, limit: 2 ** 30, id: pageFetchCount });
});

// The file a SOURCE row names, as the engine reads it (/etc/dolly/sources/SHA256,
// whose digest it checks): a site path is the file this directory publishes, an
// external URL what the page's policy admits. Null, said, for one neither gives.
async function sourceFile({ location, line }, stage) {
  try {
    if (!location.startsWith("/")) return await pageFetch(location);
    const path = sitePath(location), published = DOLLY_STATIC_SOURCES.find(source => source.path === path);
    if (!published) throw new Error("not a file this image directory publishes");
    const url = new URL(path.slice(1), imageBase), init = { credentials: "same-origin", redirect: "error" };
    const response = await decodeStaticAsset(await fetch(url, init), url, init, published.byteLength);
    return await boundedAssetBlob(response, published.byteLength);
  } catch (error) {
    stage(`SOURCE ${location} (line ${line}): ${error.message}`);
    return null;
  }
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
  // A build's root recipe: its text (a catalog recipe's at /etc/dolly/recipe.Dollyfile,
  // which the engine reads for a site path) and its rows.
  const prepareRecipe = (files, rows, text) => {
    files.write("/etc/dolly/recipe.locator", locator);
    if (custom) files.write("/etc/dolly/upload.Dollyfile", customSource);
    else if (text !== undefined) files.write("/etc/dolly/recipe.Dollyfile", text);
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
    // A saved session is the whole filesystem: it needs the recipe, not the image.
    const artifact = config.customArtifact === undefined ? null : await checkedCustomArtifact(customSource, config.customArtifact);
    config.customArtifact = undefined;
    const hosts = artifact?.hostRequirements ?? recipe.hostRequirements;
    host.require(hosts);
    await host.admit(hosts);
    return {
      name: image,
      prepare({ files }) {
        prepareRecipe(files);
        if (artifact) files.write("/etc/dolly/image.manifest", `${artifact.manifest.join("\n")}\n`);
      },
      async restore({ kernel, memory, stage }) {
        if (await host.restoreFilesystem({ kernel, memory, stage })) return { status: 0 };
        if (!artifact) throw new Error("invalid Dolly image selection");
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
  const root = custom ? { text: customSource, recipe } : await catalogRecipe(definition);
  const rows = recipeRows(root.recipe, recipeSha256);
  const baseReference = custom ? recipe.from : definition.artifacts.find(reference => reference.operation === "from");
  // A root build that installs the recipe engine's package starts from that package's
  // /bin/dollyfile, as a FROM build starts from its base's; any other from the compiler seed.
  const engineReference = baseReference ? null : (custom ? recipe : definition).artifacts.find(reference =>
    reference.operation === "install" && imageFileName(recipeFileName(reference.location)) === "dollyfile");
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
  await host.admit([...declared, ...host.enabled, ...[...artifacts.values()].flatMap(artifact => artifact.hostRequirements)]);
  const inputs = imageInputs([...artifacts.values()]);
  const base = baseReference ? artifacts.get(baseReference.sha256) : null;
  if (baseReference && !base) throw new Error("base image artifact was not provided");
  const engine = engineReference ? artifacts.get(engineReference.sha256) : null;
  if (engineReference && !engine) throw new Error("dollyfile package artifact was not provided");
  const builder = base ?? engine, builderReference = baseReference ?? engineReference;
  let seed = null, built = false, sources;
  return {
    name: image,
    async prepare({ files, stage }) {
      // A root build without the engine starts from the compiler seed, a snapshot like any image.
      if (!builder) {
        stage("loading root compiler seed...");
        // Static hosts may serve the seed as verified parts.
        const url = kernelArtifact("dolly.data");
        seed = await (await decodeStaticAsset(await fetch(url), url, {}, snapshotSizeLimit)).blob();
      }
      prepareRecipe(files, rows, custom ? undefined : root.text);
      // The engine reads each input from its Blob as it restores it: the kernel
      // never holds an input's snapshot. Each SOURCE file is an input too.
      sources = new Map();
      for (const row of root.recipe.sources) {
        if (sources.has(row.sha256)) continue;
        const file = await sourceFile(row, stage);
        if (file) sources.set(row.sha256, file);
      }
      host.kernel.setBuildInputs([...[...artifacts.values()].map(artifact => artifact.bytes), ...sources.values()]);
      [...artifacts.values()].forEach((artifact, input) =>
        files.input(`/etc/dolly/artifacts/${artifact.recipeSha256}.snapshot`, input, artifact.bytes.size));
      [...sources].forEach(([digest, file], index) => files.input(`/etc/dolly/sources/${digest}`, artifacts.size + index, file.size));
      // The kernel restores a snapshot against the list of its paths.
      const manifest = builder?.manifest ?? [...(await scanSnapshotRecords(seed.stream(), () => false)).records.keys()];
      files.write("/etc/dolly/image.manifest", `${manifest.join("\n")}\n`);
    },
    async restore({ kernel, memory, files, stage }) {
      stage("building userspace from the Dollyfile...");
      let status;
      if (builder) {
        stage(`loading builder from ${builderReference.location}...`);
        status = kernel.dolly_process_bootstrap_resume_prepare(BigInt(await stageSnapshot(kernel, memory, builder.bytes)));
      } else {
        status = kernel.dolly_process_bootstrap_prepare(BigInt(await stageSnapshot(kernel, memory, seed)));
        seed = null;
      }
      let supervisor;
      if (status === 0) {
        supervisor = await host.kernel.supervisor(kernel);
        status = (await supervisor.spawn(builder ? ["/bin/dollyfile", locator] : ["/usr/libexec/dolly/process-bin/bootstrap"])).status;
      }
      for (const artifact of artifacts.values()) files.remove(`/etc/dolly/artifacts/${artifact.recipeSha256}.snapshot`);
      for (const digest of sources.keys()) files.remove(`/etc/dolly/sources/${digest}`);
      artifacts.clear();
      sources.clear();
      host.kernel.setBuildInputs([]);
      if (status !== 0) return { status };
      // Kernel memory never shrinks: its size now is the build's high-water mark.
      stage(`capturing userspace image (kernel memory ${Math.round(memory.buffer.byteLength / 2 ** 20)} MiB)...`);
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
      await host.admit(artifact.hostRequirements);
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
