#!/usr/bin/env node
// Packages this checkout as npm packages, one directory and one tarball each under OUT:
//   node scripts/package-npm.mjs OUT
// - @daugasauron/dolly, the runtime: what boot() (src/browser.mjs) and the Worker
//   import, the kernel and the contracts beside them, and the host modules that are
//   the runtime's own machinery.
// - @daugasauron/dolly-NAME, one device host module: its directory, which imports
//   nothing outside it (host/README.md).
// - @daugasauron/dolly-default, the default image's directory for boot's `images`:
//   its catalog, every image's metadata of its closure, its packs and the recipes
//   the page verifies.
// A consumer serves the installed packages as they lie, side by side under
// node_modules/@daugasauron/, with cross-origin isolation (README.md, "Embed").
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { discoverImageDefinitions, imageRegistrySource, selectImageDefinitions } from "./image-definitions.mjs";
import { sitePath } from "../src/static-asset.mjs";

const projectDir = resolve(import.meta.dirname, "..");
const out = resolve(process.argv[2] ?? "");
if (!process.argv[2]) throw new Error("usage: package-npm.mjs OUT");
const { version } = JSON.parse(await readFile(resolve(projectDir, "package.json"), "utf8"));
const scope = "@daugasauron";
// The modules that are the runtime's own machinery, and the device modules each
// published on its own. build@0 is the site's image builder and is not published.
const runtimeModules = ["runtime", "http", "threads", "dso", "nena", "snapshot", "packages"];
const deviceModules = ["display", "input", "gpu", "audio", "microphone", "buttons", "download", "upload", "sockets", "pty"];

// The files a module graph reaches by relative specifiers: static and literal dynamic
// imports, and the Workers and worklets it starts from new URL("…", import.meta.url).
const specifiers = [/\bfrom\s+"(\.{1,2}\/[^"]+)"/g, /\bimport\s+"(\.{1,2}\/[^"]+)"/g,
  /\bimport\(\s*"(\.{1,2}\/[^"]+)"\s*\)/g, /new URL\(\s*"(\.{1,2}\/[^"]+)"\s*,\s*import\.meta\.url\s*\)/g];
async function closure(entries) {
  const seen = new Set(), pending = [...entries];
  while (pending.length) {
    const file = pending.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    if (!/\.m?js$/.test(file)) continue;
    const text = await readFile(resolve(projectDir, file), "utf8");
    for (const pattern of specifiers) for (const [, specifier] of text.matchAll(pattern)) {
      pending.push(relative(projectDir, resolve(projectDir, dirname(file), specifier)));
    }
  }
  return [...seen].sort();
}
const manifest = async name => JSON.parse(await readFile(resolve(projectDir, `host/${name}/module.json`), "utf8"));

async function writePackage(directory, files, packageJson, readme) {
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "README.md"), readme);
  for (const [from, to] of files) {
    await mkdir(dirname(join(directory, to)), { recursive: true });
    await copyFile(resolve(projectDir, from), join(directory, to));
  }
  await writeFile(join(directory, "package.json"), `${JSON.stringify({ version, type: "module", ...packageJson }, null, 2)}\n`);
  return execFileSync("npm", ["pack", "--silent", "--pack-destination", out], { cwd: directory, encoding: "utf8" }).trim();
}

const runtimeEntries = ["src/browser.mjs", "src/runtime-worker.mjs", "host/modules.mjs"];
for (const name of runtimeModules) {
  const { host } = await manifest(name);
  runtimeEntries.push(`host/${name}/module.json`, `host/${name}/${host}`);
}
const runtimeFiles = [...await closure(runtimeEntries), "dist/dolly.wasm", "dist/dolly-process-worker.mjs",
  "dist/dolly-process-dso.mjs", "LICENSE",
  ...(await readdir(resolve(projectDir, "dist"))).filter(name => /^dolly-[a-z-]+-0\.wasm$/.test(name)).map(name => `dist/${name}`)];
const tarballs = [await writePackage(join(out, "dolly"), runtimeFiles.map(file => [file, file]), {
  name: `${scope}/dolly`, license: "MIT", exports: { ".": "./src/browser.mjs" },
  description: "Dolly's runtime: a POSIX-like userspace for wasm64 in a browser tab. Run images with boot().",
}, await readFile(resolve(projectDir, "docs/embedding.md"), "utf8"))];

for (const name of deviceModules) {
  const { host } = await manifest(name);
  const files = await closure([`host/${name}/module.json`, `host/${name}/${host}`]);
  const outside = files.filter(file => !file.startsWith(`host/${name}/`));
  if (outside.length) throw new Error(`host/${name} imports outside its directory: ${outside.join(", ")}`);
  tarballs.push(await writePackage(join(out, `dolly-${name}`), files.map(file => [file, relative(`host/${name}`, file)]), {
    name: `${scope}/dolly-${name}`, license: "MIT", peerDependencies: { [`${scope}/dolly`]: version },
    description: `Dolly's ${name}@0 host module: ${(await manifest(name)).gives}.`,
  }, `# ${scope}/dolly-${name}\n\nDolly's \`${name}@0\` host module: ${(await manifest(name)).gives}. Give the URL of its\n\`module.json\` to \`boot()\`'s \`modules\`; ${scope}/dolly's README says how.\n`));
}

// The default image's directory: its catalog alone, its closure's metadata, its own
// packs (a booted image reads only its own) and every recipe the page verifies.
const definitions = await discoverImageDefinitions(projectDir);
const closureOfDefault = await selectImageDefinitions(definitions, "default");
const registry = await imageRegistrySource(projectDir, closureOfDefault);
const { DOLLY_SYSTEM_SNAPSHOT: metadata } = await import(resolve(projectDir, "dist/dolly-default-system-snapshot.mjs"));
const { DOLLY_IMAGES } = await import(`data:text/javascript,${encodeURIComponent(registry)}`);
const recipes = new Set(closureOfDefault.map(definition => definition.filename));
for (const record of DOLLY_IMAGES.find(image => image.image === "default").recipes) recipes.add(sitePath(record.sourcePath).slice(1));
const declared = DOLLY_IMAGES.find(image => image.image === "default").hostRequirements.map(value => value.split("@")[0]);
const imageDirectory = join(out, "dolly-default");
await mkdir(join(imageDirectory, "dist"), { recursive: true });
await writeFile(join(imageDirectory, "dist/dolly-images.mjs"), registry);
await writeFile(join(imageDirectory, "index.mjs"), `// The default image for boot(): its directory, and the manifests of the host modules it
// declares, from the packages installed beside this one.
export const images = new URL("./", import.meta.url).href;
export const image = "default";
export const modules = ${JSON.stringify(declared.map(name =>
    runtimeModules.includes(name) ? `../dolly/host/${name}/module.json` : `../dolly-${name}/module.json`))}
  .map(path => new URL(path, import.meta.url).href);
`);
tarballs.push(await writePackage(imageDirectory, [
  ...closureOfDefault.map(({ image }) => `dist/dolly-${image}-system-snapshot.mjs`),
  ...metadata.packs.map(pack => `dist/packs/${pack.sha256}.snapshot.gz`),
  ...recipes,
].map(file => [file, file]), {
  name: `${scope}/dolly-default`, license: "SEE LICENSE IN README.md", exports: { ".": "./index.mjs" },
  description: "Dolly's default image: a shell, its text tools, Ghostty's terminal, curl, amy and nena.",
  peerDependencies: Object.fromEntries([`${scope}/dolly`, ...declared.filter(name => deviceModules.includes(name))
    .map(name => `${scope}/dolly-${name}`)].map(name => [name, version])),
}, `# ${scope}/dolly-default\n\nDolly's \`default\` image: a shell, its text tools, Ghostty's terminal, curl, \`amy\`, \`nena\`\nand \`ps\`, for ${scope}/dolly's \`boot()\`:\n\n\`\`\`js\nimport { boot } from "./node_modules/${scope}/dolly/src/browser.mjs";\nimport { images, image, modules } from "./node_modules/${scope}/dolly-default/index.mjs";\nawait boot(document.querySelector("#dolly"), { images, image, modules });\n\`\`\`\n\nThe image holds programs built inside Dolly from their upstream sources, each under its own\nlicence: their licence texts are in the image under \`/usr/share/licenses\`, and Dolly's\n\`docs/licences.md\` lists every upstream (https://github.com/daugasauron/dolly).\n`));
console.log(tarballs.map(name => join(out, name)).join("\n"));
