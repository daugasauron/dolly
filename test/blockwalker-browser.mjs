import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {startBrowserServer} from './browser-server.mjs';

const output=new URL('../build/blockwalker-proof/',import.meta.url);
await mkdir(output,{recursive:true});
const site=await startBrowserServer(new URL('..',import.meta.url).pathname,'blockwalker');
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--no-sandbox','--ozone-platform=x11','--enable-unsafe-webgpu','--use-angle=vulkan','--enable-features=Vulkan,VulkanFromANGLE']});
const page=await browser.newPage({acceptDownloads:true,viewport:{width:1280,height:720}}),errors=[];
page.on('pageerror',e=>errors.push(String(e)));
const shot=name=>page.screenshot({path:new URL(name+'.png',output).pathname});
const frames=async(n=8)=>{const previous=await page.evaluate(()=>__dolly.gpu.stats.frames);await page.waitForFunction(({previous,n})=>__dolly.gpu.stats.frames>previous+n,{previous,n},{timeout:30000});};
const exportBlueprint=async name=>{
 const download=page.waitForEvent('download');await page.mouse.click(860,40);const file=await download;
 const path=new URL(name+'.character',output).pathname;await file.saveAs(path);await frames();
 const source=await readFile(path,'utf8'),rows=source.trim().split('\n');
 const count=Number(rows[1].split(/\s+/)[0]),blocks=rows.slice(2).map(row=>{const [x,y,z,parent,joint,color,axis,negative,positive,speed,limit,travel,force,direction,material,finish]=row.split(/\s+/).map(Number);return {x,y,z,parent,joint,color,axis,negative,positive,speed,limit,material,finish};});
 assert.equal(blocks.length,count);return {path,source,count,anchored:Number(rows[1].split(/\s+/)[1]??0),blocks};
};
const importBlueprint=async path=>{
 await page.mouse.click(974,40);await page.waitForSelector('#file-upload[open]');
 await page.locator('#file-upload input').setInputFiles(path);await page.waitForSelector('#file-upload[open]',{state:'hidden'});await frames();
};
try {
 await page.goto(site.origin+'/blockwalker/');
 await page.waitForFunction(()=>globalThis.__dolly?.gpu?.stats?.frames>30,null,{timeout:60000});
 await page.keyboard.press('Escape');await page.evaluate(()=>__dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/,'shell'));
 const upload=page.evaluate(()=>__dolly.submit('upload /tmp/blockwalker-camera.mjs'));
 await page.waitForSelector('#file-upload[open]');await page.locator('#file-upload input').setInputFiles(new URL('./fixtures/blockwalker-camera.mjs',import.meta.url).pathname);assert.equal(await upload,0);
 assert.equal(await page.evaluate(()=>__dolly.submit('cp /tmp/blockwalker-camera.mjs /usr/src/dolly/blockwalker/check.mjs')),0);
 const editor=page.evaluate(()=>__dolly.submit('blockwalker --integration-check'));
 await page.waitForFunction(()=>__dolly.gpu?.active&&__dolly.gpu.stats.frames>20,null,{timeout:30000});
 await shot('builder');let blueprint=await exportBlueprint('starter');
 assert.equal(blueprint.count,5);assert.equal(blueprint.blocks.filter(b=>b.joint).length,4);
 await page.mouse.click(1140,346);await page.mouse.click(1160,588);await page.mouse.click(120,352);await page.mouse.click(145,464);await frames();
 const styled=await exportBlueprint('anchored-hull');assert.equal(styled.anchored,1);assert.equal(styled.blocks[0].material,1);assert.equal(styled.blocks[0].finish,2);
 await shot('materials');await importBlueprint(styled.path);assert.equal((await exportBlueprint('materials-restored')).source,styled.source);await importBlueprint(blueprint.path);
 let largeSource='BLOCKWALKER 1\n160\n';
 for(let z=0;z<4;z++)for(let y=0;y<4;y++)for(let x=0;x<10;x++){
  const i=z*40+y*10+x,parent=x?i-1:y?i-10:z?i-40:-1;
  largeSource+=`${x-5} ${y} ${z-2} ${parent} 0 ${(x+y+z)%6} 2 0 0 2.5 75\n`;
 }
 const largePath=new URL('160-parts.character',output).pathname;await writeFile(largePath,largeSource);await importBlueprint(largePath);
 const large=await exportBlueprint('160-parts-reloaded');assert.equal(large.count,160);await shot('160-parts');
 await page.mouse.click(172,630);await frames();assert.equal((await exportBlueprint('160-cleared')).count,0);
 await page.mouse.click(70,630);await frames();assert.equal((await exportBlueprint('160-restored')).source,large.source);
 await page.mouse.click(110,597);await frames();const quadruped=await exportBlueprint('quadruped');assert.equal(quadruped.count,15);assert.equal(quadruped.blocks.filter(b=>b.joint===1).length,8);
 await importBlueprint(blueprint.path);
 const lowPath=new URL('low-joint.character',output).pathname;
 const lowSource='BLOCKWALKER 1\n3\n0 1 0 -1 0 0 2 0 0 2.5 75\n0 0 0 0 1 1 2 81 65 2.5 75\n1 1 0 0 1 2 2 87 83 2.5 75\n';
 await writeFile(lowPath,lowSource);await importBlueprint(lowPath);
 for(let i=0;i<7;i++)await page.mouse.click(558,109);
 await page.mouse.click(90,156);await page.mouse.move(678,354);await frames();await shot('under-floor-preview');
 await page.mouse.click(678,354);await frames();await shot('under-floor-attached');
 const underside=await exportBlueprint('underside');assert.equal(underside.count,4);
 const attached=underside.blocks[3];assert.deepEqual([attached.x,attached.y,attached.z,attached.parent,attached.joint],[1,0,0,2,0]);
 await page.mouse.click(70,630);assert.equal((await exportBlueprint('underside-undo')).count,3);
 await importBlueprint(underside.path);assert.equal((await exportBlueprint('underside-reloaded')).source,underside.source);
 await importBlueprint(blueprint.path);
 await page.mouse.click(119,352);await page.mouse.move(100,80);await frames();
 const view=()=>page.screenshot({clip:{x:242,y:80,width:756,height:594}}),initialView=await view();
 for(const action of [
  ()=>page.mouse.click(294,109),()=>page.mouse.click(470,109),
  async()=>{await page.mouse.move(850,430);await page.mouse.down({button:'right'});await page.mouse.move(650,500,{steps:12});await page.mouse.up({button:'right'});},
  async()=>{await page.keyboard.down('Alt');await page.mouse.move(850,430);await page.mouse.down();await page.mouse.move(650,350,{steps:12});await page.mouse.up();await page.keyboard.up('Alt');},
  async()=>{await page.mouse.move(850,430);await page.mouse.wheel(0,240);}
 ]){
  await action();await page.mouse.move(100,80);await frames();assert.ok(!(await view()).equals(initialView),'Camera action changes the view');
  await shot('camera');await page.mouse.click(646,109);await page.mouse.move(100,80);await frames();assert.ok((await view()).equals(initialView),'Camera reset restores the view');
 }
 assert.equal((await exportBlueprint('after-camera')).source,blueprint.source);
 await page.mouse.click(404,40);await page.mouse.move(100,80);await frames();
 await page.keyboard.down('W');await page.keyboard.down('E');await page.waitForTimeout(500);await page.keyboard.up('W');await page.keyboard.up('E');await frames();
 await shot('world-camera');
 await page.mouse.click(404,40);await frames();await page.mouse.click(404,40);await frames();
 await page.keyboard.press('Tab');await page.mouse.click(1120,627);await page.keyboard.type('WASDQE');
 await page.keyboard.down('W');await page.keyboard.down('E');await page.waitForTimeout(500);await page.keyboard.up('W');await page.keyboard.up('E');await frames();
 await page.keyboard.press('Escape');await page.keyboard.press('Tab');await page.keyboard.press('H');await frames();
 await page.keyboard.press('Escape');await frames();assert.equal((await exportBlueprint('after-world-camera')).source,blueprint.source);
 await page.mouse.click(404,40);await frames();
 for(const [x,y] of [[170,204],[68,242],[170,242],[68,280],[170,280]]){await page.mouse.click(x,y);await frames();}
 await shot('world-overview');await page.mouse.click(198,580);await page.mouse.click(100,536);await frames();await shot('world-last-creature');
 await page.mouse.move(100,390);await page.mouse.wheel(0,-100);await frames();await page.mouse.click(100,355);await frames();
 await page.keyboard.press('Escape');await frames();
 await page.mouse.click(119,352);await page.mouse.click(706,352);await frames();await shot('joint');
 await page.mouse.click(1085,354);await page.keyboard.press('Q');await page.keyboard.press('Z');await frames();
 blueprint=await exportBlueprint('remapped');assert.equal(blueprint.blocks[3].negative,'Z'.charCodeAt(0));
 await page.mouse.click(1069,263);await frames();
 blueprint=await exportBlueprint('axis');assert.equal(blueprint.blocks[3].axis,0);
 await page.mouse.click(1220,263);await page.mouse.click(1233,452);await page.mouse.click(1054,548);await frames();
 blueprint=await exportBlueprint('configured');assert.equal(blueprint.blocks[3].axis,2);assert.equal(blueprint.blocks[3].speed,3);assert.equal(blueprint.blocks[3].limit,60);
 await page.mouse.click(120,188);await page.mouse.move(710,311);await frames();await shot('placement-preview');
 await page.mouse.click(710,311);await frames();
 let added=await exportBlueprint('added');assert.equal(added.count,6);assert.equal(added.blocks[5].joint,1);assert.equal(added.blocks[5].parent,3);assert.equal(added.blocks[5].y,4);
 await page.mouse.click(70,630);await frames();assert.equal((await exportBlueprint('undo')).source,blueprint.source);
 await page.mouse.click(119,352);await page.mouse.click(706,352);await page.mouse.click(1140,630);await frames();
 assert.equal((await exportBlueprint('removed-branch')).count,3);
 await page.mouse.click(70,630);await frames();assert.equal((await exportBlueprint('restored-branch')).source,blueprint.source);
 await page.mouse.click(172,630);await frames();assert.equal((await exportBlueprint('empty')).count,0);
 await importBlueprint(blueprint.path);
 assert.equal((await exportBlueprint('imported')).source,blueprint.source);await shot('imported');
 await page.mouse.click(1156,40);await frames(90);await shot('test-ground');
 const still=await page.screenshot({clip:{x:242,y:80,width:756,height:594}});
 const keyCap=()=>page.screenshot({clip:{x:1080,y:294,width:6,height:6}}),releasedKey=await keyCap();
 await page.keyboard.down('Z');await page.waitForTimeout(900);assert.ok(!(await keyCap()).equals(releasedKey),'Held key is highlighted');await shot('key-held');await page.keyboard.up('Z');
 await frames();assert.ok((await keyCap()).equals(releasedKey),'Released key clears the highlight');
 await page.keyboard.down('K');await page.waitForTimeout(500);await page.keyboard.up('K');
 await page.keyboard.down('A');await page.waitForTimeout(900);await page.keyboard.up('A');await frames();
 assert.ok(!(await page.screenshot({clip:{x:242,y:80,width:756,height:594}})).equals(still),'Joint input moves the character');await shot('moving');
 await page.keyboard.press('Escape');await frames();assert.equal((await exportBlueprint('after-test')).source,blueprint.source);await shot('back-in-builder');
 const gpu=await page.evaluate(()=>__dolly.gpu);assert.equal(gpu.stats.readbackBytes,0);
 await page.keyboard.press('Escape');
 await page.evaluate(()=>__dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/,'shell'));
 assert.equal(await editor,0);
 const cameraDownload=page.waitForEvent('download'),cameraCommand=page.evaluate(()=>__dolly.submit('download /workspace/blockwalker-camera.json'));
 const cameraFile=await cameraDownload,cameraPath=new URL('camera.json',output).pathname;await cameraFile.saveAs(cameraPath);assert.equal(await cameraCommand,0);
 const trace=JSON.parse(await readFile(cameraPath,'utf8')),visits=[];
 for(let i=0;i<trace.length;i++)if(trace[i].mode==='world'){
  if(i===0||trace[i-1].mode!=='world')visits.push([]);
  visits.at(-1).push(trace[i].camera);
 }
 assert.equal(visits.length,3);const [travel,returned,navigation]=visits;
 assert.ok(travel.at(-1).y>travel[0].y+1&&Math.hypot(travel.at(-1).x-travel[0].x,travel.at(-1).z-travel[0].z)>1,'World keyboard input moves the camera horizontally and vertically');
 assert.deepEqual(returned[0],travel.at(-1),'Switching views preserves the world camera');
 assert.equal(returned.length,2,'Prompt typing leaves the camera unchanged until Home');
 assert.deepEqual(returned[1],travel[0],'Home restores the world camera');
 assert.deepEqual(navigation.slice(1,6).map(({x,y,z,distance})=>[x,y,z,distance]),[[116,-1,20,50],[170,4,30,100],[-174,2,-35,110],[15,6,-175,150],[0,0,0,512]],'Place buttons visit the harbor, islands and overview');
 assert.equal(navigation[6].x,68.5,'Paging reaches the last of twelve creatures');assert.ok(navigation[6].distance>19,'A large creature fits its physical bounds');
 assert.equal(navigation[7].x,33,'Scrolling the population list reaches earlier creatures');
 const download=page.waitForEvent('download'),command=page.evaluate(()=>__dolly.submit('download /workspace/blockwalker-last-run.json'));
 const file=await download,path=new URL('physics.json',output).pathname;await file.saveAs(path);assert.equal(await command,0);
 const physics=JSON.parse(await readFile(path,'utf8'));
 assert.equal(physics.blocks,5);assert.ok(physics.physicsSteps>120);
 assert.ok(physics.joints[2].motorSteps>20);assert.equal(physics.joints[2].negative,'Z');assert.ok(physics.joints[2].peakAngle>.15);
 assert.ok(physics.joints[0].motorSteps>10);
 assert.ok(physics.joints[2].drivenRadians>.5);assert.ok(physics.joints[0].drivenRadians>.3);
 assert.ok(physics.maxSeparation<.025);
 assert.equal(await page.evaluate(()=>__dolly.submit('blockwalker --check')),0);
 await writeFile(new URL('physics-check.log',output),await page.evaluate(()=>__dolly.visibleTerminalText()));
 const restarted=page.evaluate(()=>__dolly.submit('blockwalker'));
 await page.waitForFunction(()=>__dolly.gpu?.active&&__dolly.gpu.stats.frames>20,null,{timeout:30000});
 assert.equal((await exportBlueprint('reopened')).source,blueprint.source);
 await page.keyboard.press('Escape');assert.equal(await restarted,0);
 assert.deepEqual(errors,[]);
 const result={browser:browser.version(),adapter:gpu.adapter,boxes:5,joints:4,undersideAttachment:true,spherePlacement:true,facePlacement:true,branchDeletionUndo:true,remap:true,axisSpeedLimit:true,materialsAndAnchor:true,exportImport:true,originalBuildPreserved:true,cameraButtonsDragZoom:true,worldCameraTravel:true,worldPlacesAndPopulation:true,promptDoesNotMoveCamera:true,keyFeedback:true,reopen:true,readbackBytes:0,physics,errors};
 await writeFile(new URL('results.json',output),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}catch(error){await shot('failure');console.error(await page.evaluate(()=>globalThis.__dolly?.visibleTerminalText()).catch(()=>''));throw error;}
finally{await browser.close();await site.close();}
