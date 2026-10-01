// node tasks/20261001-223000-slopyard-living-world/run.mjs OUT PROGRAM.c "ARGS" [WORLD.lua]
// Boots /slopyard/ on DISPLAY, uploads the checkout's game sources and PROGRAM
// (which includes world.c), compiles it with the image's compile line and runs
// it with ARGS. WORLD.lua, if given, becomes /workspace/audit-in.lua. Saves the
// program's output as OUT/run.log and /workspace/audit-out.lua as OUT/.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright-core';
import {startBrowserServer} from '../../test/browser-server.mjs';
import {acceptDownload} from '../../demos/browser.mjs';
import {compileCommand} from '../../demos/slopyard/test/slopyard-data.mjs';
const root=resolve(import.meta.dirname,'../..'),[out,program,args='',input]=process.argv.slice(2).map((a,i)=>i===2?a:a&&resolve(a));
await fs.mkdir(out,{recursive:true});
execFileSync(process.execPath,['scripts/build-source-tar.mjs',out+'/source.tar','demos/slopyard/src','/usr/src/dolly/slopyard'],{cwd:root});
const site=await startBrowserServer(root,'slopyard');
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--no-sandbox','--ozone-platform=x11','--enable-unsafe-webgpu','--use-angle=vulkan','--enable-features=Vulkan,VulkanFromANGLE']});
const page=await browser.newPage({acceptDownloads:true,viewport:{width:1280,height:720}});page.setDefaultTimeout(120000);
const command=text=>page.evaluate(text=>__dolly.submit(text),text);
async function upload(local,target){const running=command('upload '+target);running.catch(()=>{});await page.waitForSelector('#file-upload[open]');await page.locator('#file-upload input').setInputFiles(local);assert.equal(await running,0);}
async function download(path,local){const run=command('download '+path),event=acceptDownload(page,()=>run);await(await event).saveAs(local);assert.equal(await run,0);}
try{
 await page.goto(site.origin+'/slopyard/');await page.waitForFunction(()=>globalThis.__dolly?.gpu?.stats?.frames>20);await page.keyboard.press('Escape');
 await page.evaluate(()=>__dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/,'shell'));
 await upload(program,'/tmp/probe.c');await upload(out+'/source.tar','/tmp/source.tar');assert.equal(await command('tar -xf /tmp/source.tar -C /'),0);
 if(input)await upload(input,'/workspace/audit-in.lua');
 const compile=(await compileCommand()).replace('/usr/src/dolly/slopyard/main.c','-I /usr/src/dolly/slopyard /tmp/probe.c').replace(' /usr/src/dolly/slopyard/world.c','').replace('-o /usr/bin/slopyard','-o /tmp/probe');
 assert.equal(await command(compile),0);
 const started=Date.now(),status=await command(`/tmp/probe ${args} > /workspace/run.log 2>&1`);
 console.log('status',status,'wall',((Date.now()-started)/1000).toFixed(1)+'s');
 await download('/workspace/run.log',out+'/run.log');
 if(await command('test -f /workspace/audit-out.lua')===0)await download('/workspace/audit-out.lua',out+'/audit-out.lua');
}finally{await browser.close();await site.close();}
