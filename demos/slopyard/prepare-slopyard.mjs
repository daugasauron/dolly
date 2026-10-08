#!/usr/bin/env node
import {execFileSync} from "node:child_process";
import {readFile,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {siteReference} from "../../src/static-asset.mjs";
const root=resolve(import.meta.dirname, "../..");
const output=process.argv[2]??resolve(root,"dist/static/slopyard/source.tar");
execFileSync(process.execPath,[resolve(root,"scripts/build-source-tar.mjs"),output,
  "demos/slopyard/src","/usr/src/dolly/slopyard"],{cwd:root,stdio:"inherit"});
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
const pin=async path=>`${siteReference(path)} ${hash(await readFile(resolve(root,path)))}`;
// The Lua archive pin is refreshed by update-recipe-pins --sources.
const luaPin=(/lua-5\.5\.1\.tar\.gz ([0-9a-f]{64})/.exec(await readFile(resolve(root,"demos/slopyard/Dollyfile-slopyard"),"utf8").catch(()=>""))??[,"0".repeat(64)])[1];
await writeFile(resolve(root,"demos/slopyard/Dollyfile-slopyard"),`DOLLY 7
APPLICATION slopyard
REQUIRES HOST runtime@0
REQUIRES HOST display@0
REQUIRES HOST input@0
REQUIRES HOST download@0
REQUIRES HOST gpu@0
REQUIRES HOST http@0
REQUIRES HOST snapshot@0
REQUIRES HOST threads@0
REQUIRES HOST upload@0

FROM ${await pin("demos/slopyard/Dollyfile-gamedev-sdk")}
INSTALL ${await pin("demos/javascript/Dollyfile-javascript")}
INSTALL ${await pin("demos/pi/Dollyfile-pi-coding-agent")}
REQUIRES TOOL cc
REQUIRES TOOL ar
REQUIRES TOOL make
REQUIRES TOOL gzip
REQUIRES TOOL tar
REQUIRES TOOL cp
REQUIRES TOOL mkdir
REQUIRES TOOL rm
REQUIRES HEADER libc

SOURCE ${siteReference("dist/static/slopyard/lua-5.5.1.tar.gz")} ${luaPin} /tmp/lua55/source.tar.gz
SLOP gzip -dc /tmp/lua55/source.tar.gz > /tmp/lua55/source.tar
SLOP tar -xf /tmp/lua55/source.tar -C /tmp/lua55
FILE /tmp/lua55/Makefile
    SOURCE := /tmp/lua55/lua-5.5.1/src
    FILES := $(filter-out $(SOURCE)/lua.c,$(wildcard $(SOURCE)/*.c))
    OBJECTS := $(patsubst $(SOURCE)/%.c,/tmp/lua55/%.o,$(FILES))
    /usr/lib/liblua5.5.a: $(OBJECTS)
    	ar rcs $@ $^
    /tmp/lua55/%.o: $(SOURCE)/%.c
    	cc -std=c17 -O2 -U__SIZEOF_INT128__ -DLUA_USE_C89 -I $(SOURCE) -c $< -o $@
SLOP make -f /tmp/lua55/Makefile
SLOP mkdir -p /usr/include/lua5.5 /usr/share/licenses/lua5.5
SLOP cp /tmp/lua55/lua-5.5.1/src/lua.h /tmp/lua55/lua-5.5.1/src/luaconf.h /tmp/lua55/lua-5.5.1/src/lauxlib.h /tmp/lua55/lua-5.5.1/src/lualib.h /usr/include/lua5.5
SLOP cp /tmp/lua55/lua-5.5.1/doc/readme.html /usr/share/licenses/lua5.5/readme.html
SLOP rm -rf /tmp/lua55
EXPORTS LIB lua55 /usr/lib/liblua5.5.a
EXPORTS HEADER lua55 /usr/include/lua5.5
FILE /usr/share/licenses/lua5.5/readme.html
REQUIRES LIB raylib
REQUIRES LIB box3d
REQUIRES LIB dolly-raylib
REQUIRES LIB dolly-js
REQUIRES LIB lua55
REQUIRES HEADER lua55
REQUIRES HEADER gpu
REQUIRES HEADER quickjs
REQUIRES HEADER quickjs-runner

SOURCE ${siteReference("dist/static/slopyard/source.tar")} ${hash(await readFile(output))} /tmp/slopyard.tar
SLOP tar -xf /tmp/slopyard.tar -C / && rm /tmp/slopyard.tar
SLOP make -f /usr/src/dolly/slopyard/box3d.mk
SLOP cc -std=c17 -O2 -pthread -U__SIZEOF_INT128__ -I/usr/include/lua5.5 /usr/src/dolly/slopyard/main.c /usr/src/dolly/slopyard/data.c /usr/src/dolly/slopyard/pi.c /usr/src/dolly/slopyard/character.c /usr/src/dolly/slopyard/render.c /usr/src/dolly/slopyard/world.c /usr/src/dolly/slopyard/terrain.c /usr/src/dolly/slopyard/magnet.c -ldolly-gpu -llua5.5 -ldolly-js -ldolly-raylib -lraylib -lslopyard-box3d -lm -o /usr/bin/slopyard
SLOP /usr/bin/slopyard --check
SLOP rm -rf /tmp/slopyard-box3d
EXPORTS TOOL slopyard
EXPORTS LIB slopyard-box3d /usr/lib/libslopyard-box3d.a
EXPORTS FOLDER slopyard-source /usr/src/dolly/slopyard

FILE /etc/dolly/slopyard.slop
    /bin/foreground /usr/bin/slopyard
    /bin/foreground -i /bin/slop

ENTRY /bin/foreground -i /bin/slop /etc/dolly/slopyard.slop
`);
