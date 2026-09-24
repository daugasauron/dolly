import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {chromium,firefox} from "playwright-core";
import {startBrowserServer} from "./browser-server.mjs";

const browserName=process.argv[2]??"chromium";
assert.ok(["chromium","firefox"].includes(browserName));
// The default correctness run uses SwiftShader; Firefox exercises the real GPU.
const provider=await readFile(new URL('../src/gpu-worker.mjs',import.meta.url),'utf8');
const server=await startBrowserServer(new URL('..',import.meta.url).pathname,'gpu-sdk',0,
  new Map([['/src/gpu-worker.mjs',browserName==='chromium'?provider.replace('powerPreference: "high-performance"','forceFallbackAdapter: true'):provider]]),
  {'gpu-render.c':'test/fixtures/gpu-render.c'});
let browser,deadline;
try {
  browser=browserName==='firefox'
    ? await firefox.launch({headless:false,firefoxUserPrefs:{'dom.webgpu.enabled':true}})
    : await chromium.launch({channel:'chrome',headless:true,
    args:['--no-sandbox','--enable-unsafe-webgpu','--use-angle=vulkan','--use-vulkan=swiftshader','--use-webgpu-adapter=swiftshader','--enable-features=Vulkan','--disable-vulkan-surface']});
  deadline=setTimeout(()=>void browser.close(),90000);
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(origin=>{
    globalThis.DOLLY_HTTP_POLICY={maxRequests:1,rules:[{origin,pathPrefix:'/fixture/',methods:['GET']}]};
  },server.origin);
  await page.goto(`${server.origin}/gpu-sdk/`);
  await page.waitForFunction(()=>['ready','failed'].includes(document.documentElement.dataset.dollyStatus));
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.dollyStatus),'ready');
  await page.evaluate(()=>__dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/,'shell'));
  const submit=command=>page.evaluate(text=>__dolly.submit(text),command);
  assert.equal(await submit(`curl -fsS ${server.origin}/fixture/gpu-render.c -o /tmp/gpu-render.c`),0);
  assert.equal(await submit('cc /tmp/gpu-render.c -ldolly-gpu -o /tmp/gpu-render'),0,
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
  const retirement=await page.evaluate(async()=>{
    const {gpuRetirementProof}=await import('/test/fixtures/gpu-boundary.mjs');return gpuRetirementProof();
  });
  assert.deepEqual(errors,[]);
  assert.equal(await submit('echo GPU_SHELL_RECOVERY > /tmp/gpu-recovery && cat /tmp/gpu-recovery'),0);
  const adapter=await page.evaluate(()=>__dolly.gpu.adapter);
  if(browserName==='chromium')assert.match(adapter,/swiftshader/i);
  else assert.equal(await page.evaluate(()=>__dolly.gpu.isFallbackAdapter),false);
  console.log(JSON.stringify({browser:browser.version(),adapter,guestCompiled:true,freshProcesses:3,interruptRecovery:true,textureDepthIndexed:true,boundary,retirement}));
} finally {
  clearTimeout(deadline);await browser?.close();await server.close();
}
