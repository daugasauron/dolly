// Vision and input tools only. All recordings stay in Dolly's filesystem. SPDX-License-Identifier: GPL-2.0-or-later
import { parameters, encodeBatch } from './codec.mjs';
export const describe = image => `Bhop framebuffer at frame ${image.frame}, ${image.milliseconds} ms since launch (960×540). The course keeps running while you think. No game-state telemetry is available.`;
export const toolText = (name,args) => name==='game_input' ? args.actions.map(a=>`${a.ticks*10} ms [${a.keys.join('+')||'release'}] mouse (${a.mouse_dx||0}, ${a.mouse_dy||0})${a.wheel?' wheel '+a.wheel:''}`).join('; ') || 'observe' : JSON.stringify(args);
const wait = ms => new Promise(resolve=>setTimeout(resolve,ms));
export function connect(fs,directory,firstId=1) {
  let serial=firstId,busy=false;
  const remove=name=>{try{fs.unlinkSync(`${directory}/${name}`);}catch(error){if(error.code!=='ENOENT')throw error;}};
  const write=(name,data)=>{fs.writeFileSync(`${directory}/${name}.tmp`,data);fs.renameSync(`${directory}/${name}.tmp`,`${directory}/${name}`);};
  return async(actions,signal)=>{
    if(busy)throw Error('An input batch is already running');
    if(signal?.aborted)throw Error('Input cancelled');
    const gate=fs.readFileSync(`${directory}/control`);
    if(gate.length!==8||gate.readUInt32LE(4)!==2)throw Error('The agent does not have control');
    const id=serial++,request=encodeBatch(actions,id,gate.readUInt32LE(0));
    const deadline=Date.now()+60000+actions.reduce((sum,a)=>sum+a.ticks*10,0);
    busy=true;let sent=false,completed=false;
    try {
      remove('response');write('request',request);sent=true;
      while(true) {
        if(signal?.aborted)throw Error('Input cancelled');
        if(Date.now()>deadline)throw Error('Input timed out; the game may have stopped');
        if(fs.existsSync(`${directory}/response`)) {
          const result=JSON.parse(fs.readFileSync(`${directory}/response`,'utf8'));
          remove('response');
          if(result.id!==id)continue;
          if(result.version!==1)throw Error('Unsupported bhop input protocol');
          if(result.status)throw Error(['','Invalid input batch','Input cancelled','The agent does not have control'][result.status]||'Input failed');
          const png=fs.readFileSync(`${directory}/response.png`);remove('response.png');
          if(png.length<24||png.readUInt32BE(16)!==960||png.readUInt32BE(20)!==540)throw Error('Invalid bhop framebuffer');
          completed=true;return {...result,png};
        }
        await wait(25);
      }
    } finally {
      if(sent&&!completed){const bytes=Buffer.alloc(4);bytes.writeUInt32LE(id);write('cancel',bytes);}
      busy=false;
    }
  };
}
const number=(value,name)=>{if(!Number.isInteger(value)||value<0||value>999999)throw Error(`Invalid ${name}`);return value;};
export const attemptPath=(run,attempt)=>`${run}/attempt-${String(number(attempt,'attempt')).padStart(6,'0')}`;
export const framePath=(run,attempt,index)=>`${attemptPath(run,attempt)}/frame-${String(number(index,'frame')).padStart(6,'0')}.png`;
export function recording(fs,run,attempt) {
  const attempts=fs.readdirSync(run).filter(name=>/^attempt-\d{6}$/.test(name)).map(name=>Number(name.slice(8))).sort((a,b)=>a-b);
  attempt ??= attempts.at(-1);
  if(!attempts.includes(attempt))throw Error('No such recorded attempt. Take control and start an attempt first.');
  const file=`${attemptPath(run,attempt)}/frames.jsonl`;
  const frames=fs.existsSync(file)?fs.readFileSync(file,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
  return {attempt,attempts,frames};
}
function choose(frames) {
  return [...new Set(Array.from({length:Math.min(4,frames.length)},(_,n)=>frames[Math.round(n*(frames.length-1)/Math.max(1,Math.min(4,frames.length)-1))].index))];
}
export function review(fs,run,attempt,indices) {
  const saved=recording(fs,run,attempt);
  indices ??= choose(saved.frames);
  if(!Array.isArray(indices)||indices.length>4||!indices.length||new Set(indices).size!==indices.length)throw Error('Choose one to four recorded frame indices');
  const content=[{type:'text',text:`Archived attempt ${saved.attempt}: ${saved.frames.length} snapshots, normally 100 ms apart. Available attempts: ${saved.attempts.join(', ')}. These are recorded framebuffers, not the current live state. Call game_input with actions:[] for a fresh view. Use review_attempt with frames:[indices] to inspect any part of this attempt.`}];
  for(const index of indices) {
    const frame=saved.frames.find(frame=>frame.index===number(index,'frame'));
    if(!frame)throw Error(`Frame ${index} is not recorded`);
    content.push({type:'text',text:`Attempt ${saved.attempt}, frame ${index}, ${frame.milliseconds} ms (${frame.tick} fixed ticks) after recording began.`},
      {type:'image',mimeType:'image/png',data:fs.readFileSync(framePath(run,saved.attempt,index)).toString('base64')});
  }
  if(content.reduce((sum,item)=>sum+(item.data?.length||0),0)>700000)throw Error('These frames exceed the model image budget; request fewer frames');
  return {content,details:{attempt:saved.attempt,frames:indices,totalFrames:saved.frames.length}};
}
export function modelContext(messages) {
  const latest=messages.findLastIndex(message=>Array.isArray(message.content)&&message.content.some(part=>part.type==='image'));
  return messages.map((message,n)=>n===latest||!Array.isArray(message.content)?message:{...message,content:message.content.filter(part=>part.type!=='image')});
}
export default function tools(pi) {
  const fs=globalThis.__janisBuiltin('fs'),directory=process.env.DOLLY_BHOP_DIR,run=process.env.DOLLY_BHOP_RUN,input=connect(fs,directory);
  pi.on('context',event=>({messages:modelContext(event.messages)}));
  pi.registerTool({name:'game_input',label:'bhop input',parameters,
    description:'Run a timeline of ordinary keyboard and relative mouse inputs in the unchanged bhop course. Each tick is 10 ms. Keys and mouse movement act simultaneously; mouse_dx/mouse_dy are TOTAL CSS pixels spread evenly over that segment (0.001 pixel precision). Positive x turns right; positive y looks down. One CSS pixel rotates the view by 0.0011 radians. Adjacent segments preserve held keys, and the batch ends by releasing them. Space jumps on a new press, not on every tick; release it between jumps or send wheel:1/-1. R is the ordinary full-course restart. No practice or teleport controls are exposed. Maximum 128 segments and 3000 ticks (30 seconds). Empty actions observes without acting. The game keeps running between calls. Actual framebuffers are recorded every 100 ms throughout agent control, including while inference is pending. Returns sampled frames from this batch; review_attempt can inspect the full recording. Explain your observation and proposed attempt before acting.',
    async execute(_id,args,signal) {
      const image=await input(args.actions,signal),saved=recording(fs,run,image.attempt);
      const sampled=choose(saved.frames.filter(frame=>frame.index>=image.first&&frame.index<=image.last));
      const result=sampled.length?review(fs,run,image.attempt,sampled):{content:[],details:{}};
      result.content.unshift({type:'text',text:`${describe(image)} The following frames show this input batch in time order; the last is its end view. All intermediate snapshots remain available through review_attempt.`});
      if(!sampled.length)result.content.push({type:'image',mimeType:'image/png',data:image.png.toString('base64')});
      result.details={...result.details,frame:image.frame,milliseconds:image.milliseconds,actions:args.actions};return result;
    }});
  pi.registerTool({name:'review_attempt',label:'review attempt',description:'Inspect recorded framebuffer snapshots from an attempt to understand a failed jump and plan the next try. No game-state queries. Omit attempt for the latest recording; omit frames to sample it evenly, or choose up to four exact frame indices. This does not send game inputs.',
    parameters:{type:'object',additionalProperties:false,properties:{attempt:{type:'integer',minimum:1,maximum:999999},frames:{type:'array',minItems:1,maxItems:4,uniqueItems:true,items:{type:'integer',minimum:0,maximum:999999}}}},
    async execute(_id,args,signal){if(signal?.aborted)throw Error('Review cancelled');return review(fs,run,args.attempt,args.frames);}});
}
