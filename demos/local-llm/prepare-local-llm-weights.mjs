#!/usr/bin/env node
// usage: prepare-local-llm-weights.mjs OUTPUT IMAGE...
// Stages each selected model package as OUTPUT/ID/N.part, the pinned upstream
// GGUF in 1 GiB parts (the most one SOURCE accepts), and OUTPUT/ID/LICENSE.
import {execFile} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {copyFile,mkdir,open,rename,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {promisify} from 'node:util';

const root=new URL('../../',import.meta.url).pathname;
const [output,...images]=process.argv.slice(2);
const part=1024**3;
for(const model of JSON.parse(readFileSync(resolve(root,'demos/local-llm/models.json'),'utf8'))) {
  if(!images.includes(model.image))continue;
  const cached=resolve(root,`.cache/${model.id}-${model.sha256}.gguf`);
  await promisify(execFile)('bash',[resolve(root,'scripts/fetch-verified-file.sh'),model.url,model.sha256,cached]);
  const directory=resolve(output,model.id);
  await mkdir(directory,{recursive:true});
  const file=await open(cached);
  try {
    if((await file.stat()).size!==model.bytes)throw Error(`${model.id}: pinned model size mismatch`);
    for(let at=0,index=0;at<model.bytes;at+=part,index++) {
      const bytes=Buffer.alloc(Math.min(part,model.bytes-at)),path=resolve(directory,`${index}.part`);
      await file.read(bytes,0,bytes.length,at);
      await writeFile(path+'.tmp',bytes);await rename(path+'.tmp',path);
    }
  } finally {await file.close();}
  await copyFile(resolve(root,'demos/local-llm',model.license),resolve(directory,'LICENSE'));
  console.log(`dolly: prepared ${model.id}, ${model.bytes} bytes`);
}
