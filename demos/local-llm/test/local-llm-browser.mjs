import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium,firefox} from 'playwright-core';
import {startBrowserServer} from '../../../test/browser-server.mjs';
import {acceptDownload} from '../../browser.mjs';

if(!process.env.DISPLAY){console.log('local-llm: skipped, it needs a GPU window on DISPLAY');process.exit(0);}

const root=new URL('../../../',import.meta.url).pathname;
// pi-local's default model, installed from its model package.
const model='qwen3.5-2b',weights=`/usr/share/dolly/llm/${model}.gguf`;
const piShowsModel=label=>page=>page.evaluate(([model,label])=>__dolly.waitForInteractiveTerminal(new RegExp(model.replaceAll('.','\\.'),'i'),label),[model,label]);
const output=new URL('../../../build/llm-proof/',import.meta.url);
await mkdir(output,{recursive:true});
// Playwright drives the installed Firefox, which on Ubuntu is a snap with a
// private /tmp: its profile and downloads must live under $HOME.
process.env.TMPDIR=new URL('tmp/',output).pathname;await mkdir(process.env.TMPDIR,{recursive:true});
const site=await startBrowserServer(root,'pi-local',{responseHeaders:{'content-security-policy':"connect-src 'self'"}});
try {
  for(const name of (process.env.DOLLY_LLM_BROWSERS??'chromium,firefox').split(',')) {
    const browser=await ({chromium,firefox})[name].launch(name==='chromium'
      ? {channel:'chrome',headless:false,args:['--no-sandbox','--ozone-platform=x11','--enable-unsafe-webgpu','--use-angle=vulkan','--enable-features=Vulkan']}
      : {channel:'moz-firefox',headless:false,firefoxUserPrefs:{'dom.webgpu.enabled':true}});
    try {
      const context=await browser.newContext({acceptDownloads:true,viewport:{width:1280,height:840}});
      const page=await context.newPage(),errors=[],requests=[];
      page.on('pageerror',error=>errors.push(String(error)));
      page.on('request',request=>requests.push(request.url()));
      const snapshotDownloads=()=>[...site.requests].filter(([path])=>/\.snapshot(?:\.gz)?$/.test(path)).reduce((total,[,count])=>total+count,0);
      const previousDownloads=snapshotDownloads();
      // CSP denies external model servers without disabling the browser HTTP cache.
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
      const imageDownloads=snapshotDownloads()-previousDownloads;
      assert.ok(imageDownloads>0,'Initial boot did not fetch snapshot bytes');
      console.log(name,'image booted');
      await piShowsModel('Pi local model')(page);
      await page.screenshot({path:new URL(`${name}-pi.png`,output).pathname});
      await page.locator('#keyboard').focus();await page.keyboard.press('Control+d');
      await page.evaluate(()=>__dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/,'recovery shell'));
      await page.waitForTimeout(300);
      assert.equal(await submit('dolly-llama --check'),0,await text());
      const upload=submit('upload /workspace/local-llm-proof.mjs');
      await page.waitForSelector('#file-upload[open]');
      await page.locator('#file-upload input').setInputFiles(new URL('./fixtures/local-llm.mjs',import.meta.url).pathname);
      assert.equal(await upload,0);await page.waitForTimeout(200);
      const running=submit(`janis /workspace/local-llm-proof.mjs ${model}`);
      const progress=setInterval(()=>{void text().then(value=>console.log(name,value.slice(-360)));},30000);
      let status;try{status=await running;}finally{clearInterval(progress);}
      assert.equal(status,0,await text());
      assert.match(await text(),/LOCAL-LLM-PROOF-OK/);
      const downloading=submit('download /workspace/local-llm-proof.json'),download=acceptDownload(page,()=>downloading);
      const file=await download;const resultPath=new URL(`${name}.json`,output).pathname;
      await file.saveAs(resultPath);assert.equal(await downloading,0);await page.waitForTimeout(200);
      const result=JSON.parse(await readFile(resultPath,'utf8'));
      assert.equal(result.cancel,true);assert.equal(result.restart,true);assert.equal(result.reuse,true);
      assert.equal(await submit('printf saved > /workspace/session-proof.txt'),0);
      assert.equal(await page.evaluate(()=>__dolly.saveSession('llm-proof')),'llm-proof');
      const savedBytes=await page.evaluate(()=>Number(document.documentElement.dataset.sessionUncompressedBytes));
      assert.ok(savedBytes<10*1024*1024,`Base model was copied into the session (${savedBytes} bytes)`);
      assert.equal(await submit(`janis -e 'const fs=process.getBuiltinModule("node:fs");const fd=fs.openSync("${weights}","r+");fs.writeSync(fd,new Uint8Array([0]),0,1,0);fs.closeSync(fd);'`),0);
      await assert.rejects(page.evaluate(()=>__dolly.saveSession('llm-proof')),/session|snapshot|large|save/i);
      await page.reload();
      await ready();
      await piShowsModel('restored Pi')(page);
      await page.locator('#keyboard').focus();await page.keyboard.press('Control+d');
      await page.evaluate(()=>__dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/,'restored recovery shell'));
      await page.waitForTimeout(300);
      assert.equal(await submit(`test -f ${weights} && cat /workspace/session-proof.txt`),0);
      assert.match(await text(),/saved/);
      assert.equal(await submit(`janis /workspace/local-llm-proof.mjs ${model}`),0,await text());
      // Open the original image, without the saved session or its workspace.
      await page.goto(site.origin+'/pi-local/');
      await ready();
      await piShowsModel('fresh Pi')(page);
      await page.locator('#keyboard').focus();await page.keyboard.press('Control+d');
      await page.evaluate(()=>__dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/,'fresh shell'));
      await page.waitForTimeout(300);
      assert.equal(await submit(`test ! -f /workspace/session-proof.txt && test -f ${weights}`),0);
      const external=requests.filter(url=>new URL(url).origin!==site.origin);
      assert.deepEqual(external,[],'Bundled inference attempted external network access');
      // Streaming boots use the HTTP cache; browsers may evict large packs.
      const totalImageDownloads=snapshotDownloads()-previousDownloads;
      assert.deepEqual(errors,[]);
      await writeFile(resultPath,JSON.stringify({...result,browser:name,version:browser.version(),externalRequests:external.length,imageDownloads,totalImageDownloads,savedBytes,restored:true,freshBoot:true},null,2)+'\n');
      console.log(name,'bundled inference, reuse, cancellation, session restore and fresh boot passed with external requests denied');
    } finally {await browser.close();}
  }
} finally {await site.close();}
