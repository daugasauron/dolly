import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { firstAttempt } from './bhop-provider.mjs';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

export async function runBhopAgentProof({page,projectDir,fixture,modelsFile,downloadDirectory}) {
  page.setDefaultTimeout(60000);
  await page.waitForFunction(()=>document.documentElement.dataset.dollyStatus==='ready');
  await page.waitForFunction(()=>globalThis.__dolly?.graphicsActive);
  const click=async(x,y)=>{const r=await page.locator('#display').boundingBox();await page.mouse.click(r.x+r.width*x/1280,r.y+r.height*y/960);};
  const key=name=>page.keyboard.press(name);
  const shot=name=>page.screenshot({path:resolve(projectDir,`build/bhop-agent-${fixture?'fixture':'live'}-${name}.png`)});
  const probe=()=>page.evaluate(async()=>{
    const name='bhop-probe';await __dolly.saveSession(name);
    const url=performance.getEntriesByType('resource').find(e=>e.name.endsWith('/src/browser.mjs')).name;
    const store=await import(new URL('session-store.mjs',url));
    const buffer=await store.decodeSessionSnapshot(await store.loadStoredSession(name));await store.deleteStoredSession(name);
    document.querySelector('#session-status').style.display='none';
    const bytes=new Uint8Array(buffer),view=new DataView(buffer),decode=new TextDecoder(),result={events:[],attempts:{},profile:{},game:{}};let offset=16;
    for(let n=0;n<view.getUint32(12,true);n++) {
      const length=view.getUint32(offset+4,true),size=Number(view.getBigUint64(offset+8,true));offset+=16;
      const path=decode.decode(bytes.subarray(offset,offset+length));offset+=length;
      const data=bytes.subarray(offset,offset+size);offset+=size;const file=path.split('/').at(-1);
      if(/^\/tmp\/bhop-agent-[^/]+\/[^/]+$/.test(path)) {
        if(['status.txt','menu','activity.txt','ready','ended'].includes(file))result.game[file]=decode.decode(data);
        if(file==='control')result.game.owner=new DataView(data.buffer,data.byteOffset).getUint32(4,true);
        if(file==='view.rgba'&&data.length>16){const h=new DataView(data.buffer,data.byteOffset);result.game.frame=h.getUint32(0,true);result.game.ms=h.getUint32(4,true);
          result.game.dimensions=[h.getUint32(8,true),h.getUint32(12,true)];}
      }
      if(path.startsWith('/home/dolly/.config/bhop/')&&['agent.json','idle-prompt.txt','draft.txt','usage.json','ui.conf','conversation.jsonl','recording-run.txt'].includes(file))result.profile[file]=decode.decode(data);
      if(path.startsWith('/workspace/bhop-runs/')) {
        if(file==='agent.events.jsonl')result.events.push(...decode.decode(data).trim().split('\n').filter(Boolean).map(JSON.parse));
        const attempt=path.match(/(run-[^/]+\/attempt-\d{6})\/([^/]+)$/);
        if(attempt){const a=result.attempts[attempt[1]]||={frames:[],inputs:[],pngs:0,bytes:0};
          if(['frames.jsonl','inputs.jsonl'].includes(file))a[file==='frames.jsonl'?'frames':'inputs']=decode.decode(data).trim().split('\n').filter(Boolean).map(JSON.parse);
          if(file.endsWith('.png')){a.pngs++;a.bytes+=size;}
        }
      }
    }
    return result;
  });
  const state=async(predicate,label,seconds=60)=>{const end=Date.now()+seconds*1000;let last;
    do{last=await probe();if(predicate(last))return last;await delay(250);}while(Date.now()<end);
    await writeFile(resolve(projectDir,'build/bhop-agent-failure.json'),JSON.stringify(last));
    throw Error(`${label}: ${JSON.stringify({game:last.game,events:last.events.slice(-5)})}`);
  };
  const menu=title=>state(s=>s.game.menu?.split('\n')[2]===title&&!s.game.menu.includes('\nbusy\n'),title);
  const row=async(title,id)=>{const s=await menu(title),rows=s.game.menu.split('\n').slice(4).map(r=>r.split('\t')[0]),n=rows.indexOf(id);assert.ok(n>=0&&n<10,`${title}: ${id}`);await click(600,316+n*48);};
  const events=(s,type)=>s.events.filter(e=>e.type===type);
  const prompt=async text=>{await key('Enter');await page.keyboard.type(text);await state(s=>s.profile['draft.txt']===text,'typed prompt');await key('Enter');};
  const measure=async label=>{
    const before=await probe();
    const presentation=await page.evaluate(()=>new Promise(resolve=>{const start=performance.now(),first=Number(document.documentElement.dataset.frameSequence);let previous=start;const gaps=[];
      const tick=now=>{gaps.push(now-previous);previous=now;if(now-start<4000)return requestAnimationFrame(tick);gaps.sort((a,b)=>a-b);resolve({seconds:(now-start)/1000,presents:Number(document.documentElement.dataset.frameSequence)-first,rafP95:gaps[Math.floor(gaps.length*.95)]});};requestAnimationFrame(tick);
    }));
    const after=await probe();presentation.presentFPS=presentation.presents/presentation.seconds;presentation.gameFPS=(after.game.frame-before.game.frame)*1000/(after.game.ms-before.game.ms);
    console.log(`browser: bhop ${label} ${JSON.stringify(presentation)}`);return presentation;
  };
  let s=await state(s=>s.game.frame>0,'initial game');
  assert.deepEqual(s.game.dimensions,[960,540]);assert.equal(await page.evaluate(()=>__dolly.httpRequestCount),0);
  await shot('start');if(fixture)await measure('without recording');console.log('browser: bhop starts in the original course before provider setup');
  await key('F11');await page.waitForFunction(()=>!!document.fullscreenElement);await key('F11');await page.waitForFunction(()=>!document.fullscreenElement);
  await key('Tab');await state(s=>s.game.owner===1&&s.profile['ui.conf'].includes('interface=0'),'human control');
  await click(640,480);await page.waitForFunction(()=>document.pointerLockElement?.id==='display');
  await page.keyboard.down('w');await delay(350);await page.keyboard.up('w');
  await key('Escape');await delay(150);await key('Tab');
  await click(980,87);await menu('Agent settings');await click(600,280);
  await row('Provider',modelsFile?'provider:codex-local':'provider:openrouter');
  if(modelsFile){await row('Codex (local proxy)','relay');await page.locator('#file-upload input').setInputFiles(modelsFile);}
  else {await row('OpenRouter','key');await menu('OpenRouter API key');await page.keyboard.type('sk-or-v1-bhop-fixture');await key('Enter');}
  await menu('Model');await page.keyboard.type(modelsFile?'gpt-5.6-luna':'fixture/vision');await key('Enter');
  await menu('Agent settings');await click(600,488);await row('Reasoning effort','effort:low');await menu('Agent settings');await click(1090,132);
  s=await probe();assert.deepEqual(JSON.parse(s.profile['agent.json']),{provider:modelsFile?'codex-local':'openrouter',model:modelsFile?'gpt-5.6-luna':'fixture/vision',effort:'low'});
  const instruction=fixture?'BHOP-ATTEMPT: inspect the view, attempt the course, review the snapshots and try again.':
    'Try to complete this bhop course using only the framebuffer and ordinary inputs. First explain what you see. Use game_input to restart with R, then run and attempt a jump with synchronized strafing and mouse turning. Call review_attempt to inspect the recorded snapshots and explain what went wrong. Adjust your inputs and make a second attempt, then briefly report the result. Use at most five game_input calls and two review_attempt calls for this instruction; do not claim completion unless visible.';
  await prompt(instruction);
  s=await state(s=>events(s,'tool_result').filter(e=>!e.isError&&e.details?.actions?.length).length>=2&&
    events(s,'tool_result').some(e=>!e.isError&&e.details?.totalFrames&&!e.details?.actions)&&events(s,'settled').length,'two attempts and review',fixture?100:240);
  assert.ok(events(s,'thinking_delta').length||events(s,'text_delta').length);
  assert.equal(events(s,'provider_error').length,0);
  assert.ok(Object.values(s.attempts).every(a=>a.frames.length===a.pngs));
  await shot('traces');console.log('browser: bhop agent completed two input attempts and reviewed actual snapshots');
  if(fixture) {
    await measure('while recording');
    const first=events(s,'tool_result').find(e=>e.details?.actions?.length)?.details;assert.deepEqual(first.actions,firstAttempt);
    const attempt=Object.entries(s.attempts).find(([name])=>name.endsWith(`/attempt-${String(first.attempt).padStart(6,'0')}`))[1];
    const turns=attempt.inputs.filter(e=>e.type===8);
    assert.equal(turns.reduce((sum,e)=>sum+e.dx_milli,0),123457);assert.equal(turns.reduce((sum,e)=>sum+e.dy_milli,0),-22123);
    assert.equal(turns.length,37);assert.equal(turns[0].tick,36);assert.equal(turns.at(-1).tick,72);
    assert.ok(attempt.inputs.some(e=>e.type===1&&e.code==='Space'&&e.action===1&&e.tick===36));
    assert.ok(attempt.inputs.some(e=>e.type===1&&e.code==='Space'&&e.action===0&&e.tick===73));
    assert.ok(attempt.frames.at(-1).milliseconds>2000,'recordings continue while the model waits between calls');
    const intervals=attempt.frames.slice(1).map((f,n)=>f.tick-attempt.frames[n].tick);assert.ok(intervals.every(n=>n>0&&n<=10));
    await state(s=>events(s,'prompt').some(e=>e.source==='idle')&&s.game['status.txt'].startsWith('Trying again'),'automatic next attempt',30);
    await prompt('BHOP-CANCEL: continue this long input until I take control.');
    await state(s=>Object.values(s.attempts).some(a=>a.inputs.some(e=>e.dx_milli<0)),'long input is running');
  }
  await key('Backquote');s=await state(s=>s.game.owner===1&&Object.values(s.attempts).every(a=>{
    const held=new Set();for(const e of a.inputs)if(e.type===1){if(e.action)held.add(e.code);else held.delete(e.code);}return held.size===0;
  }),'one-key takeover releases the agent keys');
  const before=Object.values(s.attempts).reduce((n,a)=>n+a.inputs.length,0);await delay(800);
  s=await probe();assert.equal(Object.values(s.attempts).reduce((n,a)=>n+a.inputs.length,0),before,'cancelled agent sends no further inputs');
  await click(640,480);await page.waitForFunction(()=>document.pointerLockElement?.id==='display');
  await page.keyboard.down('d');await delay(250);await page.keyboard.up('d');
  if(fixture) {
    const observations=events(await probe(),'observation').length;
    await key('Backquote');await state(s=>s.game.owner===2&&events(s,'observation').length>observations,'one-key return observes before resuming');
    await key('Backquote');await state(s=>s.game.owner===1,'take control again');
  }
  await key('Escape');await delay(150);await key('Tab');
  await state(s=>s.game.owner===0&&s.profile['ui.conf'].includes('interface=1'),'review controls visible');
  await page.waitForFunction(()=>!__dolly.transport.relativePointerRequested()&&!document.pointerLockElement);
  const downloaded=page.waitForEvent('download',{timeout:60000});
  await click(770,66);await shot('exporting');console.log('browser: bhop cancellation passed; exporting attempt replay');
  const download=await downloaded;
  assert.equal(await download.failure(),null);
  const replayPath=resolve(downloadDirectory,'bhop-attempts.html');await download.saveAs(replayPath);
  const replay=await readFile(replayPath,'utf8');assert.doesNotMatch(replay,/sk-or-v1-|Bearer /);
  const reviewPage=await page.context().newPage();
  try {
    await reviewPage.setContent(replay);await reviewPage.waitForFunction(()=>document.querySelector('img').naturalWidth===960);
    assert.ok(await reviewPage.locator('select option').count()>=2);
    await reviewPage.locator('select').selectOption({index:1});
    const first=await reviewPage.locator('img').getAttribute('src');
    await reviewPage.locator('input').focus();await reviewPage.keyboard.press('Home');for(let n=0;n<4;n++)await reviewPage.keyboard.press('ArrowRight');
    assert.notEqual(await reviewPage.locator('img').getAttribute('src'),first);
    await reviewPage.getByRole('button',{name:'Play',exact:true}).click();await delay(250);
    assert.ok(Number(await reviewPage.locator('input').inputValue())>4);
    await reviewPage.screenshot({path:resolve(projectDir,`build/bhop-agent-${fixture?'fixture':'live'}-replay.png`)});
  } finally {await reviewPage.close();}
  await page.bringToFront();await key('Enter');await page.keyboard.type('Saved next attempt');
  s=await state(s=>s.profile['draft.txt']==='Saved next attempt','saved draft');
  await page.evaluate(()=>__dolly.saveSession('bhop-agent-proof'));
  await page.goto(new URL('/session/bhop-agent-proof',page.url()).href);
  await page.waitForFunction(()=>document.documentElement.dataset.dollyStatus==='ready');await page.waitForFunction(()=>__dolly.graphicsActive);
  const restored=await state(s=>s.game.frame>0,'restored game');
  assert.deepEqual(restored.profile,s.profile);assert.deepEqual(restored.attempts,s.attempts);
  assert.equal(await page.evaluate(()=>__dolly.httpRequestCount),0,'restore does not start inference');
  await shot('restored');
  const savedDownload=page.waitForEvent('download',{timeout:60000});await click(770,66);
  const savedReplay=await savedDownload;assert.equal(await savedReplay.failure(),null);
  const savedPath=resolve(downloadDirectory,'bhop-restored-attempts.html');await savedReplay.saveAs(savedPath);
  const savedHTML=await readFile(savedPath,'utf8');assert.equal(savedHTML,replay,'restored attempts remain available through the review button');
  if(fixture) {
    const count=Object.keys(restored.attempts).length;
    await key('Backquote');const next=await state(s=>s.game.owner===2&&Object.keys(s.attempts).length>count,'restored runner starts another numbered recording');
    await key('Backquote');await state(s=>s.game.owner===1,'restored runner returns control');
    for(const [name,attempt] of Object.entries(restored.attempts))assert.deepEqual(next.attempts[name],attempt,'a new attempt does not overwrite a restored recording');
  }
  await writeFile(resolve(projectDir,`build/bhop-agent-${fixture?'fixture':'live'}-report.json`),JSON.stringify({events:restored.events,attempts:restored.attempts}));
  console.log(`browser: bhop ${fixture?'scripted OpenRouter':'LIVE Codex'}: unchanged game framebuffer, typed prompt, precise timed inputs, mid-attempt recording, archive review, automatic retry, handoff/cancellation, F11 and persisted settings/history/recordings passed`);
  if(fixture) {
    await key('q');
    await page.waitForFunction(()=>!__dolly.graphicsActive);
    await page.evaluate(()=>__dolly.waitForInteractiveTerminal(/dolly:\/workspace\$/, 'bhop recovery shell'));
    await page.evaluate(()=>{globalThis.bhopFixtureUpload=null;void __dolly.submit('upload /tmp/bhop-frame-failure.c').then(code=>bhopFixtureUpload=code);});
    await page.locator('#file-upload input').setInputFiles(resolve(projectDir,'test/fixtures/bhop-frame-failure.c'));
    await page.waitForFunction(()=>bhopFixtureUpload!==null);assert.equal(await page.evaluate(()=>bhopFixtureUpload),0);
    assert.equal(await page.evaluate(()=>__dolly.submit('cc -std=c17 -O2 -fno-builtin -Dmain=bhop_main /usr/src/dolly/bhop/bhop.c /usr/src/dolly/bhop/agent/input.c /tmp/bhop-frame-failure.c -o /tmp/bhop-frame-failure-bin -ldolly-raylib -lraylib -lm')),0);
    assert.equal(await page.evaluate(()=>__dolly.submit('/tmp/bhop-frame-failure-bin')),0);
    const output=await page.evaluate(()=>__dolly.visibleTerminalText());
    assert.equal(output.match(/live preview update failed/g)?.length,1);
    assert.match(output,/live preview recovered/);
    assert.match(output,/missing preview files recovered; agent response and recording survived/);
    await shot('preview-recovery');
    console.log('browser: bhop missing preview files recover without ending the game, agent response or recording');
  }
}
