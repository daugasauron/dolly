import {readFileSync,mkdirSync,statSync,openSync,writeSync,closeSync,renameSync,unlinkSync} from 'node:fs';
import {spawn} from 'node:child_process';
export const models=JSON.parse(readFileSync('/usr/share/dolly/llm/models.json','utf8'));
// Volatile in-Wasm files: model weights are not part of saved filesystem sessions.
const directory='/run/dolly-llm';
async function digest(path,signal) {
  signal?.throwIfAborted();
  const child=spawn('/bin/sha256sum',[path],{stdio:['ignore','pipe','pipe']});
  const abort=()=>child.kill('SIGTERM');signal?.addEventListener('abort',abort,{once:true});
  try {
    return await new Promise((resolve,reject)=>{
      let output='';child.stdout.on('data',bytes=>{output+=bytes.toString();});
      child.stderr.on('data',()=>{});child.on('error',reject);
      child.on('close',code=>code===0?resolve(output.split(/\s/)[0]):reject(Error('Model checksum command failed')));
    });
  } finally {signal?.removeEventListener('abort',abort);}
}
export async function modelFile(id,{signal,progress=()=>{}}={}) {
  const model=models.find(model=>model.id===id);
  if(!model)throw Error(`Unknown local model: ${id}`);
  mkdirSync(directory,{recursive:true});
  const path=`${directory}/${model.id}-${model.sha256}.gguf`;
  try {if(statSync(path).size===model.bytes)return path;} catch {}
  const temporary=path+'.partial';let fd=openSync(temporary,'w'),complete=false;
  try {
    const chunk=32*1024*1024;
    for(let offset=0;offset<model.bytes;offset+=chunk) {
      signal?.throwIfAborted();
      const end=Math.min(model.bytes,offset+chunk)-1;
      progress(`Downloading ${id}: ${Math.floor(offset*100/model.bytes)}%`);
      const response=await fetch(model.url,{headers:{Range:`bytes=${offset}-${end}`},signal});
      if(response.status!==206)throw Error(`Model download requires HTTP Range support (received ${response.status})`);
      const bytes=new Uint8Array(await response.arrayBuffer());
      if(bytes.length!==end-offset+1)throw Error('Model download returned an incorrect range size');
      for(let at=0;at<bytes.length;) {const written=writeSync(fd,bytes,at,bytes.length-at);if(written<=0)throw Error('Model file write failed');at+=written;}
    }
    closeSync(fd);fd=null;progress(`Verifying ${id}…`);
    if(await digest(temporary,signal)!==model.sha256)throw Error('Model download SHA-256 mismatch');
    signal?.throwIfAborted();renameSync(temporary,path);complete=true;
    progress(`${id} downloaded and verified`);return path;
  } finally {if(fd!==null)closeSync(fd);if(!complete)try{unlinkSync(temporary);}catch{}}
}
