import {spawn} from 'node:child_process';
import {appendFileSync,mkdirSync} from 'node:fs';
import {unmet} from './model.mjs';

const command='/usr/bin/dolly-llama';
// The shader kind this page's GPU adapter gives: what `dolly-llama --check` prints.
export function checkGpu() {
  return new Promise((resolve,reject)=>{
    const child=spawn(command,['--check'],{stdio:['ignore','pipe','ignore']});let output='';
    child.stdout.on('data',bytes=>{output+=bytes;});
    child.on('error',reject);
    child.on('close',()=>{
      let result={};try{result=JSON.parse(output);}catch{}
      result.ready?resolve(result):reject(Error(result.error??'WebGPU preflight failed; see demos/local-llm/README.md'));
    });
  });
}

// One dolly-llama process holding one model on the GPU. respond() stands where fetch
// would reach llama-server: the request body goes to the engine, its events come back.
export class LocalLlama {
  constructor(progress=()=>{}) {this.progress=progress;this.process=null;this.busy=false;}
  stop() {this.process?.kill('SIGTERM');this.process=null;this.loaded=null;}
  async load(model,context) {
    const loaded=`${model.id} ${context}`;
    if(this.loaded===loaded && this.process)return;
    this.stop();
    this.progress('Checking WebGPU…');
    const gpu=this.gpu??=await checkGpu();
    if(!model.installed)throw Error(`${model.name} is not installed; run /local, or: amy install ${model.packages.join(' ')}`);
    const missing=unmet(model,gpu.shaders);if(missing)throw Error(missing);
    this.progress(`Loading ${model.id} on the GPU…`);
    const child=spawn(command,[model.path,String(context)],{stdio:['pipe','pipe','pipe']});
    this.process=child;this.loaded=loaded;
    mkdirSync('/home/dolly/.cache/dolly-llm',{recursive:true});
    let pending='',failure,ended=false,wake,reason='';
    const events=[],decoder=new TextDecoder();
    const changed=()=>{wake?.();wake=undefined;};
    child.stdout.on('data',bytes=>{
      pending+=decoder.decode(bytes,{stream:true});
      for(let at;(at=pending.indexOf('\n\n'))!==-1;) {events.push(pending.slice(0,at));pending=pending.slice(at+2);}
      if(pending.length>1024*1024){failure=Error('Local model response exceeds protocol limit');child.kill('SIGTERM');}
      changed();
    });
    child.stderr.on('data',bytes=>{
      appendFileSync('/home/dolly/.cache/dolly-llm/engine.log',bytes);
      reason=String(bytes).match(/(?:Dolly WebGPU: |ggml_webgpu: .*(?:error|failed)).*$/mi)?.[0]??reason;
    });
    child.on('error',error=>{failure=error;changed();});
    child.on('close',(code,signal)=>{
      ended=true;failure??=Error(reason?`${reason}; ${model.name} needs ${model.gpu[gpu.shaders]} GB of GPU memory with ${context} tokens of context`
        :`Local model exited (${signal??code}); see ~/.cache/dolly-llm/engine.log`);
      if(this.process===child){this.process=null;this.loaded=null;}changed();
    });
    // The next event of the engine's stream, without its "data: " prefix.
    this.next=async()=>{
      while(!events.length && !failure && !ended)await new Promise(resolve=>{wake=resolve;});
      if(events.length)return events.shift().slice(6);
      throw failure;
    };
    const ready=JSON.parse(await this.next());
    if(!ready.ready)throw Error(ready.error);
    this.progress(`${model.id} ready · ${ready.context} tokens · GPU, ${ready.shaders} shaders`);
  }
  respond(model,context,{body,signal}) {
    const encoder=new TextEncoder();
    const send=(controller,event)=>controller.enqueue(encoder.encode(`data: ${event}\n\n`));
    return new Response(new ReadableStream({start:async controller=>{
      const abort=()=>this.stop();
      try {
        if(this.busy)throw Error('Local model is already generating');
        this.busy=true;signal?.addEventListener('abort',abort,{once:true});
        try {
          signal?.throwIfAborted();await this.load(model,context);signal?.throwIfAborted();
          this.process.stdin.write(JSON.stringify(JSON.parse(body))+'\n');
          for(let event;event!=='[DONE]';send(controller,event))event=await this.next();
        } catch(error) {this.stop();throw error;}
        finally {signal?.removeEventListener('abort',abort);this.busy=false;}
      } catch(error) {
        // An event the OpenAI client reports as the request's error, in the engine's own words.
        send(controller,JSON.stringify({error:{message:String(error.message??error)}}));send(controller,'[DONE]');
      }
      controller.close();
    }}),{headers:{'content-type':'text/event-stream'}});
  }
}
