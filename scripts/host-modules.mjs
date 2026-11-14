// Repository paths named by the host module manifests. As a command it prints
// one per line; "client" prints "NAME PATH" rows (libdolly-NAME.a members).
import { copyFile, mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { hostManifests } from "../host/manifests.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
export const hostFiles = field => hostManifests.flatMap(manifest => [manifest[field] ?? []].flat()
  .map(path => ({ name: manifest.name, file: relative(root, fileURLToPath(new URL(path, manifest.url))) })));

// Module headers, clients and tools are published at their checkout path;
// headers are installed as /usr/include/dolly/NAME.h, by the seed or a package.
export const publishedHostFiles = new Set([...hostFiles("headers"), ...hostFiles("client"), ...hostFiles("tools")]
  .map(({ file }) => `/${file}`));

// The platform's documents and machine contracts are published at their
// checkout path as well (package-documentation.mjs) and installed under
// /usr/share/doc/dolly/ by the docs package (Dollyfile-dolly-docs).
export const publishedDocument = path =>
  /^\/(?:docs\/[a-z-]+\.md|(?:abi|host)\/README\.md|abi\/[a-z0-9-]+\.wat|host\/[a-z]+\/[a-z0-9-]+\.wat)$/.test(path);

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

// The kernel's module table: every module with kernel sources defines
// dolly_NAME_kernel, except the runtime, whose sources are the kernel itself.
const kernelModuleList = () => hostManifests.filter(({ provides, kernel }) => provides !== "kernel" && kernel.length)
  .map(({ name }) => `DOLLY_KERNEL_MODULE(${name})\n`).join("");

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === "kernel-modules") {
  process.stdout.write(`// Generated from the host module manifests.\n${kernelModuleList()}`);
} else if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === "packaged") {
  for (const { name, package: image } of hostManifests) if (image) console.log(name);
} else if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === "exports") {
  // What cc exports from a program built with -OPTION (rdynamic, pthread), one symbol a line.
  for (const { ccExports } of hostManifests) for (const symbol of ccExports?.[process.argv[3]] ?? []) console.log(symbol);
} else if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === "links") {
  // What cc links into every program: each client but those a program asks for.
  for (const { name, client, requested } of hostManifests) if (client.length && !requested) console.log(`-ldolly-${name}`);
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const field = process.argv[2];
  if (process.argv.length !== 3 || !["contracts", "process", "headers", "kernel", "client", "seed", "fixtures"].includes(field)) {
    throw new Error("usage: host-modules.mjs contracts|process|headers|kernel|client|seed|fixtures|packaged|exports OPTION|links");
  }
  for (const { name, file } of hostFiles(field)) console.log(field === "client" ? `${name} ${file}` : file);
}
