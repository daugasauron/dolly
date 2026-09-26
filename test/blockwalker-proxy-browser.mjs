import {compileCommand} from './blockwalker-data.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {zstdDecompressSync} from 'node:zlib';
import {chromium} from 'playwright-core';
import {startBrowserServer} from './browser-server.mjs';
import {relayToken,piModel} from '../scripts/codex-relay.mjs';
const output='build/blockwalker-proxy';await fs.mkdir(output,{recursive:true});
const requests=[],servers=[],token=relayToken();
async function endpoint(name){
 const server=createServer(async(req,res)=>{
  res.setHeader('access-control-allow-origin',req.headers.origin||'*');
  if(req.method==='OPTIONS'){res.writeHead(204,{'access-control-allow-methods':'POST','access-control-allow-headers':req.headers['access-control-request-headers']||'','access-control-allow-private-network':'true'});res.end();return;}
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const bytes=Buffer.concat(chunks),body=JSON.parse(req.headers['content-encoding']==='zstd'?zstdDecompressSync(bytes):bytes);
  requests.push({endpoint:name,model:body.model,effort:body.reasoning?.effort,session:req.headers['session-id'],closed:false});
  const request=requests.at(-1);res.on('close',()=>request.closed=true);
  res.writeHead(200,{'content-type':'text/event-stream'});res.flushHeaders();
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');servers.push(server);
 return JSON.stringify({providers:{'codex-local':{api:'openai-codex-responses',baseUrl:`http://127.0.0.1:${server.address().port}`,apiKey:token,models:[piModel({slug:'gpt-6-astra',context_window:128000,supported_reasoning_levels:[{effort:'xhigh'}]})]}}});
}
const first=await endpoint('first'),second=await endpoint('second');
const site=await startBrowserServer(process.cwd(),'blockwalker'),browser=await chromium.launch({channel:'chrome',headless:false,args:['--no-sandbox','--ozone-platform=x11','--enable-unsafe-webgpu','--use-angle=vulkan','--enable-features=Vulkan,VulkanFromANGLE']});
const page=await browser.newPage({acceptDownloads:true,viewport:{width:1280,height:720}}),errors=[];page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
const command=s=>page.evaluate(s=>__dolly.submit(s),s);
async function upload(path,dest){const run=command('upload '+dest);await page.waitForSelector('#file-upload[open]');await page.locator('#file-upload input').setInputFiles(path);assert.equal(await run,0);}
async function imported(content){
 await page.mouse.click(1140,160);await page.waitForSelector('#file-upload[open]');
 if(content===null)await page.locator('#file-upload button').click();
 else await page.locator('#file-upload input').setInputFiles({name:'models.json',mimeType:'application/json',buffer:Buffer.from(content)});
 await page.waitForSelector('#file-upload[open]',{state:'hidden'});await page.waitForTimeout(1800);
}
async function start(name,count){
 await page.mouse.click(1088,206);
 const until=Date.now()+45000;while(requests.filter(r=>r.endpoint===name).length<count&&Date.now()<until)await page.waitForTimeout(100);
 assert.equal(requests.filter(r=>r.endpoint===name).length,count,'Pi connects through the selected configuration');
}
async function download(name){const event=page.waitForEvent('download'),run=command('download /workspace/'+name);const target=output+'/'+name.split('/').at(-1);await(await event).saveAs(target);assert.equal(await run,0);return JSON.parse(await fs.readFile(target,'utf8'));}
try{
 await page.goto(site.origin+'/blockwalker/');await page.waitForFunction(()=>globalThis.__dolly?.gpu?.stats?.frames>20,null,{timeout:60000});await page.keyboard.press('Escape');await page.evaluate(()=>__dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/,'shell'));
 if(process.argv[2]){await upload(process.argv[2],'/tmp/proxy-source.tar');assert.equal(await command('tar -xf /tmp/proxy-source.tar -C /'),0);}
  assert.equal(await command(await compileCommand()),0);
 await upload('test/fixtures/blockwalker-proxy.mjs','/tmp/proxy-check.mjs');assert.equal(await command('cp /tmp/proxy-check.mjs /usr/src/dolly/blockwalker/check.mjs'),0);
 const run=command('blockwalker --integration-check');run.catch(()=>{});await page.waitForFunction(()=>__dolly.gpu.active);await page.keyboard.press('Tab');
 const before=await page.evaluate(()=>__dolly.httpRequestCount);
 await imported(first);assert.equal(await page.evaluate(()=>__dolly.httpRequestCount),before,'validation makes no network request');assert.equal(requests.length,0);await page.screenshot({path:output+'/first.png'});await start('first',1);
 await imported('{invalid');assert.ok(requests[0].closed,'import interrupts the in-flight connection');await start('first',2);
 await imported(null);await start('first',3);
 await imported('{"providers":{}}');await start('first',4);
 await imported(second);await page.screenshot({path:output+'/replacement.png'});await start('second',1);
 await page.keyboard.press('Escape');assert.equal(await run,0);
 const proof=await download('proxy-import-proof.json'),saved=await download('blockwalker-agent/models.json');
 assert.equal(proof.length,4);assert.deepEqual(proof.map(p=>p.config),[JSON.parse(first),JSON.parse(first),JSON.parse(first),JSON.parse(second)]);assert.ok(proof.every(p=>p.enabled===false));assert.deepEqual(saved,JSON.parse(second));
 assert.ok(requests.every(r=>r.model==='gpt-6-astra'&&r.effort==='xhigh'));assert.ok(requests[0].session);assert.equal(new Set(requests.map(r=>r.session)).size,1,'configuration replacement preserves the Pi conversation');assert.deepEqual(errors,[]);
 await fs.writeFile(output+'/requests.json',JSON.stringify(requests,null,2));console.log(JSON.stringify({imports:proof.length,cancelPreservedConfig:true,activeRequestAborted:true,requests,errors}));
}catch(error){await page.screenshot({path:output+'/failure.png'});throw error;}
finally{await browser.close();await site.close();for(const server of servers){server.closeAllConnections();server.close();}}
