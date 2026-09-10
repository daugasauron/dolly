import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const quote = text => "'" + text.replace(/\n/g, " ").replace(/'/g, "'\\''") + "'";

export async function runClassiCubeAgentProof({ send, evaluate, wait, key, input, projectDir, secret, live, liveModel, downloadDirectory, relayFile, selectFile, fixture }) {
  await wait("document.documentElement?.dataset.dollyStatus", value => value === "ready", "world boot");
  await wait("__dolly.graphicsActive", Boolean, "world display before sign-in");
  const press = (name, code = name, keyCode) => key({ key: name, code, ...(keyCode ? { windowsVirtualKeyCode: keyCode } : {}) });
  const chord = async (name, code, number, modifier = "Control", modifierCode = "ControlLeft", modifierNumber = 17, mask = 2) => {
    await send("Input.dispatchKeyEvent", {type:"keyDown",key:modifier,code:modifierCode,windowsVirtualKeyCode:modifierNumber,modifiers:mask});
    await key({key:name,code,windowsVirtualKeyCode:number,modifiers:mask});
    await send("Input.dispatchKeyEvent", {type:"keyUp",key:modifier,code:modifierCode,windowsVirtualKeyCode:modifierNumber});
  };
  const type = async text => {
    for (const character of text) await key({key:character,code:/[a-z]/i.test(character)?`Key${character.toUpperCase()}`:character===' '?'Space':'',text:character});
  };
  const fullscreen = async () => {
    const before=await evaluate('!!document.fullscreenElement');
    await press('F11','F11',122);
    await wait('!!document.fullscreenElement',value=>value!==before,'F11 toggles fullscreen');
  };
  const enter = () => press("Enter", "Enter", 13), escape = () => press("Escape", "Escape", 27);
  const tab = () => press("Tab", "Tab", 9), handoff = () => press("`", "Backquote", 192);
  const snapshot = async name => writeFile(resolve(projectDir, `build/classicube-overlay-${name}.png`), (await send("Page.captureScreenshot", { format: "png" })).data, "base64");
  const click = async (x, y, button = "left") => {
    const position = await evaluate(`(() => { const r=document.querySelector('#display').getBoundingClientRect(); return {x:r.x+r.width*${x}/1280,y:r.y+r.height*${y}/960}; })()`);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", ...position, button, buttons: button === "right" ? 2 : 1, clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...position, button, buttons: 0, clickCount: 1 });
  };
  const probe = () => evaluate(`(async () => {
    const name = "classicube-probe";
    await __dolly.saveSession(name);
    document.querySelector("#session-status").style.display = "none";
    const browser=performance.getEntriesByType('resource').find(e=>e.name.endsWith('/src/browser.mjs')).name;
    const store=await import(new URL('session-store.mjs',browser));
    const buffer=await store.decodeSessionSnapshot(await store.loadStoredSession(name));
    await store.deleteStoredSession(name);
    const view=new DataView(buffer), bytes=new Uint8Array(buffer), result={}; let offset=16;
    for(let i=0;i<view.getUint32(12,true);i++) {
      const length=view.getUint32(offset+4,true), size=Number(view.getBigUint64(offset+8,true)); offset+=16;
      const path=new TextDecoder().decode(bytes.subarray(offset,offset+length)); offset+=length;
      const data=bytes.subarray(offset,offset+size); offset+=size;
      if(path.includes('/tmp/classicube-agent-')) {
        const name=path.split('/').pop();
        if(['menu','selection.txt','status.txt','cost.txt','activity.txt','inputs.log','retry'].includes(name)) result[name]=new TextDecoder().decode(data);
        if(name==='control' && data.length===8) result.control=new DataView(data.buffer,data.byteOffset,8).getUint32(4,true);
        if(name==='view.rgba' && data.length>16) {
          result.frame=new DataView(data.buffer,data.byteOffset,16).getUint32(0,true);
          result.pixels=[[600,20],[600,460],[20,460]].map(([x,y])=>Array.from(data.subarray(16+(y*640+x)*4,16+(y*640+x)*4+3)));
        }
      }
      if(path==='/home/dolly/classicube/maps/agent-world.cw') result.world=Array.from(data);
      if(path==='/home/dolly/.config/classicube/agent.json') result.config=JSON.parse(new TextDecoder().decode(data));
      if(path==='/home/dolly/.config/classicube/ui.conf') result.ui=new TextDecoder().decode(data);
      if(path==='/home/dolly/.config/classicube/draft.txt') result.draft=new TextDecoder().decode(data);
      if(path==='/home/dolly/.config/classicube/idle-prompt.txt') result.idlePrompt=new TextDecoder().decode(data);
      if(path==='/home/dolly/.config/classicube/usage.json') result.usage=JSON.parse(new TextDecoder().decode(data));
      if(path.endsWith('/agent.events.jsonl')) result.events=(result.events||[]).concat(new TextDecoder().decode(data).trim().split('\\n').filter(Boolean).map(JSON.parse));
      if(path.endsWith('/world.events.jsonl')) result.worldEvents=(result.worldEvents||[]).concat(new TextDecoder().decode(data).trim().split('\\n').filter(Boolean).map(JSON.parse));
    }
    return result;
  })()`);
  const state = async (predicate, label, seconds = 45) => {
    const deadline = Date.now() + seconds * 1000; let last;
    do { last = await probe(); if (predicate(last)) return last; await delay(150); } while (Date.now() < deadline);
    await writeFile(resolve(projectDir,'build/classicube-overlay-failure.json'),JSON.stringify({events:last.events,worldEvents:last.worldEvents,
      requests:fixture?.requests.map(({index,phase})=>({index,phase}))}));
    throw Error(`${label}: ${JSON.stringify({ menu:last.menu, control:last.control, status:last['status.txt'], config:last.config, events:last.events?.slice(-3) })}`);
  };
  const menu = title => state(s => s.menu?.split('\n')[2] === title && !s.menu.includes('\nbusy\n'), title);
  const choose = async (title, filter) => { await menu(title); if (filter) await type(filter); await enter(); };
  const events = (s, type) => (s.events || []).filter(e => e.type === type);
  const requested = async phase => {
    const deadline = Date.now() + 45000;
    while (!fixture.requests.some(request => request.phase === phase)) {
      if (Date.now() > deadline) throw Error(`Provider request ${phase} was not sent`);
      await delay(100);
    }
  };
  const field = async n => { await menu('Agent settings'); await click(600,280+n*104); };
  const row = async (title, id) => {
    const current=await menu(title), rows=current.menu.split('\n').slice(4).map(line=>line.split('\t'));
    const index=rows.findIndex(row=>row[0]===id); assert.ok(index>=0 && index<10, `visible row ${id}`);
    await click(600,316+index*48);
  };
  const gamePixels = async docked => {
    let actual, expected;
    // The game and viewer are separate workers; a filesystem snapshot can lead the painted frame.
    for(let n=0;n<12;n++) {
      const s=await state(s=>s.frame>0,'world framebuffer'); expected=s.pixels;
      actual=await evaluate(`(() => {const c=document.querySelector('#display'),g=c.getContext('2d');
        return [[600,20],[600,460],[20,460]].map(([x,y])=>Array.from(g.getImageData(Math.floor((x+.5)*${docked?880:1280}/640),${docked?150:0}+Math.floor((y+.5)*${docked?660:960}/480),1,1).data).slice(0,3));})()`);
      if(JSON.stringify(actual)===JSON.stringify(expected)) return;
      await delay(200);
    }
    assert.deepEqual(actual,expected,docked?'panel does not cover the game edges':'hidden interface leaves the complete game unobstructed');
  };
  assert.equal(await evaluate("__dolly.httpRequestCount"),0,'world starts without network calls');
  await state(s=>s.ui?.includes('interface=1') && s.frame>0,'docked controls');
  await gamePixels(true); await snapshot('docked');
  for(const n of [2,6,10]) await press(`F${n}`,`F${n}`,111+n);
  assert.equal(await evaluate('!!document.fullscreenElement'),false,'other function keys do not control this app');
  await state(s=>s.ui.includes('interface=1') && s.control===0,'function keys leave controls unchanged');
  await fullscreen(); await fullscreen();
  await tab(); await state(s=>s.ui.includes('interface=0') && s.control===1,'Tab hides all controls');
  await gamePixels(false); await snapshot('game-only');
  await wait('__dolly.transport.relativePointerRequested()',Boolean,'manual capture requested');
  await click(640,480); await wait("document.pointerLockElement?.id",value=>value==='display','human mouse capture');
  await send("Input.dispatchKeyEvent",{type:'keyDown',key:'w',code:'KeyW',windowsVirtualKeyCode:87}); await delay(500);
  await send("Input.dispatchKeyEvent",{type:'keyUp',key:'w',code:'KeyW',windowsVirtualKeyCode:87});
  await escape(); await delay(150); await enter();
  await press('a','KeyA',65); await chord('B','KeyB',66,'Shift','ShiftLeft',16,8);
  await chord('!','Digit1',49,'Shift','ShiftLeft',16,8);
  await press('é','KeyE',69); await press('あ','KeyA',65);
  await state(s=>s.draft==='aB!éあ','physical keyboard produces layout-aware prompt text',8);
  await fullscreen(); await fullscreen();
  await state(s=>s.draft==='aB!éあ','fullscreen preserves the focused draft');
  await chord('a','KeyA',65); await type('Replacement');
  await state(s=>s.draft==='Replacement','typing replaces selected text');
  await chord('Enter','Enter',13,'Shift','ShiftLeft',16,8); await type('line 2');
  await state(s=>s.draft==='Replacement\nline 2','Shift+Enter inserts a newline');
  await chord('a','KeyA',65); await press('Backspace','Backspace',8);
  await input('Enter works after releasing capture 日本語 ✓');
  await state(s=>s.draft==='Enter works after releasing capture 日本語 ✓','prompt accepts immediate paste',8);
  await tab(); await state(s=>s.ui.includes('interface=0') && s.draft.endsWith('日本語 ✓'),'hiding UI retains draft');
  await tab(); await enter(); await chord('a','KeyA',65); await press('Backspace','Backspace',8);
  await state(s=>s.draft==='','Ctrl+A clears draft'); await escape();
  await click(980,87); const home=await menu('Agent settings');
  assert.deepEqual(home.menu.split('\n').slice(4).map(line=>line.split('\t')[0]),['provider','model','effort','connection']);
  await field(0); const providers=await menu('Provider');
  assert.match(providers.menu,/provider:openrouter/); assert.match(providers.menu,/provider:codex-local/);
  await row('Provider','provider:codex-local');
  const codex=await menu('Codex (local proxy)'); assert.match(codex.menu,/Connect local proxy/); assert.doesNotMatch(codex.menu,/OpenRouter|API key/);
  await snapshot('codex-provider');
  if(relayFile) {
    await row('Codex (local proxy)','relay');
    await wait("!!document.querySelector('#file-upload[open]')",Boolean,'proxy upload'); await fullscreen(); await fullscreen(); await selectFile(relayFile);
  } else {
    await click(210,132); await field(0); await row('Provider','provider:openrouter');
    const router=await menu('OpenRouter'); assert.doesNotMatch(router.menu,/proxy|relay/);
    if(!live) {
      await row('OpenRouter','key'); await menu('OpenRouter API key'); await input('cancelled-input'); await escape();
      await menu('Agent settings'); await field(3); await menu('OpenRouter');
    }
    await row('OpenRouter',live?'key':'oauth');
    await menu(live?'OpenRouter API key':'Authorization code');
    await input(live?secret:'classicube-authorization-fixture'); await press('Enter','NumpadEnter',13);
  }
  const model=liveModel || (relayFile?'gpt-5.6-luna':live?'google/gemini-2.5-flash':'fixture/vision');
  const catalog=await menu('Model');
  const models=catalog.menu.split('\n').slice(4).map(line=>line.split('\t')[0].slice(6));
  if(!live) assert.ok(models.length>10,'exercise a model list with multiple pages');
  await type('no-such-model-zzzz'); await delay(150); await snapshot('no-matches'); await click(600,316);
  assert.equal((await probe()).config.model,'','empty search cannot select an invisible model');
  await click(1035,248); await delay(150);
  if(models.length>10) {
  const region=()=>evaluate(`(() => {const c=document.querySelector('#display'),d=c.getContext('2d').getImageData(190,292,892,480).data;let h=2166136261;for(const b of d)h=Math.imul(h^b,16777619);return h>>>0;})()`);
  const initial=await region();
  const wheel=await evaluate("(() => {const r=document.querySelector('#display').getBoundingClientRect();return {x:r.x+r.width*600/1280,y:r.y+r.height*500/960};})()");
  await send('Input.dispatchMouseEvent',{type:'mouseWheel',...wheel,deltaX:0,deltaY:180}); await delay(200);
  assert.notEqual(await region(),initial,'wheel scrolls visible models without selecting');
  assert.equal((await probe()).config.model,'');
  const track=await evaluate("(() => {const r=document.querySelector('#display').getBoundingClientRect();return {x:r.x+r.width*1096/1280,y:r.y+r.height*300/960,end:r.y+r.height*771/960};})()");
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:track.x,y:track.y,button:'left',buttons:1,clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:track.x,y:track.end,buttons:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:track.x,y:track.end,button:'left',buttons:0,clickCount:1});
  await delay(150); await snapshot('model-scroll'); await click(600,316);
  await state(s=>s.config.model===models.at(-10),'click selects the visible row after scrolling');
  await field(1);
  if(!live) {
    await menu('Model'); await type('fixture/list-'); await press('ArrowDown','ArrowDown',40); await enter();
    await state(s=>s.config.model==='fixture/list-01','arrows and Enter select the next matching model'); await field(1);
  }
  }
  await choose('Model',model); await menu('Agent settings');
  await field(2); await row('Reasoning effort','effort:low'); await menu('Agent settings');
  await chord(',','Comma',188); await chord(',','Comma',188); await menu('Agent settings');
  const configured=await probe(); assert.deepEqual(configured.config,{provider:relayFile?'codex-local':'openrouter',model,effort:'low'});
  assert.equal(await evaluate('__dolly.httpRequestCount'),relayFile?0:live?2:3,'selection makes no inference calls');
  await fullscreen(); await fullscreen(); await snapshot('settings'); await click(1090,132);
  await delay(150); await snapshot('log-panel');
  await click(1210,238); await state(s=>s.ui.includes('activity=0'),'hide activity independently');
  await click(1210,238); await state(s=>s.ui.includes('activity=1'),'restore activity');
  if (!live) {
    await handoff();
    const active = await state(s=>events(s,'prompt').filter(e=>e.source==='idle').length>=3 && s['status.txt'].startsWith('Exploring again') &&
      events(s,'settled').at(-1)?.time>events(s,'prompt').at(-1)?.time,'default exploration starts without a user prompt and repeats',60);
    assert.equal(active.idlePrompt,'Explore the world and have fun.');
    assert.ok(events(active,'prompt').filter(e=>e.source==='idle').every(e=>e.text===active.idlePrompt));
    await escape(); await escape(); await state(s=>s.control===0,'Interrupt pauses autonomous continuation');
    const requests = fixture.requests.length; await delay(6500);
    assert.equal(fixture.requests.length,requests,'paused player never receives an idle ping');
  }
  const instruction=live?'Look around, place three blocks in a short row, inspect them and report what you actually did.':'CLASSICUBE-FIXTURE-TASK: exercise ordinary game controls and inspect the results.';
  await click(980,886); await type(instruction);
  await state(s=>s.draft===instruction,'the complete typed instruction is stored');
  await snapshot('prompt'); await click(1170,886);
  const started=await state(s=>events(s,'configuration').length>0 && events(s,'prompt').some(e=>e.text===instruction),'real Pi configuration');
  assert.equal(events(started,'prompt').find(e=>e.source!=='idle').text,instruction,'Send delivers the complete typed prompt');
  await tab(); await state(s=>s.control===2 && s.ui.includes('interface=0'),'hiding interface keeps agent in control');
  await gamePixels(false); await tab();
  if(live) { await state(s=>events(s,'tool_result').some(e=>!e.isError && e.details?.actions.length),'live model uses the game controls',75); await snapshot('live'); }
  else {
    const complete = await state(s=>events(s,'tool_result').length>=3 && events(s,'settled').some(e=>e.time>events(s,'prompt').find(e=>e.text===instruction).time),'first task completes',90);
    const chats = complete.worldEvents.filter(e=>e.type==='chat').map(e=>Buffer.from(e.bytes));
    assert.deepEqual(chats,[Buffer.from("Hello, team! Let's explore together."),Buffer.from("Chat: 123456789012345678901234! Let's explore.")],
      'chat preserves complete messages across UTF-8 chunks; upstream Classic chat filters non-ASCII without FullCP437 negotiation');
    await snapshot('chat');
  }
  const followup = live ? 'Inspect your recent work and describe it. Stop acting when finished.' : 'Follow-up proof: turn left and walk briefly, then finish. Keep this complete typed instruction.';
  await enter(); await type(followup); await enter();
  if(live) await delay(18000);
  else await state(s=>events(s,'tool_result').length>=4 && events(s,'settled').some(e=>e.time>events(s,'prompt').find(e=>e.text===followup)?.time),'Enter sends a follow-up');
  const completed = await probe();
  assert.ok(events(completed,'tool_result').some(e=>!e.isError && e.details.actions.length));
  assert.ok(events(completed,'thinking_delta').length || events(completed,'text_delta').length);
  if(!live) assert.ok(completed.usage.reportedUSD>1,'the world and agent continue beyond the former dollar limit');
  await snapshot(live?'live-traces':'traces');
  if(!live) {
    await enter(); await type('INTERRUPT-PROOF: keep working until I take control.'); await enter();
    await requested('interrupt');
    await handoff(); await state(s=>s.control===1,'Backtick gives human control immediately');
    await delay(1000); const interrupted=await probe();
    assert.equal(events(interrupted,'tool_result').length,events(completed,'tool_result').length,'interrupted inference executes no inputs');
    await handoff(); await state(s=>s.control===2 && events(s,'tool').length>events(completed,'tool').length,'Backtick resumes the existing task');
    await handoff(); await state(s=>s.control===1,'take over during an active input batch');
    await delay(500);
    await handoff(); await requested('resume-2');
    await enter(); await type('STEER-PROOF: inspect before continuing.'); await enter();
    await state(s=>s['status.txt']==='Instruction queued for the agent','Enter steers while inference is running');
    await enter(); await type('REPLACE-PROOF: replace the current instruction.'); await chord('Enter','Enter',13);
    await requested('replace');
    await state(s=>events(s,'tool').length>events(completed,'tool').length+1,'replacement starts an input batch');
    await escape(); await state(s=>s.control===0,'Escape interrupts without closing the world');
    await handoff(); await state(s=>s.control===1,'human controls after replacement');
  } else { await handoff(); await state(s=>s.control===1,'live agent yields control'); }
  if (!live) {
    const before = await probe(), settled = events(before, 'settled').length;
    await enter(); await type('TRANSIENT-TIMEOUT-PROOF: inspect and finish.'); await enter();
    const retrying = await state(s=>events(s,'retry').length>0,'provider timeout triggers an automatic retry');
    assert.equal(events(retrying,'retry').at(-1).delayMs, 2000);
    await state(s=>events(s,'settled').length>settled && s['status.txt'].startsWith('Exploring again') && s.retry==='', 'transient timeout recovers');
    await enter(); await type('PERSISTENT-TIMEOUT-PROOF: inspect and finish.'); await enter();
    const failed = await state(s=>s.retry==='1' && events(s,'retry_end').some(e=>!e.success), 'exhausted retries stay visible',60);
    assert.match(failed['status.txt'], /Agent error/);
    assert.equal(events(failed,'retry_end').at(-1).success,false);
    await delay(6500); assert.equal((await probe())['status.txt'],failed['status.txt'],'settled and idle continuation must not erase the provider error');
    await snapshot('timeout');
    await click(1170,886);
    const recovered = await state(s=>events(s,'settled').length>events(failed,'settled').length && s['status.txt'].startsWith('Exploring again') && s.retry==='', 'Retry task restarts Pi with its saved conversation');
    assert.equal(events(recovered,'configuration').length,events(failed,'configuration').length+1);
    assert.ok(events(recovered,'observation').length>events(failed,'observation').length,'retry observes the current world');
    assert.equal(events(recovered,'tool').length,events(failed,'tool').length,'completed game actions are not replayed');
    assert.doesNotMatch(recovered['activity.txt'], /undefined ms/);
    await snapshot('reconnected');
    await handoff(); await state(s=>s.control===1,'human controls after provider recovery');
    console.log('browser: injected provider timeout: automatic retry, exhausted retries, persistent error, Retry task with a fresh Pi process, conversation and observation passed');
  }
  await click(640,480); await wait('document.pointerLockElement?.id',v=>v==='display','human control after agent');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'d',code:'KeyD',windowsVirtualKeyCode:68}); await delay(400);
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'d',code:'KeyD',windowsVirtualKeyCode:68});
  await escape(); await delay(100); await tab(); await click(980,886);
  const draft='Saved unfinished instruction 日本語 ✓'; await input(draft); await state(s=>s.draft===draft,'clickable editor saves unfinished text');
  await click(1210,238); await tab();
  await state(s=>s.ui.includes('interface=0') && s.ui.includes('activity=0'),'saved hidden interface and activity');
  await delay(5200); const before = await probe();
  await evaluate("__dolly.saveSession('classicube-world-proof')");
  await send('Page.navigate',{url:await evaluate("new URL('/session/classicube-world-proof',location.href).href")});
  await wait("document.documentElement?.dataset.dollyStatus",v=>v==='ready','restored session boot');
  await wait('__dolly.graphicsActive',Boolean,'restored world display'); await wait('__dolly.transport.relativePointerRequested()',Boolean,'restored playable world');
  const restored=await probe();
  const blocks = bytes => {
    const data = gunzipSync(Buffer.from(bytes)), tag = Buffer.from([7,0,10,...Buffer.from('BlockArray')]);
    const offset = data.indexOf(tag) + tag.length; assert.ok(offset >= tag.length);
    const length = data.readUInt32BE(offset); assert.ok(length > 0);
    return data.subarray(offset + 4, offset + 4 + length);
  };
  assert.deepEqual(blocks(restored.world),blocks(before.world),'restored world retains every block');
  assert.equal(restored.ui,before.ui,'interface visibility survives restore');
  assert.deepEqual(restored.config,before.config); assert.equal(restored.draft,draft); assert.deepEqual(restored.usage,before.usage);
  assert.equal(restored.idlePrompt,before.idlePrompt,'idle instruction survives save/restore');
  assert.equal(await evaluate('__dolly.httpRequestCount'),0,'restoring settings/history does not start model calls');
  await enter(); await snapshot('restored');
  await click(975,934); await wait('__dolly.graphicsActive',v=>!v,'save and exit');
  await evaluate("__dolly.waitForInteractiveTerminal(/dolly:[^\\n]*\\$\\s*$/, 'recovery shell')");
  const inspect=`const fs=globalThis.__janisBuiltin('fs'); const root='/workspace/classicube-runs'; const report={events:[],files:{}};
    const authPath=process.env.HOME+'/.pi/agent/auth.json', modelsPath=process.env.HOME+'/.pi/agent/models.json';
    const credential=JSON.parse(fs.readFileSync(${relayFile?'modelsPath':'authPath'},'utf8'));
    const secret=${relayFile?"credential.providers['codex-local'].apiKey":"credential.openrouter.key||credential.openrouter.access"};
    const inspectDirectory=path=>{for(const file of fs.readdirSync(path)) {
      const entry=path+'/'+file;if(fs.statSync(entry).isDirectory()){inspectDirectory(entry);continue;}
      const data=fs.readFileSync(entry); if(data.includes(Buffer.from(secret))) throw Error('credential in run files');
      if(file==='agent.events.jsonl') report.events.push(...data.toString('utf8').trim().split('\\n').filter(Boolean).map(JSON.parse));
    }};inspectDirectory(root);
    for(const name of ['agent.json','usage.json','draft.txt','conversation.jsonl']) report.files[name]=fs.readFileSync('/home/dolly/.config/classicube/'+name,'utf8');
    report.world=fs.readFileSync('/home/dolly/classicube/maps/agent-world.cw').toString('base64');
    report.scratch=fs.readdirSync('/tmp').filter(n=>n.startsWith('classicube-agent-'));
    fs.writeFileSync('/tmp/classicube-report.json',JSON.stringify(report));
    for(const path of [authPath,modelsPath]) if(fs.existsSync(path)) fs.unlinkSync(path);`;
  assert.equal(await evaluate(`__dolly.submit(${JSON.stringify('janis -e '+quote(inspect))})`),0);
  assert.equal(await evaluate("__dolly.submit('download /tmp/classicube-report.json')"),0);
  let bytes; for(let n=0;n<200&&!bytes;n++){bytes=await readFile(resolve(downloadDirectory,'classicube-report.json')).catch(()=>null);if(!bytes)await delay(50);}
  assert.ok(bytes); const report=JSON.parse(bytes); assert.deepEqual(report.scratch,[]);
  await writeFile(resolve(projectDir,`build/classicube-overlay-${relayFile?'relay-live':live?'live':'fixture'}-report.json`),bytes);
  console.log(`browser: ClassiCube ${live?'LIVE':'scripted'}: unobstructed docked/full game pixels, hide/show panels, F11 fullscreen in game/editor/settings, real keyboard typing, separate settings/log, provider isolation, search/clear/${models.length>10?'wheel/scrollbar/':''}mouse selection, prompt input, agent tools, backtick handoff, interruption and config/history/world/UI restoration passed`);
}
