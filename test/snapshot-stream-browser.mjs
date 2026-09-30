import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {chromium} from 'playwright-core';
import {startBrowserServer} from './browser-server.mjs';
import {decodeSnapshotRecords,encodeSnapshotRecords} from '../src/snapshot-records.mjs';
import {DOLLY_SYSTEM_SNAPSHOT as original} from '../dist/dolly-default-system-snapshot.mjs';

const root=new URL('..',import.meta.url).pathname;
const records=decodeSnapshotRecords(await readFile(root+'/dist/dolly-default-system.snapshot'));
const groups=[new Map(),new Map()];
let index=0;
for(const [path,record] of records)groups[index++%2].set(path,record);
const bodies=new Map(),parts=[];
for(const group of groups) {
  const bytes=encodeSnapshotRecords(group),body=gzipSync(bytes);
  const sha256=createHash('sha256').update(bytes).digest('hex');
  parts.push({sha256,byteLength:bytes.length,encodedByteLength:body.length});
  bodies.set(sha256,body);
}
// Interleaved records and reversed parts require the canonical image hash,
// not the digest of a concatenation or the last successful download.
const metadata={...original,encoding:'packs',packs:parts.reverse()};
const overrides=new Map();
const server=await startBrowserServer(root,'default',{sourceOverrides:overrides});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox','--disable-gpu']});
const deadline=setTimeout(()=>void browser.close(),120000);
try {
  for(const scenario of ['valid','wrong-image-digest','wrong-pack-digest','truncated']) {
    const candidate=structuredClone(metadata);
    if(scenario==='wrong-image-digest')candidate.sha256='0'.repeat(64);
    if(scenario==='wrong-pack-digest')candidate.packs[0].sha256='f'.repeat(64);
    overrides.set('/dist/dolly-default-system-snapshot.mjs',`export const DOLLY_SYSTEM_SNAPSHOT=${JSON.stringify(candidate)};`);
    const context=await browser.newContext();
    const page=await context.newPage();
    try {
      await page.addInitScript(()=>{
        globalThis.streamReady=false;
        const NativeWorker=Worker;
        globalThis.Worker=class extends NativeWorker {
          constructor(...args) {
            super(...args);
            this.addEventListener('message',({data})=>{if(data.type==='ready')streamReady=true;});
          }
        };
      });
      await page.route('**/dist/packs/*.snapshot.gz',async route=>{
        const requested=route.request().url().split('/').at(-1).split('.')[0];
        let body=bodies.get(requested)??bodies.get(metadata.packs[0].sha256);
        if(scenario==='truncated')body=body.subarray(0,body.length-10);
        await route.fulfill({status:200,contentType:'application/octet-stream',body});
      });
      await page.goto(server.origin+'/default/');
      await page.waitForFunction(()=>['ready','failed'].includes(document.documentElement.dataset.dollyStatus),null,{timeout:45000});
      const state=await page.evaluate(()=>({status:document.documentElement.dataset.dollyStatus,ready:streamReady}));
      assert.deepEqual(state,{status:scenario==='valid'?'ready':'failed',ready:scenario==='valid'},scenario);
      if(scenario==='valid') {
        await page.evaluate(()=>__dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/,'streamed shell'));
        assert.equal(await page.evaluate(()=>__dolly.submit("test \"$(cat /etc/dolly/image)\" = default && printf restored > /tmp/stream-test && test \"$(cat /tmp/stream-test)\" = restored")),0);
      }
      console.log(`snapshot stream: ${scenario} passed`);
    } finally {await context.close();}
  }
} finally {clearTimeout(deadline);await browser.close();await server.close();}
