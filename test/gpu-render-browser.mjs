import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {chromium} from "playwright-core";
import {startBrowserServer} from "./browser-server.mjs";

// Force a software adapter inside the worker for this bounded correctness test.
const provider=await readFile(new URL('../src/gpu-worker.mjs',import.meta.url),'utf8');
const server=await startBrowserServer(new URL('..',import.meta.url).pathname,'default',0,
  new Map([['/src/gpu-worker.mjs',provider.replace('powerPreference: "high-performance"','forceFallbackAdapter: true')]]),
  {'gpu-render.c':'test/fixtures/gpu-render.c','gpu-client.c':'src/gpu/client.c',
   'gpu.h':'include/dolly/gpu.h','gpu-abi.h':'include/dolly/gpu-abi.h'});
let browser,deadline;
try {
  browser=await chromium.launch({channel:'chrome',headless:true,
    args:['--no-sandbox','--enable-unsafe-webgpu','--use-angle=vulkan','--use-vulkan=swiftshader','--use-webgpu-adapter=swiftshader','--enable-features=Vulkan','--disable-vulkan-surface']});
  deadline=setTimeout(()=>void browser.close(),90000);
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(origin=>{
    globalThis.DOLLY_HTTP_POLICY={maxRequests:4,rules:[{origin,pathPrefix:'/fixture/',methods:['GET']}]};
  },server.origin);
  await page.goto(`${server.origin}/default/`);
  await page.waitForFunction(()=>['ready','failed'].includes(document.documentElement.dataset.dollyStatus));
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.dollyStatus),'ready');
  await page.evaluate(()=>__dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/,'shell'));
  const submit=command=>page.evaluate(text=>__dolly.submit(text),command);
  assert.equal(await submit('mkdir -p /tmp/include/dolly'),0);
  for(const file of ['gpu-render.c','gpu-client.c','gpu.h','gpu-abi.h']) {
    const destination=file.endsWith('.h')?`/tmp/include/dolly/${file}`:`/tmp/${file}`;
    assert.equal(await submit(`curl -fsS ${server.origin}/fixture/${file} -o ${destination}`),0);
  }
  assert.equal(await submit('cc -I/tmp/include /tmp/gpu-render.c /tmp/gpu-client.c -o /tmp/gpu-render'),0,
    await page.evaluate(()=>__dolly.visibleTerminalText()));
  for(let run=0;run<2;run++) {
    const status=await submit('/tmp/gpu-render');
    const terminal=await page.evaluate(()=>__dolly.visibleTerminalText());
    assert.equal(status,0,terminal+'\n'+JSON.stringify(await page.evaluate(()=>__dolly.gpu)));
    assert.match(terminal,/GPU texture\/depth\/indexed rendering PASS/);
  }
  await page.evaluate(()=>{globalThis.gpuHoldStatus=null;void __dolly.submit('/tmp/gpu-render --hold').then(status=>{globalThis.gpuHoldStatus=status;});});
  let held=false;
  for(let i=0;i<100;i++) {
    if((await page.evaluate(()=>__dolly.visibleTerminalText())).includes('GPU_RENDER_HOLD')){held=true;break;}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(held,'Guest never reached the held render state');
  await page.keyboard.press('Control+c');
  await page.waitForFunction(()=>globalThis.gpuHoldStatus!==null);
  assert.equal(await page.evaluate(()=>globalThis.gpuHoldStatus),130);
  assert.equal(await submit('/tmp/gpu-render'),0,await page.evaluate(()=>__dolly.visibleTerminalText()));
  const boundary=await page.evaluate(async()=>{
    const {gpuBoundaryProof}=await import('/test/fixtures/gpu-boundary.mjs');return gpuBoundaryProof();
  });
  assert.deepEqual(errors,[]);
  assert.equal(await submit('echo GPU_SHELL_RECOVERY > /tmp/gpu-recovery && cat /tmp/gpu-recovery'),0);
  const adapter=await page.evaluate(()=>__dolly.gpu.adapter);
  assert.match(adapter,/swiftshader/i);
  console.log(JSON.stringify({browser:browser.version(),adapter,guestCompiled:true,freshProcesses:3,interruptRecovery:true,textureDepthIndexed:true,boundary}));
} finally {
  clearTimeout(deadline);await browser?.close();await server.close();
}
