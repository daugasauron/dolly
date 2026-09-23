import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {startBrowserServer} from './browser-server.mjs';

const root=new URL('..',import.meta.url), output=new URL('../.cache/0ad/browser/',import.meta.url);
await mkdir(output,{recursive:true});
const provider=await readFile(new URL('src/gpu-worker.mjs',root),'utf8');
const server=await startBrowserServer(root.pathname,'default',0,new Map([
  ['/src/gpu-worker.mjs',provider.replace('powerPreference: "high-performance"','forceFallbackAdapter: true')]
]),{'pyrogenesis.wasm':'build/0ad/pyrogenesis.wasm','0ad-graphics.tar':'build/0ad/graphics-data.tar'});
let browser,deadline,page;
try {
  // A virtual X display allows Chrome's software Vulkan surface to composite.
  browser=await chromium.launch({channel:'chrome',headless:false,args:['--no-sandbox','--enable-unsafe-webgpu',
    '--use-angle=vulkan','--use-vulkan=swiftshader','--use-webgpu-adapter=swiftshader','--enable-features=Vulkan','--disable-vulkan-surface']});
  deadline=setTimeout(()=>void browser.close(),180000);
  page=await browser.newPage({viewport:{width:1024,height:768}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(origin=>{globalThis.DOLLY_HTTP_POLICY={maxRequests:2,
    rules:[{origin,pathPrefix:'/fixture/',methods:['GET']}]};},server.origin);
  await page.goto(server.origin+'/default/');
  await page.waitForFunction(()=>['ready','failed'].includes(document.documentElement.dataset.dollyStatus));
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.dollyStatus),'ready');
  await page.evaluate(()=>__dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/,'shell'));
  const submit=command=>page.evaluate(text=>__dolly.submit(text),command);
  const download=async(path,name)=>{
    const event=page.waitForEvent('download'),running=submit('download '+path);
    const file=await event;await file.saveAs(new URL(name,output).pathname);assert.equal(await running,0);
    return readFile(new URL(name,output),'utf8');
  };
  const stagingStart=performance.now();
  assert.equal(await submit('mkdir -p /opt/0ad/system'),0);
  assert.equal(await submit(`curl -fsS ${server.origin}/fixture/pyrogenesis.wasm -o /opt/0ad/system/pyrogenesis`),0);
  assert.equal(await submit(`curl -fsS ${server.origin}/fixture/0ad-graphics.tar -o /tmp/0ad.tar && tar -xf /tmp/0ad.tar -C /opt/0ad && rm /tmp/0ad.tar`),0);
  const stagingMilliseconds=Math.round(performance.now()-stagingStart);
  console.log(`Graphical content staged in ${stagingMilliseconds} ms`);
  const frames=()=>page.evaluate(()=>__dolly.gpu.stats?.frames??0);
  const advance=async count=>{
    const target=await frames()+count;
    await page.waitForFunction(target=>gameStatus!==null || __dolly.gpu.error || __dolly.gpu.stats?.frames>=target,target,{timeout:30000});
    assert.equal(await page.evaluate(()=>gameStatus),null,JSON.stringify(await page.evaluate(()=>__dolly.gpu)));
    assert.equal(await page.evaluate(()=>__dolly.gpu.error),undefined);
  };
  const start=async()=>{
    const baseline=await frames(),time=performance.now();
    await page.evaluate(()=>{
      globalThis.gameStatus=null;
      void __dolly.submit('ICU_DATA=/opt/0ad/data/icu /opt/0ad/system/pyrogenesis -quickstart -writableRoot -mod=public -nosound -autostart=scenarios/combat_demo')
        .then(status=>{globalThis.gameStatus=status;});
    });
    await page.waitForFunction(target=>gameStatus!==null || __dolly.gpu.stats?.frames>=target,baseline+22,{timeout:30000});
    assert.equal(await page.evaluate(()=>gameStatus),null);
    return Math.round(performance.now()-time);
  };
  const stop=async()=>{
    await page.keyboard.press('Control+c');await page.waitForFunction(()=>gameStatus!==null);
    assert.ok([0,130].includes(await page.evaluate(()=>gameStatus)));
    await page.waitForFunction(()=>!__dolly.graphicsActive);
  };
  const startupMilliseconds=await start();
  console.log(`Combat scene reached 22 frames in ${startupMilliseconds} ms`);
  assert.match(await page.evaluate(()=>__dolly.gpu.adapter),/swiftshader/i);
  await page.mouse.move(535,350);await page.mouse.down();
  await page.mouse.move(595,610,{steps:5});await page.mouse.up();await advance(2);
  await page.screenshot({path:new URL('graphics-selection.png',output).pathname});
  await page.mouse.click(360,390,{button:'right'});
  await advance(8);
  await page.keyboard.press('Shift+F5');await advance(2);
  await page.keyboard.press('Shift+F8');await advance(4);
  await page.screenshot({path:new URL('graphics-game.png',output).pathname});
  const before=await frames(),time=performance.now();await advance(10);
  const frameMilliseconds=(performance.now()-time)/((await frames())-before);
  const gpu=await page.evaluate(()=>__dolly.gpu);
  await stop();
  const warnings=await download('/opt/0ad/logs/interestinglog.html','graphics-warnings.html');
  assert.doesNotMatch(warnings,/class="error"|class="warning"/);
  assert.equal(await submit("cat $(find /opt/0ad/data/replays -name commands.txt) > /tmp/graphics-replay.txt"),0);
  const replay=await download('/tmp/graphics-replay.txt','graphics-replay.txt');
  const commands=replay.split('\n').filter(line=>line.startsWith('cmd 1 ')).map(line=>JSON.parse(line.slice(6)));
  assert.ok(commands.some(command=>command.type==='walk' && command.entities.length),'drag selection and right-click must issue a real walk command');
  const turns=[...replay.matchAll(/^turn (\d+) /gm)].map(match=>Number(match[1]));
  assert.ok(turns.some((turn,index)=>index>0 && turn<turns[index-1]),'quickload must restore an earlier simulation turn');
  const restartMilliseconds=await start();await stop();
  assert.equal(await submit('echo GRAPHICS_RECOVERED > /tmp/graphics-recovered && cat /tmp/graphics-recovered'),0);
  assert.deepEqual(errors,[]);
  const cgroup=(await readFile('/proc/self/cgroup','utf8')).match(/^0::(.*)$/m)?.[1];
  const processTreePeakBytes=cgroup?Number(await readFile('/sys/fs/cgroup'+cgroup+'/memory.peak','utf8')):undefined;
  console.log(JSON.stringify({browser:browser.version(),adapter:gpu.adapter,stagingMilliseconds,startupMilliseconds,
    restartMilliseconds,frameMilliseconds:Math.round(frameMilliseconds),allocatedBytes:gpu.stats.allocatedBytes,
    processTreePeakBytes,visualInput:true,quickSaveLoad:true,freshProcesses:2,shellRecovery:true}));
} catch(error) {
  if(page && !page.isClosed()) {
    console.error(await page.evaluate(()=>({status:globalThis.gameStatus,gpu:__dolly?.gpu})).catch(()=>null));
    if(await page.evaluate(()=>!__dolly.graphicsActive).catch(()=>false))
      console.error(await page.evaluate(()=>__dolly.visibleTerminalText()).catch(()=>''));
  }
  throw error;
} finally {clearTimeout(deadline);await browser?.close();await server.close();}
