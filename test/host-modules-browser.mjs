import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium, firefox} from 'playwright-core';
import {startBrowserServer} from './browser-server.mjs';
import {parseWasmInterface} from '../src/wasm-interface.mjs';
import {executableHostRequirements} from '../src/host/requirements.mjs';

const kind=process.argv[2]??'chrome', output=`build/host-modules-contract-${kind}`;
const overrides=new Map(), server=await startBrowserServer(process.cwd(),'system',0,overrides);
await fs.mkdir(output,{recursive:true});
let browser;
try {
  browser=kind==='firefox'?await firefox.launch({headless:true}):await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox','--disable-gpu']});
  const page=await browser.newPage({acceptDownloads:true}), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(origin=>{
    globalThis.DOLLY_HOST_MODULES=['runtime@0','display@0','http@0','download@0','upload@0','snapshot@0'];
    globalThis.DOLLY_HTTP_POLICY={maxRequests:200,rules:[{origin,pathPrefix:'/fixture/',methods:['GET']}]};
  },server.origin);
  await page.goto(server.origin+'/system/');
  await page.waitForFunction(()=>['ready','failed'].includes(document.documentElement.dataset.dollyStatus),null,{timeout:60000});
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.dollyStatus),'ready',await page.locator('#bootstrap-log').textContent());
  await page.evaluate(()=>__dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/,'shell'));
  const submit=cmd=>page.evaluate(text=>__dolly.submit(text),cmd);
  async function run(cmd){const status=await submit(cmd);assert.equal(status,0,`${cmd}\n${status?await page.evaluate(()=>__dolly.visibleTerminalText()):''}`);}
  async function source(text,path='/tmp/probe.c') {
    overrides.set('/fixture/process-check.c',text);
    await run(`curl -fsS ${server.origin}/fixture/process-check.c -o ${path}`);
  }
  async function requirements(path) {
    const pending=page.waitForEvent('download');await run(`download ${path}`);
    const download=await pending, file=`${output}/${path.split('/').at(-1)}.wasm`;
    await download.saveAs(file);
    return executableHostRequirements(parseWasmInterface(await fs.readFile(file)));
  }
  await source('#include <dolly/host.h>\nDOLLY_HOST_REQUIRE(http,0);\nint probe(void){return 37;}');
  await run('cc -O1 -c /tmp/probe.c -o /tmp/probe.o && ar rcs /tmp/libprobe.a /tmp/probe.o');
  const cases={used:'extern int probe(void);int main(void){return probe()!=37;}',unused:'int main(void){return 0;}',header:'#include <dolly/gpu.h>\nint main(void){return 0;}'};
  const linked={};
  for(const [name,text]of Object.entries(cases)){
    await source(text);await run(`cc -O1 /tmp/probe.c /tmp/libprobe.a -o /tmp/${name} && /tmp/${name}`);
    linked[name]=await requirements('/tmp/'+name);
  }
  assert.deepEqual(linked.unused,linked.header);
  assert.deepEqual(linked.used,[...linked.unused,'http@0'].sort());
  assert.ok(!linked.header.includes('gpu@0'));
  await source('extern int probe(void);int outer(void){return probe();}');
  await run('cc -O1 -c /tmp/probe.c -o /tmp/outer.o && ar rcs /tmp/libouter.a /tmp/outer.o');
  await source('extern int outer(void);int main(void){return outer()!=37;}');
  await run('cc -O1 /tmp/probe.c /tmp/libouter.a /tmp/libprobe.a -o /tmp/transitive && /tmp/transitive');
  linked.transitive=await requirements('/tmp/transitive');assert.deepEqual(linked.transitive,linked.used);
  await source('#include <dolly/gpu.h>\nint main(void){static dolly_gpu g;return dolly_gpu_open(&g,0,0)<0;}');
  await run('cc -O1 /tmp/probe.c -ldolly-gpu -o /tmp/gpu-client');
  linked.gpu=await requirements('/tmp/gpu-client');assert.ok(linked.gpu.includes('gpu@0'));
  assert.notEqual(await submit('/tmp/gpu-client'),0,'a disabled provider must deny the client call');
  for(const required of ['unknown,0','http,1']){
    await source(`#include <dolly/host.h>\n#include <stdio.h>\nDOLLY_HOST_REQUIRE(${required});\nint main(void){FILE*f=fopen("/tmp/entered","w");if(f)fclose(f);return 0;}`);
    await run('cc -O1 /tmp/probe.c -o /tmp/denied');
    assert.notEqual(await submit('/tmp/denied'),0);
    await run('test ! -e /tmp/entered');
  }
  // No requirement claim: call the actual process operation directly. The
  // disabled outer provider still denies it, even if Wasm omits its stamp.
  await source(`#include <dolly/process.h>\n#include <dolly/gpu-abi.h>\n#include <stdint.h>\n#include <errno.h>\nint main(void){uint64_t p[5]={DOLLY_GPU_OPEN*(1ull<<32),0,1,8,0};char reply[64];return dolly_process_call(DOLLY_GPU_PROCESS_OP,p,sizeof p,reply,sizeof reply)!=-ENOSYS;}`);
  await run('cc -O1 /tmp/probe.c -o /tmp/forged && /tmp/forged');
  assert.ok(!(await requirements('/tmp/forged')).includes('gpu@0'));
  await source('#include <dolly/host.h>\n#include <stdio.h>\nDOLLY_HOST_REQUIRE(gpu,1);\n__attribute__((constructor)) static void init(void){FILE*f=fopen("/tmp/dso-entered","w");if(f)fclose(f);}\nint probe(void){return 37;}');
  await run('cc -shared -O1 /tmp/probe.c -o /tmp/denied.so');
  assert.deepEqual(await requirements('/tmp/denied.so'),['gpu@1']);
  await source('#include <dlfcn.h>\n#include <string.h>\nint main(void){void*h=dlopen("/tmp/denied.so",RTLD_NOW);const char*e=dlerror();return h!=0||!e||!strstr(e,"gpu@1");}');
  await run('cc -rdynamic -O1 /tmp/probe.c -o /tmp/dso-host && /tmp/dso-host && test ! -e /tmp/dso-entered');
  assert.notEqual(await submit(`curl -fsS ${server.origin}/denied`),0);
  assert.equal(server.requests.has('/denied'),false,'denied network request escaped the broker');
  await run("printf 'restored state' > /workspace/host-proof");
  await page.evaluate(()=>__dolly.saveSession('host-proof'));
  await page.reload();
  await page.waitForFunction(()=>['ready','failed'].includes(document.documentElement.dataset.dollyStatus),null,{timeout:60000});
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.dollyStatus),'ready',await page.locator('#bootstrap-log').textContent());
  await page.evaluate(()=>__dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/,'restored shell'));
  await run('test "$(cat /workspace/host-proof)" = "restored state"');
  const denied=await browser.newPage(), requests=[];
  await denied.addInitScript(()=>{globalThis.DOLLY_HOST_MODULES=['runtime@0','display@0','download@0','upload@0','snapshot@0'];});
  denied.on('request',request=>requests.push(new URL(request.url()).pathname));
  await denied.goto(server.origin+'/system/');
  await denied.waitForFunction(()=>document.documentElement.dataset.dollyStatus==='failed');
  assert.match(await denied.locator('#bootstrap-log').textContent(),/http@0/);
  assert.equal(requests.some(path=>path.endsWith('.snapshot')||path.endsWith('dolly.wasm')),false,'compatibility must fail before large downloads');
  assert.deepEqual(errors,[]);
  const proof={linked,unsupportedCommandAbi:true,unsupportedDsoAbi:true,forgedCallDenied:true,httpPolicy:true,sessionReload:true,earlyImageDenial:true,errors};
  await fs.writeFile(`${output}/proof.json`,JSON.stringify(proof,null,2));console.log(proof);
} finally {await browser?.close();await server.close();}
