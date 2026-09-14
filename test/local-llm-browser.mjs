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
      // Worker scripts and image packs remain available; model servers do not.
      await context.route('**/*',route=>new URL(route.request().url()).origin===site.origin?route.continue():route.abort());
      const text=()=>page.evaluate(()=>__dolly.visibleTerminalText());
      const submit=command=>{
        console.log(name,'run',command.slice(0,90));
        return page.evaluate(command=>__dolly.submit(command),command);
      };
      const ready=async()=>{
        await page.waitForFunction(()=>['ready','failed'].includes(document.documentElement.dataset.dollyStatus),null,{timeout:120000});
        assert.equal(await page.evaluate(()=>document.documentElement.dataset.dollyStatus),'ready',await page.locator('#bootstrap-log').textContent());
      };
      await page.goto(site.origin+'/pi-local/');
      await ready();
      console.log(name,'image booted');
      await page.evaluate(()=>__dolly.waitForInteractiveTerminal(/Qwen3.5-0.8B/,'Pi local model'));
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
      assert.equal(await submit('printf saved > /workspace/session-proof.txt'),0);
      assert.equal(await page.evaluate(()=>__dolly.saveSession('llm-proof')),'llm-proof');
      const savedBytes=await page.evaluate(()=>Number(document.documentElement.dataset.sessionUncompressedBytes));
      assert.ok(savedBytes<10*1024*1024,`Base model was copied into the session (${savedBytes} bytes)`);
      assert.equal(await submit(`janis -e 'const fs=process.getBuiltinModule("node:fs");const fd=fs.openSync("/usr/share/dolly/llm/Qwen3.5-0.8B.gguf","r+");fs.writeSync(fd,new Uint8Array([0]),0,1,0);fs.closeSync(fd);'`),0);
      await assert.rejects(page.evaluate(()=>__dolly.saveSession('llm-proof')),/session|snapshot|large|save/i);
      await page.reload();
      await ready();
      await page.evaluate(()=>__dolly.waitForInteractiveTerminal(/Qwen3.5-0.8B/,'Pi local model'));
      await page.locator('#keyboard').focus();await page.keyboard.press('Control+d');
      await page.evaluate(()=>__dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/,'restored recovery shell'));
      await page.waitForTimeout(300);
      assert.equal(await submit('test -f /usr/share/dolly/llm/Qwen3.5-0.8B.gguf && cat /workspace/session-proof.txt'),0);
      assert.match(await text(),/saved/);
      assert.equal(await submit('janis /workspace/local-llm-proof.mjs'),0,await text());
      // Open the original image, without the saved session or its workspace.
      await page.goto(site.origin+'/pi-local/');
      await ready();
      await page.evaluate(()=>__dolly.waitForInteractiveTerminal(/Qwen3.5-0.8B/,'fresh Pi'));
      await page.locator('#keyboard').focus();await page.keyboard.press('Control+d');
      await page.evaluate(()=>__dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/,'fresh shell'));
      await page.waitForTimeout(300);
      assert.equal(await submit('test ! -f /workspace/session-proof.txt && test -f /usr/share/dolly/llm/Qwen3.5-0.8B.gguf'),0);
      const external=requests.filter(url=>new URL(url).origin!==site.origin);
      assert.deepEqual(external,[],'Bundled inference attempted external network access');
      const imageDownloads=requests.filter(url=>new URL(url).pathname.endsWith('/dolly-pi-local-system.snapshot')).length;
      assert.equal(imageDownloads,1,'Refresh downloaded the image again instead of reusing its cached bytes');
      assert.deepEqual(errors,[]);
      await writeFile(resultPath,JSON.stringify({...result,browser:name,version:browser.version(),externalRequests:external.length,imageDownloads,savedBytes,restored:true,freshBoot:true},null,2)+'\n');
      console.log(name,'bundled inference, reuse, cancellation, session restore and fresh boot passed with external requests denied');
    } finally {await browser.close();}
  }
} finally {await site.close();}
