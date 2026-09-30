import {parseLua,readCatalog} from './slopyard-data.mjs';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {startBrowserServer} from './browser-server.mjs';

const output=new URL('../build/slopyard-cargo/',import.meta.url);await mkdir(output,{recursive:true});
const designs=await readCatalog();
const cargo=designs.find(d=>d.name==='Cargo'),pier=designs.find(d=>d.name.startsWith('Tidelock')),boat=designs.find(d=>d.name.startsWith('Quayfin'));
const beam=[cargo.blueprint[0],{...cargo.blueprint[0],parent:0,x:1},{...cargo.blueprint[0],parent:1,x:2}];
const seed=[pier,boat,{...cargo,x:163.5,y:.5,z:-6},{...cargo,x:-40,y:8,z:0},{...cargo,x:-60,y:129,z:0},
 {...cargo,name:'Beam cargo',x:-20,z:80,blueprint:beam},
 {...cargo,name:'Fixed rack',x:-30,z:80,blueprint:beam,anchored:true},
 {...cargo,name:'Magnetic machine',x:-40,z:80,blueprint:[beam[0],{...beam[1],joint:5,axis:0,negative:81,positive:65}]}];
await writeFile(new URL('designs.lua',output),JSON.stringify(seed));
const site=await startBrowserServer(new URL('..',import.meta.url).pathname,'slopyard');
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--no-sandbox','--ozone-platform=x11','--enable-unsafe-webgpu','--use-angle=vulkan','--enable-features=Vulkan,VulkanFromANGLE']});
const page=await browser.newPage({acceptDownloads:true,viewport:{width:1280,height:720}});
const command=text=>page.evaluate(text=>__dolly.submit(text),text);
const upload=async(local,destination)=>{const running=command('upload '+destination);await page.waitForSelector('#file-upload[open]');await page.locator('#file-upload input').setInputFiles(local.pathname);assert.equal(await running,0);};
const download=async name=>{const event=page.waitForEvent('download'),running=command('download /workspace/'+name),file=await event,path=new URL(name,output);await file.saveAs(path.pathname);assert.equal(await running,0);return readFile(path);};
try{
 await page.goto(site.origin+'/slopyard/');await page.waitForFunction(()=>globalThis.__dolly?.gpu?.stats?.frames>20,null,{timeout:60000});
 await page.keyboard.press('Escape');await page.evaluate(()=>__dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/,'shell'));
 await upload(new URL('./fixtures/slopyard-cargo.mjs',import.meta.url),'/tmp/cargo.mjs');await upload(new URL('designs.lua',output),'/tmp/cargo-designs.lua');
 assert.equal(await command('cp /tmp/cargo.mjs /usr/src/dolly/slopyard/check.mjs'),0);
 assert.equal(await command('cp /tmp/cargo-designs.lua /usr/src/dolly/slopyard/designs.lua'),0);
 assert.equal(await command('rm /workspace/slopyard-world.lua'),0);
 assert.equal(await command('slopyard --integration-check'),0);
 const first=parseLua((await download('cargo-first.lua')).toString());await download('cargo-first.png');
 const {initial,placed,created,trace,final}=first,body=(world,id)=>world.creatures.find(c=>c.id===id);
 assert.equal(initial.creatures.length,7,'invalid bundled height does not spawn a body');
 assert.equal(initial.creatures.find(c=>c.name==='Beam cargo').cargo,true,'a passive assembly can be transported as cargo');
 for(const name of ['Fixed rack','Magnetic machine'])assert.equal(initial.creatures.find(c=>c.name===name).cargo,false,'structures and actuators remain machines');
 assert.equal(initial.creatures[2].y,.5);assert.equal(initial.creatures[3].y,8);
 assert.ok(Math.abs(body(placed,created.deck).y-1)<.0001);assert.ok(Math.abs(body(placed,created.high).y-8)<.0001,'world cargo accepts explicit height');
 assert.ok(Math.abs(body(placed,created.sea).y+1.35)<.001,'shared sea placement ignores the ground workshop');
 assert.ok(Math.abs(body(placed,created.island).y-10.65)<.001,'omitted height uses the island surface');
 assert.equal(final.creatures.length,11);assert.equal(final.deaths,0);
 for(const id of [initial.creatures[3].id,created.high])assert.ok(body(final,id).y<.6&&body(final,id).rootHeight<.7,'a falling crate keeps its standing height and survives landing');
 const pierId=initial.creatures[0].id,liftId=initial.creatures[2].id,boatId=initial.creatures[1].id;
 const moving=trace.filter(s=>s.seconds>2),stage=moving.map(s=>body(s,pierId).poses[41][1]),loads=moving.map(s=>body(s,liftId).y);
 assert.ok(Math.max(...loads)-Math.min(...loads)>5,'the loose crate rides through the full lift travel');
 const high=loads.findIndex(y=>y>Math.max(...loads)-.1);
 assert.ok(loads.slice(high+1).some(y=>y<Math.max(...loads)-5),'the loaded lift returns to the low level after reaching the top');
 assert.ok(moving.every((s,i)=>Math.abs(loads[i]-stage[i]-.97)<.08),'cargo remains supported by the physical moving platform');
 const boatTrack=moving.map(s=>body(s,boatId)),deckTrack=moving.map(s=>body(s,created.deck));
 assert.ok(Math.max(...boatTrack.map(c=>c.z))-Math.min(...boatTrack.map(c=>c.z))>10,'loaded boat travels to the pier and returns');
 assert.ok(deckTrack.every((c,i)=>Math.hypot(c.x-boatTrack[i].poses[39][0],c.z-boatTrack[i].poses[39][2])<.3&&Math.abs(c.y-boatTrack[i].poses[39][1]-.97)<.12),'loose cargo travels on the boat deck under gravity and friction');
 assert.equal(await command('slopyard --integration-check'),0);
 const restored=parseLua((await download('cargo-restored.lua')).toString());await download('cargo-restored.png');
 assert.deepEqual(restored.initial.creatures.map(c=>[c.id,c.rootHeight]),final.creatures.map(c=>[c.id,c.rootHeight]),'save/reload preserves identities and spawn semantics');
 for(const before of final.creatures){const after=body(restored.initial,before.id);assert.equal(after.poses.length,before.poses.length);for(let i=0;i<before.poses.length;i++){
  assert.equal(after.poses[i].length,before.poses[i].length);
  for(let j=0;j<before.poses[i].length;j++)assert.ok(Math.abs(after.poses[i][j]-before.poses[i][j])<2e-5,`Body ${before.id}, part ${i}, pose/velocity ${j} changed on reload`);
 }}
 assert.deepEqual(restored.initial.creatures.map(c=>[c.id,c.cargo]),final.creatures.map(c=>[c.id,c.cargo]),'cargo roles survive reload');
 assert.equal(restored.final.creatures.length,11);assert.equal(restored.final.deaths,0);
 assert.ok(restored.trace.every(s=>Math.abs(body(s,liftId).y-body(s,pierId).poses[41][1]-.97)<.08),'loaded lift stays supported after restart');
 assert.equal(await page.evaluate(()=>__dolly.httpRequestCount),0);
 console.log(JSON.stringify({elevatedWorldCargo:true,bundledHeight:true,invalidPlacementsAtomic:true,loadedLiftTravel:Math.max(...loads)-Math.min(...loads),boatTravel:Math.max(...boatTrack.map(c=>c.z))-Math.min(...boatTrack.map(c=>c.z)),restoredBodies:restored.final.creatures.length,modelRequests:0}));
}catch(error){await page.screenshot({path:new URL('failure.png',output).pathname});throw error;}
finally{await browser.close();await site.close();}
