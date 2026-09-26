#!/usr/bin/env node
import {execFileSync} from "node:child_process";
import {readFile,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
const root=resolve(import.meta.dirname,"..");
const output=process.argv[2]??resolve(root,"dist/static/blockwalker/source.tar");
execFileSync(process.execPath,[resolve(root,"scripts/build-source-tar.mjs"),output,
  "src/blockwalker","/usr/src/dolly/blockwalker"],{cwd:root,stdio:"inherit"});
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
const module=`DOLLY 4
MODULE blockwalker

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

SOURCE HOST /static/blockwalker/source.tar /tmp/blockwalker.tar ${hash(await readFile(output))}
SLOP tar -xf /tmp/blockwalker.tar -C / && rm /tmp/blockwalker.tar
SLOP make -f /usr/src/dolly/blockwalker/box3d.mk
SLOP cc -std=c17 -O2 -pthread -U__SIZEOF_INT128__ -I/usr/include/lua5.5 /usr/src/dolly/blockwalker/main.c /usr/src/dolly/blockwalker/data.c /usr/src/dolly/blockwalker/pi.c /usr/src/dolly/blockwalker/character.c /usr/src/dolly/blockwalker/render.c /usr/src/dolly/blockwalker/world.c /usr/src/dolly/blockwalker/terrain.c /usr/src/dolly/blockwalker/magnet.c -ldolly-gpu -llua5.5 -ldolly-js -ldolly-raylib -lraylib -lblockwalker-box3d -lm -o /usr/bin/blockwalker
SLOP /usr/bin/blockwalker --check
SLOP rm -rf /tmp/blockwalker-box3d
EXPORTS TOOL blockwalker
EXPORTS LIB blockwalker-box3d /usr/lib/libblockwalker-box3d.a
EXPORTS FOLDER blockwalker-source /usr/src/dolly/blockwalker
`;
await writeFile(resolve(root,"modules/blockwalker.dm"),module);
await writeFile(resolve(root,"Dollyfile-blockwalker"),`DOLLY 4
IMAGE blockwalker

FROM HOST /Dollyfile-gamedev-sdk ${hash(await readFile(resolve(root,"Dollyfile-gamedev-sdk")))}
COPY FROM HOST /Dollyfile-javascript ${hash(await readFile(resolve(root,"Dollyfile-javascript")))} /usr/lib/libdolly-js.a /usr/lib/libdolly-js.a
COPY FROM HOST /Dollyfile-javascript ${hash(await readFile(resolve(root,"Dollyfile-javascript")))} /usr/include/quickjs.h /usr/include/quickjs.h
COPY FROM HOST /Dollyfile-javascript ${hash(await readFile(resolve(root,"Dollyfile-javascript")))} /usr/include/dolly/quickjs-runner.h /usr/include/dolly/quickjs-runner.h
COPY FROM HOST /Dollyfile-javascript ${hash(await readFile(resolve(root,"Dollyfile-javascript")))} /usr/lib/dolly/node.js /usr/lib/dolly/node.js
COPY FROM HOST /Dollyfile-javascript ${hash(await readFile(resolve(root,"Dollyfile-javascript")))} /usr/lib/janis/runtime.js /usr/lib/janis/runtime.js
EXPORTS LIB dolly-js /usr/lib/libdolly-js.a
EXPORTS HEADER quickjs /usr/include/quickjs.h
EXPORTS HEADER quickjs-runner /usr/include/dolly/quickjs-runner.h
USE HOST /modules/pi.dm ${hash(await readFile(resolve(root,"modules/pi.dm")))}
USE HOST /modules/lua55.dm ${hash(await readFile(resolve(root,"modules/lua55.dm")))}
USE HOST /modules/blockwalker.dm ${hash(module)}

FILE /etc/dolly/blockwalker.slop
    /bin/foreground /usr/bin/blockwalker
    /bin/foreground -i /bin/slop

ENTRY /bin/foreground -i /bin/slop /etc/dolly/blockwalker.slop
`);
