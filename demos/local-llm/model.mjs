import {readFileSync,mkdirSync,statSync,openSync,writeSync,closeSync,renameSync,unlinkSync} from 'node:fs';
import {spawn} from 'node:child_process';
// The catalog: id, name, prompt format, context, GPU memory in GB (measured),
// pinned upstream URL, bytes and SHA-256.
export const models=JSON.parse(readFileSync('/usr/share/dolly/llm/models.json','utf8'));
// Volatile in-Wasm files: model weights are not part of saved filesystem sessions.
const directory='/run/dolly-llm';
function run(command,args,stdout,signal) {
  signal?.throwIfAborted();
  const child=spawn(command,args,{stdio:['ignore',stdout,'pipe']});
  const abort=()=>child.kill('SIGTERM');signal?.addEventListener('abort',abort,{once:true});
  let output='',errors='';child.stdout?.on('data',bytes=>{output+=bytes.toString();});child.stderr.on('data',bytes=>{errors+=bytes.toString();});
  return new Promise((resolve,reject)=>{
    child.on('error',reject);
    child.on('close',code=>{signal?.removeEventListener('abort',abort);
      code===0?resolve(output):reject(Error(`${command} failed: ${errors.trim()||code}`));});
  });
}
export async function modelFile(id,{signal,progress=()=>{}}={}) {
  const model=models.find(model=>model.id===id);
  if(!model)throw Error(`Unknown local model: ${id}`);
  // A model package installs the weights here; other models download into volatile /run.
  const installed=`/usr/share/dolly/llm/${model.id}.gguf`;
  try {if(statSync(installed).size===model.bytes)return installed;} catch {}
  mkdirSync(directory,{recursive:true});
  const path=`${directory}/${model.id}-${model.sha256}.gguf`;
  try {if(statSync(path).size===model.bytes)return path;} catch {}
  const temporary=path+'.partial',started=Date.now();let complete=false;
  const report=()=>progress(`Downloading ${id} (${(model.bytes/1e9).toFixed(1)} GB, ${Math.round((Date.now()-started)/1000)} s)…`);
  const timer=setInterval(report,5000);report();
  try {
    // Sizing the file first lets it pass 2 GiB: a growing file reallocates past the kernel's memory.
    // curl writes at native speed through the inherited descriptor.
    const fd=openSync(temporary,'w');
    try {writeSync(fd,new Uint8Array(1),0,1,model.bytes-1);await run('/usr/bin/curl',['-sSfL',model.url],fd,signal);}
    finally {closeSync(fd);}
    clearInterval(timer);progress(`Verifying ${id}…`);
    if((await run('/bin/sha256sum',[temporary],'pipe',signal)).split(/\s/)[0]!==model.sha256)throw Error('Model download SHA-256 mismatch');
    renameSync(temporary,path);complete=true;
    progress(`${id} downloaded and verified`);return path;
  } finally {clearInterval(timer);if(!complete)try{unlinkSync(temporary);}catch{}}
}
