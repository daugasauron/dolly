// A developed match: four medium Petra AIs on a revealed 256-tile mainland for MINUTES of wall
// time (default 30), a box selection every 15 s and the camera on another base every minute.
// Prints the presented frames' intervals, the simulation's progress and, for the last TRACE
// seconds (default 120), what the engine's thread spent its frames above 100 ms on (V8's sampling
// profiler in a Chrome trace). The adapter is the window's; the round of the task names it.
//   node demos/zero-ad/test/0ad-large-match-browser.mjs [MINUTES] [TRACE]
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {startBrowserServer} from '../../../test/browser-server.mjs';
import {acceptDownload} from '../../browser.mjs';
import {hasGameHud} from './fixtures/0ad-hud.mjs';

const root=new URL('../../../',import.meta.url), output=new URL('../../../.cache/0ad/browser/',import.meta.url);
const minutes=Number(process.argv[2]??30), traceSeconds=Number(process.argv[3]??120);
assert.ok(minutes>0 && traceSeconds>=0 && traceSeconds<minutes*60,
  'usage: node demos/zero-ad/test/0ad-large-match-browser.mjs [MINUTES] [TRACE-SECONDS]');
const match=['-autostart=random/mainland','-autostart-size=256','-autostart-players=4','-autostart-biome=generic/temperate',
  '-autostart-seed=11','-autostart-ceasefire=40','-autostart-visibility=revealed',
  ...['athen','brit','rome','maur'].flatMap((civ,i)=>[`-autostart-civ=${i+1}:${civ}`,`-autostart-ai=${i+1}:petra`,`-autostart-aidiff=${i+1}:3`])];
// The four bases of seed 11 on the minimap at the bottom left of a 1024x768 view.
const bases=[[72,645],[122,638],[125,688],[75,693]];
const longFrame=100;
await mkdir(output,{recursive:true});
const server=await startBrowserServer(root.pathname,'zero-ad');
let browser,page;
try {
  browser=await chromium.launch({channel:'chrome',headless:false,args:['--no-sandbox','--mute-audio','--ozone-platform=x11',
    '--enable-unsafe-webgpu','--use-angle=vulkan','--enable-features=Vulkan,VulkanFromANGLE']});
  page=await browser.newPage({viewport:{width:1024,height:768}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    // The GPU provider reports each frame it presents: the page times them, and marks them in a trace.
    globalThis.frameTimes=[];globalThis.markFrames=false;
    const NativeWorker=Worker;
    globalThis.Worker=class extends NativeWorker {
      constructor(...args) {
        super(...args);
        this.addEventListener('message',({data})=>{
          if(data.type!=='gpu-status' || !data.active || !data.stats) return;
          frameTimes.push(performance.now());
          if(markFrames) {performance.mark('dolly-frame');performance.clearMarks('dolly-frame');}
        });
      }
    };
  });
  await page.goto(server.origin+'/zero-ad/');
  await page.waitForFunction(()=>['ready','failed'].includes(document.documentElement.dataset.dollyStatus),null,{timeout:90000});
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.dollyStatus),'ready');
  await page.waitForFunction(()=>__dolly.gpu.stats?.frames>=90,null,{timeout:60000});
  await page.keyboard.press('Control+F10');
  await page.waitForFunction(()=>!__dolly.graphicsActive);
  await page.evaluate(()=>__dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/,'shell'));
  await page.mouse.click(10,10);
  const submit=command=>page.evaluate(text=>__dolly.submit(text),command);
  const download=async(path,name)=>{
    const running=submit('download '+path),event=acceptDownload(page,()=>running);
    const file=await event;await file.saveAs(new URL(name,output).pathname);assert.equal(await running,0);
    return readFile(new URL(name,output),'utf8');
  };
  const running=()=>page.evaluate(()=>gameStatus===null && !__dolly.gpu.error);
  const loadStart=performance.now();
  await page.evaluate(command=>{globalThis.gameStatus=null;void __dolly.submit(command).then(status=>{globalThis.gameStatus=status;});},
    'zero-ad '+match.join(' '));
  while(!await hasGameHud(page)) {
    assert.ok(await running() && performance.now()-loadStart<300000,'The match never showed its HUD');
    await page.waitForTimeout(500);
  }
  const loadMilliseconds=Math.round(performance.now()-loadStart);
  const firstFrame=await page.evaluate(()=>frameTimes.length);
  await page.screenshot({path:new URL('large-match-start.png',output).pathname});
  const started=performance.now(), end=started+minutes*60000;
  let selections=0,cameraMoves=0,traced=false,provider;
  // The GPU provider's counters: its batches (one kernel call each) and the wall time it spent in them.
  const providerStats=()=>page.evaluate(()=>({...__dolly.gpu.stats}));
  for(let tick=0;performance.now()<end;tick++) {
    if(!traced && traceSeconds && end-performance.now()<=traceSeconds*1000) {
      await browser.startTracing(page,{categories:['disabled-by-default-v8.cpu_profiler','blink.user_timing','toplevel']});
      await page.evaluate(()=>{markFrames=true;});
      traced=true;provider=await providerStats();
    }
    assert.ok(await running(),'The match ended: '+JSON.stringify(await page.evaluate(()=>({status:gameStatus,error:__dolly.gpu.error}))));
    if(tick%4===0) {await page.mouse.click(...bases[cameraMoves%bases.length]);cameraMoves++;}
    await page.mouse.move(300,250);await page.mouse.down();await page.mouse.move(720,520,{steps:5});await page.mouse.up();
    selections++;
    await page.waitForTimeout(Math.max(0,Math.min(15000,end-performance.now())));
  }
  const providerEnd=traced?await providerStats():null;
  const profile=traced?{...longFrameProfile(traceEvents(await browser.stopTracing())),
    providerPerFrame:{frames:providerEnd.frames-provider.frames,batches:+((providerEnd.packets-provider.packets)/(providerEnd.frames-provider.frames)).toFixed(2),
      milliseconds:+((providerEnd.batchWallMilliseconds-provider.batchWallMilliseconds)/(providerEnd.frames-provider.frames)).toFixed(2)}}:null;
  const intervals=await page.evaluate(first=>frameTimes.slice(first).map((time,i,times)=>i?time-times[i-1]:null).slice(1),firstFrame);
  const hud=await hasGameHud(page,await page.screenshot({path:new URL('large-match-end.png',output).pathname}));
  await page.keyboard.press('Control+F10');await page.waitForFunction(()=>gameStatus!==null,null,{timeout:120000});
  assert.equal(await page.evaluate(()=>gameStatus),0);
  assert.equal(await submit('find /opt/0ad/data/replays -name commands.txt > /tmp/replay && cat $(cat /tmp/replay) > /tmp/commands.txt && cat $(dirname $(cat /tmp/replay))/metadata.json > /tmp/metadata.json'),0);
  const turns=[...(await download('/tmp/commands.txt','large-match-commands.txt')).matchAll(/^turn \d+ (\d+)$/gm)];
  const metadata=JSON.parse(await download('/tmp/metadata.json','large-match-metadata.json'));
  const warnings=await download('/opt/0ad/logs/interestinglog.html','large-match-warnings.html');
  const sorted=[...intervals].sort((a,b)=>a-b),percentile=p=>sorted[Math.floor(sorted.length*p)];
  const perMinute=[];
  for(let minute=0,sum=0,count=0,max=0,clock=0,i=0;i<intervals.length;i++) {
    sum+=intervals[i];count++;max=Math.max(max,intervals[i]);clock+=intervals[i];
    if(clock>=(minute+1)*60000 || i===intervals.length-1) {perMinute.push({mean:+(sum/count).toFixed(2),max:+max.toFixed(1)});minute++;sum=count=max=0;}
  }
  const cgroup=(await readFile('/proc/self/cgroup','utf8')).match(/^0::(.*)$/m)?.[1];
  const summary={browser:browser.version(),adapter:await page.evaluate(()=>__dolly.gpu.adapter),minutes,loadMilliseconds,selections,cameraMoves,
    frames:{count:intervals.length,mean:+(intervals.reduce((a,b)=>a+b,0)/intervals.length).toFixed(2),median:+percentile(.5).toFixed(2),
      p95:+percentile(.95).toFixed(2),p99:+percentile(.99).toFixed(2),max:+sorted.at(-1).toFixed(2),
      over33:intervals.filter(time=>time>1000/30).length,over100:intervals.filter(time=>time>longFrame).length,
      over250:intervals.filter(time=>time>250).length},
    simulationSeconds:turns.reduce((sum,[,length])=>sum+Number(length),0)/1000,
    populations:metadata.playerStates.slice(1).map(state=>state.popCount),
    finalHud:hud,warnings:(warnings.match(/class="(error|warning)"/g)??[]).length,pageErrors:errors.length,
    processTreePeakBytes:cgroup?Number(await readFile('/sys/fs/cgroup'+cgroup+'/memory.peak','utf8')):undefined};
  await writeFile(new URL('large-match.json',output),JSON.stringify({summary,perMinute,profile},null,1));
  console.log(JSON.stringify(summary));
  if(profile) console.log(JSON.stringify({...profile,allFrames:undefined}));
  assert.ok(hud,'The match must still show its HUD');
  assert.equal(summary.warnings,0,'The engine logged errors or warnings');
  assert.deepEqual(errors,[]);
} finally {await browser?.close();await server.close();}

// Each profiled thread's samples between consecutive presented frames, summed by function over
// the frames that took longer than longFrame: inclusive (on the stack) and self (on top)
// milliseconds, in full for the engine's thread and the busiest functions of the others
// (the GPU provider's among them), which the engine waits for in its kernel calls; and each
// browser thread's busy milliseconds (its top-level tasks), the GPU process's among them.
// The trace's events one at a time: two minutes of V8's samples are longer than a string can be.
function* traceEvents(trace) {
  let at=trace.indexOf('[',trace.indexOf('"traceEvents"'))+1;
  for(let depth=0,start=0,string=false;at<trace.length;at++) {
    const byte=trace[at];
    if(string) {if(byte===0x5c) at++; else if(byte===0x22) string=false;}
    else if(byte===0x22) string=true;
    else if(byte===0x7b) {if(depth++===0) start=at;}
    else if(byte===0x7d) {if(--depth===0) yield JSON.parse(trace.toString('utf8',start,at+1));}
    else if(byte===0x5d && depth===0) return;
  }
}

function longFrameProfile(events) {
  const profiles=new Map(),marks=[],names=new Map(),tasks=[];
  for(const event of events) {
    if(event.name==='dolly-frame') marks.push(event.ts);
    else if(event.ph==='M' && event.name==='thread_name') names.set(`${event.pid}:${event.tid}`,event.args.name);
    else if(event.ph==='M' && event.name==='process_name') names.set(`${event.pid}`,event.args.name);
    else if(event.ph==='X' && event.cat==='toplevel' && event.name.endsWith('RunTask')) tasks.push(event);
    else if(event.name==='Profile') profiles.set(`${event.pid}:${event.id}`,{time:event.args.data.startTime,nodes:new Map(),samples:[]});
    else if(event.name==='ProfileChunk') {
      const profile=profiles.get(`${event.pid}:${event.id}`),{cpuProfile={},timeDeltas=[]}=event.args.data;
      if(!profile) continue;
      for(const node of cpuProfile.nodes??[]) profile.nodes.set(node.id,{name:node.callFrame.functionName.replace(/(.)\(.*$/,'$1')||'(anonymous)',parent:node.parent});
      (cpuProfile.samples??[]).forEach((node,i)=>{profile.time+=timeDeltas[i];profile.samples.push({node,time:profile.time,weight:timeDeltas[i]/1000});});
    }
  }
  const engine=[...profiles.values()].find(({nodes})=>[...nodes.values()].some(({name})=>name==='CGame::Update'));
  assert.ok(engine && marks.length>1,'The trace holds no engine profile or no presented frames');
  marks.sort((a,b)=>a-b);
  const sums=(profile,frames,inclusiveCount,selfCount)=>{
    const inclusive=new Map(),self=new Map();let total=0;
    for(const {start,end} of frames) for(const sample of profile.samples) {
      if(sample.time<=start || sample.time>end) continue;
      const names=[];for(let id=sample.node;id!==undefined;id=profile.nodes.get(id).parent) names.push(profile.nodes.get(id).name);
      total+=sample.weight;
      self.set(names[0],(self.get(names[0])??0)+sample.weight);
      for(const name of new Set(names)) inclusive.set(name,(inclusive.get(name)??0)+sample.weight);
    }
    const top=(map,count)=>[...map].sort((a,b)=>b[1]-a[1]).slice(0,count).map(([name,ms])=>[name,Math.round(ms)]);
    return {sampledMilliseconds:Math.round(total),inclusive:top(inclusive,inclusiveCount),self:top(self,selfCount)};
  };
  const long=[];
  for(let i=1;i<marks.length;i++) if(marks[i]-marks[i-1]>longFrame*1000) long.push({start:marks[i-1],end:marks[i]});
  const busy=new Map();
  for(const {pid,tid,ts,dur} of tasks) for(const {start,end} of long) {
    const overlap=Math.min(end,ts+dur)-Math.max(start,ts);
    if(overlap<=0) continue;
    const thread=`${names.get(`${pid}`)??pid}: ${names.get(`${pid}:${tid}`)??tid}`;
    busy.set(thread,(busy.get(thread)??0)+overlap/1000);
  }
  const others=[...profiles.values()].filter(profile=>profile!==engine).map(profile=>sums(profile,long,0,8))
    .filter(({self})=>self.some(([name,ms])=>name!=='(idle)' && ms>0)).sort((a,b)=>b.sampledMilliseconds-a.sampledMilliseconds);
  return {windowSeconds:+((marks.at(-1)-marks[0])/1e6).toFixed(1),frames:marks.length-1,longFrames:long.length,
    longFrameMilliseconds:Math.round(long.reduce((sum,{start,end})=>sum+(end-start)/1000,0)),
    longest:long.map(({start,end})=>Math.round((end-start)/1000)).sort((a,b)=>b-a).slice(0,10),
    long:sums(engine,long,40,25),allFrames:sums(engine,[{start:marks[0],end:marks.at(-1)}],40,25),otherThreads:others,
    threadBusyMilliseconds:[...busy].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([thread,ms])=>[thread,Math.round(ms)])};
}
