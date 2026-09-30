import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {startBrowserServer} from './browser-server.mjs';
const out='build/slopyard-controller-check';execFileSync(process.execPath,['scripts/build-source-tar.mjs','build/slopyard-controller-source.tar','src/slopyard','/usr/src/dolly/slopyard']);await mkdir(out,{recursive:true});const site=await startBrowserServer(process.cwd(),'slopyard');
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--no-sandbox','--ozone-platform=x11','--enable-unsafe-webgpu','--use-angle=vulkan','--enable-features=Vulkan,VulkanFromANGLE']});
const p=await browser.newPage({acceptDownloads:true,viewport:{width:1280,height:720}}),command=text=>p.evaluate(text=>__dolly.submit(text),text);
async function upload(local,target){const running=command('upload '+target);await p.waitForSelector('#file-upload[open]');await p.locator('#file-upload input').setInputFiles(local);assert.equal(await running,0);}
try{
 await p.goto(site.origin+'/slopyard/');await p.waitForFunction(()=>globalThis.__dolly?.gpu?.stats?.frames>20,null,{timeout:60000});await p.keyboard.press('Escape');await p.evaluate(()=>__dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/,'shell'));
 await upload(process.argv[2]||'test/fixtures/slopyard-controllers.c','/tmp/controller-probe.c');await upload('build/slopyard-controller-source.tar','/tmp/controller-source.tar');assert.equal(await command('tar -xf /tmp/controller-source.tar -C /'),0);
 const recipe=await readFile('modules/slopyard.dm','utf8');const compile=recipe.split('\n').find(s=>s.startsWith('SLOP cc ')).slice(5).replace('/usr/src/dolly/slopyard/main.c','-I /usr/src/dolly/slopyard /tmp/controller-probe.c').replace(' /usr/src/dolly/slopyard/world.c','').replace('-o /usr/bin/slopyard','-o /tmp/controller-probe');
 assert.equal(await command(compile),0);assert.equal(await command('/tmp/controller-probe'),0);
 assert.equal(await p.evaluate(()=>__dolly.httpRequestCount),0);
 console.log(await p.evaluate(()=>__dolly.visibleTerminalText()));
}catch(e){console.error(await p.evaluate(()=>__dolly.visibleTerminalText()));throw e;}finally{await browser.close();await site.close();}
