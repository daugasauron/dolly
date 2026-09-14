#!/usr/bin/env node
import {execFile} from 'node:child_process';
import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {promisify} from 'node:util';

const root=new URL('..',import.meta.url).pathname;
const model=JSON.parse(await readFile(resolve(root,'src/local-llm/models.json'),'utf8'))[0];
const cached=resolve(root,`.cache/${model.id}-${model.sha256}.gguf`);
await promisify(execFile)('bash',[resolve(root,'scripts/fetch-verified-file.sh'),model.url,model.sha256,cached]);
const output=resolve(process.argv[2]??resolve(root,'dist/static/llama'));
await mkdir(output,{recursive:true});
const bytes=await readFile(cached),chunk=256*1024*1024;
if(bytes.length!==model.bytes)throw Error('Pinned model size mismatch');
for(let at=0,index=0;at<bytes.length;at+=chunk,index++) {
  const path=resolve(output,`model-${index}.part`),temporary=path+'.tmp';
  await writeFile(temporary,bytes.subarray(at,at+chunk));await rename(temporary,path);
}
console.log(`dolly: prepared ${model.id}, ${bytes.length} bytes`);
