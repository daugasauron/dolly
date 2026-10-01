import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium,firefox} from 'playwright-core';
import {startBrowserServer} from '../../../test/browser-server.mjs';
import {acceptDownload} from '../../browser.mjs';
import {hasGameHud} from './fixtures/0ad-hud.mjs';
import {inspectDollyfile} from '../../../src/dollyfile-view.mjs';
import {engineFixture} from './fixtures/image-file.mjs';

const root=new URL('../../../',import.meta.url), output=new URL('../../../.cache/0ad/browser/',import.meta.url);
const image=process.argv[2]??'default', backend=process.argv[3]??'hardware';
const browserName=process.argv[4]??'chromium';
const compression=process.argv[5]??'auto';
const animation=process.argv[6]??'gpu';
assert.ok(['default','zero-ad'].includes(image) && ['hardware','software'].includes(backend),
  'usage: node demos/zero-ad/test/0ad-graphics-browser.mjs [default|zero-ad] [hardware|software] [chromium|firefox] [auto|uncompressed|core] [gpu|cpu]');
assert.ok(['chromium','firefox'].includes(browserName) && (browserName==='chromium'||backend==='hardware'));
assert.ok(['auto','uncompressed','core'].includes(compression));
assert.ok(['gpu','cpu'].includes(animation));
await mkdir(output,{recursive:true});
const sources=inspectDollyfile(await readFile(new URL('demos/zero-ad/zero-ad.dm',root),'utf8')).sources;
const prefix='https://daugasauron.com/dist/static/zero-ad/';
const fixtures=Object.fromEntries(sources.map(source=>[source.location.slice(prefix.length),'dist/static/zero-ad/'+source.location.slice(prefix.length)]));
fixtures['pyrogenesis.wasm']=await engineFixture();
let provider='import "/test/fixtures/gpu-surface-observer.mjs";\n'+(await readFile(new URL('host/gpu/worker.mjs',root),'utf8'))
  .replace('stats:{...stats,allocatedBytes:usedBytes}',
    'stats:{...stats,allocatedBytes:usedBytes,frameTime:performance.now(),gpuTotalMs:scope.gpuTotalMs}');
if(backend==='software')provider=provider.replace('powerPreference: "high-performance"','forceFallbackAdapter: true');
if(compression==='uncompressed')provider='import "/test/fixtures/gpu-no-bc.mjs";\n'+provider;
if(compression==='core')provider='import "/test/fixtures/gpu-core-limits.mjs";\n'+provider;
const server=await startBrowserServer(root.pathname,image,{sourceOverrides:new Map([['/host/gpu/worker.mjs',provider]]),
  fixtures});
let browser,deadline,page;
try {
  browser=browserName==='firefox'
    ? await firefox.launch({headless:false,firefoxUserPrefs:{'dom.webgpu.enabled':true}})
    : await chromium.launch({channel:'chrome',headless:false,args:['--no-sandbox','--mute-audio','--enable-unsafe-webgpu',
    '--use-angle=vulkan',...(backend==='hardware'
      ? ['--ozone-platform=x11','--enable-features=Vulkan,VulkanFromANGLE']
      : ['--use-vulkan=swiftshader','--use-webgpu-adapter=swiftshader','--enable-features=Vulkan','--disable-vulkan-surface'])]});
  deadline=setTimeout(()=>void browser.close(),240000);
  page=await browser.newPage({viewport:{width:1024,height:768}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(({origin,requests})=>{globalThis.DOLLY_HTTP_POLICY={maxRequests:requests,
    rules:[{origin,pathPrefix:'/fixture/',methods:['GET']}]};
    globalThis.audioPeak=0;
    globalThis.frameSamples=[];
    const NativeWorker=Worker;
    globalThis.Worker=class extends NativeWorker {
      constructor(...args) {
        super(...args);
        this.addEventListener('message',({data})=>{
          if(data.type==='gpu-status' && data.active && data.stats?.frameTime)
            frameSamples.push({time:data.stats.frameTime,gpu:data.stats.gpuTotalMs,packets:data.stats.packets,bytes:data.stats.packetBytes,provider:data.stats.batchWallMilliseconds});
        });
      }
    };
    const nativeSource=AudioContext.prototype.createBufferSource, meters=new WeakMap();
    AudioContext.prototype.createBufferSource=function(){
      const source=nativeSource.call(this);
      let meter=meters.get(this);
      if(!meter){
        meter=this.createAnalyser();meters.set(this,meter);
        const mute=this.createGain();mute.gain.value=0;meter.connect(mute);mute.connect(this.destination);
        const samples=new Float32Array(2048);
        setInterval(()=>{meter.getFloatTimeDomainData(samples);
          audioPeak=Math.max(audioPeak,Math.sqrt(samples.reduce((sum,x)=>sum+x*x,0)/samples.length));},20);
      }
      source.connect(meter);
      const connect=source.connect;
      source.connect=function(target,...args){return connect.call(this,target===this.context.destination?meter:target,...args);};
      return source;
    };
  },{origin:server.origin,requests:sources.length});
  const bootStart=performance.now();
  await page.goto(server.origin+'/'+image+'/');
  await page.waitForFunction(()=>['ready','failed'].includes(document.documentElement.dataset.dollyStatus),null,{timeout:90000});
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.dollyStatus),'ready');
  if(image==='zero-ad') {
    await page.waitForFunction(()=>__dolly.gpu.stats?.frames>=90,null,{timeout:60000});
    await page.screenshot({path:new URL('graphics-main-menu.png',output).pathname});
    await page.keyboard.press('Control+F10');
    await page.waitForFunction(()=>!__dolly.graphicsActive);
  }
  await page.evaluate(()=>__dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/,'shell'));
  const bootMilliseconds=Math.round(performance.now()-bootStart);
  await page.mouse.click(10,10);
  const submit=command=>page.evaluate(text=>__dolly.submit(text),command);
  const download=async(path,name,encoding='utf8')=>{
    const running=submit('download '+path),event=acceptDownload(page,()=>running);
    const file=await event;await file.saveAs(new URL(name,output).pathname);assert.equal(await running,0);
    return readFile(new URL(name,output),encoding);
  };
  const stagingStart=performance.now();
  if(image==='default') {
    for(const source of sources) {
      const name=source.location.slice(prefix.length);
      const directory=source.destination.slice(0,source.destination.lastIndexOf('/'));
      assert.equal(await submit(`mkdir -p ${directory} && curl -fsS ${server.origin}/fixture/${name} -o ${source.destination}`),0);
    }
  }
  const stagingMilliseconds=Math.round(performance.now()-stagingStart);
  console.log(`Graphical content staged in ${stagingMilliseconds} ms`);
  const frames=()=>page.evaluate(()=>__dolly.gpu.stats?.frames??0);
  const frameTimings=()=>page.evaluate(()=>{
    const intervals=frameSamples.slice(1).map((sample,i)=>sample.time-frameSamples[i].time).sort((a,b)=>a-b);
    const first=frameSamples[0],last=frameSamples.at(-1),count=intervals.length;
    return {frames:count,mean:(last.time-first.time)/count,median:intervals[Math.floor(count*.5)],
      p95:intervals[Math.floor(count*.95)],p99:intervals[Math.floor(count*.99)],max:intervals.at(-1),
      over33Milliseconds:intervals.filter(time=>time>1000/30).length,gpuMilliseconds:(last.gpu-first.gpu)/count,
      packetsPerFrame:(last.packets-first.packets)/count,bytesPerFrame:(last.bytes-first.bytes)/count,
      providerMilliseconds:(last.provider-first.provider)/count};
  });
  const advance=async count=>{
    // GPU reports can arrive before the game consumes newly posted input.
    await page.waitForFunction(()=>gameStatus!==null || __dolly.transport.inputIdle());
    const target=await frames()+count;
    await page.waitForFunction(target=>gameStatus!==null || __dolly.gpu.error || __dolly.gpu.stats?.frames>=target,target,{timeout:90000});
    assert.equal(await page.evaluate(()=>gameStatus),null,JSON.stringify(await page.evaluate(()=>__dolly.gpu)));
    assert.equal(await page.evaluate(()=>__dolly.gpu.error),undefined);
  };
  const advanceFor=async milliseconds=>{
    const start=performance.now();
    do {await advance(2);} while(performance.now()-start<milliseconds);
  };
  const checkOpacity=async label=>{
    await page.evaluate(label=>{
      const channel=new BroadcastChannel('dolly-test-surface-alpha');
      channel.postMessage(label);channel.close();
    },label);
    await page.waitForFunction(label=>__dolly.gpu.surfaceAlpha?.label===label,label);
    const alpha=await page.evaluate(()=>__dolly.gpu.surfaceAlpha);
    assert.ok(alpha.width>0,'Presented frame alpha was not observed');
    assert.equal(alpha.nonOpaquePixels,0,'The game window must not expose the terminal through scene alpha');
  };
  const start=async(options='-autostart=scenarios/combat_demo')=>{
    if(animation==='cpu')options+=' -conf=gpuskinning:false';
    const baseline=await frames(),time=performance.now();
    await page.evaluate(({options,image})=>{
      globalThis.gameStatus=null;globalThis.audioPeak=0;
      const launch=image==='zero-ad'?'zero-ad':'ICU_DATA=/opt/0ad/data/icu /opt/0ad/system/pyrogenesis -writableRoot -mod=public -conf=hotkey.exit:Ctrl+F10';
      void __dolly.submit(launch+' '+options)
        .then(status=>{globalThis.gameStatus=status;});
    },{options,image});
    await page.waitForFunction(target=>gameStatus!==null || __dolly.gpu.stats?.frames>=target,baseline+22,{timeout:30000});
    assert.equal(await page.evaluate(()=>gameStatus),null);
    while(!await hasGameHud(page)) {
      assert.ok(performance.now()-time<60000,'The in-game HUD never appeared');
      await advance(2);
    }
    return Math.round(performance.now()-time);
  };
  const stop=async(graceful=false)=>{
    await page.keyboard.press(graceful?'Control+F10':'Control+c');await page.waitForFunction(()=>gameStatus!==null);
    const status=await page.evaluate(()=>gameStatus);
    if(graceful) assert.equal(status,0); else assert.ok([0,130].includes(status));
    await page.waitForFunction(()=>!__dolly.graphicsActive);
    await page.waitForFunction(()=>__dolly.audio.activeScopes===0 && __dolly.audio.buffers===0);
  };
  const startupMilliseconds=await start();
  console.log(`Combat scene ready in ${startupMilliseconds} ms`);
  const adapter=await page.evaluate(()=>__dolly.gpu);
  console.log(JSON.stringify({adapter:adapter.adapter,isFallbackAdapter:adapter.isFallbackAdapter}));
  if(backend==='software') assert.match(adapter.adapter,/swiftshader/i);
  else {
    assert.equal(adapter.isFallbackAdapter,false,'Hardware verification must not use a fallback adapter');
    assert.doesNotMatch(adapter.adapter,/swiftshader|llvmpipe|software/i);
  }
  assert.ok(await hasGameHud(page,await page.screenshot({path:new URL('graphics-initial.png',output).pathname})),
    'Combat view must remain visible after loading');
  await page.keyboard.press('F10');await advanceFor(600);
  await page.screenshot({path:new URL('graphics-menu.png',output).pathname});
  await page.keyboard.press('F10');await advanceFor(600);
  await page.mouse.move(535,350);await page.mouse.down();
  await page.mouse.move(595,610,{steps:5});await page.mouse.up();await advance(2);
  await page.screenshot({path:new URL('graphics-selection.png',output).pathname});
  await page.mouse.click(360,390,{button:'right'});
  await advance(8);
  await page.keyboard.press('Shift+F5');await advanceFor(600);
  await page.keyboard.press('Shift+F8');await advance(4);
  await page.screenshot({path:new URL('graphics-game.png',output).pathname});
  await advanceFor(5000);
  await page.evaluate(()=>{frameSamples=[];});
  const before=await frames(),time=performance.now();await advance(120);
  const frameMilliseconds=(performance.now()-time)/((await frames())-before);
  const combatFrameTimings=await frameTimings();
  await checkOpacity('combat');
  const gpu=await page.evaluate(()=>__dolly.gpu);
  assert.equal(gpu.stats.dispatches>0,animation==='gpu','Compute activity must match the selected animation mode');
  const combatAudio=await page.evaluate(()=>({peak:audioPeak,...__dolly.audio}));
  if(animation==='gpu')for(const enabled of [false,true]) {
    await page.keyboard.press('F9');await advanceFor(400);
    await page.keyboard.type('Engine.ConfigDB_CreateValue("user", "gpuskinning", "'+enabled+'")');
    await advance(2);await page.keyboard.press('Enter');await advanceFor(400);
    await page.keyboard.press('F9');await advance(30);
    const first=await page.evaluate(()=>__dolly.gpu.stats.dispatches);
    await advance(60);
    assert.equal(await page.evaluate(first=>__dolly.gpu.stats.dispatches>first,first),enabled,
      'Changing GPU skinning during a match must change compute activity');
  }
  await page.keyboard.press('Shift+Space');await advance(2);
  for(const quality of [2,0]) {
    await page.keyboard.press('F9');await advanceFor(250);
    await page.keyboard.type(`Engine.ConfigDB_CreateValue("user", "textures.quality", "${quality}")`);
    await page.keyboard.press('Enter');await advanceFor(250);
    await page.keyboard.press('F9');await advance(90);
  }
  await page.keyboard.press('Shift+Space');await advance(2);
  await page.keyboard.press('F2');await advance(4);
  await stop();
  const screenshot=await download('/opt/0ad/data/screenshots/screenshot0001.png','graphics-readback.png',null);
  assert.ok(await hasGameHud(page,screenshot),'Native screenshot readback must contain the game HUD');
  const warnings=await download('/opt/0ad/logs/interestinglog.html','graphics-warnings.html');
  assert.doesNotMatch(warnings,/class="error"|class="warning"/);
  assert.ok(combatAudio.peak>1e-4,'Combat audio must reach the browser audio graph: '+JSON.stringify(combatAudio));
  assert.equal(await submit("cat $(find /opt/0ad/data/replays -name commands.txt) > /tmp/graphics-replay.txt"),0);
  const replay=await download('/tmp/graphics-replay.txt','graphics-replay.txt');
  const commands=replay.split('\n').filter(line=>line.startsWith('cmd 1 ')).map(line=>JSON.parse(line.slice(6)));
  assert.ok(commands.some(command=>command.type==='walk' && command.entities.length),'drag selection and right-click must issue a real walk command');
  const turns=[...replay.matchAll(/^turn (\d+) /gm)].map(match=>Number(match[1]));
  assert.ok(turns.some((turn,index)=>index>0 && turn<turns[index-1]),'quickload must restore an earlier simulation turn');
  const restartMilliseconds=await start('-autostart=skirmishes/temperate_roadway_2p -autostart-civ=1:athen -autostart-civ=2:athen -autostart-ai=2:petra -autostart-aidiff=2:1');
  // Let the selection panel finish updating before clicking its controls.
  await page.mouse.click(520,360);await advanceFor(300);
  await page.mouse.click(648,627);await advance(3);
  await page.mouse.click(648,627);await advance(3);
  await page.mouse.move(330,385);await page.mouse.down();
  await page.mouse.move(457,475,{steps:5});await page.mouse.up();await advanceFor(300);
  await page.mouse.click(687,626);await advance(3);
  await page.mouse.click(238,423);
  // Training and construction follow simulation time, independently of GPU speed.
  await page.evaluate(()=>{frameSamples=[];});
  await advanceFor(40000);
  const economyFrameTimings=await frameTimings();
  await checkOpacity('economy');
  assert.ok(await hasGameHud(page,await page.screenshot({path:new URL('graphics-economy.png',output).pathname})),
    'Economy view must remain visible');
  const economyGpu=await page.evaluate(()=>__dolly.gpu);
  const economyAudio=await page.evaluate(()=>({peak:audioPeak,...__dolly.audio}));
  assert.ok(economyAudio.peak>1e-4,'Economy audio must reach the browser audio graph');
  await stop(true);
  assert.doesNotMatch(await download('/opt/0ad/logs/interestinglog.html','graphics-economy-warnings.html'),/class="error"|class="warning"/);
  assert.equal(await submit("find /opt/0ad/data/replays -name commands.txt | sort | tail -n1 > /tmp/economy-replay-path; cat $(cat /tmp/economy-replay-path) > /tmp/economy-replay.txt; cat $(dirname $(cat /tmp/economy-replay-path))/metadata.json > /tmp/economy-metadata.json"),0);
  const economyReplay=await download('/tmp/economy-replay.txt','graphics-economy-replay.txt');
  const economyCommands=economyReplay.split('\n').filter(line=>line.startsWith('cmd 1 ')).map(line=>JSON.parse(line.slice(6)));
  assert.ok(economyCommands.some(command=>command.type==='train' && command.template==='units/athen/support_civilian'));
  assert.ok(economyCommands.some(command=>command.type==='construct' && command.template==='structures/athen/house'));
  const economyMetadata=JSON.parse(await download('/tmp/economy-metadata.json','graphics-economy-metadata.json'));
  assert.equal(economyMetadata.playerStates[1].popCount,13,'two civilians trained through the UI');
  assert.equal(economyMetadata.playerStates[1].popLimit,30,'the house placed through the UI finished construction');
  assert.ok(economyMetadata.playerStates[2].popCount>11,'Petra progressed in the visual game');
  assert.equal(await submit('echo GRAPHICS_RECOVERED > /tmp/graphics-recovered && cat /tmp/graphics-recovered'),0);
  assert.deepEqual(errors,[]);
  const cgroup=(await readFile('/proc/self/cgroup','utf8')).match(/^0::(.*)$/m)?.[1];
  const processTreePeakBytes=cgroup?Number(await readFile('/sys/fs/cgroup'+cgroup+'/memory.peak','utf8')):undefined;
  console.log(JSON.stringify({image,backend,browserName,compression,animation,browser:browser.version(),adapter:gpu.adapter,isFallbackAdapter:gpu.isFallbackAdapter,bootMilliseconds,stagingMilliseconds,startupMilliseconds,
    restartMilliseconds,frameMilliseconds:Math.round(frameMilliseconds),combatFrameTimings,economyFrameTimings,allocatedBytes:gpu.stats.allocatedBytes,
    economyAllocatedBytes:economyGpu.stats.allocatedBytes,processTreePeakBytes,visualInput:true,
    economyConstruction:true,economyTraining:true,quickSaveLoad:true,freshProcesses:2,shellRecovery:true,
    opaquePresentation:gpu.surfaceAlpha,economyOpaquePresentation:economyGpu.surfaceAlpha,
    combatAudio,economyAudio}));
} catch(error) {
  if(page && !page.isClosed()) {
    await page.screenshot({path:new URL('graphics-failure.png',output).pathname}).catch(()=>{});
    console.error(await page.evaluate(()=>({status:globalThis.gameStatus,gpu:__dolly?.gpu,audio:__dolly?.audio})).catch(()=>null));
    if(await page.evaluate(()=>!__dolly.graphicsActive).catch(()=>false))
      console.error(await page.evaluate(()=>__dolly.visibleTerminalText()).catch(()=>''));
  }
  throw error;
} finally {clearTimeout(deadline);await browser?.close();await server.close();}
