#!/usr/bin/env node
// usage: prepare-local-llm-weights.mjs OUTPUT IMAGE...
// Stages each model whose package is selected, from its description models/ID.json, as
// OUTPUT/ID/: the description, the license and the pinned upstream GGUF, either in
// 1 GiB parts (the most one SOURCE accepts) for a one-file model, or as the shards
// llama's own gguf-split writes for a model its description splits.
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
  const directory=resolve(output,id),files=Object.entries(model.files);
  await mkdir(directory,{recursive:true});
  if(files.length>1) {
    // Shard names and bytes are gguf-split's; an identical staged set stays.
    const sizes=await Promise.all(files.map(([file])=>stat(resolve(directory,file)).then(entry=>entry.size,()=>0)));
    if(!files.every(([,bytes],index)=>bytes===sizes[index])) {
      const {stdout}=await run('bash',[resolve(root,'demos/local-llm/build-gguf-split.sh')]);
      await run(stdout.trim(),['--split','--split-max-size','1G',cached,resolve(directory,id)]);
    }
  } else {
    const file=await open(cached);
    try {
      for(let at=0,index=0;at<files[0][1];at+=part,index++) {
        const bytes=Buffer.alloc(Math.min(part,files[0][1]-at)),path=resolve(directory,`${index}.part`);
        await file.read(bytes,0,bytes.length,at);
        // Writing gigabytes is the slow part: an identical staged part stays.
        if((await readFile(path).catch(()=>null))?.equals(bytes))continue;
        await writeFile(path+'.tmp',bytes);await rename(path+'.tmp',path);
      }
    } finally {await file.close();}
  }
  const staged=files.length>1?await Promise.all(files.map(([file])=>stat(resolve(directory,file)).then(entry=>entry.size))):[(await stat(cached)).size];
  if(!files.every(([,bytes],index)=>bytes===staged[index]))throw Error(`${id}: the weights are not the ${files.map(([,bytes])=>bytes).join(', ')} bytes its description names`);
  await copyFile(resolve(models,name),resolve(directory,name));
  await copyFile(resolve(root,'demos/local-llm',model.source.license),resolve(directory,'LICENSE'));
  console.log(`dolly: prepared ${id}, ${staged.reduce((total,bytes)=>total+bytes,0)} bytes`);
}
