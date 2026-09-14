// Runs in Janis inside Dolly against the real GPU and pinned model weights.
import {writeFileSync} from 'node:fs';
import {LocalLlama} from '/usr/lib/dolly-llm/client.mjs';
const model=process.argv[2]??'Qwen3.5-0.8B';
const engine=new LocalLlama(console.log),results=[];
function check(condition,message) {if(!condition)throw Error(message);}
const prompt=text=>`<|im_start|>user\n${text}<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n`;
async function answer(text,signal) {
  const decoder=new TextDecoder();let output='',done;
  for await(const event of engine.generate(model,{prompt:prompt(text),max_tokens:128,temperature:0},signal)) {
    if(event.token)output+=decoder.decode(new Uint8Array(event.token),{stream:true});
    if(event.done)done=event;
  }
  check(done?.output_tokens>0 && output.trim(),'Empty model response');
  results.push({text:output,...done});return output;
}
try {
  await answer('Say hello in one short sentence.');
  const first=engine.process.pid;
  await answer('What is two plus two? Answer briefly.');
  check(engine.process.pid===first,'Weights were reloaded between requests');
  const controller=new AbortController();let interrupted=false;
  try {
    for await(const event of engine.generate(model,{prompt:prompt('Count from one to one hundred.'),max_tokens:256,temperature:0},controller.signal)) {
      if(event.token)controller.abort();
    }
  } catch {interrupted=controller.signal.aborted;}
  check(interrupted && !engine.process,'Generation did not stop');
  await answer('Say hello again in one short sentence.');
  check(engine.process.pid!==first,'Interrupted process was reused');
  writeFileSync('/workspace/local-llm-proof.json',JSON.stringify({model,reuse:true,cancel:true,restart:true,results},null,2));
  console.log('LOCAL-LLM-PROOF-OK');
} finally {engine.stop();}
