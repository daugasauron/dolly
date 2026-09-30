import {compileCommand,parseLua} from './slopyard-data.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {startBrowserServer} from './browser-server.mjs';
const output=process.argv[3]||'build/slopyard-bearing-proof';await fs.mkdir(output,{recursive:true});
const site=await startBrowserServer(process.cwd(),'slopyard'),browser=await chromium.launch({channel:'chrome',headless:false,args:['--no-sandbox','--ozone-platform=x11','--enable-unsafe-webgpu','--use-angle=vulkan','--enable-features=Vulkan,VulkanFromANGLE']});
const page=await browser.newPage({viewport:{width:1280,height:720},acceptDownloads:true}),errors=[];page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));
const command=async s=>{console.log('Running',s);const code=await page.evaluate(s=>__dolly.submit(s),s);console.log('Status',code);return code;};
async function upload(file,to){const run=command('upload '+to);await page.waitForSelector('#file-upload[open]');await page.locator('#file-upload input').setInputFiles(file);assert.equal(await run,0);}
async function frames(){const n=await page.evaluate(()=>__dolly.gpu.stats.frames);await page.waitForFunction(n=>__dolly.gpu.stats.frames>n+8,n);}
async function exported(name){const event=page.waitForEvent('download');await page.mouse.click(860,40);await(await event).saveAs(output+'/'+name+'.lua');return parseLua(await fs.readFile(output+'/'+name+'.lua','utf8'));}
function screen(x,y,z){
 const yaw=.55,pitch=.65,distance=10,t=[.5,1,.5],eye=[t[0]+Math.sin(yaw)*Math.cos(pitch)*distance,t[1]+Math.sin(pitch)*distance,t[2]+Math.cos(yaw)*Math.cos(pitch)*distance];
 const f=t.map((v,i)=>(v-eye[i])/distance),right=[-f[2],0,f[0]],len=Math.hypot(...right);for(let i=0;i<3;i++)right[i]/=len;
 const up=[right[1]*f[2]-right[2]*f[1],right[2]*f[0]-right[0]*f[2],right[0]*f[1]-right[1]*f[0]],d=[x-eye[0],y-eye[1],z-eye[2]],dot=(a,b)=>a.reduce((v,x,i)=>v+x*b[i],0),depth=dot(d,f),scale=594/(2*Math.tan(21*Math.PI/180));
 return [620+scale*dot(d,right)/depth,377-scale*dot(d,up)/depth];
}
try{
 await page.goto(site.origin+'/slopyard/');await page.waitForFunction(()=>globalThis.__dolly?.gpu?.stats?.frames>20,null,{timeout:60000});await page.keyboard.press('Escape');await page.evaluate(()=>__dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/,'shell'));
 if(process.argv[2]){await upload(process.argv[2],'/tmp/source.tar');assert.equal(await command('tar -xf /tmp/source.tar -C /'),0);}
 await upload('test/fixtures/slopyard-bearings.c','/tmp/bearing.c');
 const flags='cc -std=c17 -O2 -U__SIZEOF_INT128__ -I/usr/src/dolly/slopyard ';
 assert.equal(await command(flags+'/tmp/bearing.c /usr/src/dolly/slopyard/character.c /usr/src/dolly/slopyard/terrain.c /usr/src/dolly/slopyard/magnet.c -ldolly-js -lraylib -lslopyard-box3d -lm -o /tmp/bearing'),0);
 const status=await command('/tmp/bearing > /workspace/bearings.log');const report=page.waitForEvent('download'),download=command('download /workspace/bearings.log');await(await report).saveAs(output+'/physics.log');assert.equal(await download,0);assert.equal(status,0);
 await upload('test/fixtures/slopyard-winch.c','/tmp/winch.c');
 assert.equal(await command(flags+'/tmp/winch.c /usr/src/dolly/slopyard/character.c /usr/src/dolly/slopyard/terrain.c /usr/src/dolly/slopyard/magnet.c -ldolly-js -lraylib -lslopyard-box3d -lm -o /tmp/winch'),0);
 const winchStatus=await command('/tmp/winch > /workspace/winch-physics.log'),winchReport=page.waitForEvent('download'),winchDownload=command('download /workspace/winch-physics.log');await(await winchReport).saveAs(output+'/winch-physics.log');assert.equal(await winchDownload,0);assert.equal(winchStatus,0);
  assert.equal(await command(flags+sources+' -ldolly-js -ldolly-raylib -lraylib -lslopyard-box3d -lm -o /usr/bin/slopyard'),0);
 await upload('test/fixtures/slopyard-winch-view.mjs','/tmp/winch-check.mjs');assert.equal(await command('cp /tmp/winch-check.mjs /usr/src/dolly/slopyard/check.mjs'),0);assert.equal(await command('slopyard --integration-check'),0);
 for(const name of ['winch-view.lua','winch-hoist.png','winch-slack.png','winch-slack.lua']){const event=page.waitForEvent('download'),download=command('download /workspace/'+name);await(await event).saveAs(output+'/'+name);assert.equal(await download,0);}
 await upload('test/fixtures/slopyard-bearing-builder.mjs','/tmp/builder-check.mjs');assert.equal(await command('cp /tmp/builder-check.mjs /usr/src/dolly/slopyard/check.mjs'),0);
 const run=command('slopyard --integration-check');run.catch(()=>{});await Promise.race([page.waitForFunction(()=>__dolly.gpu.active),run.then(code=>{throw Error('Game exited before drawing: '+code);})]);await frames();
 await page.mouse.click(120,352);await page.mouse.click(...screen(0,1.66,0));await frames();
 for(const size of [2,3,4,1,3]){await page.mouse.click(1062+(size-1)*56,194);await frames();assert.equal((await exported('size-'+size)).blueprint.at(-1).size,size);}
 await page.mouse.click(65,155);await page.mouse.click(...screen(1,2,0));await frames();let design=await exported('face-attachment');assert.equal(design.blueprint.length,18);assert.deepEqual(['x','y','z','parent'].map(k=>design.blueprint.at(-1)[k]),[1,2,0,16]);
 await page.mouse.click(120,352);await page.mouse.click(...screen(-.5,2,0));await frames();await page.mouse.click(1230,194);await frames();assert.equal((await exported('resize-with-child')).blueprint[16].size,4);
 await page.mouse.click(1062,194);await frames();assert.equal((await exported('rejected-shrink')).blueprint[16].size,4);
 await page.mouse.click(65,630);await frames();design=await exported('undo-resize');assert.equal(design.blueprint[16].size,3);await page.screenshot({path:output+'/builder.png'});
 await page.mouse.click(65,258);await page.mouse.click(...screen(0,1.66,1));await frames();design=await exported('winch-added');assert.equal(design.blueprint.length,19);assert.equal(design.blueprint.at(-1).joint,8);
 await page.mouse.click(1235,266);await page.mouse.click(1235,550);await page.mouse.click(1088,355);await page.keyboard.press('r');await page.mouse.click(1208,355);await page.keyboard.press('f');await frames();design=await exported('winch-configured');const winch=design.blueprint.at(-1);assert.equal(winch.force,26);assert.equal(winch.travel,8.5);assert.equal(winch.negative,82);assert.equal(winch.positive,70);await page.screenshot({path:output+'/winch-inspector.png'});
 await page.mouse.click(974,40);await page.waitForSelector('#file-upload[open]');await page.locator('#file-upload input').setInputFiles(output+'/winch-configured.lua');await page.waitForSelector('#file-upload[open]',{state:'hidden'});await frames();assert.deepEqual(await exported('roundtrip'),design);
 await page.keyboard.press('Escape');assert.equal(await run,0);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({sizes:[1,2,3,4],axes:[0,1,2],multipleMounts:true,loadedRotation:true,worldRestore:true,faceAttachment:true,resizeRejection:true,undo:true,designRoundtrip:true,winchBuilder:true,winchLoadedRestore:true,winchSlack:true,errors}));
}catch(e){await page.screenshot({path:output+'/failure.png'});if(!await page.evaluate(()=>__dolly.gpu?.active))console.log(await page.evaluate(()=>__dolly.visibleTerminalText()));throw e;}finally{await browser.close();await site.close();}
