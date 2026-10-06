// Runs in Janis inside Dolly against the real GPU and an installed model.
import {writeFileSync} from 'node:fs';
import {LocalLlama} from '/usr/lib/dolly-llm/client.mjs';
import {models} from '/usr/lib/dolly-llm/model.mjs';
const model=models().find(entry=>entry.id===process.argv[2]);
const engine=new LocalLlama(console.log),results=[];
function check(condition,message) {if(!condition)throw Error(message);}
const bash={type:'function',function:{name:'bash',description:'Run a shell command',
  parameters:{type:'object',properties:{command:{type:'string'}},required:['command'],additionalProperties:false}}};
// One request as Pi's adapter sends it; the reply's events folded into one result.
async function complete(request,signal,onEvent=()=>{}) {
  const body=JSON.stringify({stream:true,max_tokens:128,temperature:0,...request});
  const reader=engine.respond(model,model.pi.contextWindow,{body,signal}).body.getReader();
  const decoder=new TextDecoder(),result={content:'',calls:[]};
  for(let text='';;) {
    const {done,value}=await reader.read();if(done)break;
    text+=decoder.decode(value,{stream:true});
    for(let at;(at=text.indexOf('\n\n'))!==-1;text=text.slice(at+2)) {
      if(text.slice(6,at)==='[DONE]')continue;
      const event=JSON.parse(text.slice(6,at)),choice=event.choices?.[0];onEvent(event);
      if(event.error)result.error=event.error.message;
      if(event.usage)Object.assign(result,{usage:event.usage,timings:event.timings});
      if(choice?.finish_reason)result.finish=choice.finish_reason;
      result.content+=choice?.delta.content??'';
      for(const call of choice?.delta.tool_calls??[]) {
        const entry=result.calls[call.index]??={name:'',arguments:''};
        entry.name+=call.function.name??'';entry.arguments+=call.function.arguments??'';
      }
    }
  }
  results.push(result);return result;
}
const user=content=>({role:'user',content});
try {
  const hello=await complete({messages:[user('Say hello in one short sentence.')]});
  check(hello.finish==='stop' && hello.content.trim(),`No answer: ${JSON.stringify(hello)}`);
  const first=engine.process.pid;
  const sum=await complete({messages:[user('What is two plus two? Answer briefly.')]});
  check(/4|four/i.test(sum.content),`Wrong sum: ${sum.content}`);
  check(engine.process.pid===first,'Weights were reloaded between requests');
  // Without a seed in the request llama draws one, so equal requests do not repeat each other.
  const digits={messages:[user('Write twenty random digits.')],temperature:1,max_tokens:32};
  check((await complete(digits)).content!==(await complete(digits)).content,'Two unseeded requests sampled the same text');
  // An agent turn: a tool call, then its result on top of the evaluated conversation.
  const turn=[user('List the files in /workspace with the bash tool.')];
  const listing=await complete({messages:turn,tools:[bash],tool_choice:'required'});
  check(listing.finish==='tool_calls' && listing.calls[0]?.name==='bash' && JSON.parse(listing.calls[0].arguments).command,
    `No tool call: ${JSON.stringify(listing)}`);
  turn.push({role:'assistant',content:null,tool_calls:[{id:'call_1',type:'function',function:listing.calls[0]}]},
    {role:'tool',tool_call_id:'call_1',content:'proof-marker.txt\n'});
  const told=await complete({messages:turn,tools:[bash]});
  check(/proof-marker/.test(told.content),`The tool result did not reach the model: ${told.content}`);
  check(told.usage.prompt_tokens_details.cached_tokens>0,'The next turn reused no evaluated prompt');
  const refused=await complete({messages:[user('Hello')],logit_bias:{}});
  check(/logit_bias/.test(refused.error),'An unimplemented request field was accepted');
  const controller=new AbortController();
  const cancelled=await complete({messages:[user('Count from one to one hundred.')],max_tokens:256},controller.signal,
    event=>{if(event.choices?.[0]?.delta.content)controller.abort();});
  check(cancelled.error && !engine.process,'Generation did not stop');
  await complete({messages:[user('Say hello again in one short sentence.')]});
  check(engine.process.pid!==first,'Interrupted process was reused');
  writeFileSync('/workspace/local-llm-proof.json',JSON.stringify({model:model.id,reuse:true,cancel:true,restart:true,results},null,2));
  console.log('LOCAL-LLM-PROOF-OK');
} finally {engine.stop();}
