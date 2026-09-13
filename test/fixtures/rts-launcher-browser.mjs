import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export async function runRtsLauncherProof({ send, evaluate, key, input, projectDir, downloadDirectory, selectFile }) {
  const screen = pattern => evaluate(`__dolly.waitForInteractiveTerminal(new RegExp(${JSON.stringify(pattern)}, 'm'), 'RTS setup')`);
  const title = text => screen(`^${text}\\s*$`);
  const enter = () => key({ key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
  const escape = () => key({ key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  const clear = () => key({ key: "u", code: "KeyU", modifiers: 2, windowsVirtualKeyCode: 85 });
  const choose = async (heading, filter) => { await title(heading); if (filter) await input(filter); await enter(); };
  const text = () => evaluate("__dolly.visibleTerminalText()");
  const home = () => title("DOLLY / RTS ARENA");
  const shot = async name => {
    await screen(".");
    await new Promise(resolve=>setTimeout(resolve,100));
    await writeFile(resolve(projectDir, `build/rts-setup-${name}.png`),
      (await send("Page.captureScreenshot", { format: "png" })).data, "base64");
  };
  const wait = async (expression, expected) => {
    for (let n=0; n<600; n++) { if (await evaluate(expression) === expected) return; await new Promise(resolve=>setTimeout(resolve,100)); }
    throw Error(`Timed out waiting for ${expression}`);
  };
  await wait("document.documentElement?.dataset.dollyStatus", "ready");
  await home(); await shot("menu");
  const requests = await evaluate("__dolly.httpRequestCount");
  await enter(); await wait("__dolly.graphicsActive", true);
  await new Promise(resolve=>setTimeout(resolve,2000)); await escape(); await home();
  assert.equal(await evaluate("__dolly.httpRequestCount"),requests,"included replay is offline");
  await choose("DOLLY / RTS ARENA", "newmatch"); await choose("New match", "player1");
  await choose("Player 1 provider", "opnrtr"); await title("OpenRouter API key");
  await shot("empty-key");
  const secret = "sk-or-v1-" + "0123456789abcdef".repeat(4);
  await evaluate(`navigator.clipboard.writeText(${JSON.stringify(secret + "\n")})`);
  await key({ key: "V", code: "KeyV", modifiers: 10, windowsVirtualKeyCode: 86 });
  await screen("\\*{20}"); await title("OpenRouter API key");
  assert.doesNotMatch(await text(), /sk-or-v1-|0123456789abcdef/);
  assert.equal(await evaluate("__dolly.httpRequestCount"),requests,"paste does not submit or make network calls");
  await shot("pasted-key"); await enter(); await title("Player 1 model · OpenRouter");
  await input("gem fla"); await screen("> gem fla");
  const selected = async () => (await text()).match(/^→ .+$/m)?.[0];
  const before = await selected(); assert.ok(before);
  await key({key:"ArrowDown",code:"ArrowDown",windowsVirtualKeyCode:40}); await screen("> gem fla");
  assert.notEqual(await selected(),before);
  await key({key:"ArrowUp",code:"ArrowUp",windowsVirtualKeyCode:38}); await screen("> gem fla");
  assert.equal(await selected(),before); await shot("openrouter-models");
  await escape(); await title("Player 1 provider"); await escape(); await title("New match"); await escape(); await home();
  await choose("DOLLY / RTS ARENA", "localcodex"); await choose("Connect local Codex");
  await wait("!!document.querySelector('#file-upload[open]')",true);
  const path = resolve(downloadDirectory,"models.json");
  await writeFile(path,JSON.stringify({ providers: { "codex-local": {
    api:"openai-codex-responses",baseUrl:"http://127.0.0.1:9002",apiKey:"fixture-relay-capability",
    models:[{id:"rts-vision-fixture",name:"Vision fixture",reasoning:true,input:["text","image"],
      thinkingLevelMap:{high:"high",xhigh:"xhigh",low:null},contextWindow:65536,maxTokens:4096,
      cost:{input:0,output:0,cacheRead:0,cacheWrite:0}}],
  } } }));
  await selectFile(path); await home(); await screen("Local Codex configuration imported");
  const configuredRequests = await evaluate("__dolly.httpRequestCount");
  await choose("DOLLY / RTS ARENA", "newmatch");
  for (const player of [1,2]) {
    await choose("New match",`player${player}`); await choose(`Player ${player} provider`,"cdxl");
    await title(`Player ${player} model · Local Codex`);
    if(player===1) {
      await input("nonexistent"); await screen("No matches"); await enter(); await screen("No matches");
      await clear(); await input("rtsvsfx"); await screen("1 / 1 matches");
    }
    await enter(); await title(`Player ${player} reasoning effort`);
    if(player===1) {
      await input("low"); await screen("No matches"); await enter(); await screen("No matches");
      await escape(); await title("Player 1 model · Local Codex"); await enter(); await title("Player 1 reasoning effort");
    }
    await input("high"); await screen("2 / 5 matches");
    if(player===2) await key({key:"ArrowDown",code:"ArrowDown",windowsVirtualKeyCode:40});
    await shot(`effort-${player}`); await enter(); await title("New match");
  }
  await choose("New match","duration"); await title("Match duration"); await input("9"); await enter();
  await screen("Enter a whole number from 10 to 3600"); await escape(); await title("New match");
  assert.match(await text(),/600 seconds/);
  await choose("New match","duration"); await title("Match duration"); await input("10"); await enter(); await title("New match");
  await choose("New match","spending"); await title("Spending limit"); await input("0"); await enter();
  await screen("Enter an amount greater than zero"); await clear(); await input("0.25"); await enter(); await title("New match");
  const review = await text();
  assert.match(review,/rts-vision-fixture · high/); assert.match(review,/rts-vision-fixture · xhigh/);
  assert.match(review,/10 seconds/); assert.match(review,/\$0\.25/); await shot("review");
  await escape(); await home(); await choose("DOLLY / RTS ARENA","newmatch"); await title("New match");
  assert.match(await text(),/rts-vision-fixture · xhigh/); await escape(); await home();
  assert.equal(await evaluate("__dolly.httpRequestCount"),configuredRequests,"review, editing and cancellation make no model calls");
  await choose("DOLLY / RTS ARENA","opnrtr"); await title("OpenRouter API key");
  await input("not-a-key"); await enter(); await screen("Paste an OpenRouter key beginning");
  await escape(); await home();
  assert.doesNotMatch(await text(),/0123456789abcdef|fixture-relay-capability/);
  await choose("DOLLY / RTS ARENA","shell"); await screen("(?:^|\\n)dolly:[^\\n]*\\$\\s*$");
  const check = `const fs=__janisBuiltin('fs');const auth=JSON.parse(fs.readFileSync(process.env.HOME+'/.pi/agent/auth.json','utf8'));if(auth.openrouter?.key!==${JSON.stringify(secret)})throw Error('credential mismatch');if(fs.readdirSync('/tmp').some(name=>name.startsWith('codex-relay-import-')||name.startsWith('dolly-rts-replay-')))throw Error('scratch leak');`;
  const quote = value => "'" + value.replace(/'/g,"'\\''") + "'";
  assert.equal(await evaluate(`__dolly.submit(${JSON.stringify("janis -e " + quote(check))})`),0);
  console.log("browser: RTS selectable setup, inline connection, native masked paste without auto-submit, fuzzy models, supported effort menus, back navigation, editable review, validation, cancellation and credential persistence passed");
}
