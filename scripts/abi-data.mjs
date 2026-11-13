// dist/dolly-abi.json: the contracts' numbers for a host written in another
// language. It is the generated modules the browser imports, written as JSON, so
// the two cannot disagree; their sources stay include/dolly/process.h and the
// WAT contracts (scripts/generate-abi-constants.mjs, scripts/dolly-abi.mjs).
// scripts/build.sh writes it once the digests exist.
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { hostManifests } from "../host/manifests.mjs";

const numbers = module => Object.fromEntries(Object.entries(module).filter(([, value]) => typeof value === "number"));
const digest = module => Object.entries(module).find(([name]) => name.endsWith("_ABI_DIGEST"))?.[1];
const imported = path => import(new URL(path, import.meta.url));

export async function abiData() {
  const process = await imported("../page/process-constants.mjs");
  return {
    process: {
      digest: (await imported("../dist/dolly-process-abi.mjs")).DOLLY_PROCESS_ABI_DIGEST,
      constants: numbers(process),
      errno: process.DOLLY_ERRNO,
      sizeof: process.DOLLY_PROCESS_SIZEOF,
      offsetof: process.DOLLY_PROCESS_OFFSETOF,
    },
    kernelPlugin: { digest: (await imported("../dist/dolly-kernel-plugin-abi.mjs")).DOLLY_KERNEL_PLUGIN_ABI_DIGEST },
    host: { constants: numbers(await imported("../host/abi.mjs")) },
    // Each host module's manifest, and the numbers and digest of its contracts where it has any.
    modules: Object.fromEntries(await Promise.all(hostManifests.map(async ({ url, ...manifest }) => {
      const file = new URL("abi.mjs", url), abi = existsSync(file) ? await import(file) : {};
      return [manifest.name, { manifest, constants: numbers(abi), digest: digest(abi) }];
    }))),
  };
}

if (process.argv[1] === import.meta.filename) {
  await writeFile(new URL("../dist/dolly-abi.json", import.meta.url), `${JSON.stringify(await abiData(), null, 2)}\n`);
}
