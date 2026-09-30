import {createHash} from "node:crypto";
import {createReadStream} from "node:fs";
import {copyFile, mkdir, readFile, readdir, rm, writeFile} from "node:fs/promises";
import {dirname, resolve} from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const output = resolve(process.argv[2] ?? resolve(root, "dist/static/zero-ad"));
await mkdir(output, {recursive: true});
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
async function digest(path) {
  const result = createHash("sha256");
  for await (const bytes of createReadStream(path)) result.update(bytes);
  return result.digest("hex");
}
const sources = [];
const content = resolve(root, "build/0ad/graphics");
const files = (await readdir(content, { recursive: true, withFileTypes: true }))
  .filter(entry => entry.isFile()).map(entry => resolve(entry.parentPath, entry.name).slice(content.length + 1)).sort();
for (const [input, name, destination] of [
  [resolve(root, "build/0ad/pyrogenesis.wasm"), "pyrogenesis.wasm", "/opt/0ad/system/pyrogenesis"],
  ...files.map(path => [resolve(content, path), path, `/opt/0ad/${path}`])
]) {
  await mkdir(dirname(resolve(output, name)), { recursive: true });
  await copyFile(input, resolve(output, name));
  sources.push(`SOURCE HOST /static/zero-ad/${name} ${destination} ${await digest(resolve(output, name))}`);
}
await rm(resolve(output, "data.tar"), { force: true });
const module = `DOLLY 4
MODULE zero-ad

REQUIRES HOST audio@0
REQUIRES HOST gpu@0
REQUIRES HOST display@0
REQUIRES HOST http@0

REQUIRES TOOL slop

# External wasm64 bootstrap; pinned sources and port instructions: docs/sources.md.
${sources.join("\n")}

FILE /usr/bin/zero-ad
    #!/bin/slop
    export ICU_DATA=/opt/0ad/data/icu
    /opt/0ad/system/pyrogenesis -writableRoot -mod=public -conf=hotkey.exit:Ctrl+F10 "$@"
SLOP /usr/bin/zero-ad -version
EXPORTS TOOL zero-ad
EXPORTS FOLDER zero-ad /opt/0ad
`;
await writeFile(resolve(root, "demos/zero-ad/zero-ad.dm"), module);
await writeFile(resolve(root, "demos/zero-ad/Dollyfile-zero-ad"), `DOLLY 4
IMAGE zero-ad

FROM HOST /Dollyfile ${hash(await readFile(resolve(root, "Dollyfile")))}
USE HOST /modules/zero-ad.dm ${hash(module)}

FILE /etc/dolly/zero-ad.slop
    /bin/foreground /usr/bin/zero-ad
    /bin/foreground -i /bin/slop

ENTRY /bin/foreground -i /bin/slop /etc/dolly/zero-ad.slop
`);
console.log(`Prepared zero-ad engine/content sources in ${output}`);
