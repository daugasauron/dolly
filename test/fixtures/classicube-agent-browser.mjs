import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const quote = text => "'" + text.replace(/\n/g, " ").replace(/'/g, "'\\''") + "'";

export async function runClassiCubeAgentProof({ send, evaluate, wait, key, input, projectDir, secret, live, liveModel, downloadDirectory, relayFile, selectFile }) {
  await wait("document.documentElement?.dataset.dollyStatus", value => value === "ready", "world boot");
  await wait("__dolly.graphicsActive", Boolean, "world display before sign-in");
  await wait("__dolly.transport.relativePointerRequested()", Boolean, "playable world before sign-in");
  const press = (name, code = name, keyCode) => key({ key: name, code, ...(keyCode ? { windowsVirtualKeyCode: keyCode } : {}) });
  const chord = async (name, code, number, modifier = "Control", modifierCode = "ControlLeft", modifierNumber = 17, mask = 2) => {
    await send("Input.dispatchKeyEvent", {type:"keyDown",key:modifier,code:modifierCode,windowsVirtualKeyCode:modifierNumber,modifiers:mask});
    await key({key:name,code,windowsVirtualKeyCode:number,modifiers:mask});
    await send("Input.dispatchKeyEvent", {type:"keyUp",key:modifier,code:modifierCode,windowsVirtualKeyCode:modifierNumber});
  };
  const enter = () => press("Enter", "Enter", 13), escape = () => press("Escape", "Escape", 27);
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
        if(['menu','selection.txt','status.txt','cost.txt','activity.txt','inputs.log'].includes(name)) result[name]=new TextDecoder().decode(data);
        if(name==='control' && data.length===8) result.control=new DataView(data.buffer,data.byteOffset,8).getUint32(4,true);
        if(name==='view.rgba' && data.length>16) result.frame=new DataView(data.buffer,data.byteOffset,16).getUint32(0,true);
      }
      if(path==='/home/dolly/classicube/maps/agent-world.cw') result.world=Array.from(data);
      if(path==='/home/dolly/.config/classicube/agent.json') result.config=JSON.parse(new TextDecoder().decode(data));
      if(path==='/home/dolly/.config/classicube/draft.txt') result.draft=new TextDecoder().decode(data);
      if(path==='/home/dolly/.config/classicube/usage.json') result.usage=JSON.parse(new TextDecoder().decode(data));
      if(path.endsWith('/agent.events.jsonl')) result.events=(result.events||[]).concat(new TextDecoder().decode(data).trim().split('\\n').filter(Boolean).map(JSON.parse));
    }
    return result;
  })()`);
  const state = async (predicate, label, seconds = 45) => {
    const deadline = Date.now() + seconds * 1000; let last;
    do { last = await probe(); if (predicate(last)) return last; await delay(150); } while (Date.now() < deadline);
    throw Error(`${label}: ${JSON.stringify({ menu:last.menu, control:last.control, status:last['status.txt'], config:last.config, events:last.events?.slice(-3) })}`);
  };
  const menu = title => state(s => s.menu?.split('\n')[2] === title && !s.menu.includes('\nbusy\n'), title);
  const choose = async (title, filter) => { await menu(title); if (filter) await input(filter); await enter(); };
  const events = (s, type) => (s.events || []).filter(e => e.type === type);
  assert.equal(await evaluate("__dolly.httpRequestCount"), 0, "booting straight into the world makes no network requests");
  await snapshot("world");
  await click(640,480); await wait("document.pointerLockElement?.id", value=>value==='display', 'human mouse capture');
  await send("Input.dispatchKeyEvent",{type:'keyDown',key:'w',code:'KeyW',windowsVirtualKeyCode:87}); await delay(500);
  await send("Input.dispatchKeyEvent",{type:'keyUp',key:'w',code:'KeyW',windowsVirtualKeyCode:87});
  await escape(); await wait("document.pointerLockElement",value=>value===null,'release human capture'); await delay(150);
  await enter(); await input("Enter works after releasing capture 日本語 ✓");
  await state(s=>s.draft==='Enter works after releasing capture 日本語 ✓', 'Enter reclaims keyboard focus and edits the prompt', 8);
  await chord('a','KeyA',65); await press('Backspace','Backspace',8);
  await state(s=>s.draft==='', 'Ctrl+A clears the prompt');
  await escape();
  await delay(200); await click(1005,28); await menu("Agent settings");
  if (relayFile) {
    await choose("Agent settings", "Local Codex proxy");
    await wait("!!document.querySelector('#file-upload[open]')", Boolean, "proxy upload"); await selectFile(relayFile);
  } else if (live) {
    await choose("Agent settings", "OpenRouter API key"); await menu("OpenRouter API key"); await input(secret); await enter();
  } else {
    await choose("Agent settings", "Sign in with OpenRouter"); await menu("Authorization code");
    await input("classicube-authorization-fixture"); await press("Enter", "NumpadEnter", 13);
  }
  const model = liveModel || (relayFile ? "gpt-5.6-luna" : live ? "google/gemini-2.5-flash" : "fixture/vision");
  await choose("Choose vision model", model); await choose("Choose reasoning effort", "low"); await menu("Agent settings");
  await snapshot("settings");
  const configured = await probe();
  assert.deepEqual(configured.config,{provider:relayFile?'codex-local':'openrouter',model,effort:'low'});
  assert.equal(configured.config.seconds, undefined); assert.equal(configured.config.budget, undefined);
  assert.equal((await evaluate("__dolly.httpRequestCount")),relayFile?0:live?2:3,'setup has no inference calls');
  await press('F2','F2',113);
  await enter(); await input(live ? 'Look around, place three blocks in a short row, inspect them and report what you actually did.' : 'CLASSICUBE-FIXTURE-TASK: exercise ordinary game controls and inspect the results.');
  await snapshot("prompt"); await click(1120,860);
  await state(s=>events(s,'configuration').length>0,'real Pi configuration');
  if(live) { await state(s=>events(s,'tool_result').some(e=>!e.isError && e.details?.actions.length),'live model uses the game controls',75); await snapshot('live'); }
  else await state(s=>events(s,'tool_result').length>=3 && events(s,'settled').length>0,'first task completes');
  await enter(); await input(live ? 'Inspect your recent work and describe it. Stop acting when finished.' : 'Follow-up proof: turn left and walk briefly, then finish. Keep this complete pasted instruction: 日本語 ✓.'); await enter();
  if(live) await delay(18000);
  else await state(s=>events(s,'tool_result').length>=4 && events(s,'settled').length>=2,'Enter sends a follow-up');
  const completed = await probe();
  assert.ok(events(completed,'tool_result').some(e=>!e.isError && e.details.actions.length));
  assert.ok(events(completed,'thinking_delta').length || events(completed,'text_delta').length);
  if(!live) assert.ok(completed.usage.reportedUSD>1,'the world and agent continue beyond the former dollar limit');
  await snapshot(live?'live-traces':'traces');
  if(!live) {
    const count=await evaluate('__dolly.httpRequestCount');
    await enter(); await input('INTERRUPT-PROOF: keep working until I take control.'); await enter();
    await wait('__dolly.httpRequestCount',n=>n>count,'slow inference request begins');
    await press('F6','F6',117); await state(s=>s.control===1,'F6 gives human control immediately');
    await delay(1000); const interrupted=await probe();
    assert.equal(events(interrupted,'tool_result').length,events(completed,'tool_result').length,'interrupted inference executes no inputs');
    await press('F6','F6',117); await state(s=>s.control===2 && events(s,'tool').length>events(completed,'tool').length,'F6 resumes the existing task');
    await press('F6','F6',117); await state(s=>s.control===1,'take over during an active input batch');
    await delay(500);
    const requests = await evaluate('__dolly.httpRequestCount');
    await press('F6','F6',117); await wait('__dolly.httpRequestCount',n=>n>requests,'resume before steering');
    await enter(); await input('STEER-PROOF: inspect before continuing.'); await enter();
    await state(s=>s['status.txt']==='Instruction queued for the agent','Enter steers while inference is running');
    await enter(); await input('REPLACE-PROOF: replace the current instruction.'); await chord('Enter','Enter',13);
    await wait('__dolly.httpRequestCount',n=>n>requests+1,'Ctrl+Enter interrupts and sends a replacement');
    await state(s=>events(s,'tool').length>events(completed,'tool').length+1,'replacement starts an input batch');
    await escape(); await state(s=>s.control===0,'Escape interrupts without closing the world');
    await press('F6','F6',117); await state(s=>s.control===1,'human controls after replacement');
  } else { await press('F6','F6',117); await state(s=>s.control===1,'live agent yields control'); }
  await click(640,480); await wait('document.pointerLockElement?.id',v=>v==='display','human control after agent');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'d',code:'KeyD',windowsVirtualKeyCode:68}); await delay(400);
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'d',code:'KeyD',windowsVirtualKeyCode:68});
  await escape(); await delay(100); await click(240,920);
  const draft='Saved unfinished instruction 日本語 ✓'; await input(draft); await state(s=>s.draft===draft,'clickable editor saves unfinished text');
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
  assert.deepEqual(restored.config,before.config); assert.equal(restored.draft,draft); assert.deepEqual(restored.usage,before.usage);
  assert.equal(await evaluate('__dolly.httpRequestCount'),0,'restoring settings/history does not start model calls');
  await enter(); await snapshot('restored');
  await press('F10','F10',121); await wait('__dolly.graphicsActive',v=>!v,'save and exit');
  await evaluate("__dolly.waitForInteractiveTerminal(/dolly:[^\\n]*\\$\\s*$/, 'recovery shell')");
  const inspect=`const fs=globalThis.__janisBuiltin('fs'); const root='/workspace/classicube-runs'; const report={events:[],files:{}};
    const authPath=process.env.HOME+'/.pi/agent/auth.json', modelsPath=process.env.HOME+'/.pi/agent/models.json';
    const credential=JSON.parse(fs.readFileSync(${relayFile?'modelsPath':'authPath'},'utf8'));
    const secret=${relayFile?"credential.providers['codex-local'].apiKey":"credential.openrouter.key||credential.openrouter.access"};
    for(const name of fs.readdirSync(root)) for(const file of fs.readdirSync(root+'/'+name)) {
      const data=fs.readFileSync(root+'/'+name+'/'+file); if(data.includes(Buffer.from(secret))) throw Error('credential in run files');
      if(file==='agent.events.jsonl') report.events.push(...data.toString('utf8').trim().split('\\n').filter(Boolean).map(JSON.parse));
    }
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
  console.log(`browser: ClassiCube ${live?'LIVE':'scripted'}: immediate manual play, overlay setup, Enter/click/numpad input, agent tools, F6 handoff, interruption, uncapped usage and full config/history/world session restoration passed`);
}
