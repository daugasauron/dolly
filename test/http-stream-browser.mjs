import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright-core';
import {startBrowserServer} from './browser-server.mjs';
const image='default';
const site=await startBrowserServer(new URL('..',import.meta.url).pathname,image);
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox','--disable-gpu']});
try {
  const chunk=Buffer.from(Uint8Array.from({length:65536},(_,i)=>i&255)),hash=createHash('sha256');
  for(let i=0;i<1040;i++)hash.update(chunk);
  hash.update(chunk.subarray(0,17));const digest=hash.digest('hex');
  for(const restricted of [false,true]){
    const page=await browser.newPage();
    if(restricted)await page.addInitScript(origin=>{globalThis.DOLLY_HTTP_POLICY={rules:[{origin,pathPrefix:'/fixture/',maxResponseBytes:1024}]};},site.origin);
    await page.goto(site.origin+'/'+image+'/');
    await page.waitForFunction(()=>['ready','failed'].includes(document.documentElement.dataset.dollyStatus),null,{timeout:60000});
    assert.equal(await page.evaluate(()=>document.documentElement.dataset.dollyStatus),'ready',await page.locator('#bootstrap-log').textContent());
    await page.evaluate(()=>__dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/,'shell'));
    const submit=command=>page.evaluate(text=>__dolly.submit(text),command);
    const result=await submit(`curl -fsS ${site.origin}/fixture/large -o /tmp/large`);
    if(restricted)assert.notEqual(result,0);
    else {
      assert.equal(result,0);console.log('Downloaded 65 MiB + 17 bytes');
      assert.equal(await submit(`test "$(wc -c < /tmp/large)" = 68157457 && sha256sum /tmp/large > /tmp/digest && grep -q '^${digest} ' /tmp/digest`),0,await page.evaluate(()=>__dolly.visibleTerminalText()));
      assert.equal(await submit(`curl -fsS ${site.origin}/fixture/http-check.c -o /tmp/http-check.c && cc /tmp/http-check.c -o /tmp/http-check && DOLLY_PROCESS_HTTP_POST_URL=${site.origin}/fixture/echo /tmp/http-check`),0,await page.evaluate(()=>__dolly.visibleTerminalText()));
    }
    const cancelled=site.cancelledRequests;
    const pending=submit(`curl -fsS ${site.origin}/fixture/slow`);
    await page.waitForFunction(()=>__dolly.httpActive);
    await page.keyboard.press('Control+c');await pending;
    await page.waitForFunction(()=>!__dolly.httpActive);
    assert.equal(site.cancelledRequests,cancelled+1);
    assert.equal(await submit(`curl -fsS ${site.origin}/fixture/http.txt -o /tmp/after`),0);
    await page.close();
  }
  console.log(JSON.stringify({downloadBytes:68157457,sha256:digest,uploadBytes:3145745,uploadBound:true,finiteQuota:true,cancelledAndReused:true}));
}finally{await browser.close();await site.close();}
