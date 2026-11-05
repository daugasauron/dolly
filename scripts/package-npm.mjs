#!/usr/bin/env node
// Packages this checkout as npm packages, one directory and one tarball each under OUT:
//   node scripts/package-npm.mjs OUT [VERSION]
// VERSION is the checkout's (package.json) or a prerelease of it, such as 0.1.4-rc.0,
// which npm publishes beside the release without taking its number.
// - @daugasauron/dolly, the runtime: what boot() (src/browser.mjs), the Worker and
//   an image build in the page (src/image-builder.mjs) import, the kernel and the
//   contracts beside them, and the host modules that are the runtime's own machinery.
// - @daugasauron/dolly-host-NAME, one device host module: its directory, which imports
//   nothing outside it (host/README.md). download@0's is dolly-host-save: npm refuses a
//   new name with the word download ("That word is not allowed", 2026-10-30).
// - @daugasauron/dolly-image-NAME and dolly-package-NAME, the directory of an image
//   config/npm-images.txt lists, by its role: its catalog, every image's metadata of
//   its closure, its packs, the recipes the page verifies and its amy-index.txt.
// - @daugasauron/dolly-build, the command that builds an image of one's own in a
//   browser, FROM an installed image package, into a static site (scripts/dolly-build.mjs).
// Each host module and image depends on the runtime alone, at this version, a package
// also on the packages it installs, and dolly-build also on the playwright-core that
// starts its browser; an image does not depend on its host modules, which
// docs/embedding.md names to install.
// A consumer serves the installed packages as they lie, side by side under
// node_modules/@daugasauron/, with cross-origin isolation (README.md, "Embed").
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { discoverImageDefinitions, imageRegistryJson, selectImageDefinitions } from "./image-definitions.mjs";
import { amyIndex, heldPackages, indexSource, plainText } from "./image-directory.mjs";
import { imageDescriptions } from "./image-menu.mjs";
import { siteReference, sitePath } from "../src/static-asset.mjs";
import { hostManifests } from "../host/manifests.mjs";

const projectDir = resolve(import.meta.dirname, "..");
const out = resolve(process.argv[2] ?? "");
if (!process.argv[2]) throw new Error("usage: package-npm.mjs OUT [VERSION]");
const checkout = JSON.parse(await readFile(resolve(projectDir, "package.json"), "utf8")).version;
const version = process.argv[3] ?? checkout;
if (version !== checkout && !version.startsWith(`${checkout}-`)) throw new Error(`VERSION is ${checkout} or a prerelease of it`);
const scope = "@daugasauron";
// The modules that are the runtime's own machinery, and the device modules each
// published on its own: the rest of host/manifests.mjs but build@0, the site's
// image builder, which is not published.
const runtimeModules = ["runtime", "http", "threads", "dso", "stack", "nena", "snapshot", "packages"];
const deviceModules = hostManifests.map(({ name }) => name).filter(name => ![...runtimeModules, "build"].includes(name));
const hostPackage = name => `dolly-host-${name === "download" ? "save" : name}`;

// The files a module graph reaches by relative specifiers: static and literal dynamic
// imports, and the Workers and worklets it starts from new URL("…", import.meta.url),
// but not the site's pages (a URL that ends in /).
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
      if (!specifier.endsWith("/")) pending.push(relative(projectDir, resolve(projectDir, dirname(file), specifier)));
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
  await writeFile(join(directory, "package.json"), `${JSON.stringify({ version, type: "module", ...packageJson,
    repository: { type: "git", url: "git+https://github.com/daugasauron/dolly.git" } }, null, 2)}\n`);
  return execFileSync("npm", ["pack", "--silent", "--pack-destination", out], { cwd: directory, encoding: "utf8" }).trim();
}

const runtimeEntries = ["src/browser.mjs", "src/runtime-worker.mjs", "host/modules.mjs",
  "src/image-builder.mjs", "src/image-build.mjs", "host/http/local-services.mjs"];
for (const name of runtimeModules) {
  const { host } = await manifest(name);
  runtimeEntries.push(`host/${name}/module.json`, `host/${name}/${host}`);
}
// The contracts the runtime reads (process-supervisor.mjs, host/dso/dso.mjs); a
// device module's travel in its own package. coi-serviceworker.js isolates a site
// dolly-build writes where the host sends no isolation headers.
const runtimeFiles = [...await closure(runtimeEntries), "dist/dolly.wasm", "dist/dolly-process-worker.mjs",
  "dist/dolly-process-dso.mjs", "dist/dolly-process-stack.mjs", "LICENSE", "coi-serviceworker.js",
  ...["process-gate", "process", "threads", "dso"].map(name => `dist/dolly-${name}-0.wasm`)];
const tarballs = [await writePackage(join(out, "dolly"), runtimeFiles.map(file => [file, file]), {
  name: `${scope}/dolly`, license: "MIT", exports: { ".": "./src/browser.mjs" },
  description: "Dolly's runtime: a POSIX-like userspace for wasm64 in a browser tab. Run images with boot().",
}, await readFile(resolve(projectDir, "docs/embedding.md"), "utf8"))];

for (const name of deviceModules) {
  const { host } = await manifest(name);
  const files = await closure([`host/${name}/module.json`, `host/${name}/${host}`]);
  const outside = files.filter(file => !file.startsWith(`host/${name}/`));
  if (outside.length) throw new Error(`host/${name} imports outside its directory: ${outside.join(", ")}`);
  tarballs.push(await writePackage(join(out, hostPackage(name)), files.map(file => [file, relative(`host/${name}`, file)]), {
    name: `${scope}/${hostPackage(name)}`, license: "MIT", dependencies: { [`${scope}/dolly`]: version },
    description: `Dolly's ${name}@0 host module: ${(await manifest(name)).gives}.`,
  }, `# ${scope}/${hostPackage(name)}\n\nDolly's \`${name}@0\` host module: ${(await manifest(name)).gives}. Give the URL of its\n\`module.json\` to \`boot()\`'s \`modules\`; ${scope}/dolly's README says how.\n`));
}

// An image's directory, for each image config/npm-images.txt lists: its catalog alone,
// its closure's metadata, its own packs, every recipe the page verifies, and the index
// of the packages it holds (amy-index.txt). An application (dolly-image-NAME) has an
// index.mjs for boot(); a package (dolly-package-NAME) is INSTALLed by a recipe
// dolly-build builds, and depends on the packages its own INSTALL rows name, which
// npm then installs beside it, each with its own packs.
const definitions = await discoverImageDefinitions(projectDir);
const listed = (await readFile(resolve(projectDir, "config/npm-images.txt"), "utf8")).split("\n").filter(Boolean);
const described = await imageDescriptions(projectDir, await selectImageDefinitions(definitions, listed.join(",")));
const packageName = (image, role) => `dolly-${role === "package" ? "package" : "image"}-${image}`;
const licensed = "The image holds programs built inside Dolly from their upstream sources, each under its own\n" +
  "licence: their licence texts are in the image under `/usr/share/licenses` (a Python library's in\n" +
  "its `.dist-info`), and Dolly's `docs/licences.md` lists every upstream\n" +
  "(https://github.com/daugasauron/dolly).\n";
async function writeImageDirectory(image) {
  const closureOfImage = await selectImageDefinitions(definitions, image);
  const registry = await imageRegistryJson(projectDir, closureOfImage);
  const catalog = JSON.parse(registry).images, record = catalog.find(entry => entry.image === image);
  if (!["application", "package"].includes(record.role)) throw new Error(`config/npm-images.txt: ${image} is a ${record.role}`);
  const bootable = record.role === "application", name = packageName(image, record.role), directory = join(out, name);
  const installs = bootable ? [] : closureOfImage.find(definition => definition.image === image).parsed.artifacts
    .filter(({ operation }) => operation === "install").map(({ location }) => catalog.find(entry => siteReference(entry.dollyfile) === location).image);
  const unlisted = installs.filter(needed => !listed.includes(needed));
  if (unlisted.length) throw new Error(`config/npm-images.txt: ${image} installs ${unlisted.join(", ")}, which it does not list`);
  const metadata = JSON.parse(await readFile(resolve(projectDir, `dist/dolly-${image}-system-snapshot.json`), "utf8"));
  const recipes = new Set(closureOfImage.map(definition => definition.filename));
  for (const recipe of record.recipes) recipes.add(sitePath(recipe.sourcePath).slice(1));
  const held = catalog.filter(entry => [...heldPackages(catalog, image), ...bootable ? [] : [image]].includes(entry.image));
  const declared = record.hostRequirements.map(value => value.split("@")[0]);
  await mkdir(join(directory, "dist"), { recursive: true });
  await writeFile(join(directory, "dist/dolly-images.json"), registry);
  await writeFile(join(directory, "amy-index.txt"), amyIndex(held, described));
  if (bootable) {
    await writeFile(join(directory, "index.mjs"), indexSource(image, declared.map(name =>
      runtimeModules.includes(name) ? `../dolly/host/${name}/module.json` : `../${hostPackage(name)}/module.json`)));
  }
  const install = [`${scope}/dolly`, ...bootable ? [] : [`${scope}/dolly-image-pi-minimal`, `${scope}/dolly-build`], `${scope}/${name}`,
    ...declared.filter(name => deviceModules.includes(name)).map(name => `${scope}/${hostPackage(name)}`)].join(" ");
  const description = described.get(image);
  return writePackage(directory, [
    ...closureOfImage.map(definition => `dist/dolly-${definition.image}-system-snapshot.json`),
    ...metadata.packs.map(pack => `dist/packs/${pack.sha256}.snapshot.gz`),
    ...recipes,
  ].map(file => [file, file]), {
    name: `${scope}/${name}`, license: "SEE LICENSE IN README.md", ...bootable ? { exports: { ".": "./index.mjs" } } : {},
    dependencies: Object.fromEntries([`${scope}/dolly`, ...installs.map(needed => `${scope}/${packageName(needed, "package")}`)]
      .map(dependency => [dependency, version])),
    description: `Dolly's ${image} ${record.role}: ${plainText(description)}`,
  }, bootable
    ? `# ${scope}/${name}\n\nDolly's \`${image}\` image, for ${scope}/dolly's \`boot()\`. ${description}\nIt depends on the runtime alone: install it with the runtime and the host modules it\ndeclares, all at version ${version}:\n\n\`\`\`sh\nnpm install ${install}\n\`\`\`\n\n\`\`\`js\nimport { boot } from "./node_modules/${scope}/dolly/src/browser.mjs";\nimport { images, image, modules } from "./node_modules/${scope}/${name}/index.mjs";\nawait boot(document.querySelector("#dolly"), { images, image, modules });\n\`\`\`\n\n` +
      `\`dolly-build\` (${scope}/dolly's README, "Your own image") builds a recipe of your own on it, with this row:\n\n` +
      `\`\`\`text\nFROM ${siteReference(record.dollyfile)} ${record.sha256}\n\`\`\`\n\n${licensed}`
    : `# ${scope}/${name}\n\nDolly's \`${image}\` package, for an image of your own. ${description}\n\`dolly-build init NAME ${image}\` writes a recipe that \`INSTALL\`s it, \`FROM\` \`pi-minimal\`\n(${scope}/dolly's README, "Your own image"); npm installs the packages it installs with it.\nInstall it with the runtime, the base image, the command and the host modules it declares,\nall at version ${version}:\n\n\`\`\`sh\nnpm install ${install}\n\`\`\`\n\n${licensed}`);
}
for (const image of listed) tarballs.push(await writeImageDirectory(image));
// The build command, the scripts it runs and the files init writes, at their checkout
// paths. It finds the runtime and the packages it builds from beside itself, never through
// these copies.
const buildFiles = [...await closure(["scripts/dolly-build.mjs"]), ...(await readdir(resolve(projectDir, "scripts/dolly-build-init"),
  { recursive: true, withFileTypes: true })).filter(entry => entry.isFile())
  .map(entry => relative(projectDir, join(entry.parentPath, entry.name)))];
const built = buildFiles.filter(file => file.startsWith("dist/"));
if (built.length) throw new Error(`dolly-build would carry its own ${built.join(", ")}: read the runtime's`);
const { devDependencies } = JSON.parse(await readFile(resolve(projectDir, "package.json"), "utf8"));
tarballs.push(await writePackage(join(out, "dolly-build"), [...buildFiles, "LICENSE"].map(file => [file, file]), {
  name: `${scope}/dolly-build`, license: "MIT", bin: { "dolly-build": "scripts/dolly-build.mjs" },
  dependencies: { [`${scope}/dolly`]: version, "playwright-core": devDependencies["playwright-core"] },
  description: "Build a Dolly image of your own, FROM an installed image package, in a browser, into a static site.",
}, `# ${scope}/dolly-build\n\nA project with a Dolly image of your own: a Dollyfile \`FROM\` the installed\n\`${scope}/dolly-image-pi-minimal\` with the packages it INSTALLs (\`${scope}/dolly-package-NAME\`)\nand your files, built in a browser into a site that any static host serves as it lies.\n${scope}/dolly's README (\`docs/embedding.md\`) says how.\n\n\`\`\`sh\nnpx dolly-build init my-pi git\nnpx dolly-build Dollyfile-my-pi my-pi\npython3 -m http.server -d my-pi -b 127.0.0.1 8080\n\`\`\`\n`));
console.log(tarballs.map(name => join(out, name)).join("\n"));
