import {readdirSync,readFileSync,statSync} from 'node:fs';
// A model is its description, ID.json, beside the weight files it names; a model package
// installs both. The image also holds the descriptions of the models it does not bundle.
export const directory='/usr/share/dolly/llm';
export function models() {
  return readdirSync(directory).filter(name=>name.endsWith('.json')).map(name=>{
    const model={id:name.slice(0,-5),...JSON.parse(readFileSync(`${directory}/${name}`,'utf8'))};
    const sizes=Object.entries(model.files);
    model.bytes=sizes.reduce((total,[,bytes])=>total+bytes,0);
    // llama loads a split model from its first shard.
    model.path=`${directory}/${sizes[0][0]}`;
    model.installed=sizes.every(([file,bytes])=>{try{return statSync(`${directory}/${file}`).size===bytes;}catch{return false;}});
    return model;
  }).sort((a,b)=>a.bytes-b.bytes);
}
// Why this adapter cannot run the model, or nothing. A description lists the GPU memory
// measured for each shader kind; a kind it omits does not fit gpu@0's 4 GiB of buffers.
export function unmet(model,shaders) {
  if(model.gpu[shaders]!==undefined)return;
  return `${model.name} needs shader-f16 to fit the 4 GiB of GPU buffers Dolly grants, and this GPU adapter runs ${shaders} shaders`;
}
