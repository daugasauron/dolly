import {createHash} from "node:crypto";
import {createReadStream} from "node:fs";
import {copyFile, mkdir, readFile, writeFile} from "node:fs/promises";
import {resolve} from "node:path";

const root = resolve(import.meta.dirname, "../..");
const output = resolve(process.argv[2] ?? resolve(root, "dist/static/zero-ad"));
await mkdir(output, {recursive: true});
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
async function digest(path) {
  const result = createHash("sha256");
  for await (const bytes of createReadStream(path)) result.update(bytes);
  return result.digest("hex");
}
const sources = [];
for (const [input, name, destination] of [
  ["pyrogenesis.wasm", "pyrogenesis.wasm", "/opt/0ad/system/pyrogenesis"],
  ["graphics-data.tar", "data.tar", "/tmp/0ad-data.tar"]
]) {
  await copyFile(resolve(root, "build/0ad", input), resolve(output, name));
  sources.push(`SOURCE HOST /static/zero-ad/${name} ${destination} ${await digest(resolve(output, name))}`);
}
const module = `DOLLY 3
MODULE zero-ad

REQUIRES TOOL slop
REQUIRES TOOL tar

# External wasm64 bootstrap; pinned sources and port instructions: docs/sources.md.
${sources.join("\n")}
SLOP tar -xf /tmp/0ad-data.tar -C /opt/0ad && rm /tmp/0ad-data.tar

FILE /usr/bin/zero-ad
    #!/bin/slop
    export ICU_DATA=/opt/0ad/data/icu
    if test "$#" -eq 0; then
      set -- -autostart=skirmishes/temperate_roadway_2p -autostart-civ=1:athen -autostart-civ=2:athen -autostart-ai=2:petra -autostart-aidiff=2:1
    fi
    /opt/0ad/system/pyrogenesis -writableRoot -mod=public -conf=hotkey.exit:Ctrl+F10 "$@"
SLOP /usr/bin/zero-ad -version
EXPORTS TOOL zero-ad
EXPORTS FOLDER zero-ad /opt/0ad
`;
await writeFile(resolve(root, "modules/zero-ad.dm"), module);
await writeFile(resolve(root, "Dollyfile-zero-ad"), `DOLLY 3
IMAGE zero-ad

FROM HOST /Dollyfile ${hash(await readFile(resolve(root, "Dollyfile")))}
USE HOST /modules/zero-ad.dm ${hash(module)}

FILE /home/dolly/.dollyrc
    printf '0 A.D. Release 28 / Dolly baseline\\n'
    printf 'Run zero-ad to play Athens against Petra on Temperate Roadway (2).\\n'
    printf 'Run zero-ad -autostart=scenarios/combat_demo for the combat scenario.\\n'
    printf 'F10 opens the menu; Ctrl-F10 exits; Ctrl-C interrupts. Saves and replays: /opt/0ad/data.\\n\\n'

ENTRY /bin/foreground -i /bin/slop /etc/dolly/init.slop
`);
console.log(`Prepared zero-ad engine/content sources in ${output}`);
