import {compileCommand,parseLua} from './blockwalker-data.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {startBrowserServer} from './browser-server.mjs';
const output='build/blockwalker-import';await fs.mkdir(output,{recursive:true});
const site=await startBrowserServer(process.cwd(),'blockwalker'),browser=await chromium.launch({channel:'chrome',headless:false,args:['--no-sandbox','--ozone-platform=x11','--enable-unsafe-webgpu','--use-angle=vulkan','--enable-features=Vulkan,VulkanFromANGLE']});
const page=await browser.newPage({acceptDownloads:true,viewport:{width:1280,height:720}}),errors=[];page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
const command=s=>page.evaluate(s=>__dolly.submit(s),s),frames=async()=>{const n=await page.evaluate(()=>__dolly.gpu.stats.frames);await page.waitForFunction(n=>__dolly.gpu.stats.frames>n+5,n);};
async function upload(path,dest){const run=command('upload '+dest);await page.waitForSelector('#file-upload[open]');await page.locator('#file-upload input').setInputFiles(path);assert.equal(await run,0);}
async function download(name){const event=page.waitForEvent('download'),run=command('download /workspace/'+name);await(await event).saveAs(output+'/'+name);assert.equal(await run,0);}
async function importFile(file,x=974,y=40){await page.mouse.click(x,y);await page.waitForSelector('#file-upload[open]');await page.locator('#file-upload input').setInputFiles(output+'/'+file);await page.waitForSelector('#file-upload[open]',{state:'hidden'});await frames();}
async function exported(name,x=860,y=40){const event=page.waitForEvent('download');await page.mouse.click(x,y);await(await event).saveAs(output+'/'+name);await frames();return parseLua(await fs.readFile(output+'/'+name,'utf8'));}
try{
 await page.goto(site.origin+'/blockwalker/');await page.waitForFunction(()=>globalThis.__dolly?.gpu?.stats?.frames>20,null,{timeout:60000});await page.keyboard.press('Escape');await page.evaluate(()=>__dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/,'shell'));
 if(process.argv[2]){await upload(process.argv[2],'/tmp/import-source.tar');assert.equal(await command('tar -xf /tmp/import-source.tar -C /'),0);}
  assert.equal(await command(await compileCommand()),0);
 await upload('test/fixtures/blockwalker-import.c','/tmp/import.c');assert.equal(await command('cc -std=c17 -O2 -DBOX3D_DISABLE_SIMD -U__SIZEOF_INT128__ -I/usr/src/dolly/blockwalker /tmp/import.c /usr/src/dolly/blockwalker/character.c /usr/src/dolly/blockwalker/terrain.c /usr/src/dolly/blockwalker/magnet.c -ldolly-js -lraylib -lbox3d -lm -o /tmp/import-check'),0);
 if(process.argv[3])await upload(process.argv[3],'/tmp/legacy-world.lua');
 assert.equal(await command('/tmp/import-check'+(process.argv[3]?' /tmp/legacy-world.lua':'')),0);await fs.writeFile(output+'/physics.log',await page.evaluate(()=>__dolly.visibleTerminalText()));
 for(const file of ['manual-design.lua','programmed-design.lua','invalid-design.lua','loaded-world.lua','delivered-world.lua','invalid-world.lua'])await download(file);
 const run=command('blockwalker');run.catch(()=>{});await page.waitForFunction(()=>__dolly.gpu.active);await frames();
 await importFile('manual-design.lua');await page.mouse.click(120,62);await page.mouse.click(828,172);await frames();await page.screenshot({path:output+'/manual-library.png'});await page.mouse.click(928,220);await frames();
 const manual=await exported('manual-roundtrip.lua');assert.equal(manual.source,null);assert.deepEqual(manual,parseLua(await fs.readFile(output+'/manual-design.lua','utf8')));
 await importFile('programmed-design.lua');const programmed=await exported('programmed-roundtrip.lua');assert.equal(programmed.hz,60);assert.equal(programmed.sea,true);assert.deepEqual(programmed,parseLua(await fs.readFile(output+'/programmed-design.lua','utf8')));
 await importFile('invalid-design.lua');assert.deepEqual(await exported('design-after-rejection.lua'),programmed);
 await page.mouse.click(404,40);await frames();await importFile('loaded-world.lua',120,656);const loaded=await exported('loaded-roundtrip.lua',120,626);assert.equal(loaded.creatures.length,2);assert.equal(loaded.cargoDelivered,0);assert.ok(loaded.creatures.some(c=>c.magnets.some(m=>m?.attached)));
 await importFile('invalid-world.lua',120,656);const rejected=await exported('world-after-rejection.lua',120,626);assert.equal(rejected.creatures.length,2);assert.equal(rejected.cargoDelivered,0);assert.equal(rejected.playerId,loaded.playerId);
 await importFile('delivered-world.lua',120,656);const delivered=await exported('delivered-roundtrip.lua',120,626);assert.equal(delivered.cargoDelivered,1);assert.equal(delivered.playerDelivered,1);assert.equal(delivered.deliveries.length,1);assert.equal(delivered.creatures.length,2);await page.mouse.click(120,350);await frames();await page.screenshot({path:output+'/restored-world.png'});
 await page.mouse.click(404,40);await frames();assert.deepEqual(await exported('workshop-after-world-import.lua'),programmed,'replacing the world preserves the workshop and controller');
 await page.keyboard.press('Escape');assert.equal(await run,0);assert.deepEqual(errors,[]);console.log(JSON.stringify({manualLibrary:true,designRoundtrip:true,legacyDesign:true,loadedMagnetRestored:true,cargoCreditRestored:true,corruptImportsRetainWork:true,workshopPreserved:true,errors}));
}catch(error){await page.screenshot({path:output+'/failure.png'});if(!await page.evaluate(()=>__dolly.gpu?.active))console.log(await page.evaluate(()=>__dolly.visibleTerminalText()));throw error;}
finally{await browser.close();await site.close();}
