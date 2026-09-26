import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium,firefox} from 'playwright-core';
import {startBrowserServer} from './browser-server.mjs';
const kind=process.argv[2]??'chrome', output=`build/host-compute-${kind}`;
const source=await fs.readFile(new URL('./fixtures/host-compute.c',import.meta.url),'utf8');
const server=await startBrowserServer(process.cwd(),'system-build');
let browser;
try {
  browser=kind==='firefox'?await firefox.launch({headless:false,firefoxUserPrefs:{'dom.webgpu.enabled':true,'gfx.webgpu.ignore-blocklist':true}}):await chromium.launch({channel:'chrome',headless:false,args:['--no-sandbox','--ozone-platform=x11','--enable-unsafe-webgpu','--use-angle=vulkan','--enable-features=Vulkan,VulkanFromANGLE']});
  const page=await browser.newPage();
  page.on('console',message=>console.log(message.text()));
  await page.goto(server.origin+'/fixture/http.txt');
  const result=await page.evaluate(async code=>{
    const {DOLLY_IMAGES,DOLLY_STATIC_SOURCES}=await import('/dist/dolly-images.mjs');
    const {createHost}=await import('/src/host/modules.mjs');
    const {buildImage}=await import('/src/image-builder.mjs');
    const {prepareImageArtifacts}=await import('/src/image-build.mjs');
    const {describeImageArtifact,sha256}=await import('/src/image-artifact.mjs');
    const {consumeDollyHttpPolicy}=await import('/src/http-policy.mjs');
    const {localServicesTransport}=await import('/src/local-services.mjs');
    const sources=[...DOLLY_IMAGES.map(d=>({path:`/${d.dollyfile}`,byteLength:d.byteLength})),...DOLLY_STATIC_SOURCES];
    const network=localServicesTransport(consumeDollyHttpPolicy(globalThis,sources,new URL('/',location.href)));
    const base=DOLLY_IMAGES.find(d=>d.image==='system-build');
    const recipe=`DOLLY 4\nIMAGE compute\nFROM HOST /Dollyfile-system-build ${base.sha256}\nREQUIRES HOST gpu@0\nFILE /tmp/probe.c\n${code.trimEnd().split('\n').map(line=>'    '+line).join('\n')}\nSLOP cc -O1 /tmp/probe.c -ldolly-gpu -o /usr/bin/probe\nEXPORTS TOOL probe\nENTRY /usr/bin/probe\n`;
    const report=text=>console.log(text);
    const artifacts=await prepareImageArtifacts('custom',recipe,(name,inputs)=>buildImage(name,inputs,network,report),report);
    const built=await buildImage('custom',artifacts,network,report,{customSource:recipe});
    const artifact=await describeImageArtifact(built.bytes,await sha256(new TextEncoder().encode(recipe)),built.inputs);
    let worker;
    const host=await createHost('browser',['runtime@0','gpu@0'],{send:message=>worker.postMessage(message)});
    try {
      host.require(artifact.hostRequirements);
      worker=new Worker('/src/runtime-worker.mjs',{type:'module'});
      const exited=new Promise((resolve,reject)=>{
        worker.onerror=e=>reject(Error(e.message));
        worker.onmessage=({data:m})=>{
          void host.handle(m).catch(reject);
          if(m.type==='bootstrap')report(m.text);
          if(m.type==='bootstrap-bytes')report(new TextDecoder().decode(m.bytes));
          if(m.type==='ready')worker.postMessage({type:'entry-ready-ack'});
          if(m.type==='exited')resolve(m.status);
          if(m.type==='error')reject(Error(m.message));
        };
      });
      worker.postMessage({type:'configure',image:'custom',mode:'snapshot',customSource:recipe,customArtifact:artifact,
        hostModules:host.enabled,hostConfiguration:host.configuration},[artifact.bytes]);
      const status=await exited;
      return {status,requirements:artifact.hostRequirements,providers:host.enabled,canvasCount:document.querySelectorAll('canvas').length,gpu:host.get('gpu').status};
    } finally {host.dispose();worker?.terminate();}
  },source);
  assert.equal(result.status,0);assert.deepEqual(result.requirements,['gpu@0']);
  assert.deepEqual(result.providers,['runtime@0','gpu@0']);assert.equal(result.canvasCount,0);
  await fs.mkdir(output,{recursive:true});await fs.writeFile(`${output}/proof.json`,JSON.stringify(result,null,2));console.log(result);
}finally{await browser?.close();await server.close();}
