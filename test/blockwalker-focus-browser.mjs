import {parseLua,readCatalog} from './blockwalker-data.mjs';
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {startBrowserServer} from './browser-server.mjs';

const output=new URL('../build/blockwalker-focus/',import.meta.url);await mkdir(output,{recursive:true});
const population=await readCatalog().length;
const site=await startBrowserServer(new URL('..',import.meta.url).pathname,'blockwalker');
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--no-sandbox','--ozone-platform=x11','--enable-unsafe-webgpu','--use-angle=vulkan','--enable-features=Vulkan,VulkanFromANGLE']});
const page=await browser.newPage({acceptDownloads:true,viewport:{width:1280,height:720}});
const command=text=>page.evaluate(text=>__dolly.submit(text),text),frames=async()=>{const n=await page.evaluate(()=>__dolly.gpu.stats.frames);await page.waitForFunction(n=>__dolly.gpu.stats.frames>n+6,n);};
const shot=name=>page.screenshot({path:new URL(name+'.png',output).pathname});
const download=async name=>{const event=page.waitForEvent('download'),running=command('download /workspace/'+name),file=await event,path=new URL(name,output).pathname;await file.saveAs(path);assert.equal(await running,0);return readFile(path);};
try{
 await page.goto(site.origin+'/blockwalker/');await page.waitForFunction(()=>globalThis.__dolly?.gpu?.stats?.frames>20,null,{timeout:60000});
 assert.equal(await page.evaluate(()=>__dolly.gpu.stats.readbackBytes),0);
 await page.keyboard.press('Escape');await page.evaluate(()=>__dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/,'shell'));
 const upload=command('upload /tmp/focus.mjs');await page.waitForSelector('#file-upload[open]');await page.locator('#file-upload input').setInputFiles(new URL('./fixtures/blockwalker-focus.mjs',import.meta.url).pathname);assert.equal(await upload,0);
 assert.equal(await command('cp /tmp/focus.mjs /usr/src/dolly/blockwalker/check.mjs'),0);
 const run=command('blockwalker --integration-check');await page.waitForFunction(()=>__dolly.gpu?.active&&__dolly.gpu.stats.frames>10,null,{timeout:30000});
 await page.mouse.click(100,458);await page.waitForTimeout(1300);
 await page.mouse.click(900,698);await frames();await shot('full-world');
 await page.mouse.click(100,350);await frames();
 await page.mouse.move(1160,480);await page.mouse.down({button:'right'});await page.mouse.move(1080,520,{steps:8});await page.mouse.up({button:'right'});await frames();
 await page.keyboard.press('Tab');await frames();await shot('world-with-pi');
 await page.mouse.click(1120,627);await page.keyboard.type('WASDQE');await page.keyboard.press('Enter');await frames();
 await page.keyboard.press('Shift+Tab');await frames();await page.mouse.click(900,698);await frames();await page.keyboard.press('Tab');await frames();
 await page.keyboard.down('W');await page.waitForTimeout(350);await page.keyboard.up('W');await frames();
 await page.keyboard.press('Escape');await frames();
 for(let i=0;i<Math.ceil((population-7)/8);i++)await page.mouse.click(198,580);
 await page.mouse.click(100,356+26*Math.min(population,7));await page.waitForTimeout(5000);await frames();
 await page.keyboard.press('Escape');await frames();
 await page.mouse.click(172,630);await frames();await page.keyboard.press('Shift+Tab');await frames();
 await page.mouse.click(640,360);await frames();await shot('full-builder-placement');
 await page.keyboard.press('Escape');await frames();await page.keyboard.press('Escape');assert.equal(await run,0);
 const result=parseLua((await download('blockwalker-focus.lua')).toString()),{trace,captures}=result;
 const following=trace.filter(s=>s.target&&s.camera.follow!==result.probe);assert.ok(following.length>20);assert.ok(following.every(s=>s.camera.follow===following[0].camera.follow),'hidden menus cannot select another creature');
 const first=following[0],last=following.at(-1),offset=first.target.map((v,i)=>first.camera[['x','y','z'][i]]-v);
 assert.ok(Math.hypot(...first.target.map((v,i)=>v-last.target[i]))>.2,'followed world body actually moves');
 assert.ok(following.every(s=>s.target.every((v,i)=>Math.abs(s.camera[['x','y','z'][i]]-v-offset[i])<.002)),'camera follows the same physical displacement while orbiting and typing');
 assert.ok(following.some(s=>Math.abs(s.camera.yaw-first.camera.yaw)>.5),'right-drag works in the expanded viewport');
 const removalStart=trace.findIndex(s=>s.camera.follow===result.probe),free=trace.slice(trace.indexOf(last)+1,removalStart).filter(s=>s.mode==='world');assert.ok(free.length>2&&free.every(s=>s.camera.follow===0));assert.ok(Math.hypot(free.at(-1).camera.x-free[0].camera.x,free.at(-1).camera.z-free[0].camera.z)>1,'manual movement releases following');
 const removalEnd=trace.findIndex((s,i)=>i>removalStart&&s.camera.follow===0);assert.ok(removalStart>=0&&removalEnd>removalStart&&trace[removalEnd].mode==='world');assert.ok(result.removals.some(r=>r.id===result.probe&&r.cause==='controller'),'a real controller failure removes the followed body safely');assert.deepEqual(trace[removalEnd].camera,{...trace[removalEnd-1].camera,follow:0},'removing the target leaves the camera at its last location');
 assert.equal(result.prompt,'WASDQE','the Pi prompt accepts movement keys while focus view is active');
 const placement=trace.find(s=>s.mode==='builder'&&s.view.focused&&s.parts.length===1);assert.ok(placement);
 const c=placement.camera;assert.deepEqual(placement.parts[0],[Math.round(c.x-Math.sin(c.yaw)*c.y/Math.tan(c.pitch)),0,Math.round(c.z-Math.cos(c.yaw)*c.y/Math.tan(c.pitch))],'full-view center picking agrees with the actual camera ray');
 assert.ok(trace.some(s=>s.mode==='world'&&!s.view.focused&&s.camera.follow===0),'Escape restores controls before leaving the world');
 const widths=new Set();for(const capture of captures){const png=await download(capture.name);assert.equal(png.readUInt32BE(16),640);assert.equal(png.readUInt32BE(20),Math.floor(capture.view.height*640/capture.view.width));widths.add(capture.view.width);}
 assert.deepEqual([...widths].sort((a,b)=>a-b),[756,998,1280]);assert.equal(await page.evaluate(()=>__dolly.httpRequestCount),0);
 console.log(JSON.stringify({followedBody:first.camera.follow,followedFrames:following.length,focusView:true,piPrompt:true,expandedPicking:true,captures:captures.length,modelRequests:0}));
}catch(error){await shot('failure');if(!await page.evaluate(()=>__dolly.gpu?.active))console.error(await page.evaluate(()=>__dolly.visibleTerminalText()).catch(()=>''));throw error;}
finally{await browser.close();await site.close();}
