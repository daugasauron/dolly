#!/usr/bin/env node
import {execFileSync} from "node:child_process";
import {readFile,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
const root=resolve(import.meta.dirname, "../..");
const output=process.argv[2]??resolve(root,"dist/static/slopyard/source.tar");
execFileSync(process.execPath,[resolve(root,"scripts/build-source-tar.mjs"),output,
  "demos/slopyard/src","/usr/src/dolly/slopyard"],{cwd:root,stdio:"inherit"});
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
const module=`DOLLY 5
MODULE slopyard

REQUIRES TOOL cc
REQUIRES TOOL tar
REQUIRES TOOL make
REQUIRES TOOL ar
REQUIRES LIB raylib
REQUIRES LIB box3d
REQUIRES LIB dolly-raylib
REQUIRES LIB dolly-js
REQUIRES LIB lua55
REQUIRES HEADER lua55
REQUIRES HEADER gpu
REQUIRES HOST gpu@0
REQUIRES HOST display@0
REQUIRES HOST threads@0
REQUIRES HEADER quickjs
REQUIRES HEADER quickjs-runner

SOURCE https://daugasauron.com/static/slopyard/source.tar ${hash(await readFile(output))} /tmp/slopyard.tar
SLOP tar -xf /tmp/slopyard.tar -C / && rm /tmp/slopyard.tar
SLOP make -f /usr/src/dolly/slopyard/box3d.mk
SLOP cc -std=c17 -O2 -pthread -U__SIZEOF_INT128__ -I/usr/include/lua5.5 /usr/src/dolly/slopyard/main.c /usr/src/dolly/slopyard/data.c /usr/src/dolly/slopyard/pi.c /usr/src/dolly/slopyard/character.c /usr/src/dolly/slopyard/render.c /usr/src/dolly/slopyard/world.c /usr/src/dolly/slopyard/terrain.c /usr/src/dolly/slopyard/magnet.c -ldolly-gpu -llua5.5 -ldolly-js -ldolly-raylib -lraylib -lslopyard-box3d -lm -o /usr/bin/slopyard
SLOP /usr/bin/slopyard --check
SLOP rm -rf /tmp/slopyard-box3d
EXPORTS TOOL slopyard
EXPORTS LIB slopyard-box3d /usr/lib/libslopyard-box3d.a
EXPORTS FOLDER slopyard-source /usr/src/dolly/slopyard
`;
await writeFile(resolve(root,"demos/slopyard/slopyard.dm"),module);
await writeFile(resolve(root,"demos/slopyard/Dollyfile-slopyard"),`DOLLY 5
IMAGE slopyard

FROM https://daugasauron.com/Dollyfile-gamedev-sdk ${hash(await readFile(resolve(root,"demos/slopyard/Dollyfile-gamedev-sdk")))}
COPY FROM https://daugasauron.com/Dollyfile-javascript ${hash(await readFile(resolve(root,"demos/javascript/Dollyfile-javascript")))} /usr/lib/libdolly-js.a /usr/lib/libdolly-js.a
COPY FROM https://daugasauron.com/Dollyfile-javascript ${hash(await readFile(resolve(root,"demos/javascript/Dollyfile-javascript")))} /usr/include/quickjs.h /usr/include/quickjs.h
COPY FROM https://daugasauron.com/Dollyfile-javascript ${hash(await readFile(resolve(root,"demos/javascript/Dollyfile-javascript")))} /usr/include/dolly/quickjs-runner.h /usr/include/dolly/quickjs-runner.h
COPY FROM https://daugasauron.com/Dollyfile-javascript ${hash(await readFile(resolve(root,"demos/javascript/Dollyfile-javascript")))} /usr/lib/dolly/node.js /usr/lib/dolly/node.js
COPY FROM https://daugasauron.com/Dollyfile-javascript ${hash(await readFile(resolve(root,"demos/javascript/Dollyfile-javascript")))} /usr/lib/janis/runtime.js /usr/lib/janis/runtime.js
EXPORTS LIB dolly-js /usr/lib/libdolly-js.a
EXPORTS HEADER quickjs /usr/include/quickjs.h
EXPORTS HEADER quickjs-runner /usr/include/dolly/quickjs-runner.h
USE https://daugasauron.com/modules/pi.dm ${hash(await readFile(resolve(root,"demos/pi/pi.dm")))}
USE https://daugasauron.com/modules/lua55.dm ${hash(await readFile(resolve(root,"demos/slopyard/lua55.dm")))}
USE https://daugasauron.com/modules/slopyard.dm ${hash(module)}

FILE /etc/dolly/slopyard.slop
    /bin/foreground /usr/bin/slopyard
    /bin/foreground -i /bin/slop

ENTRY /bin/foreground -i /bin/slop /etc/dolly/slopyard.slop
`);
