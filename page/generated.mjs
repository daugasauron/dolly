// The modules the runtime's build writes beside it (scripts/build.sh): its identities and
// the digests and imports of the contracts it was built against. The page, its Workers
// and the host modules import them from here alone; an image directory's catalog is
// data, which images.mjs loads.
export { DOLLY_BUILD_ID } from "../dist/dolly-build-id.mjs";
export { DOLLY_IMAGE_BUILD_ID } from "../dist/dolly-image-build-id.mjs";
export { DOLLY_PROCESS_ABI_DIGEST } from "../dist/dolly-process-abi.mjs";
export { DOLLY_KERNEL_PLUGIN_ABI_DIGEST, DOLLY_KERNEL_PLUGIN_IMPORTS } from "../dist/dolly-kernel-plugin-abi.mjs";
