import {spawn} from 'node:child_process';
import {appendFileSync,mkdirSync} from 'node:fs';
import {modelFile} from './model.mjs';

export class LocalLlama {
  constructor(progress=()=>{}) {this.progress=progress;this.process=null;this.busy=false;}
  stop() {this.process?.kill('SIGTERM');this.process=null;this.model=null;}
  async *generate(id,request,signal) {
    if(this.busy)throw Error('Local model is already generating');
    this.busy=true;
    const abort=()=>this.stop();signal?.addEventListener('abort',abort,{once:true});
    try {
      signal?.throwIfAborted();
      if(this.model!==id || !this.process) {
        this.stop();
        this.progress('Checking WebGPU…');
        await new Promise((resolve,reject)=>{
          const child=spawn('/usr/bin/dolly-llama',['--check'],{stdio:['ignore','pipe','pipe']});
          this.process=child;let output='';
          child.stdout.on('data',bytes=>{output+=bytes.toString();});
          child.stderr.on('data',()=>{});
          child.on('error',reject);
          child.on('close',code=>{
            if(this.process===child)this.process=null;
            if(code===0)resolve();
            else {let message;try{message=JSON.parse(output.trim()).error;}catch{}
              reject(Error(message??'WebGPU preflight failed; see docs/browser-local-models.md'));}
          });
        });
        const file=await modelFile(id,{signal,progress:this.progress});
        signal?.throwIfAborted();this.progress(`Loading ${id} on the GPU…`);
        const child=spawn('/usr/bin/dolly-llama',[file,'8192'],{stdio:['pipe','pipe','pipe']});
        this.process=child;this.model=id;
        mkdirSync('/home/dolly/.cache/dolly-llm',{recursive:true});
        let pending='',failure,ended=false,wake;
        const queue=[],decoder=new TextDecoder();
        const changed=()=>{wake?.();wake=undefined;};
        child.stdout.on('data',bytes=>{
          pending+=decoder.decode(bytes,{stream:true});
          if(pending.length>1024*1024){failure=Error('Local model response exceeds protocol limit');child.kill('SIGTERM');changed();return;}
          for(let at;(at=pending.indexOf('\n'))!==-1;) {
            const line=pending.slice(0,at);pending=pending.slice(at+1);
            try {queue.push(JSON.parse(line));}catch{failure=Error('Invalid local model response');}
          }
          changed();
        });
        child.stderr.on('data',bytes=>appendFileSync('/home/dolly/.cache/dolly-llm/engine.log',bytes));
        child.on('error',error=>{failure=error;changed();});
        child.on('close',(code,reason)=>{
          ended=true;failure??=Error(`Local model exited (${reason??code}); see ~/.cache/dolly-llm/engine.log`);
          if(this.process===child){this.process=null;this.model=null;}changed();
        });
        this.next=async()=>{
          while(!queue.length && !failure && !ended)await new Promise(resolve=>{wake=resolve;});
          if(failure)throw failure;
          const value=queue.shift();if(value?.error)throw Error(value.error);return value;
        };
        const ready=await this.next();if(!ready?.ready)throw Error('Local model did not become ready');
        this.progress(`${id} ready · GPU`);
      }
      this.process.stdin.write(JSON.stringify(request)+'\n');
      for(;;) {
        signal?.throwIfAborted();const result=await this.next();yield result;if(result.done)break;
      }
    } catch(error) {this.stop();throw error;}
    finally {signal?.removeEventListener('abort',abort);this.busy=false;}
  }
}
