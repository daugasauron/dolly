import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {startBrowserServer} from './browser-server.mjs';
const out='build/blockwalker-controller-check';execFileSync(process.execPath,['scripts/build-source-tar.mjs','build/blockwalker-controller-source.tar','src/blockwalker','/usr/src/dolly/blockwalker']);await mkdir(out,{recursive:true});const site=await startBrowserServer(process.cwd(),'blockwalker');
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--no-sandbox','--ozone-platform=x11','--enable-unsafe-webgpu','--use-angle=vulkan','--enable-features=Vulkan,VulkanFromANGLE']});
const p=await browser.newPage({acceptDownloads:true,viewport:{width:1280,height:720}}),command=text=>p.evaluate(text=>__dolly.submit(text),text);
async function upload(local,target){const running=command('upload '+target);await p.waitForSelector('#file-upload[open]');await p.locator('#file-upload input').setInputFiles(local);assert.equal(await running,0);}
try{
 await p.goto(site.origin+'/blockwalker/');await p.waitForFunction(()=>globalThis.__dolly?.gpu?.stats?.frames>20,null,{timeout:60000});await p.keyboard.press('Escape');await p.evaluate(()=>__dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/,'shell'));
 await upload('test/fixtures/blockwalker-controllers.c','/tmp/controller-probe.c');await upload('build/blockwalker-controller-source.tar','/tmp/controller-source.tar');assert.equal(await command('tar -xf /tmp/controller-source.tar -C /'),0);
 const recipe=await readFile('modules/blockwalker.dm','utf8');const compile=recipe.split('\n').find(s=>s.startsWith('SLOP cc ')).slice(5).replace('/usr/src/dolly/blockwalker/main.c','-I /usr/src/dolly/blockwalker /tmp/controller-probe.c').replace(' /usr/src/dolly/blockwalker/world.c','').replace('-o /usr/bin/blockwalker','-o /tmp/controller-probe');
 assert.equal(await command(compile),0);assert.equal(await command('/tmp/controller-probe'),0);
 const event=p.waitForEvent('download'),pending=command('download /workspace/controller-probe.csv');await(await event).saveAs(out+'/controllers.csv');assert.equal(await pending,0);
 const lines=(await readFile(out+'/controllers.csv','utf8')).trim().split('\n'),keys=lines.shift().split(','),rows=lines.map(line=>Object.fromEntries(line.split(',').map((v,i)=>[keys[i],v])));
 const normal=rows.filter(r=>r.kind==='normal'),paused=rows.find(r=>r.kind==='paused'),bad=rows.filter(r=>!['normal','paused'].includes(r.kind));
 const examples=JSON.parse(await readFile('src/blockwalker/designs.json','utf8'));
 assert.equal(normal.length,examples.length);assert.ok(normal.every(r=>r.valid==='1'&&Number(r.steps)===1000));
 assert.ok(paused?.valid==='1'&&Number(paused.steps)===1000&&Number(paused.checks)>0&&Number(paused.wallMs)>=50,'a finite controller survives the actual injected wait');
 assert.equal(bad.length,5);assert.ok(bad.every(r=>r.valid==='0'&&r.error),'runaway loops, regex, getters, clocks and initialization are stopped');
 assert.equal(await p.evaluate(()=>__dolly.httpRequestCount),0);
 console.log(JSON.stringify({finiteCalls:normal.length*1000,pausedCalls:Number(paused.steps),runawaysStopped:bad.length,normalMilliseconds:normal.reduce((n,r)=>n+Number(r.wallMs),0)}));
}catch(e){console.error(await p.evaluate(()=>__dolly.visibleTerminalText()));throw e;}finally{await browser.close();await site.close();}
