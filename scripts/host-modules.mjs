// Repository paths named by the host module manifests. As a command it prints
// one per line; "client" prints "NAME PATH" rows (libdolly-NAME.a members).
import { copyFile, mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { hostManifests } from "../host/manifests.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
export const hostFiles = field => hostManifests.flatMap(manifest => [manifest[field]].flat()
  .map(path => ({ name: manifest.name, file: relative(root, fileURLToPath(new URL(path, manifest.url))) })));

// Module headers are published at their checkout path and installed as
// /usr/include/dolly/NAME.h.
export const publishedHeaders = new Set(hostFiles("headers").map(({ file }) => `/${file}`));

// A temporary include directory holding every module header as dolly/NAME.h,
// the layout programs compile against (build.sh stages build/include alike).
let staged;
export function stagedIncludeDirectory() {
  return staged ??= (async () => {
    const directory = await mkdtemp(join(tmpdir(), "dolly-include-"));
    await mkdir(join(directory, "dolly"));
    await Promise.all(hostFiles("headers").map(({ file }) =>
      copyFile(join(root, file), join(directory, "dolly", basename(file)))));
    return directory;
  })();
}

// The kernel's module table: every module with kernel sources except the
// runtime, whose sources are the kernel itself, defines dolly_NAME_kernel.
export const kernelModuleList = () => hostManifests.filter(({ name, kernel }) => name !== "runtime" && kernel.length)
  .map(({ name }) => `DOLLY_KERNEL_MODULE(${name})\n`).join("");

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === "kernel-modules") {
  process.stdout.write(`// Generated from the host module manifests.\n${kernelModuleList()}`);
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const field = process.argv[2];
  if (process.argv.length !== 3 || !["host", "contracts", "process", "headers", "kernel", "client"].includes(field)) {
    throw new Error("usage: host-modules.mjs host|contracts|process|headers|kernel|client");
  }
  for (const { name, file } of hostFiles(field)) console.log(field === "client" ? `${name} ${file}` : file);
}
