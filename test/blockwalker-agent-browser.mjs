import {parseLua,readCatalog} from './blockwalker-data.mjs';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {startBrowserServer} from './browser-server.mjs';
const output=new URL('../build/blockwalker-proof/',import.meta.url);await mkdir(output,{recursive:true});
const site=await startBrowserServer(new URL('..',import.meta.url).pathname,'blockwalker',19199);
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--no-sandbox','--ozone-platform=x11','--enable-unsafe-webgpu','--use-angle=vulkan','--enable-features=Vulkan,VulkanFromANGLE']});
const page=await browser.newPage({acceptDownloads:true,viewport:{width:1280,height:720}});
const shell=()=>page.evaluate(()=>__dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/,'shell'));
const shot=name=>page.screenshot({path:new URL(name+'.png',output).pathname});
const download=async name=>{const event=page.waitForEvent('download'),command=page.evaluate(path=>__dolly.submit('download '+path),'/workspace/'+name);const file=await event,path=new URL(name,output).pathname;await mkdir(new URL('.',new URL(name,output)),{recursive:true});await file.saveAs(path);assert.equal(await command,0);return path;};
try {
 await page.goto(site.origin+'/blockwalker/');await page.waitForFunction(()=>globalThis.__dolly?.gpu?.stats?.frames>20,null,{timeout:60000});
 await shot('embedded-builder');
 if(process.env.BLOCKWALKER_RELAY_CONFIG){
  await page.mouse.click(752,40);await page.mouse.click(1136,160);await page.waitForSelector('#file-upload[open]');
  await page.locator('#file-upload input').setInputFiles(process.env.BLOCKWALKER_RELAY_CONFIG);await page.waitForSelector('#file-upload[open]',{state:'hidden'});
  await page.mouse.click(1088,206);await page.waitForTimeout(15000);await shot('astra-start');
  await page.waitForTimeout(30000);await shot('astra-progress');
  await page.mouse.click(1200,206);await page.keyboard.press('Escape');await page.keyboard.press('Escape');await shell();
  const events=(await readFile(await download('blockwalker-agent/events.lual'),'utf8')).trim().split('\n').map(JSON.parse);
  assert.ok(events.some(e=>e.event==='assistant'&&e.message.model==='gpt-6-astra'&&e.message.usage.totalTokens>0));
  assert.ok(events.some(e=>e.event==='tool_end'&&e.tool==='keyboard_trial'&&e.images.length===3));
  assert.ok(events.some(e=>e.event==='tool_end'&&e.tool==='release_creature'));
  console.log(JSON.stringify({astra:true,realProxy:true,threeTimedFrames:true,learnedProgramReleased:true}));
 }else{
  const examples=await readCatalog(),samples=[];
  await page.mouse.click(404,40);await page.mouse.click(170,204);
  const samplingDeadline=Date.now()+120000;
  for(let i=0;!samples.length||samples.at(-1).seconds<35;i++){
   assert.ok(Date.now()<samplingDeadline,'the populated simulation reaches 35 seconds');
   await page.waitForTimeout(1000);const event=page.waitForEvent('download');await page.mouse.click(120,630);
   const file=await event,path=new URL('fresh-world-'+i+'.lua',output).pathname;await file.saveAs(path);samples.push(parseLua(await readFile(path,'utf8')));
  }
  await shot('fresh-harbor');const fresh=samples.at(-1);
  assert.equal(fresh.creatures.length,examples.length);assert.equal(fresh.deaths,0);
  const cargoDesigns=new Set(examples.filter(d=>d.name==='Cargo').map(d=>JSON.stringify([d.blueprint,d.source,d.hz,d.anchored]))).size;
  assert.equal(fresh.creatures.filter(c=>c.name==='Cargo').length,examples.filter(d=>d.name==='Cargo').length);assert.equal(fresh.designs.filter(d=>d.name==='Cargo').length,cargoDesigns,'cargo placements share reusable designs while preserving their materials');
  assert.ok(fresh.creatures.filter(c=>c.distance>1).length>=5,'bundled controllers move several creations without Pi');
  assert.ok(fresh.creatures.some(c=>!c.anchored&&c.y>4&&c.up>.95),'bundled feedback flyer takes off');
  assert.ok(fresh.creatures.some(c=>!c.anchored&&Math.abs(c.startX)>100&&c.y>-2&&c.y<0&&c.up>.8&&c.distance>1),'bundled boat floats and travels');
  const carriers=fresh.creatures.filter(c=>c.blueprint.some(p=>p.joint===5)),held=new Set(),cargoLow=new Map(fresh.creatures.filter(c=>c.name==='Cargo').map(c=>[c.id,Math.min(c.pickup[1],...samples.map(w=>w.creatures.find(b=>b.id===c.id).y))]));assert.equal(carriers.length,examples.filter(d=>d.blueprint.some(p=>p.joint===5)).length);
  for(const carrier of carriers){
   assert.ok(samples.some(w=>w.creatures.find(c=>c.id===carrier.id).magnets.some(m=>{const cargo=m?.attached&&w.creatures.find(c=>c.id===m.creature);if(cargo&&(cargo.y>cargoLow.get(cargo.id)+.7||cargo.distance>2)){held.add(cargo.id);return true;}return false;})),carrier.name+' physically carries its crate');
  }
  assert.equal(held.size,carriers.length,'the machines handle distinct world bodies');
  const courier=carriers.find(c=>c.blueprint.some(p=>p.joint===3)),crate=fresh.creatures.find(c=>c.name==='Cargo'&&c.startX===courier.startX&&c.startZ===courier.startZ);
  assert.ok(samples.some(w=>{const bird=w.creatures.find(c=>c.id===courier.id),box=w.creatures.find(c=>c.id===crate.id);return bird.magnets.some(m=>m?.attached&&m.creature===crate.id)&&box.y>6&&box.distance>2;}),'the flying courier carries its own crate above the island');
  assert.ok(samples.some(w=>{const bird=w.creatures.find(c=>c.id===courier.id),box=w.creatures.find(c=>c.id===crate.id);return bird.magnets.some(m=>m&&!m.attached&&m.power===0)&&box.delivered&&w.deliveries.some(d=>d.cargoId===box.id&&d.carrierId===bird.id);}),'the courier releases its cargo at a depot and earns delivery credit');
  const beacon=fresh.creatures.find(c=>c.name.startsWith('Westwatch')),head=beacon.blueprint.findIndex(p=>p.joint===1),bearings=[];
  for(const w of samples){
   const c=w.creatures.find(c=>c.id===beacon.id),memory=parseLua(c.memory);if(c.seconds<6||c.seconds-memory.acquired<3)continue;
   const target=w.creatures.find(p=>p.id===memory.target);assert.ok(target,'the beacon observes a real moving character');
   const h=c.poses[head],q=h.slice(3,7),yaw=Math.atan2(2*(q[0]*q[2]+q[3]*q[1]),1-2*(q[0]*q[0]+q[1]*q[1])),bearing=Math.atan2(target.x-h[0],target.z-h[2]);
   assert.ok(Math.abs(Math.atan2(Math.sin(yaw-bearing),Math.cos(yaw-bearing)))<.1,'the physical beacon head follows its current target bearing');bearings.push(yaw);
  }
  assert.equal(beacon.distance,0,'the island beacon base remains anchored');assert.ok(bearings.length>=5&&Math.max(...bearings)-Math.min(...bearings)>.08,'the head follows a moving character across several observations');
  const lift=fresh.creatures.find(c=>c.name.startsWith('Tidelock')),stage=lift.blueprint.findLastIndex(p=>p.joint===2),heights=samples.map(w=>w.creatures.find(c=>c.id===lift.id).poses[stage][1]);
  assert.equal(lift.distance,0);assert.ok(Math.max(...heights)-Math.min(...heights)>5,'the two-stage pier lift travels between the sea and island levels');
  const tender=samples.map(w=>w.creatures.find(c=>c.startX===160&&c.startZ===-18));assert.ok(Math.max(...tender.map(c=>c.z))-Math.min(...tender.map(c=>c.z))>10&&tender.every(c=>Math.abs(c.x-160)<.5&&c.up>.95&&c.y>-2),'the island tender approaches and returns on its narrow lane beside the pier');
  assert.ok(samples.some(w=>w.creatures.some(c=>c.parts>=40&&!c.anchored&&c.blueprint.every(p=>p.joint!==3&&p.joint!==4)&&c.distance>2&&c.up>.95)),'the larger legged machine advances without wheels or jets');
  assert.ok(fresh.creatures.some(c=>c.parts>=30&&c.startX>100&&!c.anchored&&c.y>-2&&c.y<0&&c.distance>2&&c.up>.9),'the larger boat floats and moves');
  assert.equal(await page.evaluate(()=>__dolly.httpRequestCount),0,'the programmed population runs without network or model requests');
  await page.keyboard.press('Escape');await page.keyboard.press('Escape');await shell();
  const freshRestart=page.evaluate(()=>__dolly.submit('blockwalker'));await page.waitForFunction(()=>__dolly.gpu?.active,null,{timeout:30000});await page.waitForTimeout(500);await page.keyboard.press('Escape');assert.equal(await freshRestart,0);
  const reopened=parseLua(await readFile(await download('blockwalker-world.lua'),'utf8'));
  assert.deepEqual(reopened.creatures.map(c=>[c.id,c.name]),fresh.creatures.map(c=>[c.id,c.name]),'reopening retains all world identities without duplicating initial placements');
  assert.equal(reopened.designs.filter(d=>d.name==='Cargo').length,cargoDesigns);
  assert.equal(await page.evaluate(()=>__dolly.submit('echo \'{"version":1,"creatures":[]}\' > /workspace/blockwalker-world.lua')),0);
  assert.equal(await page.evaluate(()=>__dolly.submit('blockwalker --integration-check')),0);
  const result=parseLua(await readFile(await download('blockwalker-integration.lua'),'utf8'));
  assert.equal(result.embedded,true);assert.equal(result.steps,60);assert.equal(result.population.creatures.length,10);assert.equal(result.population.deaths,0);
  await download('blockwalker-magnet.png');await download('blockwalker-magnet.lua');
  await download('blockwalker-feedback.png');await download('blockwalker-feedback.lua');
  await download('blockwalker-observation.png');await download('blockwalker-actuators.png');await download('blockwalker-water.png');await download('blockwalker-world.png');await download('blockwalker-world.lua');
  const upload=page.evaluate(()=>__dolly.submit('upload /tmp/blockwalker-reopen.mjs'));await page.waitForSelector('#file-upload[open]');await page.locator('#file-upload input').setInputFiles(new URL('fixtures/blockwalker-reopen.mjs',import.meta.url).pathname);assert.equal(await upload,0);
  assert.equal(await page.evaluate(()=>__dolly.submit('cp /usr/src/dolly/blockwalker/check.mjs /tmp/blockwalker-check.mjs && cp /tmp/blockwalker-reopen.mjs /usr/src/dolly/blockwalker/check.mjs')),0);
  assert.equal(await page.evaluate(()=>__dolly.submit('blockwalker --integration-check')),0,'restart preserves every pose, velocity, program, memory and magnet load before physics resumes');
  assert.equal(await page.evaluate(()=>__dolly.submit('cp /tmp/blockwalker-check.mjs /usr/src/dolly/blockwalker/check.mjs')),0);
  const restarted=page.evaluate(()=>__dolly.submit('blockwalker'));await page.waitForFunction(()=>__dolly.gpu?.active,null,{timeout:30000});
  await page.mouse.click(404,40);await page.waitForTimeout(2000);await shot('restored-world');await page.keyboard.press('Escape');await page.keyboard.press('Escape');assert.equal(await restarted,0);
  const restored=parseLua(await readFile(await download('blockwalker-world.lua'),'utf8'));assert.equal(restored.creatures.length,10);assert.ok(restored.creatures.every(c=>c.seconds>10));
  assert.equal(restored.creatures.find(c=>c.name==='Bad loop').controllerError,result.population.creatures.find(c=>c.name==='Bad loop').controllerError,'stopped controller error persists while its body remains in the world');
  assert.equal(restored.designs.filter(d=>d.name==='Spinner').length,1);assert.ok(restored.designs.some(d=>d.name==='Toppler'&&d.blueprint.length===4&&d.source==='function(){return "A"}'),'fallen design and controller survive game restart');
  assert.ok(restored.designs.some(d=>d.name==='Unreleased experiment'&&d.blueprint.length===5&&d.source==='function(t,s,m){m.ticks=(m.ticks||0)+1;return "Q"}')&&!restored.creatures.some(c=>c.name==='Unreleased experiment'),'unreleased blueprint and controller survive game restart');
  const crane=restored.creatures.find(c=>c.name==='Cargo hoist'),cargo=restored.creatures.find(c=>c.id===crane.magnets[5].creature);
  assert.ok(crane.magnets[5].attached&&crane.magnets[5].power===1&&cargo?.y>1.7,'restored latched magnet keeps holding the saved body without pressing On again');
  const boat=restored.creatures.find(c=>c.name==='Harbor boat'),bridge=restored.creatures.find(c=>c.name==='Harbor bridge');assert.ok(boat&&boat.y>-2&&boat.up>.8&&bridge&&bridge.x===96);
  const flyer=restored.creatures.find(c=>c.hz===60);assert.ok(flyer&&Math.abs(flyer.y-4.5)<.3&&flyer.up>.995);
  console.log(JSON.stringify({embedded:true,timedCapture:true,controllerTimeout:true,feedbackHover:true,waterBuoyancy:true,anchoredBridge:true,magnetPickupLiftRelease:true,magnetRestored:true,overheadPassage:true,survivors:10,worldRestored:true,pngBytes:result.pngBytes}));
 }
}catch(error){await shot('agent-failure');if(!await page.evaluate(()=>__dolly.gpu?.active))console.error(await page.evaluate(()=>__dolly.visibleTerminalText()));throw error;}
finally{await browser.close();await site.close();}
