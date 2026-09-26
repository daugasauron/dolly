import {compileCommand,parseLua,readCatalog} from './blockwalker-data.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {startBrowserServer} from './browser-server.mjs';
const output='build/blockwalker-spectator';await fs.mkdir(output,{recursive:true});
const site=await startBrowserServer(process.cwd(),'blockwalker');
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--no-sandbox','--ozone-platform=x11','--enable-unsafe-webgpu','--use-angle=vulkan','--enable-features=Vulkan,VulkanFromANGLE']});
const page=await browser.newPage({viewport:{width:1280,height:720},acceptDownloads:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
const command=s=>page.evaluate(s=>__dolly.submit(s),s),shell=()=>page.evaluate(()=>__dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/,'shell'));
async function upload(path,dest){const run=command('upload '+dest);await page.waitForSelector('#file-upload[open]');await page.locator('#file-upload input').setInputFiles(path);assert.equal(await run,0);}
async function download(name){const event=page.waitForEvent('download'),run=command('download /workspace/'+name);await(await event).saveAs(output+'/'+name);assert.equal(await run,0);return parseLua(await fs.readFile(output+'/'+name,'utf8'));}
const catalog=await readCatalog();let first=0;
async function select(name){
 const index=catalog.findIndex(c=>c.name.startsWith(name));assert.ok(index>=0);
 while(index<first){await page.mouse.click(44,580);first=Math.max(0,first-8);}
 while(index>=first+8){await page.mouse.click(198,580);first=Math.min(catalog.length-8,first+8);}
 await page.mouse.click(120,356+(index-first)*26);
}
function rotate(v,q){const u=q.slice(0,3),w=q[3],dot=u.reduce((n,x,i)=>n+x*v[i],0),square=u.reduce((n,x)=>n+x*x,0),cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];return v.map((x,i)=>2*dot*u[i]+(w*w-square)*x+2*w*cross[i]);}
try{
 await page.goto(site.origin+'/blockwalker/');await page.waitForFunction(()=>globalThis.__dolly?.gpu?.stats?.frames>20,null,{timeout:60000});await page.keyboard.press('Escape');await shell();
 if(process.argv[2]){
  await upload(process.argv[2],'/tmp/spectator.tar');assert.equal(await command('tar -xf /tmp/spectator.tar -C /'),0);
    assert.equal(await command(await compileCommand()),0);
 }
 await upload('test/fixtures/blockwalker-spectator.mjs','/tmp/spectator.mjs');assert.equal(await command('cp /tmp/spectator.mjs /usr/src/dolly/blockwalker/check.mjs && rm /workspace/blockwalker-world.lua'),0);
 const prior=await page.evaluate(()=>__dolly.gpu.stats.frames),run=command('blockwalker --integration-check');run.catch(()=>{});
 await page.waitForFunction(n=>__dolly.gpu?.active&&__dolly.gpu.stats.frames>n+10,prior);await page.mouse.click(404,40);
 for(const name of ['Sidelight','Komame','Tsubame']){
  await select(name);await page.keyboard.press('Backslash');await page.waitForTimeout(2600);await page.screenshot({path:output+'/'+name+'-eyes.png'});
  await page.mouse.click(1140,295);await page.waitForTimeout(800);await page.screenshot({path:output+'/'+name+'-follow.png'});
 }
 await page.keyboard.press('Backslash');await page.waitForTimeout(800);await page.keyboard.down('W');await page.waitForTimeout(800);await page.keyboard.up('W');await page.waitForTimeout(800);
 await select('Cargo');await page.keyboard.press('Backslash');await page.waitForTimeout(800);
 await page.keyboard.press('Escape');await page.keyboard.press('Escape');assert.equal(await run,0);await shell();
 const trace=await download('spectator-trace.lua'),world=await download('blockwalker-world.lua'),eyes=trace.filter(s=>s.eyes);
 assert.ok(eyes.length>=9);assert.ok(trace.every(s=>!s.piloting),'watching does not take keyboard control from the character');
 for(const s of eyes){
  const axis=[0,0,0];axis[s.block.axis]=s.block.direction;
  const forward=rotate(axis,s.pose.slice(3,7)),up=rotate(s.block.axis===1?[0,0,-1]:[0,1,0],s.pose.slice(3,7)),camera=s.camera;
  const eye=[camera.eyeX,camera.eyeY,camera.eyeZ],target=[camera.x,camera.y,camera.z],actualUp=[camera.upX,camera.upY,camera.upZ];
  assert.equal(camera.fov,72);
  for(let i=0;i<3;i++){assert.ok(Math.abs(eye[i]-s.pose[i]-.52*forward[i])<.001);assert.ok(Math.abs(target[i]-eye[i]-forward[i])<.001);assert.ok(Math.abs(actualUp[i]-up[i])<.001);}
 }
 for(const name of ['Sidelight','Komame','Tsubame']){const samples=eyes.filter(s=>s.actor.name.startsWith(name));assert.ok(samples.length>=3,name+' has repeated body-relative camera samples');assert.ok(samples.at(-1).actor.seconds>samples[0].actor.seconds+1,name+' continues simulating');}
 const tug=eyes.filter(s=>s.actor.name.startsWith('Tsubame'));assert.ok(Math.hypot(...tug.at(-1).actor.position.map((x,i)=>x-tug[0].actor.position[i]))>.1,'the tug keeps moving under its own program');
 assert.ok(trace.some(s=>s.camera.follow===0&&!s.eyes),'moving the spectator camera leaves the character');
 assert.ok(trace.some(s=>s.camera.follow===catalog.findIndex(c=>c.name==='Cargo')+1&&!s.eyes&&s.camera.fov===42),'a character without Eyes falls back to the outside view');
 assert.equal(world.creatures.length,catalog.length);assert.equal(world.deaths,0);assert.equal(world.playerId,0);assert.deepEqual(errors,[]);
 const result={bodyRelativeSamples:eyes.length,characters:[...new Set(eyes.map(s=>s.actor.name))],programsContinue:true,errors};await fs.writeFile(output+'/result.lua',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(e){await page.screenshot({path:output+'/failure.png'});if(!await page.evaluate(()=>__dolly.gpu?.active))console.error(await page.evaluate(()=>__dolly.visibleTerminalText()));throw e;}
finally{await browser.close();await site.close();}
