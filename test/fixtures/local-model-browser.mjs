import assert from "node:assert/strict";
import { LOCAL_MODELS, DEFAULT_LOCAL_MODEL } from "../../src/local-model-contract.mjs";

export async function runLocalCacheProof(evaluate) {
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

export async function runLocalModelProof({ evaluate, wait, submit, setOffline }) {
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
    document.querySelector('#local-model').open = true;
  })()`);
  const picker = await evaluate(`(() => {
    const panel=document.querySelector('#local-model'), select=panel.querySelector('select');
    const initial=select.value, options=[...select.options].map(option=>option.value);
    select.value=options[1]; select.dispatchEvent(new Event('change'));
    const preview={state:panel.dataset.state,loadStarted:!!globalThis.__localService,download:panel.querySelector('[data-download]').textContent};
    select.value=initial; select.dispatchEvent(new Event('change'));
    return {initial,options,preview};
  })()`);
  assert.equal(picker.initial, DEFAULT_LOCAL_MODEL.id);
  assert.deepEqual(picker.options, LOCAL_MODELS.map(m => m.id));
  assert.equal(picker.preview.state, "unloaded");
  assert.equal(picker.preview.loadStarted, false);
  assert.match(picker.preview.download, /0.42 GB/);
  await evaluate("document.querySelector('#local-model [data-action=load]').click()");
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
  await wait("__localService.state", state => state === "ready", "model lease released", 100);
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
      const panel=document.querySelector('#local-model'), select=panel.querySelector('select');
      select.value=${JSON.stringify(model.id)}; select.dispatchEvent(new Event('change'));
      return {model:__localService.model.id,button:panel.querySelector('[data-action=load]').textContent};
    })()`);
    assert.equal(selection.model, previous);
    assert.equal(selection.button, "Switch and load");
    const denied = await evaluate(`(async () => {
      const response=await __localService.fetch(new URL('https://webgpu.dolly.invalid/v1/chat/completions'),
        {method:'POST',body:new TextEncoder().encode(JSON.stringify({model:${JSON.stringify(model.id)},stream:true,messages:[{role:'user',content:'hello'}]}))});
      return {status:response.status,body:await response.text()};
    })()`);
    assert.equal(denied.status, 409);
    assert.ok(denied.body.includes(model.id));
    const switching = Date.now();
    await evaluate("__loadProgress=[]; document.querySelector('#local-model [data-action=load]').click()");
    assert.equal(await evaluate("document.querySelector('#local-model select').disabled"), true);
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
  if (process.env.DOLLY_LOCAL_REMOVE_CACHE === "1") {
    await evaluate("document.querySelector('#local-model [data-action=remove]').click()");
    const cleared = await wait("({state:__localService.state,detail:__localService.detail})",
      value => ["unloaded", "error"].includes(value.state), "remove cached model", 300);
    assert.equal(cleared.state, "unloaded", cleared.detail);
    assert.match(cleared.detail, /removed/);
    console.log("browser: all model caches removed through browser controls");
  }
}
