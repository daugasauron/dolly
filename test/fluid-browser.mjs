import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium,firefox} from 'playwright-core';
import {startBrowserServer} from './browser-server.mjs';

// Instrument only this test server: nested Worker loads are not reliably routed
// by Playwright. Record accepted copies, then turn recording off for timings.
const original=await readFile(new URL('../src/gpu-worker.mjs',import.meta.url),'utf8');
const instrumented='const proof=new BroadcastChannel("dolly-fluid-proof");let recording=false;proof.onmessage=e=>{recording=e.data==="record";};\n'+original.replace('serial=serial.then(()=>execute(request,scope,parsed))','if(recording)proof.postMessage(request.bytes);serial=serial.then(()=>execute(request,scope,parsed))');
const site=await startBrowserServer(new URL('..',import.meta.url).pathname,'gpu-fluid',0,new Map([['/src/gpu-worker.mjs',instrumented]]));
const output=new URL('../build/fluid-proof/',import.meta.url),results=[];
await mkdir(output,{recursive:true});
try {
 for(const name of ['chromium','firefox']) {
  const browser=await ({chromium,firefox})[name].launch(name==='chromium'
   ? {channel:'chrome',headless:false,args:['--no-sandbox','--ozone-platform=x11','--enable-unsafe-webgpu','--use-angle=vulkan','--enable-features=Vulkan,VulkanFromANGLE']}
   : {headless:false,firefoxUserPrefs:{'dom.webgpu.enabled':true,'gfx.webgpu.ignore-blocklist':true}});
  try {
   const context=await browser.newContext({viewport:{width:1280,height:720}});
   const page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(String(error)));
   await page.addInitScript(()=>{window.fluidPackets=[];window.fluidCapture=new BroadcastChannel('dolly-fluid-proof');fluidCapture.onmessage=e=>fluidPackets.push(e.data);});
   const submit=command=>page.evaluate(text=>__dolly.submit(text),command);
   const frames=async(n=15)=>{const before=await page.evaluate(()=>__dolly.gpu.stats.frames);await page.waitForFunction(({before,n})=>__dolly.gpu.stats.frames>before+n,{before,n},{timeout:30000});};
   const shot=label=>page.screenshot({path:new URL(`${name}-${label}.png`,output).pathname});
   await page.goto(site.origin+'/gpu-fluid/');
   await page.waitForFunction(()=>window.__dolly?.gpu?.stats?.frames>60||window.__dolly?.gpu?.error,null,{timeout:120000});
   assert.equal((await page.evaluate(()=>__dolly.gpu)).error,undefined);
   await shot('ink');
   // Hidden controls and paused simulation must produce stable pixels.
   await page.keyboard.press('Space');await page.keyboard.press('h');await frames();
   const paused=await shot('paused');await frames();assert.deepEqual(await page.screenshot(),paused);
   await page.keyboard.press('h');await page.mouse.click(160,208);await frames();await shot('smoke-controls');await page.keyboard.press('h');await frames();
   const smoke=await shot('smoke');assert.notDeepEqual(smoke,paused);
   await page.keyboard.press('h');await page.mouse.click(280,208);await frames();await page.keyboard.press('h');await frames();
   assert.notDeepEqual(await shot('shaded'),smoke);
   await page.keyboard.press('Space');await page.keyboard.press('h');await page.mouse.click(320,244); // automatic off
   await page.mouse.move(700,500);await page.mouse.move(1050,300,{steps:20});await frames();await shot('mouse');
   await page.mouse.click(290,100); // 1080p: subsequent buttons are scaled to the viewport.
   await page.waitForFunction(()=>__dolly.gpu.width===1920&&__dolly.gpu.height===1080,null,{timeout:30000});
   await frames();await shot('1080p');
   const allocation=await page.evaluate(()=>__dolly.gpu.stats.allocatedBytes);
   await page.mouse.click(350*2/3,136*2/3); // grid 512 at 1080p
   await page.waitForFunction(n=>__dolly.gpu.stats.allocatedBytes>n,allocation,{timeout:30000});
   await frames();await shot('512');
   const before=await page.evaluate(()=>({...__dolly.gpu.stats}));
   await page.mouse.click(266*2/3,172*2/3);await frames(30);
   const after=await page.evaluate(()=>({...__dolly.gpu.stats}));
   assert.ok((after.dispatches-before.dispatches)/(after.frames-before.frames)>55,'Pressure button did not add solver iterations');
   await page.mouse.click(60*2/3,208*2/3);await page.mouse.move(600,400);await page.mouse.move(1100,550,{steps:30});await frames();
   await page.keyboard.press('Space');await page.keyboard.press('h');await frames();
   const filled=await page.screenshot();await page.keyboard.press('r');await frames();assert.notDeepEqual(await shot('reset'),filled);
   const renderStatus=await page.evaluate(()=>__dolly.gpu);assert.equal(renderStatus.stats.readbackBytes,0);
   await page.keyboard.press('q');await page.waitForFunction(()=>!__dolly.graphicsActive&&!__dolly.gpu.active);
   const measurements=[];
   for(const command of ['fluid --check','fluid --bench 128 720 120','fluid --bench 256 720 120','fluid --bench 512 1080 120','fluid --bench 512 1080 120 shaded']) {
    await page.evaluate(()=>{fluidPackets=[];fluidCapture.postMessage('record');});await page.waitForTimeout(30);
    assert.equal(await submit(command),0,await page.evaluate(()=>__dolly.visibleTerminalText()));
    await page.waitForFunction(()=>fluidPackets.some(p=>new DataView(p.buffer,p.byteOffset,p.byteLength).getUint32(4,true)===5));
    await page.evaluate(()=>fluidCapture.postMessage('stop'));await page.waitForTimeout(30);
    assert.equal(await submit(command),0);
    const terminal=await page.evaluate(()=>__dolly.visibleTerminalText());
    const matches=[...terminal.matchAll(/FLUID_BENCH (\{[^\r\n]+\})/g)];assert.ok(matches.length,terminal);
    const dolly=JSON.parse(matches.at(-1)[1]);
    const replay=await page.evaluate(()=>new Promise((resolve,reject)=>{
     const canvas=document.createElement('canvas');canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none';document.querySelector('#terminal').append(canvas);
     const worker=new Worker('/test/fixtures/fluid-direct.mjs',{type:'module'}),close=()=>{worker.terminate();canvas.remove();};
     worker.onmessage=({data})=>{close();data.error?reject(Error(data.error)):resolve(data.result);};worker.onerror=e=>{close();reject(Error(e.message));};
     const offscreen=canvas.transferControlToOffscreen();worker.postMessage({packets:fluidPackets,canvas:offscreen},[offscreen]);
    }));
    assert.equal(replay.steps,dolly.steps);assert.ok(dolly.wall_ms>0&&replay.wall_ms>0);
    if(command.includes('--check')) {
     const proof=[...terminal.matchAll(/Fluid compute PASS: nonzero=(\d+) sum=([\d.]+)/g)].at(-1);assert.ok(proof,terminal);
     assert.equal(replay.readbackNonzero,Number(proof[1]));assert.ok(Math.abs(replay.readbackSum-Number(proof[2]))<1e-5,'Direct replay changed solver output');
    }
    measurements.push({command,dolly,replay});console.log(name,JSON.stringify(measurements.at(-1)));
   }
   for(let i=0;i<2;i++){const running=submit('fluid');await page.waitForFunction(()=>__dolly.graphicsActive&&__dolly.gpu.active);await page.keyboard.press('Control+c');assert.equal(await running,130);assert.equal(await submit('fluid --check'),0);}
   const boundary=await page.evaluate(async()=>{
    const {gpuBoundaryProof}=await import('/test/fixtures/gpu-boundary.mjs');return gpuBoundaryProof();
   });
   assert.deepEqual(errors,[]);
   results.push({browser:name,version:browser.version(),adapter:renderStatus.adapter,controls:true,renderReadbackBytes:0,interruptRestarts:2,measurements,boundary});
  } finally {await browser.close();}
 }
} finally {await site.close();await writeFile(new URL('results.json',output),JSON.stringify(results,null,2)+'\n');}
