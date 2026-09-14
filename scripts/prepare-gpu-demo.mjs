#!/usr/bin/env node
import { readFile, writeFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
const root=resolve(import.meta.dirname,"..");
const entries=[
  ["include/dolly/gpu-abi.h","/usr/include/dolly/gpu-abi.h"],
  ["include/dolly/gpu.h","/usr/include/dolly/gpu.h"],
  ["src/gpu/client.c","/usr/src/dolly/gpu/client.c"],
  ...(await readdir(resolve(root,"src/gpu/demo"))).sort().map(file=>[`src/gpu/demo/${file}`,`/usr/src/dolly/gpu/${file}`]),
];
let module="DOLLY 3\nMODULE gpu-demo\n\nREQUIRES TOOL cc\n\n";
for(const [source,path] of entries) {
  const text=await readFile(resolve(root,source),"utf8");
  module+=`FILE ${path}\n${text.trimEnd().split("\n").map(line=>`    ${line}`).join("\n")}\n\n`;
}
await writeFile(resolve(root,"modules/gpu-demo.dm"),module);
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
const parent=hash(await readFile(resolve(root,"Dollyfile-system")));
await writeFile(resolve(root,"Dollyfile-gpu-demo"),`DOLLY 3
IMAGE gpu-demo

FROM HOST /Dollyfile-system ${parent}
USE HOST /modules/gpu-demo.dm ${hash(module)}

SLOP cc -O2 /usr/src/dolly/gpu/main.c /usr/src/dolly/gpu/client.c -o /usr/bin/gpu-demo
EXPORTS TOOL gpu-demo

FILE /etc/dolly/gpu-demo.slop
    /bin/foreground /usr/bin/gpu-demo
    printf '\\nEdit shaders in /usr/src/dolly/gpu; run gpu-demo to reload.\\n'
    /bin/foreground -i /bin/slop

ENTRY /bin/foreground -i /bin/slop /etc/dolly/gpu-demo.slop
`);
console.log("dolly: prepared only the new GPU demo recipe and module");
