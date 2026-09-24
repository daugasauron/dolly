import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {startBrowserServer} from './browser-server.mjs';
const output='build/blockwalker-driver';await fs.mkdir(output,{recursive:true});
const site=await startBrowserServer(process.cwd(),'blockwalker');
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--no-sandbox','--ozone-platform=x11','--enable-unsafe-webgpu','--use-angle=vulkan','--enable-features=Vulkan,VulkanFromANGLE']});
const page=await browser.newPage({viewport:{width:1280,height:720},acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
const command=s=>page.evaluate(s=>__dolly.submit(s),s),shell=()=>page.evaluate(()=>__dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/,'shell'));
async function upload(path,dest){const run=command('upload '+dest);await page.waitForSelector('#file-upload[open]');await page.locator('#file-upload input').setInputFiles(path);assert.equal(await run,0);}
async function download(name){const event=page.waitForEvent('download'),run=command('download /workspace/'+name);await(await event).saveAs(output+'/'+name);assert.equal(await run,0);return JSON.parse(await fs.readFile(output+'/'+name,'utf8'));}
const frames=async()=>{const n=await page.evaluate(()=>__dolly.gpu.stats.frames);await page.waitForFunction(n=>__dolly.gpu.stats.frames>n+8,n);};
try{
 await page.goto(site.origin+'/blockwalker/');await page.waitForFunction(()=>globalThis.__dolly?.gpu?.stats?.frames>20,null,{timeout:60000});await page.keyboard.press('Escape');await shell();
 if(process.argv[2]){await upload(process.argv[2],'/tmp/playground.tar');assert.equal(await command('tar -xf /tmp/playground.tar -C /'),0);}
 const sources=['main','character','render','world','terrain','magnet','gpu-client'].map(s=>'/usr/src/dolly/blockwalker/'+s+'.c').join(' ');
 assert.equal(await command('cc -std=c17 -O2 -DBOX3D_DISABLE_SIMD -U__SIZEOF_INT128__ '+sources+' -ldolly-js -ldolly-raylib -lraylib -lbox3d -lm -o /usr/bin/blockwalker'),0);
 await upload('test/fixtures/blockwalker-pilot.c','/tmp/pilot.c');
 assert.equal(await command('cc -std=c17 -O2 -DBOX3D_DISABLE_SIMD -U__SIZEOF_INT128__ -I/usr/src/dolly/blockwalker /tmp/pilot.c /usr/src/dolly/blockwalker/character.c /usr/src/dolly/blockwalker/terrain.c /usr/src/dolly/blockwalker/magnet.c -ldolly-js -lraylib -lbox3d -lm -o /tmp/pilot-check'),0);
 assert.equal(await command('/tmp/pilot-check'),0);await fs.writeFile(output+'/pilot-physics.log',await page.evaluate(()=>__dolly.visibleTerminalText()));
 await upload(process.argv[3]||'test/fixtures/blockwalker-playground.c','/tmp/playground.c');
 assert.equal(await command('cc -std=c17 -O2 -DBOX3D_DISABLE_SIMD -U__SIZEOF_INT128__ -I/usr/src/dolly/blockwalker /tmp/playground.c /usr/src/dolly/blockwalker/character.c /usr/src/dolly/blockwalker/terrain.c /usr/src/dolly/blockwalker/magnet.c -ldolly-js -lraylib -lbox3d -lm -o /tmp/playground-check'),0);
 assert.equal(await command('/tmp/playground-check'),0);await fs.writeFile(output+'/cargo-physics.log',await page.evaluate(()=>__dolly.visibleTerminalText()));
 await download('blockwalker-world.json');
 assert.equal(await command('rm /workspace/blockwalker-world.json /workspace/blockwalker.character'),0);
 await upload('test/fixtures/blockwalker-turntable.mjs','/tmp/turntable-check.mjs');assert.equal(await command('cp /tmp/turntable-check.mjs /usr/src/dolly/blockwalker/check.mjs'),0);
 assert.equal(await command('blockwalker --integration-check'),0);await download('turntable-proof.json');
 for(const name of ['turntable-0.png','turntable-1.png']){const event=page.waitForEvent('download'),run=command('download /workspace/'+name);await(await event).saveAs(output+'/'+name);assert.equal(await run,0);}
 await upload('test/fixtures/blockwalker-driver.mjs','/tmp/driver-check.mjs');assert.equal(await command('cp /tmp/driver-check.mjs /usr/src/dolly/blockwalker/check.mjs'),0);
 const previous=await page.evaluate(()=>__dolly.gpu.stats.frames),run=command('blockwalker --integration-check');run.catch(()=>{});
 await page.waitForFunction(n=>__dolly.gpu?.active&&__dolly.gpu.stats.frames>n+10,previous);await page.screenshot({path:output+'/car-builder.png'});
 await page.mouse.click(120,564);await frames();
 await page.mouse.click(120,300);await frames();await page.screenshot({path:output+'/eyes-start.png'});
 await page.keyboard.down('W');await page.waitForTimeout(1800);await page.keyboard.up('W');await frames();
 await page.keyboard.down('W');await page.keyboard.down('D');await page.waitForTimeout(2200);await page.keyboard.up('D');await page.keyboard.up('W');await frames();
 await page.keyboard.press('C');await page.keyboard.press('E');await page.keyboard.down('W');await page.waitForTimeout(1000);await page.keyboard.up('W');await page.waitForTimeout(500);await page.screenshot({path:output+'/eyes-cargo.png'});
 await page.keyboard.press('Backslash');await frames();await page.screenshot({path:output+'/car-follow.png'});await page.keyboard.press('Q');await frames();
 await page.keyboard.press('Backslash');await frames();await page.keyboard.press('Escape');await frames();await page.keyboard.press('Escape');assert.equal(await run,0);await shell();
 const trace=await download('driver-trace.json'),world=await download('blockwalker-world.json'),views=trace.filter(s=>s.eyes),first=views[0],last=views.at(-1);
 const initial=JSON.parse(await fs.readFile('src/blockwalker/designs.json','utf8'));
 assert.ok(trace.length>30&&views.length>20);assert.equal(world.creatures.filter(c=>!c.supply).length,initial.length+2);assert.equal(world.deaths,0);
 const moved=Math.hypot(last.sensors.x-first.sensors.x,last.sensors.z-first.sensors.z);assert.ok(moved>5,'keyboard drives a physical world vehicle');
 for(const s of views){const {camera:c,sensors:p}=s,eye=[c.eyeX,c.eyeY,c.eyeZ],f=[c.x-c.eyeX,c.y-c.eyeY,c.z-c.eyeZ];assert.equal(c.fov,72);assert.ok(Math.abs(Math.hypot(...eye.map((v,i)=>v-p.positions[7][i]))-.52)<.002,'camera stays at the Eyes face');assert.ok(Math.abs(f[0]*c.upX+f[1]*c.upY+f[2]*c.upZ)<.001);}
 assert.ok(trace.some(s=>!s.eyes&&s.camera.fov===42),'outside camera toggle');assert.ok(trace.some(s=>s.sensors.magnets[8]?.power===1),'magnet switches on');assert.ok(trace.some(s=>s.sensors.magnets[8]?.attached),'vehicle picks up real world cargo');assert.equal(trace.at(-1).sensors.magnets[8].power,0);
 assert.deepEqual(errors,[]);const result={moved,frames:trace.length,cameraSamples:views.length,cargoPickedUp:true,worldObjects:world.creatures.length,errors};await fs.writeFile(output+'/driver-proof.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 const beforeEdit=await page.evaluate(()=>__dolly.gpu.stats.frames),editing=command('blockwalker --integration-check');editing.catch(()=>{});await page.waitForFunction(n=>__dolly.gpu?.active&&__dolly.gpu.stats.frames>n+10,beforeEdit);
 const original=await fs.readFile('src/blockwalker/driver.js','utf8');
 const edited=`function(t,s,m,r){
  for(const key of ['W','I'])if(s.input[key]){const p=key.toLowerCase();m[p+'Start']??=[s.x,s.z];m[p+'End']=[s.x,s.z];}
  delete s.input.W;delete s.pressed.W;
  if(s.input.I)s.input.W=s.input.I;if(s.pressed.I)s.pressed.W=s.pressed.I;
  return (${original})(t,s,m,r);
 }`;
 await fs.writeFile(output+'/edited.js',edited);await fs.writeFile(output+'/invalid.js','function broken {');
 async function importProgram(file){const opening=page.mouse.click(845,170);await page.waitForSelector('#file-upload[open]');await page.locator('#file-upload input').setInputFiles(file);await opening;await frames();}
 async function exportProgram(file){const download=page.waitForEvent('download');await page.mouse.click(700,170);await(await download).saveAs(file);await frames();return fs.readFile(file,'utf8');}
 await page.mouse.click(300,40);await frames();await importProgram(output+'/edited.js');assert.equal(await exportProgram(output+'/edited-export.js'),edited);
 await importProgram(output+'/invalid.js');assert.equal(await exportProgram(output+'/after-invalid.js'),edited);
 await page.mouse.click(952,170);await frames();await page.keyboard.press('Escape');assert.equal(await editing,0);await shell();
 let saved=await download('blockwalker-world.json');assert.equal(saved.installed,edited);
 const n=await page.evaluate(()=>__dolly.gpu.stats.frames),resumed=command('blockwalker --integration-check');resumed.catch(()=>{});await page.waitForFunction(n=>__dolly.gpu?.active&&__dolly.gpu.stats.frames>n+10,n);
 await page.mouse.click(300,40);await frames();assert.equal(await exportProgram(output+'/restored.js'),edited);await page.mouse.click(952,170);await frames();
 await page.mouse.click(120,300);await frames();await page.waitForTimeout(500);
 await page.keyboard.down('W');await page.waitForTimeout(2000);await page.keyboard.up('W');await frames();
 await page.keyboard.down('I');await page.waitForTimeout(2200);await page.keyboard.up('I');await frames();
 await page.mouse.click(300,40);await frames();assert.equal(await exportProgram(output+'/active-character.js'),edited);await page.screenshot({path:output+'/active-program.png'});await page.mouse.click(952,170);await frames();
 await page.keyboard.press('Escape');await frames();await page.keyboard.press('Escape');assert.equal(await resumed,0);await shell();saved=await download('blockwalker-world.json');
 const player=saved.creatures.find(c=>c.id===saved.playerId);assert.equal(player.source,edited);const m=typeof player.memory==='string'?JSON.parse(player.memory):player.memory,w=Math.hypot(m.wEnd[0]-m.wStart[0],m.wEnd[1]-m.wStart[1]),i=Math.hypot(m.iEnd[0]-m.iStart[0],m.iEnd[1]-m.iStart[1]);assert.ok(w<.3&&i>1,'only the imported I binding drives');
 assert.deepEqual(errors,[]);const proof={wDistance:w,iDistance:i,invalidImportKeptProgram:true,worldRestore:true,activeCharacterSource:true,errors};await fs.writeFile(output+'/edit-proof.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));

}catch(e){await page.screenshot({path:output+'/driver-failure.png'});if(!await page.evaluate(()=>__dolly.gpu?.active))console.log(await page.evaluate(()=>__dolly.visibleTerminalText()));throw e;}
finally{await browser.close();await site.close();}
