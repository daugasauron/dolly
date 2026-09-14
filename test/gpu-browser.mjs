import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";
import {chromium,firefox} from "playwright-core";
import {startBrowserServer} from "./browser-server.mjs";

const site=await startBrowserServer(new URL("..",import.meta.url).pathname,"gpu-demo");
const output=new URL("../build/gpu-proof/",import.meta.url);
await mkdir(output,{recursive:true});
const results=[];
try {
  for(const name of ["chromium","firefox"]) {
    const browser=await ({chromium,firefox})[name].launch(name==="chromium"
      ? {channel:"chrome",headless:false,args:["--no-sandbox","--ozone-platform=x11","--enable-unsafe-webgpu","--use-angle=vulkan","--enable-features=Vulkan,VulkanFromANGLE"]}
      : {headless:false,firefoxUserPrefs:{"dom.webgpu.enabled":true,"gfx.webgpu.ignore-blocklist":true}});
    try {
      const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];
      page.on("pageerror",error=>errors.push(String(error)));
      page.on("console",m=>{if(m.type()==="warning")console.log(name,m.text());});
      await page.goto(site.origin+"/gpu-demo/");
      await page.waitForFunction(()=>window.__dolly?.gpu.stats?.frames>20 || window.__dolly?.gpu.error,null,{timeout:120000});
      const status=await page.evaluate(()=>__dolly.gpu);
      if (status.error) {
        assert.equal(name,"firefox",status.error);
        await page.waitForFunction(()=>!__dolly.graphicsActive);
        assert.equal(await page.evaluate(()=>__dolly.submit("echo GPU-UNAVAILABLE-SHELL-OK")),0);
        results.push({browser:name,version:browser.version(),unavailable:status.error,shellRecovered:true});
        console.log(JSON.stringify(results.at(-1)));
        continue;
      }
      assert.equal(status.stats.readbackBytes,0);
      let previousScene;
      for(const [key,scene] of [["1","aurora"],["2","prism"],["3","garden"]]) {
        await page.keyboard.press(key);
        const before=await page.evaluate(()=>__dolly.gpu.stats.frames);
        await page.waitForFunction(n=>__dolly.gpu.stats.frames>n+30,before);
        const pixels=await page.screenshot({path:new URL(`${name}-${scene}.png`,output).pathname});
        if(previousScene)assert.notDeepEqual(pixels,previousScene,"Switching GPU scenes did not change visible pixels");
        previousScene=pixels;
      }
      assert.ok((await page.evaluate(()=>__dolly.gpu.stats.dispatches))>20);
      await page.keyboard.press("Space");
      await page.waitForTimeout(200);
      const paused=await page.screenshot();await page.waitForTimeout(200);
      assert.deepEqual(await page.screenshot(),paused,"Pause changed the rendered image");
      await page.keyboard.press("Space");
      await page.keyboard.press("q");
      await page.waitForFunction(()=>!__dolly.graphicsActive && !__dolly.gpu.active);
      const submit=command=>page.evaluate(text=>__dolly.submit(text),command);
      assert.equal(await submit("gpu-demo --check && cat /workspace/gpu-proof.txt"),0);
      const compute=await page.evaluate(()=>__dolly.visibleTerminalText());
      assert.match(compute,/GPU compute: 3 5 7 9/);
      const measured=await page.evaluate(async()=>{
        const frames=[];
        const listener=({data})=>{if(data.type==="gpu-status"&&data.active&&data.stats)frames.push(data.stats);};
        __dolly.worker.addEventListener("message",listener);
        let status;
        try {status=await __dolly.submit("gpu-demo --bench");}
        finally {__dolly.worker.removeEventListener("message",listener);}
        const provider=[];
        if(frames.length===800)for(let sample=1;sample<4;sample++)
          provider.push((frames[(sample+1)*200-1].batchWallMilliseconds-frames[sample*200-1].batchWallMilliseconds)*1000/200);
        return {status,frames:frames.length,provider};
      });
      assert.equal(measured.status,0);assert.equal(measured.frames,800);
      const benchmark=await page.evaluate(()=>__dolly.visibleTerminalText());
      const samples=[...benchmark.matchAll(/GPU render benchmark: ([\d.]+) us/g)].map(m=>Number(m[1]));
      assert.equal(samples.length,3);
      // Reopen immediately after interruption, while old GPU work may be retiring.
      for(let restart=0;restart<3;restart++) {
        const running=submit("gpu-demo");
        await page.waitForFunction(()=>__dolly.graphicsActive && __dolly.gpu.active);
        await page.keyboard.press("Control+c");assert.equal(await running,130);
        const checked=await submit("gpu-demo --check");
        assert.equal(checked,0,await page.evaluate(()=>__dolly.visibleTerminalText()));
      }
      const direct=await page.evaluate(()=>new Promise((resolve,reject)=>{
        const canvas=document.createElement("canvas");canvas.width=64;canvas.height=64;
        canvas.style.cssText="position:absolute;inset:0;width:100%;height:100%;pointer-events:none";
        document.querySelector("#terminal").append(canvas);
        const worker=new Worker("/test/fixtures/gpu-direct.mjs",{type:"module"});
        const close=()=>{worker.terminate();canvas.remove();};
        worker.onmessage=({data})=>{close();data.error?reject(Error(data.error)):resolve(data.result);};
        worker.onerror=error=>{close();reject(Error(error.message));};
        const offscreen=canvas.transferControlToOffscreen();worker.postMessage({canvas:offscreen},[offscreen]);
      }));
      const boundary=await page.evaluate(async()=>{
        const {gpuBoundaryProof}=await import("/test/fixtures/gpu-boundary.mjs");return gpuBoundaryProof();
      });
      assert.deepEqual(errors,[]);
      results.push({browser:name,version:browser.version(),adapter:status.adapter,renderReadbackBytes:status.stats.readbackBytes,
        renderBatchMicroseconds:samples,providerBatchMicroseconds:measured.provider,
        estimatedOutsideProviderMicroseconds:samples.map((n,i)=>n-measured.provider[i]),
        directWebGpuMicroseconds:direct,directPresentation:"DOM-linked OffscreenCanvas",computeAndShellRecovery:true,interruptRestarts:3,boundary});
      console.log(JSON.stringify(results.at(-1)));
    } finally {await browser.close();}
  }
} finally {await site.close();await writeFile(new URL("results.json",output),JSON.stringify(results,null,2)+"\n");}
