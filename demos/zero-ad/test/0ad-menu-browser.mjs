import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {chromium,firefox} from 'playwright-core';
import {startBrowserServer} from '../../../test/browser-server.mjs';
import {acceptDownload} from '../../browser.mjs';
import {hasGameHud} from './fixtures/0ad-hud.mjs';

const root=new URL('../../../',import.meta.url).pathname;
const browserName=process.argv[2]??'firefox',url=process.argv[3];
assert.ok(['chromium','firefox'].includes(browserName),'usage: node demos/zero-ad/test/0ad-menu-browser.mjs [chromium|firefox] [page URL]');
const output=root+'/.cache/0ad/browser';
await mkdir(output,{recursive:true});
const provider=(await readFile(root+'/src/gpu-worker.mjs','utf8')).replace(
  'insert(scope,id,"sampler",device.createSampler({',
  'stats.maxAnisotropy=Math.max(stats.maxAnisotropy??1,maxAnisotropy);insert(scope,id,"sampler",device.createSampler({');
const server=url?null:await startBrowserServer(root,'zero-ad',{sourceOverrides:new Map([['/src/gpu-worker.mjs',provider]])});
let browser,page,deadline;
try {
  browser=browserName==='firefox'
    ? await firefox.launch({headless:false,firefoxUserPrefs:{'dom.webgpu.enabled':true}})
    : await chromium.launch({channel:'chrome',headless:false,args:['--no-sandbox','--mute-audio',
      '--ozone-platform=x11','--enable-unsafe-webgpu','--use-angle=vulkan','--enable-features=Vulkan,VulkanFromANGLE']});
  deadline=setTimeout(()=>void browser.close(),240000);
  page=await browser.newPage({viewport:{width:1024,height:768}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  // Keep the audio graph active without playing test audio through speakers.
  await page.addInitScript(()=>{
    const connect=AudioNode.prototype.connect, muted=new WeakMap();
    AudioNode.prototype.connect=function(target,...args){
      if(target===this.context.destination){
        let gain=muted.get(this.context);
        if(!gain){gain=this.context.createGain();gain.gain.value=0;connect.call(gain,target);muted.set(this.context,gain);}
        return connect.call(this,gain,...args);}
      return connect.call(this,target,...args);
    };
  });
  const start=performance.now();
  await page.goto(url??server.origin+'/zero-ad/');
  await page.waitForFunction(()=>['ready','failed'].includes(document.documentElement.dataset.dollyStatus),null,{timeout:90000});
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.dollyStatus),'ready',await page.locator('#bootstrap-log').textContent());
  await page.waitForFunction(()=>__dolly.gpu.stats?.frames>=90,null,{timeout:60000});
  const menuMilliseconds=Math.round(performance.now()-start);
  assert.equal(await page.evaluate(()=>__dolly.gpu.isFallbackAdapter),false);
  const click=async(x,y)=>{
    await page.mouse.click(x,y);
    await page.waitForFunction(()=>__dolly.transport.inputIdle());
    const target=await page.evaluate(()=>__dolly.gpu.stats.frames+3);
    await page.waitForFunction(target=>__dolly.gpu.stats.frames>=target,target);
    await page.waitForTimeout(200);
  };
  const screenshot=name=>page.screenshot({path:`${output}/menu-${browserName}-${name}.png`});
  await screenshot('main');
  await click(363,578); // Upstream first-run welcome.
  await click(180,286);await click(410,285); // Settings, Options.
  await click(200,123); // Advanced graphics.
  await click(800,184);await page.keyboard.press('End');await page.keyboard.press('Enter');
  await click(800,212);await page.keyboard.press('End');await page.keyboard.press('Enter');
  await click(598,728);await screenshot('quality-options'); // Save high textures and 16x filtering.
  await click(770,728);
  const setup=async()=>{await click(180,222);await click(412,221);};
  const waitForGame=async(name,started)=>{
    while(!await hasGameHud(page)) {
      assert.ok(performance.now()-started<90000,`${name} never reached its game HUD`);
      assert.equal(await page.evaluate(()=>__dolly.gpu.error),undefined);
      await page.waitForTimeout(200);
    }
    await page.waitForTimeout(1000);
    assert.ok(await hasGameHud(page,await screenshot(name)),`${name} must remain visible after loading`);
    console.log(`${name}: load ${Math.round(performance.now()-started)} ms`);
  };
  const launch=async name=>{
    await screenshot(name+'-setup');
    const started=performance.now();await click(929,730);await waitForGame(name,started);
  };
  await setup();
  await click(430,92);await click(408,178); // Britons, outside the original Athens-only bundle.
  await launch('acropolis');
  await click(940,18);await page.waitForTimeout(400);await click(940,112);
  await screenshot('save-dialog');
  await click(367,625);await page.keyboard.type('Dolly menu save');
  await click(560,663);await page.waitForTimeout(500);await screenshot('saved');
  await page.keyboard.press('Control+F10');
  await page.waitForFunction(()=>!__dolly.graphicsActive);
  await page.evaluate(()=>__dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/,'saved-game shell'));
  assert.equal(await page.evaluate(()=>__dolly.submit('cp /opt/0ad/logs/interestinglog.html /tmp/save-first-warnings.html')),0);
  const restartFrames=await page.evaluate(()=>__dolly.gpu.stats.frames);
  await page.evaluate(()=>{globalThis.saveRestart=null;void __dolly.submit('zero-ad').then(status=>saveRestart=status);});
  await page.waitForFunction(target=>(__dolly.graphicsActive&&__dolly.gpu.stats?.frames>=target)||saveRestart!==null,restartFrames+90,{timeout:60000});
  assert.equal(await page.evaluate(()=>saveRestart),null);
  await screenshot('restart');await click(363,578);
  await click(180,222);await click(410,253);await screenshot('load-dialog');
  const loadStarted=performance.now();await click(560,663);await waitForGame('loaded-save',loadStarted);
  await click(940,18);
  await page.waitForTimeout(400); // The upstream menu slides about 350 pixels at 1.2 px/ms.
  await screenshot('game-menu');
  await click(940,338);await screenshot('exit-confirm');
  await click(707,453);await screenshot('returned-menu');
  await setup();
  await click(620,365);await click(575,425); // Random map type.
  await click(430,92);await click(399,294); // Han.
  await click(254,439);await click(238,525); // Alpine Lakes.
  await launch('alpine');
  if(server)assert.equal(await page.evaluate(()=>__dolly.gpu.stats.maxAnisotropy),16);
  await page.keyboard.press('Control+F10');
  await page.waitForFunction(()=>!__dolly.graphicsActive);
  await page.evaluate(()=>__dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/,'menu check shell'));
  const submit=command=>page.evaluate(text=>__dolly.submit(text),command);
  const download=async(path,name)=>{
    const running=submit('download '+path),event=acceptDownload(page,()=>running);
    const file=await event;await file.saveAs(`${output}/${name}`);assert.equal(await running,0);
    return readFile(`${output}/${name}`,'utf8');
  };
  assert.doesNotMatch(await download('/opt/0ad/logs/interestinglog.html',`menu-${browserName}-warnings.html`),/class="error"|class="warning"/);
  assert.doesNotMatch(await download('/tmp/save-first-warnings.html',`menu-${browserName}-first-warnings.html`),/class="error"|class="warning"/);
  const config=await download('/opt/0ad/data/config/user.cfg',`menu-${browserName}-user.cfg`);
  assert.match(config,/^textures\.quality = "2"$/m);
  assert.match(config,/^textures\.maxanisotropy = "16"$/m);
  assert.equal(await submit('cat $(find /opt/0ad/data/replays -name commands.txt) > /tmp/menu-replays.txt'),0);
  const replays=await download('/tmp/menu-replays.txt',`menu-${browserName}-replays.txt`);
  const matches=replays.split('\n').filter(line=>line.startsWith('start ')).map(line=>JSON.parse(line.slice(6)));
  assert.equal(matches.length,3);
  const player=match=>match.settings.PlayerData.find(Boolean);
  assert.equal(matches.filter(match=>match.map==='maps/skirmishes/acropolis_bay_2p'&&player(match).Civ==='brit').length,2);
  assert.ok(matches.some(match=>match.map==='maps/random/alpine_lakes'&&player(match).Civ==='han'));
  assert.deepEqual(errors,[]);
  const cgroup=(await readFile('/proc/self/cgroup','utf8')).match(/^0::(.*)$/m)[1];
  console.log(JSON.stringify({browser:browser.version(),menuMilliseconds,menuMatches:matches.map(match=>({map:match.map,civ:player(match).Civ})),
    peakBytes:Number(await readFile('/sys/fs/cgroup'+cgroup+'/memory.peak','utf8')),cleanEngineLog:true}));
} catch(error) {
  await page?.screenshot({path:`${output}/menu-${browserName}-failure.png`}).catch(()=>{});
  if(page)console.error(await page.evaluate(()=>({gpu:__dolly?.gpu,log:document.querySelector('#bootstrap-log')?.textContent})).catch(()=>null));
  throw error;
} finally {clearTimeout(deadline);await browser?.close();await server?.close();}
