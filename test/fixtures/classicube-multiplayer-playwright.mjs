import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { decodeWorld } from "../../src/classicube/agent/room.mjs";

export async function runClassiCubeMultiplayer({page, modelsFile, projectDir}) {
  page.setDefaultTimeout(45000);
  await page.waitForFunction(()=>document.documentElement.dataset.dollyStatus==='ready');
  await page.waitForFunction(()=>globalThis.__dolly?.graphicsActive);
  const click = async (x,y) => {
    const r = await page.locator('#display').boundingBox();
    await page.mouse.click(r.x+r.width*x/1280,r.y+r.height*y/960);
  };
  const probe = () => page.evaluate(async()=>{
    await __dolly.saveSession('multiplayer-probe');
    const url=performance.getEntriesByType('resource').find(e=>e.name.endsWith('/src/browser.mjs')).name;
    const store=await import(new URL('session-store.mjs',url));
    const buffer=await store.decodeSessionSnapshot(await store.loadStoredSession('multiplayer-probe'));
    await store.deleteStoredSession('multiplayer-probe');
    document.querySelector('#session-status').style.display='none';
    const bytes=new Uint8Array(buffer),view=new DataView(buffer),decode=new TextDecoder(),result={players:{},events:[],profiles:{},agentEvents:{}};let offset=16;
    for(let n=0;n<view.getUint32(12,true);n++){
      const length=view.getUint32(offset+4,true),size=Number(view.getBigUint64(offset+8,true));offset+=16;
      const path=decode.decode(bytes.subarray(offset,offset+length));offset+=length;
      const data=bytes.subarray(offset,offset+size);offset+=size;
      const match=path.match(/\/tmp\/classicube-agent-[^/]+\/players\/(\d+)\/([^/]+)$/);
      if(match){const p=result.players[match[1]] ||= {},name=match[2];
        if(['ready','status.txt','menu','activity.txt','selection.txt','ended'].includes(name))p[name]=decode.decode(data);
        if(name==='control')p.owner=new DataView(data.buffer,data.byteOffset).getUint32(4,true);
        if(name==='view.rgba'&&data.length>16){const header=new DataView(data.buffer,data.byteOffset);p.frame=header.getUint32(0,true);p.milliseconds=header.getUint32(4,true);}
      }
      if(/\/tmp\/classicube-agent-[^/]+\/watching$/.test(path))result.watching=Number(decode.decode(data));
      const profile=path.match(/^\/home\/dolly\/.config\/classicube\/(?:players\/(\d+)\/)?([^/]+)$/);
      if(profile){const p=result.profiles[profile[1]||1] ||= {};if(['agent.json','draft.txt','last-prompt.txt','usage.json','activity.txt','conversation.jsonl'].includes(profile[2]))p[profile[2]]=decode.decode(data);}
      const events=path.match(/\/player-(\d+)\/agent.events.jsonl$/);
      if(events)(result.agentEvents[events[1]] ||= []).push(...decode.decode(data).trim().split('\n').filter(Boolean).map(JSON.parse));
      if(path==='/home/dolly/.config/classicube/ui.conf')result.ui=decode.decode(data);
      if(path==='/home/dolly/classicube/maps/agent-world.cw')result.world=Array.from(data);
      if(path.endsWith('/world.events.jsonl'))result.events.push(...decode.decode(data).trim().split('\n').filter(Boolean).map(JSON.parse));
      if(path==='/home/dolly/.config/classicube/room.json')result.room=JSON.parse(decode.decode(data));
    }
    return result;
  });
  const state=async(predicate,label,seconds=45)=>{
    const until=Date.now()+seconds*1000;let last;
    do{last=await probe();if(predicate(last))return last;await page.waitForTimeout(700);}while(Date.now()<until);
    throw Error(`${label}: ${JSON.stringify({watching:last.watching,players:Object.fromEntries(Object.entries(last.players).map(([id,p])=>[id,{status:p['status.txt'],ready:p.ready,owner:p.owner,ended:p.ended}])),events:last.events.slice(-12),agentEvents:Object.fromEntries(Object.entries(last.agentEvents).map(([id,events])=>[id,events.slice(-4)]))})}\n${await page.evaluate(()=>__dolly.graphicsActive ? "Graphics still active" : __dolly.visibleTerminalText())}`);
  };
  const initialState=await state(s=>s.players[1]?.ready==='1'&&s.events.some(e=>e.type==='join'&&e.player===1),'first real client joins');
  assert.equal(await page.evaluate(()=>__dolly.httpRequestCount),0,'local multiplayer has no HTTP/socket broker requests');
  const shot=name=>page.screenshot({path:resolve(projectDir,`build/classicube-multi-${name}.png`)});
  const events=(s,id,type)=>(s.agentEvents[id]||[]).filter(e=>e.type===type);
  const menu=title=>state(s=>s.players[s.watching]?.menu?.split('\n')[2]===title,`menu ${title}`);
  const row=async(title,key)=>{const s=await menu(title),rows=s.players[s.watching].menu.split('\n').slice(4);const n=rows.findIndex(r=>r.split('\t')[0]===key);assert.ok(n>=0,key);await click(500,316+n*48);};
  const field=n=>click(600,278+n*104);
  const key=k=>page.keyboard.press(k);
  const type=text=>page.keyboard.type(text,{delay:15});
  const prompt=async(text,replace=false)=>{await key('Enter');await type(text);await key(replace?'Control+Enter':'Enter');};
  const fullscreen=async()=>{const before=await page.evaluate(()=>!!document.fullscreenElement);await key('F11');await page.waitForFunction(before=>!!document.fullscreenElement!==before,before);};
  const measure=async(label)=>{
    const before=await probe();
    const fps=await page.evaluate(()=>new Promise(resolve=>{
      const start=performance.now(),first=Number(document.documentElement.dataset.frameSequence),gaps=[];let previous=start;
      const tick=now=>{gaps.push(now-previous);previous=now;if(now-start<4000)return requestAnimationFrame(tick);
        gaps.sort((a,b)=>a-b);resolve({seconds:(now-start)/1000,presents:Number(document.documentElement.dataset.frameSequence)-first,rafP95:gaps[Math.floor(gaps.length*.95)],rafMax:gaps.at(-1)});};requestAnimationFrame(tick);
    }));
    const after=await probe();fps.presentFPS=fps.presents/fps.seconds;
    fps.gameFPS=(after.players[after.watching].frame-before.players[before.watching].frame)*1000/(after.players[after.watching].milliseconds-before.players[before.watching].milliseconds);
    console.log(`playwright: ${label} ${JSON.stringify(fps)}`);assert.ok(fps.presentFPS>18,`${label} responsive presentation`);return fps;
  };
  await shot('first');
  await key('Enter');await type('Typed [brackets] and spaces');
  await state(s=>s.profiles[1]?.['draft.txt']==='Typed [brackets] and spaces'&&s.watching===1,'physical typing including player shortcut characters');
  await fullscreen();await fullscreen();await key('Control+a');await type('Replacement');
  await key('Shift+Enter');await type('second line');
  await state(s=>s.profiles[1]?.['draft.txt']==='Replacement\nsecond line','selection replacement and newline');
  await key('Control+a');await key('Backspace');await key('Escape');
  await click(980,87);await menu('Agent settings');await field(0);
  await row('Provider','provider:codex-local');
  const codex=await menu('Codex (local proxy)');assert.doesNotMatch(codex.players[1].menu,/OpenRouter|API key/);
  await row('Codex (local proxy)','relay');
  await page.locator('#file-upload[open]').waitFor();await page.locator('#file-upload input').setInputFiles(modelsFile);
  await menu('Model');await type('gpt-5.6-luna');await click(600,316);
  await menu('Agent settings');await field(2);await row('Reasoning effort','effort:low');await menu('Agent settings');
  await fullscreen();await fullscreen();await shot('settings');await click(1090,132);
  const one=await measure('one player');
  await click(770,66);
  await state(s=>s.watching===2&&s.players[2]?.ready==='1'&&s.events.some(e=>e.type==='join'&&e.player===2),'second real client joins');
  await state(s=>s.profiles[2]?.['agent.json']===s.profiles[1]?.['agent.json'],'new player inherits configuration');
  await key('[');await state(s=>s.watching===1&&s.room.selected===1,'previous player persists');
  const exploration='Explore this world using ordinary controls. Look left and right, then walk away from your starting position for at least two seconds total in short batches, checking screenshots for obstacles. Use at most six game_input calls, then describe what you actually saw and stop.';
  await prompt(exploration);
  await state(s=>events(s,1,'prompt').some(e=>e.text===exploration),'complete typed exploration prompt');
  await key(']');await state(s=>s.watching===2,'next player');
  const building='Build a short row of three stone blocks on the nearby ground or treetop. Look down enough to target a reachable surface, select hotbar slot 1, and right click to place. Move sideways between placements and inspect your screenshots. Use at most twelve game_input calls. Verify the actual blocks before claiming success; then stop.';
  await prompt(building);
  await state(s=>events(s,2,'prompt').some(e=>e.text===building),'complete typed building prompt');
  await state(s=>events(s,1,'tool_result').some(e=>!e.isError)&&events(s,2,'tool_result').some(e=>!e.isError),'both independent live agents use real game controls',100);
  await shot('live');
  for(let id=3;id<=4;id++){
    await click(770,66);await state(s=>s.watching===id&&s.players[id]?.ready==='1'&&s.events.some(e=>e.type==='join'&&e.player===id),`player ${id} joins`);
    await prompt(`You are Player ${id}. Survey the world from here. Turn right in four short look batches, inspecting each screenshot, then describe what you saw and stop. Use at most four game_input calls.`);
  }
  const four=await measure('four players while agents work');
  const titleHash=()=>{const data=document.querySelector('#display').getContext('2d').getImageData(900,20,180,30).data;let h=0;for(let n=0;n<data.length;n+=4)h=(Math.imul(h,31)+data[n])|0;return h;};
  const titleBefore=await page.evaluate(titleHash),switchStarted=Date.now();await key('[');
  await page.waitForFunction(({source,before})=>(0,eval)(`(${source})`)()!==before,{source:titleHash.toString(),before:titleBefore});
  four.switchMilliseconds=Date.now()-switchStarted;assert.ok(four.switchMilliseconds<500,'first-person/log switch paints within 500 ms');
  await key(']');
  await click(770,66);assert.equal(Object.keys((await probe()).players).length,4,'capacity enforced');
  await click(240,66);await state(s=>s.watching===2,'watch builder while other clients run');
  const built=await state(s=>s.events.filter(e=>e.type==='block'&&e.player===2&&e.block>0).length>=3,'live agent places three real blocks',150);
  console.log('playwright: real block placements',JSON.stringify(built.events.filter(e=>e.type==='block')));
  await state(s=>[1,2,3,4].every(id=>events(s,id,'tool_result').some(e=>!e.isError)&&events(s,id,'settled').length>0),'all four live tasks finish',150);
  await shot('built');
  const complete=await probe();
  for(const id of [1,2,3,4]){assert.ok(events(complete,id,'thinking_delta').length);assert.equal(events(complete,id,'provider_error').length,0);}
  assert.notEqual(complete.profiles[1]['conversation.jsonl'],complete.profiles[2]['conversation.jsonl'],'independent conversations');
  const position=complete.room.players[0].position;
  const initial=initialState.room.players[0].position;
  assert.ok(Math.hypot(position[0]-initial[0],position[2]-initial[2])>32,'explorer actually moves more than one block');
  await prompt('Keep looking around in short batches until I interrupt you.');
  await state(s=>events(s,2,'prompt').length>1,'follow-up delivered');
  await key('`');const taken=await state(s=>s.players[2].owner===1,'selected player takeover');
  assert.equal(taken.players[1].owner,2,'taking over Player 2 leaves Player 1 ownership unchanged');
  assert.equal(events(taken,1,'interrupt').length,events(complete,1,'interrupt').length,'taking over Player 2 never interrupts Player 1');
  await key('Tab');await state(s=>s.ui.includes('interface=1'),'show traces after takeover');
  await key('Enter');await type('Stop the previous task. Observe once and describe the current view, then finish.');await key('Control+Enter');
  await state(s=>events(s,2,'prompt').length>=3&&s.players[2].owner===2,'replacement after takeover');
  await state(s=>events(s,2,'observation').some(e=>e.time>=events(s,2,'prompt').at(-1).time)&&events(s,2,'settled').some(e=>e.time>=events(s,2,'observation').at(-1).time),'replacement observes and finishes',100);
  await key('`');await state(s=>s.players[2].owner===1,'manual controls after replacement');
  await click(640,480);await page.waitForFunction(()=>document.pointerLockElement?.id==='display');
  await page.keyboard.down('d');await page.waitForTimeout(400);await page.keyboard.up('d');await key('Escape');await key('Tab');
  await key('Enter');await type('Player 2 unfinished [build] instruction');await key('Escape');
  await click(80,66);await key('Enter');await type('Player 1 unfinished exploration');await key('Escape');
  await click(240,66);await state(s=>s.profiles[1]['draft.txt']==='Player 1 unfinished exploration'&&s.profiles[2]['draft.txt']==='Player 2 unfinished [build] instruction','drafts isolated per player');
  await shot('traces');await key('Tab');await state(s=>s.ui.includes('interface=0'),'hide all chrome');await shot('game-only');
  await page.waitForTimeout(5500);const before=await probe();
  const savedWorld=decodeWorld(gunzipSync(Buffer.from(before.world)));
  for(const e of new Map(before.events.filter(e=>e.type==='block').map(e=>[`${e.x},${e.y},${e.z}`,e])).values())assert.equal(savedWorld.blocks[e.x+e.z*savedWorld.width+e.y*savedWorld.width*savedWorld.length],e.block,'actual agent edits are in the saved world');
  await page.evaluate(()=>__dolly.saveSession('multiplayer-world-proof'));
  await page.goto(new URL('/session/multiplayer-world-proof',page.url()).href);
  await page.waitForFunction(()=>document.documentElement.dataset.dollyStatus==='ready'&&__dolly.graphicsActive);
  const restored=await state(s=>Object.keys(s.players).length===4&&Object.values(s.players).every(p=>p.ready==='1')&&s.events.filter(e=>e.type==='join').length>=8,'four-player session restores',75);
  assert.equal(restored.watching,2);assert.equal(restored.ui,before.ui);
  for(let i=0;i<4;i++)assert.ok(restored.room.players[i].position.slice(0,3).every((v,n)=>Math.abs(v-before.room.players[i].position[n])<=4),`player ${i+1} restores position`);
  for(let id=1;id<=4;id++)for(const name of ['agent.json','draft.txt','usage.json','conversation.jsonl'])assert.equal(restored.profiles[id]?.[name],before.profiles[id]?.[name],`player ${id} persisted ${name}`);
  assert.deepEqual(decodeWorld(gunzipSync(Buffer.from(restored.world))).blocks,decodeWorld(gunzipSync(Buffer.from(before.world))).blocks,'every shared world block survives restore');
  assert.equal(await page.evaluate(()=>__dolly.httpRequestCount),0,'restore never starts inference');
  await key('Tab');await shot('restored');await click(975,934);await page.waitForFunction(()=>!__dolly.graphicsActive);
  const report={performance:{one,four},events:before.events,agentEvents:before.agentEvents,profiles:before.profiles,room:before.room};
  const bytes=JSON.stringify(report,null,2),credentials=JSON.parse(await readFile(modelsFile,'utf8'));
  for(const provider of Object.values(credentials.providers||{}))if(provider.apiKey)assert.ok(!bytes.includes(provider.apiKey),'export contains no proxy credential');
  await writeFile(resolve(projectDir,'build/classicube-multiplayer-report.json'),bytes);
  console.log('playwright: LIVE exploration/building, four players, typed prompts, isolated logs/drafts, takeover, F11, hidden UI and full session restore passed');
}
