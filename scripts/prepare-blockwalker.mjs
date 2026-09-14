#!/usr/bin/env node
import {execFileSync} from "node:child_process";
import {readFile,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
const root=resolve(import.meta.dirname,"..");
const output=process.argv[2]??resolve(root,"dist/static/blockwalker/source.tar");
execFileSync(process.execPath,[resolve(root,"scripts/build-source-tar.mjs"),output,
  "src/blockwalker","/usr/src/dolly/blockwalker",
  "src/gpu/client.c","/usr/src/dolly/blockwalker/gpu-client.c",
  "include/dolly/gpu.h","/usr/include/dolly/gpu.h",
  "include/dolly/gpu-abi.h","/usr/include/dolly/gpu-abi.h"],{cwd:root,stdio:"inherit"});
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
const module=`DOLLY 3
MODULE blockwalker

REQUIRES TOOL cc
REQUIRES TOOL tar
REQUIRES LIB raylib
REQUIRES LIB box3d
REQUIRES LIB dolly-raylib

SOURCE HOST /static/blockwalker/source.tar /tmp/blockwalker.tar ${hash(await readFile(output))}
SLOP tar -xf /tmp/blockwalker.tar -C / && rm /tmp/blockwalker.tar
SLOP cc -std=c17 -O2 -DBOX3D_DISABLE_SIMD -U__SIZEOF_INT128__ /usr/src/dolly/blockwalker/main.c /usr/src/dolly/blockwalker/character.c /usr/src/dolly/blockwalker/render.c /usr/src/dolly/blockwalker/gpu-client.c -ldolly-raylib -lraylib -lbox3d -lm -o /usr/bin/blockwalker
SLOP /usr/bin/blockwalker --check
EXPORTS TOOL blockwalker
EXPORTS FOLDER blockwalker-source /usr/src/dolly/blockwalker
`;
await writeFile(resolve(root,"modules/blockwalker.dm"),module);
await writeFile(resolve(root,"Dollyfile-blockwalker"),`DOLLY 3
IMAGE blockwalker

FROM HOST /Dollyfile-gamedev-sdk ${hash(await readFile(resolve(root,"Dollyfile-gamedev-sdk")))}
USE HOST /modules/blockwalker.dm ${hash(module)}

FILE /etc/dolly/blockwalker.slop
    /bin/foreground /usr/bin/blockwalker
    /bin/foreground -i /bin/slop

ENTRY /bin/foreground -i /bin/slop /etc/dolly/blockwalker.slop
`);
