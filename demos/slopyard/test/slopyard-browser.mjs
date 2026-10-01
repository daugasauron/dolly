// Slopyard needs a GPU window; run it with DISPLAY set:
//   node demos/slopyard/test/slopyard-browser.mjs [fixtures/NAME.c ...]
// Compiles the checkout's game sources inside Dolly, runs every C fixture (each
// includes world.c), then drives the starter car with a real keyboard.
import {compileCommand,parseLua,writeLua} from './slopyard-data.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright-core';
import {startBrowserServer} from '../../../test/browser-server.mjs';
import {acceptDownload} from '../../browser.mjs';
if(!process.env.DISPLAY){console.log('slopyard: skipped, it needs a GPU window on DISPLAY');process.exit(0);}
const output='build/slopyard-browser',fixtureDir='demos/slopyard/test/fixtures/';await fs.mkdir(output,{recursive:true});
const fixtures=process.argv.length>2?process.argv.slice(2):(await fs.readdir(fixtureDir)).filter(name=>name.endsWith('.c')).sort().map(name=>fixtureDir+name);
execFileSync(process.execPath,['scripts/build-source-tar.mjs',output+'/source.tar','demos/slopyard/src','/usr/src/dolly/slopyard']);
const site=await startBrowserServer(process.cwd(),'slopyard');
const browser=await chromium.launch({channel:'chrome',headless:false,args:['--no-sandbox','--ozone-platform=x11','--enable-unsafe-webgpu','--use-angle=vulkan','--enable-features=Vulkan,VulkanFromANGLE']});
const page=await browser.newPage({viewport:{width:1280,height:720},acceptDownloads:true}),errors=[];page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
const command=s=>page.evaluate(s=>__dolly.submit(s),s),shell=()=>page.evaluate(()=>__dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/,'shell'));
async function run(text){assert.equal(await command(text),0,text);}
async function upload(path,dest){const running=command('upload '+dest);await page.waitForSelector('#file-upload[open]');await page.locator('#file-upload input').setInputFiles(path);assert.equal(await running,0);}
async function download(name){const run=command('download /workspace/'+name),event=acceptDownload(page,()=>run);await(await event).saveAs(output+'/'+name);assert.equal(await run,0);return parseLua(await fs.readFile(output+'/'+name,'utf8'));}
const frames=async()=>{const n=await page.evaluate(()=>__dolly.gpu.stats.frames);await page.waitForFunction(n=>__dolly.gpu.stats.frames>n+8,n);};
async function start(){const n=await page.evaluate(()=>__dolly.gpu.stats.frames),run=command('slopyard --integration-check');run.catch(()=>{});await page.waitForFunction(n=>__dolly.gpu?.active&&__dolly.gpu.stats.frames>n+10,n);return {run};}
async function finish({run},driving=false){if(driving){await page.keyboard.press('Escape');await frames();}await page.keyboard.press('Escape');assert.equal(await run,0);await shell();}
async function hold(keys,ms){for(const k of keys)await page.keyboard.down(k);const start=Date.now();await page.waitForTimeout(ms);const end=Date.now();for(const k of keys)await page.keyboard.up(k);await frames();return {start,end};}
async function importProgram(file){await page.mouse.click(845,170);await page.waitForSelector('#file-upload[open]');await page.locator('#file-upload input').setInputFiles(file);await frames();}
async function exportProgram(name){const event=acceptDownload(page,()=>page.mouse.click(700,170));await(await event).saveAs(output+'/'+name);await frames();return fs.readFile(output+'/'+name,'utf8');}
try{
 await page.goto(site.origin+'/slopyard/');await page.waitForFunction(()=>globalThis.__dolly?.gpu?.stats?.frames>20);await page.keyboard.press('Escape');await shell();
 await upload(output+'/source.tar','/tmp/slopyard-source.tar');await run('tar -xf /tmp/slopyard-source.tar -C /');
 const game=await compileCommand();
 for(const [index,fixture] of fixtures.entries()){
  const started=Date.now(),source=`/tmp/fixture-${index}.c`;await upload(fixture,source);
  await run(game.replace('/usr/src/dolly/slopyard/main.c','-I /usr/src/dolly/slopyard '+source).replace(' /usr/src/dolly/slopyard/world.c','').replace('-o /usr/bin/slopyard','-o /tmp/fixture'));
  await run('/tmp/fixture');console.log(`${fixture}: passed in ${((Date.now()-started)/1000).toFixed(1)} s`);
 }
 await run(game);await run('rm -f /workspace/slopyard-world.lua /workspace/slopyard.character');
 await upload(fixtureDir+'slopyard-driver.mjs','/tmp/driver-check.mjs');await run('cp /tmp/driver-check.mjs /usr/src/dolly/slopyard/check.mjs');
 const driving=await start();await page.mouse.click(120,564);await frames();await page.screenshot({path:output+'/car-builder.png'});
 await page.mouse.click(120,300);await frames();await page.screenshot({path:output+'/eyes-start.png'});
 await hold(['W'],1800);const right=await hold(['W','D'],2200),left=await hold(['S','A'],1400);await page.waitForTimeout(800);
 await page.keyboard.press('E');await frames();await page.keyboard.press('Backslash');await frames();await page.screenshot({path:output+'/car-follow.png'});await page.keyboard.press('Q');await frames();
 await finish(driving,true);
 const trace=await download('driver-trace.lua'),world=await download('slopyard-world.lua'),views=trace.filter(s=>s.eyes),first=views[0],last=trace.at(-1);
 assert.ok(trace.length>30&&views.length>20);assert.equal(world.deaths,0);
 const moved=Math.max(...trace.map(s=>Math.hypot(s.sensors.x-first.sensors.x,s.sensors.z-first.sensors.z)));assert.ok(moved>3,'keyboard drives the articulated car');
 const parts=world.creatures.find(c=>c.id===first.playerId).blueprint,eye=parts.findIndex(p=>p.joint===6),magnet=parts.findIndex(p=>p.joint===5),steering=parts.findIndex(p=>p.joint===1&&p.axis===1);
 assert.ok(eye>=0&&magnet>=0&&steering>=0);
 const during=interval=>trace.filter(s=>s.wall>interval.start+300&&s.wall<interval.end-100);
 assert.ok(during(right).some(s=>s.sensors.angles[steering]<-.2),'D steers toward the Eyes camera right');assert.ok(during(left).some(s=>s.sensors.angles[steering]>.2),'A steers toward the Eyes camera left');assert.ok(Math.abs(last.sensors.angles[steering])<.12,'steering centers after release');
 // The body yaws after the wheels turn, and a loaded host simulates slower than real time: look until A steers back.
 const c=first.camera,f=[c.x-c.eyeX,c.y-c.eyeY,c.z-c.eyeZ],cameraRight=[f[1]*c.upZ-f[2]*c.upY,f[2]*c.upX-f[0]*c.upZ,f[0]*c.upY-f[1]*c.upX];
 const turning=trace.slice(trace.indexOf(during(right)[0]),trace.findIndex(s=>s.sensors.angles[steering]>.2));
 assert.ok(turning.some(({camera:c})=>cameraRight[0]*(c.x-c.eyeX)+cameraRight[1]*(c.y-c.eyeY)+cameraRight[2]*(c.z-c.eyeZ)>.1),'D turns the physical camera toward its initial right');
 for(const s of views){const {camera:c,sensors:p}=s,pos=[c.eyeX,c.eyeY,c.eyeZ],f=[c.x-c.eyeX,c.y-c.eyeY,c.z-c.eyeZ];assert.equal(c.fov,72);assert.ok(Math.abs(Math.hypot(...pos.map((v,i)=>v-p.positions[eye][i]))-.52)<.002,'camera stays at the Eyes face');assert.ok(Math.abs(f[0]*c.upX+f[1]*c.upY+f[2]*c.upZ)<.001);}
 assert.ok(trace.some(s=>!s.eyes&&s.camera.fov===42));assert.ok(trace.some(s=>s.sensors.magnets[magnet].power===1));assert.equal(last.sensors.magnets[magnet].power,0);
 const original=await fs.readFile('demos/slopyard/src/driver.lua','utf8');
 const edited=`local driver=(function()\n${original}\nend)()\nreturn function(t,s,m,r)\n  for _,key in ipairs({'W','I'}) do\n    if s.input[key] then local p=key:lower();m[p..'Start']=m[p..'Start'] or {s.x,s.z};m[p..'End']={s.x,s.z} end\n  end\n  s.input.W=s.input.I;s.pressed.W=s.pressed.I\n  return driver(t,s,m,r)\nend\n`;
 await fs.writeFile(output+'/edited.lua',edited);await fs.writeFile(output+'/invalid.lua','return function broken {');
 const editing=await start();await page.mouse.click(300,40);await frames();await importProgram(output+'/edited.lua');assert.equal(await exportProgram('edited-export.lua'),edited);
 await importProgram(output+'/invalid.lua');assert.equal(await exportProgram('after-invalid.lua'),edited);await page.mouse.click(952,170);await frames();await finish(editing);
 let saved=await download('slopyard-world.lua');assert.equal(saved.installed,edited);
 const resumed=await start();await page.mouse.click(300,40);await frames();assert.equal(await exportProgram('restored.lua'),edited);await page.mouse.click(952,170);await frames();
 await page.mouse.click(120,300);await frames();await page.waitForTimeout(700);await hold(['W'],2000);await hold(['I'],2200);
 await page.mouse.click(300,40);await frames();assert.equal(await exportProgram('active-character.lua'),edited);await page.screenshot({path:output+'/active-program.png'});await page.mouse.click(952,170);await frames();await finish(resumed,true);
 saved=await download('slopyard-world.lua');const player=saved.creatures.find(c=>c.id===saved.playerId);assert.equal(player.source,edited);const m=player.memory,w=Math.hypot(m.wEnd[0]-m.wStart[0],m.wEnd[1]-m.wStart[1]),i=Math.hypot(m.iEnd[0]-m.iStart[0],m.iEnd[1]-m.iStart[1]);assert.ok(w<.3&&i>1,'the imported binding replaces W and survives restart');
 assert.equal(await page.evaluate(()=>__dolly.httpRequestCount),0);assert.deepEqual(errors,[]);
 const proof={fixtures,moved,frames:trace.length,wDistance:w,iDistance:i,invalidImportKeptProgram:true,worldRestore:true,errors};await fs.writeFile(output+'/proof.lua',writeLua(proof));console.log(proof);
}catch(e){await page.screenshot({path:output+'/failure.png'});console.log(await page.evaluate(()=>__dolly.visibleTerminalText()).catch(()=>''));throw e;}
finally{await browser.close();await site.close();}
