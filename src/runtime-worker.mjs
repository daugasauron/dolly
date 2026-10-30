// The runtime Worker boot() starts: it restores an image of the image directory
// from its packs into a new kernel and runs its ENTRY (worker-image.mjs).
import { DOLLY_IMAGES } from "./images.mjs";
import { loadPackagedSnapshotMetadata, streamPackagedSystemSnapshot } from "./packaged-snapshot.mjs";
import { siteReference, hex } from "./static-asset.mjs";
import { checkedMemoryRange, runImage } from "./worker-image.mjs";

await runImage(async ({ image, mode, files: given = {} }, host) => {
  const definition = DOLLY_IMAGES.find(candidate => candidate.image === image);
  if (!definition || mode !== "snapshot") throw new Error("invalid Dolly image selection");
  const metadata = await loadPackagedSnapshotMetadata(image);
  const declared = metadata.hostRequirements ?? definition.hostRequirements ?? [];
  host.require(declared);
  host.admit(declared);
  return {
    name: image,
    prepare({ files }) {
      files.write("/etc/dolly/recipe.locator", siteReference(definition.dollyfile));
      // The kernel restores a snapshot against the list of its paths.
      files.write("/etc/dolly/image.manifest", `${metadata.manifest.join("\n")}\n`);
    },
    async restore({ kernel, memory, files, stage }) {
      stage("loading precompiled userspace snapshot...");
      const capacity = 1024 * 1024;
      const address = kernel.dolly_snapshot_restore_address(BigInt(capacity));
      const staging = () => {
        const range = checkedMemoryRange(memory, address, capacity);
        return new Uint8Array(memory.buffer, range.address, range.size);
      };
      staging().set(Uint8Array.from(metadata.sha256.match(/../g), byte => parseInt(byte, 16)));
      if (kernel.dolly_bootstrap_snapshot_begin(BigInt(metadata.byteLength)) !== 0)
        throw new Error("Dolly snapshot stream initialization failed");
      let loaded = 0, reported = 0;
      await streamPackagedSystemSnapshot(image, metadata, bytes => {
        for (let offset = 0; offset < bytes.length; offset += capacity) {
          const chunk = bytes.subarray(offset, offset + capacity);
          staging().set(chunk);
          if (kernel.dolly_snapshot_stream_write(BigInt(chunk.length), 0) !== 0)
            throw new Error("Dolly rejected a snapshot stream record");
        }
        loaded += bytes.length;
        if (performance.now() - reported >= 1000) {
          const mib = 1024 * 1024;
          stage(`loading userspace: ${Math.min(Math.floor(loaded / mib), Math.ceil(metadata.byteLength / mib))} / ${Math.ceil(metadata.byteLength / mib)} MiB`);
          reported = performance.now();
        }
      }, () => {
        if (kernel.dolly_snapshot_stream_write(0n, 1) !== 0)
          throw new Error("Dolly rejected an incomplete snapshot part");
        return hex(staging().subarray(0, 32));
      });
      const status = kernel.dolly_bootstrap_snapshot_end();
      // The embedding's files (boot's `files`) lie over the image's.
      if (status === 0) for (const [path, contents] of Object.entries(given)) files.write(path, contents);
      return { status };
    },
  };
});
