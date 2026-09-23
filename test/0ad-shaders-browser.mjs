import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,readdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';

const root=new URL('../build/0ad/shaders/',import.meta.url), shaders={}, pairs=new Map();
let canvas;
for(const mod of ['mod','public']) {
  const directory=new URL(`${mod}/shaders/wgsl/`,root);
  for(const name of await readdir(directory)) {
    if(name.endsWith('.wgsl'))shaders[`${mod}/${name}`]=await readFile(new URL(name,directory),'utf8');
    else if(name.endsWith('.xml')) {
      const xml=await readFile(new URL(name,directory),'utf8');
      const stages=[...xml.matchAll(/<(vertex|fragment) file="wgsl\/([^"]+)"/g)].map(m=>`${mod}/${m[2]}`);
      if(stages.length===2){pairs.set(stages.join(','),stages);if(name.startsWith('canvas2d_'))canvas=stages;}
    }
  }
}
assert.ok(canvas && pairs.size,'Run toolchain/0ad/prepare-shaders.sh first');
const server=createServer((request,response)=>{
  response.writeHead(200,{'content-type':'text/html','cross-origin-opener-policy':'same-origin','cross-origin-embedder-policy':'require-corp'});
  response.end('<!doctype html><title>0 A.D. translated shader proof</title>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser,deadline;
try {
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox','--enable-unsafe-webgpu',
    '--use-angle=swiftshader','--use-vulkan=swiftshader']});
  deadline=setTimeout(()=>void browser.close(),120000);
  const page=await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const result=await page.evaluate(async({shaders,pairs,canvas})=>{
    const adapter=await navigator.gpu.requestAdapter({forceFallbackAdapter:true});
    const adapterName=adapter?[adapter.info.vendor,adapter.info.architecture,adapter.info.description].join(' '):'';
    if(!/swiftshader/i.test(adapterName))throw Error('Software adapter unavailable: '+JSON.stringify({adapterName,isNull:adapter===null,secure:isSecureContext,visibility:document.visibilityState}));
    const device=await adapter.requestDevice(), modules=new Map();
    const start=performance.now();
    for(const [name,code] of Object.entries(shaders)) {
      const module=device.createShaderModule({code});
      const errors=(await module.getCompilationInfo()).messages.filter(m=>m.type==='error');
      if(errors.length)throw Error(`${name}: ${errors.map(e=>e.message).join('; ')}`);
      modules.set(name,module);
    }
    for(const [vs,fs] of pairs) {
      const parameters=shaders[vs].match(/fn main\(([\s\S]*?)\) ->/)?.[1];
      if(parameters===undefined)throw Error(`Vertex entry point missing: ${vs}`);
      let stride=0;
      const attributes=[...parameters.matchAll(/@location\((\d+)\)\s+\w+:\s*(vec([234])<([fiu])32>|([fiu])32)/g)].map(m=>{
        const count=Number(m[3]??1),type=({f:'float',i:'sint',u:'uint'})[m[4]??m[5]];
        const entry={shaderLocation:Number(m[1]),offset:stride,format:`${type}32${count>1?'x'+count:''}`};stride+=count*4;return entry;
      });
      try {
        await device.createRenderPipelineAsync({layout:'auto',vertex:{module:modules.get(vs),entryPoint:'main',
          buffers:attributes.length?[{arrayStride:stride,attributes}]:[]},
          fragment:{module:modules.get(fs),entryPoint:'main',targets:[{format:'rgba8unorm'}]},
          primitive:{topology:'triangle-list'},depthStencil:{format:'depth32float',depthWriteEnabled:true,depthCompare:'less'}});
      } catch(error){throw Error(`${vs} + ${fs}: ${error.message}`);}
    }
    // Exercise actual upstream canvas WGSL and the reflection-defined offsets.
    const pipeline=await device.createRenderPipelineAsync({layout:'auto',
      vertex:{module:modules.get(canvas[0]),entryPoint:'main',buffers:[{arrayStride:16,attributes:[
        {shaderLocation:0,offset:0,format:'float32x2'},{shaderLocation:1,offset:8,format:'float32x2'}]}]},
      fragment:{module:modules.get(canvas[1]),entryPoint:'main',targets:[{format:'rgba8unorm'}]},primitive:{topology:'triangle-strip'}});
    const vertices=device.createBuffer({size:64,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});
    device.queue.writeBuffer(vertices,0,new Float32Array([-1,-1,0,1,1,-1,1,1,-1,1,0,0,1,1,1,0]));
    const values=new Float32Array(20);values.set([1,0,0,1]);values.set([1,1,1,1],12);
    const uniforms=device.createBuffer({size:80,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
    const source=device.createTexture({size:[2,2],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});
    device.queue.writeTexture({texture:source},new Uint8Array([255,0,0,255,0,255,0,255,0,0,255,255,255,255,0,255]),{bytesPerRow:8},{width:2,height:2});
    const groups=[device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[]}),
      device.createBindGroup({layout:pipeline.getBindGroupLayout(1),entries:[{binding:0,resource:source.createView()},{binding:1,resource:device.createSampler()}]}),
      device.createBindGroup({layout:pipeline.getBindGroupLayout(2),entries:[{binding:0,resource:{buffer:uniforms}}]})];
    const target=device.createTexture({size:[64,64],format:'rgba8unorm',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
    const readback=device.createBuffer({size:16384,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    for(const grayscale of [0,1]) {
      device.pushErrorScope('validation');values[16]=grayscale;device.queue.writeBuffer(uniforms,0,values);
      const encoder=device.createCommandEncoder(),pass=encoder.beginRenderPass({colorAttachments:[{view:target.createView(),loadOp:'clear',storeOp:'store',clearValue:[0,0,0,1]}]});
      pass.setPipeline(pipeline);groups.forEach((group,index)=>pass.setBindGroup(index,group));pass.setVertexBuffer(0,vertices);pass.draw(4);pass.end();
      encoder.copyTextureToBuffer({texture:target},{buffer:readback,bytesPerRow:256},[64,64]);device.queue.submit([encoder.finish()]);
      await readback.mapAsync(GPUMapMode.READ);
      const error=await device.popErrorScope();if(error)throw Error(error.message);
      const pixels=new Uint8Array(readback.getMappedRange());
      for(const [x,y,r,g,b] of [[16,16,255,0,0],[48,16,0,255,0],[16,48,0,0,255],[48,48,255,255,0]]) {
        const gray=.3*r+.59*g+.11*b, expected=grayscale?[gray,gray,gray,255]:[r,g,b,255],at=(y*64+x)*4;
        if(!expected.every((n,i)=>Math.abs(pixels[at+i]-n)<=1))throw Error(`Canvas shader pixel mismatch at ${x},${y}, grayscale=${grayscale}: ${pixels.slice(at,at+4)}`);
      }
      readback.unmap();
    }
    device.destroy();
    return {adapter:adapterName.trim(),compiledShaders:modules.size,linkedPrograms:pairs.length,
      upstreamCanvasPixels:true,reflectionOffsets:true,grayscaleUniform:true,milliseconds:Math.round(performance.now()-start)};
  },{shaders,pairs:[...pairs.values()],canvas});
  console.log(JSON.stringify({browser:browser.version(),...result}));
} finally {clearTimeout(deadline);await browser?.close();await new Promise(resolve=>server.close(resolve));}
