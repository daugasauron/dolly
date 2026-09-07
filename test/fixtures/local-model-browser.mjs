import assert from "node:assert/strict";
import { LOCAL_MODELS, DEFAULT_LOCAL_MODEL } from "../../src/local-model-contract.mjs";

export async function runLocalMenuProof(evaluate, press) {
  assert.equal(await evaluate("document.querySelector('#local-model').hidden"), true);
  assert.equal(await evaluate("document.querySelectorAll('#local-model button, #local-model select').length"), 0);
  await evaluate(`globalThis.__menuKeys=[]; globalThis.__menuPushKey=__dolly.transport.pushKey;
    __dolly.transport.pushKey=function(event){if(event.type==='keydown')__menuKeys.push(event.code);return __menuPushKey.call(this,event);}; true`);
  try {
    const toggle = () => press({ key: "L", code: "KeyL", modifiers: 10, windowsVirtualKeyCode: 76 });
    await toggle();
    const opened = await evaluate(`(() => {
      const panel=document.querySelector('#local-model'), rect=panel.getBoundingClientRect();
      return {hidden:panel.hidden,color:getComputedStyle(panel).backgroundColor,top:rect.top,
        right:innerWidth-rect.right,focused:document.activeElement.dataset.model};
    })()`);
    assert.equal(opened.hidden, false);
    assert.equal(opened.color, "rgb(242, 212, 92)");
    assert.ok(opened.top < 20 && opened.right < 20);
    assert.equal(opened.focused, DEFAULT_LOCAL_MODEL.id);
    await press({ key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 });
    assert.equal(await evaluate("document.activeElement.dataset.model"), LOCAL_MODELS[1].id);
    assert.equal(await evaluate("document.querySelector('#local-model').dataset.state"), "unloaded");
    await press({ key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    assert.equal(await evaluate("document.querySelector('#local-model').hidden && document.activeElement.id==='keyboard'"), true);
    await toggle();
    await toggle();
    assert.equal(await evaluate("document.querySelector('#local-model').hidden"), true);
    assert.deepEqual(await evaluate("__menuKeys"), []);
    await toggle();
    await evaluate("document.querySelector('#local-model-help summary').focus()");
    await press({ key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
    assert.equal(await evaluate("document.querySelector('#local-model-help').open"), true);
    assert.equal(await evaluate("document.querySelector('#local-model').dataset.state"), "unloaded");
    await evaluate("document.querySelector('#local-model-help').open = false; true");
  } finally {
    await evaluate("__dolly.transport.pushKey=__menuPushKey; true");
  }
  console.log("browser: yellow model menu starts hidden; Ctrl+Shift+L, arrows and Escape preserve terminal input/focus");
}

export async function runLocalCacheProof(evaluate) {
  const setup = await evaluate(`(async () => {
    const {LocalModelService} = await import(new URL('../src/local-model-service.mjs', document.baseURI));
    const rpc = LocalModelService.prototype.rpc;
    LocalModelService.prototype.rpc = () => Promise.reject(new Error('No hardware WebGPU adapter: fixture'));
    try {
      document.querySelector('#local-model [data-action=load]').click();
      await new Promise(resolve => setTimeout(resolve, 20));
      const help = document.querySelector('#local-model-help');
      return {state:document.querySelector('#local-model').dataset.state, open:help.open,
        text:help.textContent, link:help.querySelector('a').href};
    } finally { LocalModelService.prototype.rpc = rpc; }
  })()`);
  assert.equal(setup.state, "error");
  assert.equal(setup.open, true);
  assert.match(setup.text, /chrome:\/\/settings\/system/);
  assert.match(setup.text, /chrome:\/\/gpu/);
  assert.match(setup.text, /experimental/);
  assert.match(setup.link, /docs\/browser-local-models.md#chrome-setup$/);
  const result = await evaluate(`(async () => {
    const names = ['webllm/model','webllm/config','webllm/wasm','local-cache-session-proof'];
    for (const name of names) await new Promise((resolve,reject) => {
      const request = indexedDB.open(name,1);
      request.onupgradeneeded = () => request.result.createObjectStore('proof');
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error);
    });
    const fetchRequest = globalThis.fetch;
    let fetches = 0;
    globalThis.fetch = () => { fetches++; return Promise.reject(new Error('Cache removal must stay local')); };
    const panel = document.querySelector('#local-model');
    try {
      for (let attempt=0; attempt<2; attempt++) {
        panel.querySelector('[data-action=remove]').click();
        for(let poll=0; panel.dataset.state==='clearing' && poll<100; poll++) await new Promise(r=>setTimeout(r,20));
        if(panel.dataset.state!=='unloaded') throw new Error(panel.querySelector('[role=status]').textContent);
      }
      const remaining = (await indexedDB.databases()).map(db=>db.name);
      return {fetches, modelDatabases:remaining.filter(name=>names.slice(0,3).includes(name)), session:remaining.includes(names[3])};
    } finally { globalThis.fetch = fetchRequest; indexedDB.deleteDatabase(names[3]); }
  })()`);
  assert.deepEqual(result, { fetches: 0, modelDatabases: [], session: true });
  console.log("browser: cache removal works before/after caching, makes no Fetch calls, and preserves other databases");
}

export async function runLocalModelProof({ evaluate, wait, submit, press, setOffline }) {
  console.log("browser: checking local provider discovery in Pi");
  assert.equal(await submit("pi --list-models webgpu > /tmp/local-models.txt"), 0);
  for (const model of LOCAL_MODELS) assert.equal(await submit(`grep -q ${model.id} /tmp/local-models.txt`), 0);
  const gpu = await evaluate(`(async () => {
    const adapter = await navigator.gpu?.requestAdapter({powerPreference:'high-performance'});
    return adapter ? { vendor: adapter.info.vendor, architecture: adapter.info.architecture,
      description: adapter.info.description, f16: adapter.features.has('shader-f16') } : null;
  })()`);
  assert.ok(gpu?.f16, `WebGPU shader-f16 required: ${JSON.stringify(gpu)}`);
  console.log("browser: GPU", JSON.stringify(gpu));
  await evaluate(`(async () => {
    const {LocalModelService} = await import(new URL('../src/local-model-service.mjs', document.baseURI));
    const originalLoad = LocalModelService.prototype.load;
    LocalModelService.prototype.load = function(...args) { globalThis.__localService = this; return originalLoad.apply(this,args); };
    const originalFetch = LocalModelService.prototype.fetch;
    globalThis.__localRequests = [];
    LocalModelService.prototype.fetch = function(url, init) {
      if (init.body) __localRequests.push(JSON.parse(new TextDecoder().decode(init.body)));
      return originalFetch.call(this, url, init);
    };
  })()`);
  await press({ key: "L", code: "KeyL", modifiers: 10, windowsVirtualKeyCode: 76 });
  const picker = await evaluate(`(() => {
    const panel=document.querySelector('#local-model'), rows=[...panel.querySelectorAll('[data-model]')];
    const initial=document.activeElement.dataset.model, options=rows.map(row=>row.dataset.model);
    rows[1].focus();
    const preview={state:panel.dataset.state,loadStarted:!!globalThis.__localService,download:rows[1].textContent};
    rows[0].focus();
    return {initial,options,preview};
  })()`);
  assert.equal(picker.initial, DEFAULT_LOCAL_MODEL.id);
  assert.deepEqual(picker.options, LOCAL_MODELS.map(m => m.id));
  assert.equal(picker.preview.state, "unloaded");
  assert.equal(picker.preview.loadStarted, false);
  assert.match(picker.preview.download, /0.42 GB/);
  await press({ key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  const started = Date.now();
  const state = await wait("({state:document.querySelector('#local-model').dataset.state, detail:document.querySelector('#local-model [role=status]').textContent})",
    v => ["ready", "error", "unloaded"].includes(v.state), "Qwen load", 6000);
  console.log("browser: model load", Date.now() - started, "ms", JSON.stringify(state));
  assert.equal(state.state, "ready", state.detail);
  await evaluate(`globalThis.__completeLocal = async function(extra) {
    const response = await __localService.fetch(new URL('https://webgpu.dolly.invalid/v1/chat/completions'), {
      method:'POST', signal:new AbortController().signal,
      body:new TextEncoder().encode(JSON.stringify({model:__localService.model.id,stream:true,max_tokens:256,...extra}))
    });
    return response.text();
  }; true`);
  const hello = await evaluate(`__completeLocal({messages:[{role:'user',content:'Reply with exactly: hello Dolly'}]})`);
  console.log("browser: text response", hello.slice(-800));
  assert.match(hello, /hello/i);
  assert.match(hello, /\[DONE\]/);
  const copied = await evaluate(`__completeLocal({temperature:0,messages:[
    {role:'system',content:'Repeat the user text exactly. No explanation, no quotes.'},
    {role:'user',content:'A 내용 B'}]})`);
  const content = stream => stream.split("\n").filter(line => line.startsWith("data: {")).flatMap(line =>
    JSON.parse(line.slice(6)).choices ?? []).map(choice => choice.delta?.content ?? "").join("");
  assert.match(content(copied), /^A\s+내용\s+B$/, "ordinary Qwen 3.5 tokens must not terminate generation");
  console.log("browser: Korean output survives the obsolete Qwen 2 stop-token IDs");
  const literal = await evaluate(`__completeLocal({temperature:0,messages:[
    {role:'system',content:"Return the user's JSON unchanged. No code fences or explanation."},
    {role:'user',content:JSON.stringify({value:'A $& B'})}]})`);
  assert.deepEqual(JSON.parse(content(literal)), { value: "A $& B" }, "prompt templates must preserve literal source text");
  console.log("browser: literal dollar sequences reach the model unchanged");
  const tool = await evaluate(`__completeLocal({messages:[{role:'user',content:'Read /tmp/example.txt using the read tool.'}],
    tools:[{type:'function',function:{name:'read',description:'Read a file',parameters:{type:'object',properties:{path:{type:'string'}},required:['path'],additionalProperties:false}}}]})`);
  console.log("browser: tool response", tool.slice(-1000));
  assert.match(tool, /tool_calls/);
  assert.match(tool, /example.txt/);
  const startedPi = Date.now();
  const status = await submit("pi --provider webgpu --model Qwen3.5-2B-q4f16_1-MLC --no-session -p 'Use the bash tool to run: printf LOCAL-QWEN-OK > /tmp/local-qwen-proof.txt . Then read that file with the read tool and tell me its content.' > /tmp/local-qwen-answer.txt 2>&1");
  console.log("browser: Pi turn", Date.now() - startedPi, "ms; status", status);
  console.log("browser: requests", JSON.stringify(await evaluate("__localRequests.map(r=>({messages:r.messages.length,tools:r.tools?.map(t=>t.function.name),bytes:JSON.stringify(r).length}))")));
  await submit("cat /tmp/local-qwen-answer.txt");
  console.log("browser: Pi output", await evaluate("__dolly.visibleTerminalText()"));
  assert.equal(status, 0);
  assert.equal(await submit("grep -q LOCAL-QWEN-OK /tmp/local-qwen-proof.txt"), 0);
  const readStatus = await submit("timeout 45 pi --provider webgpu --model Qwen3.5-2B-q4f16_1-MLC --no-session -p 'Read /tmp/local-qwen-proof.txt using the read tool, then answer with its exact contents.' > /tmp/local-qwen-read.txt 2>&1");
  await submit("cat /tmp/local-qwen-read.txt");
  console.log("browser: Pi read result", await evaluate("__dolly.visibleTerminalText()"));
  assert.equal(readStatus, 0);
  assert.equal(await submit("grep -q LOCAL-QWEN-OK /tmp/local-qwen-read.txt"), 0);
  const calls = await evaluate("__localRequests.flatMap(r=>r.messages.filter(m=>m.role==='assistant').flatMap(m=>m.tool_calls??[])).map(c=>c.function.name)");
  assert.ok(calls.includes("bash") && calls.includes("read"), `Missing actual Pi tool history: ${JSON.stringify(calls)}`);
  console.log("browser: real Qwen tool use wrote the shared Dolly filesystem");
  await evaluate(`globalThis.__longPi = null; void __dolly.submit(${JSON.stringify("timeout 30 pi --provider webgpu --model Qwen3.5-2B-q4f16_1-MLC --no-session -p 'Write out every integer from 1 to 2000, without tools, without abbreviation.' > /tmp/local-long.txt 2>&1")}).then(status => { __longPi = status; }); true`);
  await wait("__localService.state", state => state === "generating", "Pi generation before cancellation", 300);
  const cancelledAt = Date.now();
  await evaluate("document.querySelector('#local-model [data-action=stop]').click()");
  const stopped = await wait("__longPi", value => value !== null, "Pi cancellation", 300);
  assert.notEqual(stopped, 0);
  const released = await wait("({state:__localService.state,detail:__localService.detail})",
    value => ["ready", "error", "unloaded"].includes(value.state), "model lease released", 100);
  assert.equal(released.state, "ready", released.detail);
  console.log("browser: cancellation returned to the shell in", Date.now() - cancelledAt, "ms");
  const afterCancel = await evaluate(`__completeLocal({messages:[{role:'user',content:'Reply with hello.'}]})`);
  assert.match(afterCancel, /hello/i);
  assert.match(afterCancel, /\[DONE\]/);
  assert.equal(await submit("grep -q LOCAL-QWEN-OK /tmp/local-qwen-proof.txt"), 0);
  console.log("browser: generation and shared files survive cancellation");
  const greeting = await evaluate(`__completeLocal({messages:[{role:'user',content:'Hello! Reply with a short greeting.'}],tools:__localRequests.find(r=>r.tools?.some(t=>t.function.name==='bash')).tools})`);
  assert.doesNotMatch(greeting, /"tool_calls"/);
  assert.match(greeting, /\[DONE\]/);
  await setOffline(true);
  try {
    assert.equal(await evaluate("fetch(new URL('../Dollyfile-pi',document.baseURI)).then(()=>false,()=>true)"), true);
    assert.equal(await submit("timeout 45 pi --provider webgpu --model Qwen3.5-2B-q4f16_1-MLC --no-session -p 'Read /tmp/local-qwen-proof.txt with the read tool and repeat its contents.' > /tmp/local-offline.txt 2>&1"), 0);
    assert.equal(await submit("grep -q LOCAL-QWEN-OK /tmp/local-offline.txt"), 0);
    console.log("browser: Pi read and answered while browser networking was offline");
  } finally { await setOffline(false); }
  await evaluate(`globalThis.__loadProgress = []; __localService.addEventListener('change',()=>__loadProgress.push(__localService.detail));
    document.querySelector('#local-model [data-action=unload]').click();
    document.querySelector('#local-model [data-action=load]').click(); true`);
  const warmStarted = Date.now();
  await wait("__localService.state", state => state === "ready" || state === "error", "reload from cached model", 1200);
  assert.equal(await evaluate("__localService.state"), "ready");
  assert.deepEqual(await evaluate("__loadProgress.filter(text=>text.startsWith('Downloading and verifying'))"), []);
  console.log("browser: model reload", Date.now() - warmStarted, "ms with zero model asset downloads");
  for (const model of [...LOCAL_MODELS.slice(1), DEFAULT_LOCAL_MODEL]) {
    const previous = await evaluate("__localService.model.id");
    const selection = await evaluate(`(() => {
      const row=document.querySelector('#local-model [data-model="${model.id}"]');
      row.focus();
      return {model:__localService.model.id,disabled:row.getAttribute('aria-disabled')};
    })()`);
    assert.equal(selection.model, previous);
    assert.equal(selection.disabled, "false");
    const denied = await evaluate(`(async () => {
      const response=await __localService.fetch(new URL('https://webgpu.dolly.invalid/v1/chat/completions'),
        {method:'POST',body:new TextEncoder().encode(JSON.stringify({model:${JSON.stringify(model.id)},stream:true,messages:[{role:'user',content:'hello'}]}))});
      return {status:response.status,body:await response.text()};
    })()`);
    assert.equal(denied.status, 409);
    assert.ok(denied.body.includes(model.id));
    const switching = Date.now();
    await evaluate(`__loadProgress=[]; document.querySelector('#local-model [data-model="${model.id}"]').click()`);
    assert.equal(await evaluate(`document.querySelector('#local-model [data-model="${model.id}"]').getAttribute('aria-disabled')`), "true");
    const loaded = await wait("({state:__localService.state,model:__localService.model?.id,detail:__localService.detail})",
      v => ["ready", "error"].includes(v.state), `load ${model.id}`, 6000);
    assert.equal(loaded.state, "ready", loaded.detail);
    assert.equal(loaded.model, model.id);
    const downloads = await evaluate("__loadProgress.filter(text=>text.startsWith('Downloading and verifying')).length");
    if (model === DEFAULT_LOCAL_MODEL) assert.equal(downloads, 0);
    console.log("browser: switched to", model.id, "in", Date.now() - switching, "ms; asset downloads", downloads);
    const answer = await evaluate("__completeLocal({messages:[{role:'user',content:'Reply with exactly: hello Dolly'}]})");
    assert.match(answer, /hello/i);
    assert.match(answer, /\[DONE\]/);
    assert.ok(answer.includes(model.id));
  }
  assert.equal(await submit("grep -q LOCAL-QWEN-OK /tmp/local-qwen-proof.txt"), 0);
  console.log("browser: all three model sizes generated text; switching preserved Dolly files and reused the 2B cache");
  let previousTokens = 0;
  for (let turn = 1; turn <= 14; turn++) {
    const answer = await evaluate(`__completeLocal({max_tokens:8,stream_options:{include_usage:true},
      messages:[{role:'user',content:'Test data:'+ ' hello'.repeat(${turn * 900})+'\\nReply with hello.'}]})`);
    assert.match(answer, /\[DONE\]/);
    const chunks = answer.split("\n").filter(line => line.startsWith("data: {")).map(line => JSON.parse(line.slice(6)));
    const usage = chunks.find(chunk => chunk.usage)?.usage;
    assert.ok(usage?.prompt_tokens > previousTokens + 500, "stress prompts must exercise increasing context sizes");
    previousTokens = usage.prompt_tokens;
  }
  console.log("browser: 14 growing prompts reached", previousTokens, "tokens without exhausting the GPU");
  if (process.env.DOLLY_LOCAL_REMOVE_CACHE === "1") {
    await evaluate("document.querySelector('#local-model [data-action=remove]').click()");
    const cleared = await wait("({state:__localService.state,detail:__localService.detail})",
      value => ["unloaded", "error"].includes(value.state), "remove cached model", 300);
    assert.equal(cleared.state, "unloaded", cleared.detail);
    assert.match(cleared.detail, /removed/);
    console.log("browser: all model caches removed through browser controls");
  }
}
