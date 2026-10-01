#!/usr/bin/env node
import {readFile,writeFile,readdir} from "node:fs/promises";
import {createHash} from "node:crypto";
const root=new URL("../../",import.meta.url);
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
const entries=[
 ...(await readdir(new URL("demos/gpu-fluid/src/",root))).sort().map(file=>[`demos/gpu-fluid/src/${file}`,`/usr/src/dolly/fluid/${file}`]),
];
let module="DOLLY 5\nMODULE gpu-fluid\n\nREQUIRES TOOL cc\nREQUIRES HEADER gpu\nREQUIRES LIB dolly-gpu\nREQUIRES HOST gpu@0\nREQUIRES HOST display@0\n\n";
for(const [source,path] of entries){const content=await readFile(new URL(source,root),"utf8");module+=`FILE ${path}\n${content.trimEnd().split("\n").map(line=>`    ${line}`).join("\n")}\n\n`;}
for(const [path,include] of [["cglm/cglm.h","../platform.h"],["webgpu/wgpu_common.h","../platform.h"],["webgpu/imgui_overlay.h","../without-imgui.h"],["cimgui.h","without-imgui.h"],["sokol_time.h","platform.h"]])module+=`FILE /usr/src/dolly/fluid/${path}\n    #include "${include}"\n\n`;
await writeFile(new URL("demos/gpu-fluid/gpu-fluid.dm",root),module);
const headers=JSON.parse(await readFile(new URL("demos/gpu-fluid/fluid-cglm-headers.json",root),"utf8"));
const cglm=headers.map(({path,sha256})=>`SOURCE https://raw.githubusercontent.com/recp/cglm/144d1e7c29b3b0c6dede7917a0476cc95248559c/include/${path} ${sha256} /usr/src/dolly/fluid/${path}`).join("\n");
const parent=hash(await readFile(new URL("Dollyfile-gpu-sdk",root)));
await writeFile(new URL("demos/gpu-fluid/Dollyfile-gpu-fluid",root),`DOLLY 5
IMAGE gpu-fluid

FROM https://daugasauron.com/Dollyfile-gpu-sdk ${parent}
USE https://daugasauron.com/demos/gpu-fluid/gpu-fluid.dm ${hash(module)}

SOURCE https://raw.githubusercontent.com/samdauwe/webgpu-native-examples/9a7c30753d6f44630564a8316eb9c44211ff0ecc/src/examples/fluid_simulation.c 74d7a9fa5b0c23988016589cf57554028c38a1cd49916d03d9aeead85a045c40 /usr/src/dolly/fluid/fluid_simulation.c
SOURCE https://raw.githubusercontent.com/samdauwe/webgpu-native-examples/9a7c30753d6f44630564a8316eb9c44211ff0ecc/LICENSE b40930bbcf80744c86c46a12bc9da056641d722716c378f5659b9e555ef833e1 /usr/share/licenses/webgpu-native-examples/LICENSE
SOURCE https://raw.githubusercontent.com/webgpu-native/webgpu-headers/b5ff182caa90e53293f47939716281342c0812ba/webgpu.h 33f7b7f9a8e3cba0c397ca27894b1dd71ec9a7970016e163b2c3c0bba5223ef4 /usr/src/dolly/fluid/webgpu/webgpu.h
SOURCE https://raw.githubusercontent.com/recp/cglm/144d1e7c29b3b0c6dede7917a0476cc95248559c/LICENSE 431610a1607c117bc161f37d99a321da977deb27e4f1df367365a9ca422d9c1e /usr/share/licenses/cglm/LICENSE
${cglm}
SLOP cc -std=gnu11 -O2 -I/usr/src/dolly/fluid /usr/src/dolly/fluid/app.c /usr/src/dolly/fluid/webgpu.c -ldolly-gpu -lm -o /usr/bin/fluid
EXPORTS TOOL fluid
EXPORTS FOLDER fluid-sources /usr/src/dolly/fluid
EXPORTS FOLDER fluid-upstream-license /usr/share/licenses/webgpu-native-examples
EXPORTS FOLDER fluid-cglm-license /usr/share/licenses/cglm

FILE /etc/dolly/gpu-fluid.slop
    /bin/foreground /usr/bin/fluid
    /bin/foreground -i /bin/slop

ENTRY /bin/foreground -i /bin/slop /etc/dolly/gpu-fluid.slop
`);
console.log("dolly: prepared GPU fluid sources and recipe");
