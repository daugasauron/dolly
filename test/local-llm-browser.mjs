import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium,firefox} from 'playwright-core';
import {startBrowserServer} from './browser-server.mjs';

const root=new URL('..',import.meta.url).pathname;
const output=new URL('../build/llm-proof/',import.meta.url);
await mkdir(output,{recursive:true});
const site=await startBrowserServer(root,'pi-local');
try {
  for(const name of (process.env.DOLLY_LLM_BROWSERS??'chromium,firefox').split(',')) {
    const browser=await ({chromium,firefox})[name].launch(name==='chromium'
      ? {channel:'chrome',headless:false,args:['--no-sandbox','--ozone-platform=x11','--enable-unsafe-webgpu','--use-angle=vulkan','--enable-features=Vulkan,VulkanFromANGLE','--enable-dawn-features=vulkan_enable_f16_on_nvidia']}
      : {headless:false,firefoxUserPrefs:{'dom.webgpu.enabled':true,'gfx.webgpu.ignore-blocklist':true}});
    try {
      const context=await browser.newContext({acceptDownloads:true,viewport:{width:1280,height:840}});
      const page=await context.newPage(),errors=[],requests=[];
      page.on('pageerror',error=>errors.push(String(error)));
      page.on('request',request=>requests.push(request.url()));
      const text=()=>page.evaluate(()=>__dolly.visibleTerminalText());
      const submit=command=>page.evaluate(command=>__dolly.submit(command),command);
      await page.goto(site.origin+'/pi-local/');
      await page.waitForFunction(()=>document.documentElement.dataset.dollyStatus==='ready',null,{timeout:120000});
      await page.evaluate(()=>__dolly.waitForInteractiveTerminal(/Qwen3.5-2B/,'Pi local model'));
      await page.screenshot({path:new URL(`${name}-pi.png`,output).pathname});
      await page.locator('#keyboard').focus();await page.keyboard.press('Control+d');
      await page.evaluate(()=>__dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/,'recovery shell'));
      await page.waitForTimeout(300);
      assert.equal(await submit('dolly-llama --check'),0,await text());
      const upload=submit('upload /workspace/local-llm-proof.mjs');
      await page.waitForSelector('#file-upload[open]');
      await page.locator('#file-upload input').setInputFiles(new URL('./fixtures/local-llm.mjs',import.meta.url).pathname);
      assert.equal(await upload,0);await page.waitForTimeout(200);
      const running=submit('janis /workspace/local-llm-proof.mjs');
      const progress=setInterval(()=>{void text().then(value=>console.log(name,value.slice(-360)));},30000);
      let status;try{status=await running;}finally{clearInterval(progress);}
      assert.equal(status,0,await text());
      assert.match(await text(),/LOCAL-LLM-PROOF-OK/);
      const download=page.waitForEvent('download');const downloading=submit('download /workspace/local-llm-proof.json');
      const file=await download;const resultPath=new URL(`${name}.json`,output).pathname;
      await file.saveAs(resultPath);assert.equal(await downloading,0);await page.waitForTimeout(200);
      const result=JSON.parse(await readFile(resultPath,'utf8'));
      assert.equal(result.cancel,true);assert.equal(result.restart,true);assert.equal(result.reuse,true);
      // Keep embedding-owned Worker scripts available, but deny external requests.
      const denyExternal=route=>new URL(route.request().url()).origin===site.origin?route.continue():route.abort();
      await context.route('**/*',denyExternal);
      const external=()=>requests.filter(url=>new URL(url).origin!==site.origin).length;
      const before=external();
      assert.equal(await submit('janis /workspace/local-llm-proof.mjs'),0,await text());
      assert.equal(external(),before,'Cached inference attempted external network access');
      await context.unroute('**/*',denyExternal);
      assert.equal(await submit('printf saved > /workspace/session-proof.txt'),0);
      assert.equal(await page.evaluate(()=>__dolly.saveSession('llm-proof')),'llm-proof');
      const savedBytes=await page.evaluate(()=>Number(document.documentElement.dataset.sessionUncompressedBytes));
      assert.ok(savedBytes<10*1024*1024,`Volatile model was saved (${savedBytes} bytes)`);
      await page.reload();
      await page.waitForFunction(()=>document.documentElement.dataset.dollyStatus==='ready',null,{timeout:120000});
      await page.evaluate(()=>__dolly.waitForInteractiveTerminal(/Qwen3.5-2B/,'Pi local model'));
      await page.locator('#keyboard').focus();await page.keyboard.press('Control+d');
      await page.evaluate(()=>__dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/,'restored recovery shell'));
      await page.waitForTimeout(300);
      assert.equal(await submit('test ! -f /run/dolly-llm/Qwen3.5-0.8B-fb044e93939a70469c905781334f5de1e6c8b608ced6cbc8c9249bd4127d9526.gguf && cat /workspace/session-proof.txt'),0);
      assert.match(await text(),/saved/);assert.deepEqual(errors,[]);
      await writeFile(resultPath,JSON.stringify({...result,browser:name,version:browser.version(),externalNetworkDenied:true,savedBytes,restored:true},null,2)+'\n');
      console.log(name,'local inference, reuse, cancellation, restart with external requests denied and session restore passed');
    } finally {await browser.close();}
  }
} finally {await site.close();}
