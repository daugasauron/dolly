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
for (const [input, name, destination] of files.map(path => [resolve(content, path), path, `/opt/0ad/${path}`])) {
  await mkdir(dirname(resolve(output, name)), { recursive: true });
  await copyFile(input, resolve(output, name));
  sources.push(`SOURCE https://daugasauron.com/dist/static/zero-ad/${name} ${await digest(resolve(output, name))} ${destination}`);
}
await rm(resolve(output, "data.tar"), { force: true });
const engine = hash(await readFile(resolve(root, "demos/zero-ad/Dollyfile-zero-ad-engine")));
const linked = ["OpenAL", "SDL2", "enet", "fmt", "freetype", "icu", "libogg", "libpng", "libsodium", "libvorbis", "libxml2", "spidermonkey"];
await writeFile(resolve(root, "demos/zero-ad/Dollyfile-zero-ad"), `DOLLY 6
APPLICATION zero-ad
REQUIRES HOST runtime@0
REQUIRES HOST audio@0
REQUIRES HOST display@0
REQUIRES HOST input@0
REQUIRES HOST download@0
REQUIRES HOST gpu@0
REQUIRES HOST http@0
REQUIRES HOST snapshot@0
REQUIRES HOST upload@0

FROM https://daugasauron.com/Dollyfile ${hash(await readFile(resolve(root, "Dollyfile")))}
COPY https://daugasauron.com/demos/zero-ad/Dollyfile-zero-ad-engine ${engine} /opt/0ad/system/pyrogenesis /opt/0ad/system/pyrogenesis
# Licences of the libraries statically linked into the engine.
${linked.map(name => `COPY https://daugasauron.com/demos/zero-ad/Dollyfile-zero-ad-engine ${engine} /usr/share/licenses/${name} /usr/share/licenses/${name}`).join("\n")}
# Game content and configuration; the engine comes from zero-ad-engine.
${sources.join("\n")}

FILE /usr/bin/zero-ad
    #!/bin/slop
    export ICU_DATA=/opt/0ad/data/icu
    /opt/0ad/system/pyrogenesis -writableRoot -mod=public -conf=hotkey.exit:Ctrl+F10 "$@"
SLOP /usr/bin/zero-ad -version
EXPORTS TOOL zero-ad
EXPORTS FOLDER zero-ad /opt/0ad

FILE /etc/dolly/zero-ad.slop
    /bin/foreground /usr/bin/zero-ad
    /bin/foreground -i /bin/slop

ENTRY /bin/foreground -i /bin/slop /etc/dolly/zero-ad.slop
`);
console.log(`Prepared zero-ad engine/content sources in ${output}`);
