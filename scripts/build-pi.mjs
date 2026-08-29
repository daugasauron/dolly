import { copyFile, mkdir, readFile } from "node:fs/promises";
import { build } from "esbuild";

const expectedPiVersion = process.env.DOLLY_PI_VERSION;
const expectedEsbuildVersion = process.env.DOLLY_ESBUILD_VERSION;
if (!expectedPiVersion || !expectedEsbuildVersion) {
  throw new Error("Dolly Pi/esbuild source pins were not supplied");
}

async function packageVersion(name) {
  const packageFile = new URL(`../node_modules/${name}/package.json`, import.meta.url);
  return JSON.parse(await readFile(packageFile, "utf8")).version;
}

for (const name of [
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-ai",
  "@earendil-works/pi-coding-agent",
]) {
  const version = await packageVersion(name);
  if (version !== expectedPiVersion) {
    throw new Error(`${name} ${version} does not match pinned Pi ${expectedPiVersion}`);
  }
}
const esbuildVersion = await packageVersion("esbuild");
if (esbuildVersion !== expectedEsbuildVersion) {
  throw new Error(
    `esbuild ${esbuildVersion} does not match pin ${expectedEsbuildVersion}`,
  );
}

const generatedDirectory = new URL("../build/generated/", import.meta.url);
const generatedMetadataDirectory = new URL("pi-metadata/", generatedDirectory);
await mkdir(generatedMetadataDirectory, { recursive: true });
await build({
  entryPoints: [new URL("../src/runtimes/pi-dolly.js", import.meta.url).pathname],
  outfile: new URL("../build/generated/pi.js", import.meta.url).pathname,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2023",
  treeShaking: true,
  legalComments: "eof",
  banner: {
    js: `// Pi ${expectedPiVersion}, Dolly compatibility entry. Generated from pinned package JavaScript.`,
  },
});

// Emscripten's preload syntax is `source@destination`; a scoped npm path has
// an `@` in the source name and is therefore ambiguous. Stage just the two
// metadata files under a scope-free path before handing them to the packager.
const codingAgentDirectory = new URL(
  "../node_modules/@earendil-works/pi-coding-agent/",
  import.meta.url,
);
await Promise.all([
  copyFile(
    new URL("package.json", codingAgentDirectory),
    new URL("package.json", generatedMetadataDirectory),
  ),
  copyFile(
    new URL("README.md", codingAgentDirectory),
    new URL("README.md", generatedMetadataDirectory),
  ),
]);
