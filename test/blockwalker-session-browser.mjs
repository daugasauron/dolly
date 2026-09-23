import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {startBrowserServer} from './browser-server.mjs';

const output='build/blockwalker-session';await fs.mkdir(output,{recursive:true});
const site=process.argv[2]?{origin:new URL(process.argv[2]).origin,close:async()=>{}}:await startBrowserServer(process.cwd(),'blockwalker');
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--no-sandbox','--ozone-platform=x11','--enable-unsafe-webgpu','--use-angle=vulkan','--enable-features=Vulkan,VulkanFromANGLE']});
const page=await browser.newPage({acceptDownloads:true,viewport:{width:1280,height:720}}),errors=[];
page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
const boot=()=>page.waitForFunction(()=>globalThis.__dolly?.gpu?.stats?.frames>20);
const frames=async()=>{const n=await page.evaluate(()=>__dolly.gpu.stats.frames);await page.waitForFunction(n=>__dolly.gpu.stats.frames>n+5,n);};
async function exported(name,x=860,y=40){const event=page.waitForEvent('download');await page.mouse.click(x,y);await(await event).saveAs(output+'/'+name+'.json');await frames();return JSON.parse(await fs.readFile(output+'/'+name+'.json','utf8'));}
const fingerprint=()=>page.evaluate(async()=>{
 const r=await(await import('/src/session-store.mjs')).loadStoredSession('game-proof');
 return {updatedAt:r.updatedAt,sha:[...new Uint8Array(await crypto.subtle.digest('SHA-256',r.bytes))].map(b=>b.toString(16).padStart(2,'0')).join(''),bytes:r.bytes.byteLength};
});
const save=async()=>{await page.locator('#session-save').click();await page.waitForFunction(()=>['saved','failed'].includes(document.documentElement.dataset.sessionStatus));assert.equal(await page.evaluate(()=>document.documentElement.dataset.sessionStatus),'saved');};
try{
 await page.goto(site.origin+'/blockwalker/');await boot();
 const original=await exported('original');
 await page.mouse.click(120,352);await page.mouse.click(145,464);await frames();
 const edited=await exported('edited');assert.notDeepEqual(edited.blueprint,original.blueprint,'a real workshop edit');
 await page.mouse.click(120,300);await frames();await page.keyboard.down('W');await page.waitForTimeout(500);
 await page.keyboard.press('Control+Shift+S');await page.waitForSelector('#session-dialog[open]');await page.keyboard.up('W');
 await page.keyboard.type('WASDQE');assert.equal(await page.locator('#session-name').inputValue(),'WASDQE','modal accepts typing');
 await page.keyboard.press('F11');await page.waitForFunction(()=>!!document.fullscreenElement);assert.equal(await page.locator('#session-name').evaluate(e=>e===document.activeElement),true);
 await page.keyboard.press('F11');await page.waitForFunction(()=>!document.fullscreenElement);
 await page.keyboard.press('Escape');await page.waitForSelector('#session-dialog[open]',{state:'hidden'});await frames();
 assert.equal(await page.evaluate(()=>__dolly.gpu.active),true,'Escape closes the browser dialog without exiting the game');
 await page.keyboard.press('C');await frames();
 const changedWorld=await exported('changed-world',120,626),player=changedWorld.creatures.find(c=>c.id===changedWorld.playerId);
 assert.ok(player);assert.ok(Object.values(player.controls).every(v=>!v),'opening Save releases driving keys; modal typing stays out of the game');
 const count=JSON.parse(await fs.readFile('src/blockwalker/designs.json','utf8')).length+2;
 assert.equal(changedWorld.creatures.length,count);assert.equal(changedWorld.deaths,0);
 await page.locator('#session-open').click();await page.locator('#session-name').fill('game-proof');
 assert.equal(await page.locator('#session-name').evaluate(e=>e.checkValidity()),true);
 assert.equal(new URL(await page.locator('#session-list').getAttribute('href')).pathname,'/session/');
 await save();assert.equal(new URL(page.url()).pathname,'/session/game-proof');
 const good=await fingerprint();await page.screenshot({path:output+'/saved.png'});
 await page.reload();await boot();assert.equal(await page.evaluate(()=>document.documentElement.dataset.sessionStatus),'restored');
 assert.deepEqual((await exported('restored-design')).blueprint,edited.blueprint);
 await page.mouse.click(404,40);await frames();const restored=await exported('restored-world',120,626);
 assert.deepEqual(restored.creatures.map(c=>c.id),changedWorld.creatures.map(c=>c.id));assert.equal(restored.playerId,changedWorld.playerId);
 await page.keyboard.press('C');await frames();const later=await exported('later-world',120,626);assert.equal(later.creatures.length,count+1);
 await page.evaluate(()=>{
  window.sessionOriginalPut=IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put=function(...args){if(this.name==='sessions')throw new DOMException('Storage quota exhausted','QuotaExceededError');return window.sessionOriginalPut.apply(this,args);};
 });
 await page.locator('#session-open').click();await page.locator('#session-save').click();
 await page.waitForFunction(()=>document.documentElement.dataset.sessionStatus==='failed');
 assert.equal(await page.locator('#session-open').getAttribute('data-failed'),'');
 assert.equal(await page.locator('#session-detail').isVisible(),true);assert.deepEqual(await fingerprint(),good,'failed save retains the previous bytes and timestamp');
 await page.screenshot({path:output+'/save-failed.png'});
 await page.reload();await boot();await page.mouse.click(404,40);await frames();
 assert.equal((await exported('after-failed-save',120,626)).creatures.length,count,'refresh restores the last successful save');
 await page.keyboard.press('C');await frames();await exported('second-checkpoint',120,626);
 await page.keyboard.press('Control+Shift+S');await page.waitForFunction(()=>document.documentElement.dataset.sessionStatus==='saved');
 assert.notEqual((await fingerprint()).sha,good.sha,'named keyboard shortcut replaces the checkpoint');
 await page.reload();await boot();await page.mouse.click(404,40);await frames();assert.equal((await exported('second-restored',120,626)).creatures.length,count+1);
 assert.deepEqual(errors,[]);const result={blueprintRestored:true,worldRestored:true,typingIsolated:true,heldKeysReleased:true,fullscreen:true,failedSavePreservesLastGood:true,quickSave:true,bytes:good.bytes,errors};
 await fs.writeFile(output+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(error){await page.screenshot({path:output+'/failure.png'});console.log(await page.evaluate(()=>({status:document.documentElement.dataset,boot:document.querySelector('#bootstrap-log')?.textContent})));throw error;}
finally{await browser.close();await site.close();}
