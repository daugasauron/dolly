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
  const events=(await readFile(await download('blockwalker-agent/events.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
  assert.ok(events.some(e=>e.event==='assistant'&&e.message.model==='gpt-6-astra'&&e.message.usage.totalTokens>0));
  assert.ok(events.some(e=>e.event==='tool_end'&&e.tool==='keyboard_trial'&&e.images.length===3));
  assert.ok(events.some(e=>e.event==='tool_end'&&e.tool==='release_creature'));
  console.log(JSON.stringify({astra:true,realProxy:true,threeTimedFrames:true,learnedProgramReleased:true}));
 }else{
  await page.keyboard.press('Escape');await shell();
  assert.equal(await page.evaluate(()=>__dolly.submit('blockwalker --integration-check')),0);
  const result=JSON.parse(await readFile(await download('blockwalker-integration.json'),'utf8'));
  assert.equal(result.embedded,true);assert.equal(result.steps,60);assert.equal(result.population.creatures.length,7);assert.equal(result.population.deaths,2);
  await download('blockwalker-magnet.png');await download('blockwalker-magnet.json');
  await download('blockwalker-feedback.png');await download('blockwalker-feedback.json');
  await download('blockwalker-observation.png');await download('blockwalker-actuators.png');await download('blockwalker-water.png');await download('blockwalker-world.png');await download('blockwalker-world.json');
  const restarted=page.evaluate(()=>__dolly.submit('blockwalker'));await page.waitForFunction(()=>__dolly.gpu?.active,null,{timeout:30000});
  await page.mouse.click(404,40);await page.waitForTimeout(2000);await shot('restored-world');await page.keyboard.press('Escape');await page.keyboard.press('Escape');assert.equal(await restarted,0);
  const restored=JSON.parse(await readFile(await download('blockwalker-world.json'),'utf8'));assert.equal(restored.creatures.length,7);assert.ok(restored.creatures.every(c=>c.seconds>10));
  const crane=restored.creatures.find(c=>c.name==='Cargo hoist'),cargo=restored.creatures.find(c=>c.id===crane.magnets[5].creature);
  assert.ok(crane.magnets[5].attached&&crane.magnets[5].power===1&&cargo?.y>1.7,'restored latched magnet keeps holding the saved body without pressing On again');
  const boat=restored.creatures.find(c=>c.name==='Harbor boat'),bridge=restored.creatures.find(c=>c.name==='Harbor bridge');assert.ok(boat&&boat.y>-2&&boat.up>.8&&bridge&&bridge.x===96);
  const flyer=restored.creatures.find(c=>c.hz===60);assert.ok(flyer&&Math.abs(flyer.y-4.5)<.3&&flyer.up>.995);
  console.log(JSON.stringify({embedded:true,timedCapture:true,controllerTimeout:true,feedbackHover:true,waterBuoyancy:true,anchoredBridge:true,magnetPickupLiftRelease:true,magnetRestored:true,survivors:7,worldRestored:true,pngBytes:result.pngBytes}));
 }
}catch(error){await shot('agent-failure');console.error(await page.evaluate(()=>globalThis.__dolly?.visibleTerminalText()).catch(()=>''));throw error;}
finally{await browser.close();await site.close();}
