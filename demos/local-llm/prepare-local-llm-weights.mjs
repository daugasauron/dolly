#!/usr/bin/env node
// usage: prepare-local-llm-weights.mjs OUTPUT IMAGE...
// Stages each model whose package is selected, from its description models/ID.json, as
// OUTPUT/ID/: the description, the license and the pinned upstream GGUF in 1 GiB parts
// (the most one SOURCE accepts).
import {execFile} from 'node:child_process';
import {readdirSync,readFileSync} from 'node:fs';
import {copyFile,mkdir,open,readFile,rename,stat,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {promisify} from 'node:util';

const run=promisify(execFile);
const root=new URL('../../',import.meta.url).pathname,models=resolve(root,'demos/local-llm/models');
const [output,...images]=process.argv.slice(2);
const part=1024**3;
for(const name of readdirSync(models)) {
  const id=name.slice(0,-5),model=JSON.parse(readFileSync(resolve(models,name),'utf8'));
  if(!model.packages.some(image=>images.includes(image)))continue;
  const cached=resolve(root,`.cache/${id}-${model.source.sha256}.gguf`);
  await run('bash',[resolve(root,'scripts/fetch-verified-file.sh'),model.source.url,model.source.sha256,cached]);
  const directory=resolve(output,id),[size]=Object.values(model.files);
  if((await stat(cached)).size!==size)throw Error(`${id}: the weights are not the ${size} bytes its description names`);
  await mkdir(directory,{recursive:true});
  const file=await open(cached);
  try {
    for(let at=0,index=0;at<size;at+=part,index++) {
      const bytes=Buffer.alloc(Math.min(part,size-at)),path=resolve(directory,`${index}.part`);
      await file.read(bytes,0,bytes.length,at);
      // Writing gigabytes is the slow part: an identical staged part stays.
      if((await readFile(path).catch(()=>null))?.equals(bytes))continue;
      await writeFile(path+'.tmp',bytes);await rename(path+'.tmp',path);
    }
  } finally {await file.close();}
  await copyFile(resolve(models,name),resolve(directory,name));
  await copyFile(resolve(root,'demos/local-llm',model.source.license),resolve(directory,'LICENSE'));
  console.log(`dolly: prepared ${id}, ${size} bytes`);
}
