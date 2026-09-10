import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const quote = text => "'" + text.replace(/\n/g, " ").replace(/'/g, "'\\''") + "'";

export async function runClassiCubeAgentProof({ send, evaluate, wait, key, input, projectDir, secret, live, liveModel, downloadDirectory, relayFile, selectFile }) {
  await wait("document.documentElement?.dataset.dollyStatus", value => value === "ready", "ClassiCube agent boot");
  const terminal = () => evaluate("__dolly.visibleTerminalText()");
  const screen = text => wait("__dolly.visibleTerminalText()", value => value.includes(text), text);
  const enter = () => key({ key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  const escape = () => key({ key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  const choose = async (title, filter) => { await screen(title); if (filter) await input(filter); await enter(); };
  const snapshot = async name => {
    if (!await evaluate("__dolly.graphicsActive")) {
      await evaluate("__dolly.transport.pushPointer(12, 10, 1, {}); __dolly.transport.pushPointer(12, 10, 0, {}); true");
      await delay(60);
    }
    const result = await send("Page.captureScreenshot", { format: "png" });
    await writeFile(resolve(projectDir, `build/classicube-agent-${name}.png`), result.data, "base64");
  };
  const diagnose = async () => {
    if ((await terminal()).includes("Run finished")) await escape();
    await screen("entering the recovery Slop shell");
    const script = `const fs=globalThis.__janisBuiltin('fs'); for(const name of fs.readdirSync('/workspace/classicube-runs')) {
      for(const file of ['result.txt','agent.stderr.log','game.log']) try {
        console.log(file,fs.readFileSync('/workspace/classicube-runs/'+name+'/'+file,'utf8').replace(/sk-or-v1-[A-Za-z0-9_-]+/g,'[redacted]'));
      } catch {} }`;
    await evaluate(`__dolly.submit(${JSON.stringify(`janis -e ${quote(script)}`)})`);
    throw Error(`ClassiCube run exited early: ${await terminal()}`);
  };
  await screen("Connect an agent");
  assert.equal(await evaluate("__dolly.httpRequestCount"), 0, "loading the setup screen makes no network requests");
  await snapshot("connect");
  if (relayFile) {
    await choose("Connect an agent", "Development: local Codex proxy");
    await wait("!!document.querySelector('#file-upload[open]')", Boolean, "local proxy configuration upload");
    await selectFile(relayFile);
    await screen("Model provider"); await escape();
    await choose("Connect an agent", "Continue with local Codex proxy");
  } else if (live) {
    await choose("Connect an agent", "API key"); await screen("OpenRouter API key:");
    await input(secret); await enter();
  } else {
    await choose("Connect an agent", "Sign in with"); await screen("Authorization code:");
    assert.match((await terminal()).replace(/\s+/g, ""), /code_challenge=[A-Za-z0-9_-]{43}&code_challenge_method=S256/);
    await input("classicube-authorization-fixture"); await enter();
  }
  const model = liveModel || (relayFile ? "gpt-5.6-luna" : live ? "google/gemini-2.5-flash" : "fixture/vision");
  await choose("Model provider", relayFile ? "Local Codex" : model.split("/")[0]);
  await screen("Vision model"); await input(model); await snapshot("models"); await enter();
  await choose("Reasoning effort", "low");
  await screen("Task:");
  const prompt = live
    ? "Look around this world, find nearby ground, place a short row of three blocks, inspect your work, and report what you actually accomplished. Use game_input screenshots and ordinary controls."
    : "CLASSICUBE-FIXTURE-TASK: exercise ordinary game controls and inspect the results.";
  await input(prompt); await enter();
  await screen("Time limit, seconds"); await input(live ? "120" : "90"); await enter();
  if (!relayFile) { await screen("Reported cost limit, USD"); await input("0.25"); await enter(); }
  await screen("Ready to enter the world"); await snapshot("ready");
  const requestsBeforeStart = await evaluate("__dolly.httpRequestCount");
  if (relayFile) {
    assert.equal(requestsBeforeStart, 0, "proxy import, resume and selection make no network requests");
    assert.match(await terminal(), /subscription/);
  } else assert.ok(requestsBeforeStart <= 3, "only sign-in and catalog requests precede Start");
  await enter();
  await wait("__dolly.graphicsActive", Boolean, "agent spectator");
  assert.equal(await evaluate("document.pointerLockElement"), null, "watching the agent needs no pointer capture");
  if (live) {
    await delay(20000); await snapshot("live");
    console.log("browser: live ClassiCube agent running; capturing screenshots and exposed traces");
    await delay(20000);
  } else {
    await delay(18000); await snapshot("working");
  }
  if (!await evaluate("__dolly.graphicsActive")) await diagnose();
  const hash = () => evaluate(`(() => { const c = document.querySelector('#display');
    const p = c.getContext('2d').getImageData(0,0,c.width,c.height).data;
    let h = 2166136261; for (const b of p) h = Math.imul(h ^ b, 16777619); return h >>> 0; })()`);
  const before = await hash();
  await key({ key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 }); await delay(150);
  assert.notEqual(await hash(), before, "Tab collapses the activity panel"); await snapshot("world");
  await key({ key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await enter(); await delay(100);
  await input(live ? "Look at your recent work and describe the result. Stop acting when you have checked it."
    : "Follow-up proof: turn left and walk briefly, then finish. Keep this complete pasted instruction: 日本語 ✓.");
  await snapshot("instruction"); await enter();
  await delay(live ? 20000 : 7000); await snapshot(live ? "live-traces" : "traces");
  await escape(); await wait("__dolly.graphicsActive", value => !value, "stop releases the spectator");
  await screen("Run finished"); await escape();
  await screen("entering the recovery Slop shell");
  const submit = command => evaluate(`__dolly.submit(${JSON.stringify(command)})`);
  const inspect = `const fs=globalThis.__janisBuiltin('fs');
    const root='/workspace/classicube-runs'; const names=fs.readdirSync(root); if(names.length!==1) throw Error('expected one run');
    const dir=root+'/'+names[0];
    const events=fs.readFileSync(dir+'/agent.events.jsonl','utf8').trim().split('\\n').map(JSON.parse);
    const credentialPath=process.env.HOME+'/.pi/agent/'+${JSON.stringify(relayFile ? "models.json" : "auth.json")};
    const credential=JSON.parse(fs.readFileSync(credentialPath,'utf8'));
    const secret=${relayFile ? "credential.providers['codex-local'].apiKey" : "credential.openrouter.key||credential.openrouter.access"}; const files={};
    for(const name of fs.readdirSync(dir)) {
      const data=fs.readFileSync(dir+'/'+name); if(data.includes(Buffer.from(secret))) throw Error('credential in run files');
      if(name!=='final.rgba') files[name]=data.toString('base64');
    }
    const report={events,files,result:fs.readFileSync(dir+'/result.txt','utf8'),
      world:fs.readFileSync('/home/dolly/classicube/maps/agent-world.cw').toString('base64'),
      scratch:fs.readdirSync('/tmp').filter(name=>name.startsWith('classicube-agent-'))};
    fs.writeFileSync('/tmp/classicube-report.json',JSON.stringify(report));
    fs.unlinkSync(credentialPath);
    console.log('CLASSICUBE-REPORT-READY');`;
  assert.equal(await submit(`janis -e ${quote(inspect)}`), 0, `run inspection failed: ${await terminal()}`);
  assert.equal(await submit("download /tmp/classicube-report.json"), 0);
  let bytes;
  for (let n = 0; n < 200 && !bytes; ++n) {
    bytes = await readFile(resolve(downloadDirectory, "classicube-report.json")).catch(() => null);
    if (!bytes) await delay(50);
  }
  assert.ok(bytes, "report downloaded through Dolly's normal file command");
  const report = JSON.parse(bytes);
  const tools = report.events.filter(event => event.type === "tool_result");
  assert.ok(tools.length > 0, "Pi executed game input tools");
  assert.ok(tools.some(event => !event.isError && event.details.actions.length), "real inputs executed");
  assert.ok(report.events.some(event => event.type === "thinking_delta" || event.type === "text_delta"));
  assert.equal(report.events.find(event => event.type === "configuration").thinking, "low");
  assert.equal(report.events.find(event => event.type === "configuration").provider, relayFile ? "codex-local" : "openrouter");
  if (relayFile) assert.equal(JSON.parse(Buffer.from(report.files['task.json'], 'base64')).budget, 0);
  assert.equal(report.scratch.length, 0, "run scratch removed after game exit");
  assert.match(report.result, /Viewer exited \(0\)|Run time limit reached|Reported model cost limit reached/);
  const errors = report.events.filter(event => event.type === "provider_error");
  assert.deepEqual(errors, []);
  if (!live) {
    assert.equal(tools.length, 4); assert.ok(tools.every(event => !event.isError));
    assert.ok(report.events.some(event => event.type === "thinking_delta"));
    assert.ok(report.events.some(event => event.type === "prompt" && event.text === "Follow-up proof: turn left and walk briefly, then finish. Keep this complete pasted instruction: 日本語 ✓."));
    const initial = report.events.find(event => event.type === "observation");
    assert.ok(tools[0].details.frame - initial.frame > 60, "game frames advance during the slow provider response");
    const world = gunzipSync(Buffer.from(report.world, "base64"));
    const tag = Buffer.from([7,0,10,...Buffer.from('BlockArray')]), offset = world.indexOf(tag) + tag.length;
    assert.ok(offset >= tag.length); const size = world.readUInt32BE(offset);
    assert.equal(size, 128 * 64 * 128);
    assert.equal(world.subarray(offset+4, offset+4+size).reduce((n,b)=>n+(b!==0),0), 128 * 32 * 128 + 1,
      "agent clicks add, remove and replace a real block in the saved world");
  }
  await writeFile(resolve(projectDir, `build/classicube-agent-${relayFile ? "relay-live" : live ? "live" : "fixture"}-report.json`), bytes);
  await writeFile(resolve(projectDir, "build/classicube-agent-world.cw"), Buffer.from(report.world, "base64"));
  const requestsBeforeReload = await evaluate("__dolly.httpRequestCount");
  assert.equal(await submit("cd /home/dolly/classicube"), 0);
  await evaluate("window.__classicubeReload = null; void __dolly.submit('classicube maps/agent-world.cw').then(code => window.__classicubeReload = code); true");
  await wait("__dolly.transport.relativePointerRequested()", Boolean, "saved agent world reopens in the upstream game");
  await snapshot("saved-world");
  await key({ key: "c", code: "KeyC", modifiers: 2, windowsVirtualKeyCode: 67 });
  assert.ok([0, 130].includes(await wait("window.__classicubeReload", value => value !== null, "reloaded game exits")));
  assert.equal(await evaluate("__dolly.httpRequestCount"), requestsBeforeReload, "reopening the saved world is offline");
  console.log(`browser: ClassiCube ${relayFile ? "LIVE local Codex proxy" : live ? "LIVE OpenRouter" : "scripted provider"}: setup, Pi tools, continuous game, traces, follow-up, stop/save and secret-free history passed; ${tools.length} tool results`);
}
