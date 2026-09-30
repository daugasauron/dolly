import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,readdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';

const root=new URL('../../../build/0ad/shaders/',import.meta.url), shaders={}, pairs=new Map(), computes=[];
const borderHelper=await readFile(new URL('../toolchain/border-sampler.wgsl',import.meta.url),'utf8');
let canvas;
for(const mod of ['mod','public']) {
  const directory=new URL(`${mod}/shaders/wgsl/`,root);
  for(const name of await readdir(directory)) {
    if(name.endsWith('.wgsl'))shaders[`${mod}/${name}`]=await readFile(new URL(name,directory),'utf8');
    else if(name.endsWith('.xml')) {
      const xml=await readFile(new URL(name,directory),'utf8');
      const stages=[...xml.matchAll(/<(vertex|fragment) file="wgsl\/([^"]+)"/g)].map(m=>`${mod}/${m[2]}`);
      if(stages.length===2){pairs.set(stages.join(','),stages);if(name.startsWith('canvas2d_'))canvas=stages;}
      const compute=xml.match(/<compute file="wgsl\/([^"]+)"/);
      if(compute)computes.push([`${mod}/${compute[1]}`,Number(xml.match(/<binding binding="0" size="(\d+)" type="uniform"/)[1])]);
    }
  }
}
assert.ok(canvas && pairs.size && computes.length,'Run demos/zero-ad/toolchain/prepare-shaders.sh first');
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
  const result=await page.evaluate(async({shaders,pairs,computes,canvas,borderHelper})=>{
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
    for(const [name,uniformBytes] of computes) {
      const pipeline=await device.createComputePipelineAsync({layout:'auto',compute:{module:modules.get(name),entryPoint:'main'}});
      const buffer=(data,usage)=>{
        const result=device.createBuffer({size:data.byteLength,usage:usage|GPUBufferUsage.COPY_DST});
        device.queue.writeBuffer(result,0,data);return result;
      };
      const count=67,matrices=new Float32Array(uniformBytes/4),vertices=new Float32Array((count+2)*16),skin=new Uint8Array((count+4)*8);
      for(let i=0;i<2;i++)for(let j=0;j<4;j++)matrices[i*16+j*5]=1;
      matrices[12]=2;matrices[16+13]=4;
      for(let i=0;i<count;i++) {
        vertices.set([1,0,0,1],(i+2)*16);vertices.set([0,0,1,0],(i+2)*16+4);vertices.set([i,i/2,-i,0],(i+2)*16+8);
        skin.set([128,127,0,0,0,1,255,255],(i+4)*8);
      }
      const guard=0x12345678,positions=new Uint32Array((count+5)*4).fill(guard),normals=new Uint32Array((count+7)*4).fill(guard);
      const buffers=[buffer(matrices,GPUBufferUsage.UNIFORM),buffer(vertices,GPUBufferUsage.STORAGE),buffer(skin,GPUBufferUsage.STORAGE),
        buffer(positions,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),buffer(normals,GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),
        buffer(new Float32Array([count,0,0,0,2,4,3,5]),GPUBufferUsage.UNIFORM)];
      const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:buffers.map((buffer,binding)=>({binding,resource:{buffer}}))});
      const readback=device.createBuffer({size:positions.byteLength+normals.byteLength,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
      device.pushErrorScope('validation');
      const encoder=device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.dispatchWorkgroups(2);pass.end();
      encoder.copyBufferToBuffer(buffers[3],0,readback,0,positions.byteLength);
      encoder.copyBufferToBuffer(buffers[4],0,readback,positions.byteLength,normals.byteLength);device.queue.submit([encoder.finish()]);
      await readback.mapAsync(GPUMapMode.READ);
      const error=await device.popErrorScope();if(error)throw Error(error.message);
      const words=new Uint32Array(readback.getMappedRange()),floats=new Float32Array(words.buffer);
      for(let i=0;i<positions.length/4;i++)for(let j=0;j<4;j++) {
        const active=i>=3&&i<count+3,expected=active?[i-3+256/255,(i-3)/2+508/255,-(i-3),0][j]:guard;
        if(active? !Number.isFinite(floats[i*4+j]) || Math.abs(floats[i*4+j]-expected)>1e-5 : words[i*4+j]!==guard)
          throw Error(`${name}: skinned position ${i},${j}`);
      }
      for(let i=0;i<normals.length/4;i++)for(let j=0;j<4;j++) {
        const expected=i>=5&&i<count+5?[0,0x3c00,0x3c00,0x3c000000][j]:guard;
        if(words[positions.length+i*4+j]!==expected)throw Error(`${name}: packed normal/tangent ${i},${j}`);
      }
      readback.unmap();readback.destroy();buffers.forEach(buffer=>buffer.destroy());
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
    const samplerUniforms=device.createBuffer({size:128,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
    const source=device.createTexture({size:[2,2],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});
    device.queue.writeTexture({texture:source},new Uint8Array([255,0,0,255,0,255,0,255,0,0,255,255,255,255,0,255]),{bytesPerRow:8},{width:2,height:2});
    const groups=[device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[]}),
      device.createBindGroup({layout:pipeline.getBindGroupLayout(1),entries:[{binding:0,resource:source.createView()},{binding:1,resource:device.createSampler()}]}),
      device.createBindGroup({layout:pipeline.getBindGroupLayout(2),entries:[{binding:0,resource:{buffer:uniforms}}]}),
      device.createBindGroup({layout:pipeline.getBindGroupLayout(3),entries:[{binding:0,resource:{buffer:samplerUniforms}}]})];
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
    const mipSource=device.createTexture({size:[2,2],mipLevelCount:2,format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});
    device.queue.writeTexture({texture:mipSource},new Uint8Array([255,0,0,255,255,0,0,255,255,0,0,255,255,0,0,255]),{bytesPerRow:8},[2,2]);
    device.queue.writeTexture({texture:mipSource,mipLevel:1},new Uint8Array([0,0,255,255]),{bytesPerRow:4},[1,1]);
    const mipModule=device.createShaderModule({code:`diagnostic(off, derivative_uniformity);\n${borderHelper}
      @group(1) @binding(0) var image:texture_2d<f32>; @group(1) @binding(1) var sampling:sampler;
      @fragment fn main()->@location(0) vec4f {return dolly_sample_level(dolly_samplers[0],image,sampling,vec2f(-.125,.5),.5);}`});
    const mipPipeline=await device.createRenderPipelineAsync({layout:'auto',vertex:{module:modules.get(canvas[0]),entryPoint:'main',buffers:[{arrayStride:16,attributes:[
      {shaderLocation:0,offset:0,format:'float32x2'},{shaderLocation:1,offset:8,format:'float32x2'}]}]},
      fragment:{module:mipModule,entryPoint:'main',targets:[{format:'rgba8unorm'}]},primitive:{topology:'triangle-strip'}});
    const mipGroups=[device.createBindGroup({layout:mipPipeline.getBindGroupLayout(0),entries:[]}),
      device.createBindGroup({layout:mipPipeline.getBindGroupLayout(1),entries:[{binding:0,resource:mipSource.createView()},
        {binding:1,resource:device.createSampler({minFilter:'linear',magFilter:'linear',mipmapFilter:'linear'})}]}),
      device.createBindGroup({layout:mipPipeline.getBindGroupLayout(2),entries:[{binding:0,resource:{buffer:uniforms}}]}),
      device.createBindGroup({layout:mipPipeline.getBindGroupLayout(3),entries:[{binding:0,resource:{buffer:samplerUniforms}}]})];
    for(const [mip,color,expected] of [[1,0,[32,0,48,80]],[0,0,[0,0,96,96]],[1,2,[207,175,223,255]]]) {
      device.queue.writeBuffer(samplerUniforms,0,new Uint32Array([3,1,mip,color]));
      const encoder=device.createCommandEncoder(),pass=encoder.beginRenderPass({colorAttachments:[{view:target.createView(),loadOp:'clear',storeOp:'store'}]});
      pass.setPipeline(mipPipeline);mipGroups.forEach((group,index)=>pass.setBindGroup(index,group));pass.setVertexBuffer(0,vertices);pass.draw(4);pass.end();
      encoder.copyTextureToBuffer({texture:target},{buffer:readback,bytesPerRow:256},[64,64]);device.queue.submit([encoder.finish()]);
      await readback.mapAsync(GPUMapMode.READ);const pixel=new Uint8Array(readback.getMappedRange()).slice(0,4);readback.unmap();
      if(!expected.every((n,i)=>Math.abs(pixel[i]-n)<=1))throw Error(`Border mip mismatch: ${pixel} expected ${expected}`);
    }
    // Extend UVs beyond the texture and check both axes, border colors and
    // interpolation across the edge against the four source texels.
    values[16]=0;device.queue.writeBuffer(uniforms,0,values);
    device.queue.writeBuffer(vertices,0,new Float32Array([-1,-1,-.5,1.5,1,-1,1.5,1.5,-1,1,-.5,-.5,1,1,1.5,-.5]));
    const texels=[[255,0,0,255],[0,255,0,255],[0,0,255,255],[255,255,0,255]];
    for(const [axes,linear,color,alpha,opaque] of [[3,0,0,255,0],[3,1,0,255,0],[1,1,1,255,0],[2,1,2,255,0],
      [0,0,0,0,0],[0,1,0,0,1],[3,1,0,0,1],[1,1,1,0,1]]) {
      device.queue.writeTexture({texture:source},new Uint8Array(texels.flatMap(pixel=>[...pixel.slice(0,3),alpha])),{bytesPerRow:8},[2,2]);
      const parameters=new Uint32Array(32);parameters.set([axes|(opaque?4:0),linear,0,color]);device.queue.writeBuffer(samplerUniforms,0,parameters);
      groups[1]=device.createBindGroup({layout:pipeline.getBindGroupLayout(1),entries:[
        {binding:0,resource:source.createView()},
        {binding:1,resource:device.createSampler({magFilter:linear?'linear':'nearest',minFilter:linear?'linear':'nearest'})}]});
      const encoder=device.createCommandEncoder(),pass=encoder.beginRenderPass({colorAttachments:[{view:target.createView(),loadOp:'clear',storeOp:'store'}]});
      pass.setPipeline(pipeline);groups.forEach((group,index)=>pass.setBindGroup(index,group));pass.setVertexBuffer(0,vertices);pass.draw(4);pass.end();
      encoder.copyTextureToBuffer({texture:target},{buffer:readback,bytesPerRow:256},[64,64]);device.queue.submit([encoder.finish()]);
      await readback.mapAsync(GPUMapMode.READ);const pixels=new Uint8Array(readback.getMappedRange());
      const border=color===2?[255,255,255,255]:[0,0,0,color===1?255:0];
      const texel=(x,y)=>((axes&1)&&(x<0||x>=2))||((axes&2)&&(y<0||y>=2))?border:
        [...texels[Math.max(0,Math.min(1,y))*2+Math.max(0,Math.min(1,x))].slice(0,3),opaque?255:alpha];
      for(let y=0;y<64;y++)for(let x=0;x<64;x++) {
        const u=((x+.5)/64*2-.5)*2, v=((y+.5)/64*2-.5)*2;
        let expected;
        if(!linear)expected=texel(Math.floor(u),Math.floor(v));
        else {
          const ix=Math.floor(u-.5),iy=Math.floor(v-.5),fx=u-.5-ix,fy=v-.5-iy;
          expected=[0,1,2,3].map(c=>(texel(ix,iy)[c]*(1-fx)+texel(ix+1,iy)[c]*fx)*(1-fy)+
            (texel(ix,iy+1)[c]*(1-fx)+texel(ix+1,iy+1)[c]*fx)*fy);
        }
        const at=(y*64+x)*4;
        if(!expected.every((n,i)=>Math.abs(pixels[at+i]-n)<=2))throw Error(`Border mismatch at ${x},${y}: ${pixels.slice(at,at+4)} expected ${expected}`);
      }
      readback.unmap();
    }
    device.destroy();
    return {adapter:adapterName.trim(),compiledShaders:modules.size,linkedPrograms:pairs.length,skinningVariants:computes.length,
      upstreamCanvasPixels:true,reflectionOffsets:true,grayscaleUniform:true,borderFiltering:true,borderMipFiltering:true,opaqueRGB:true,milliseconds:Math.round(performance.now()-start)};
  },{shaders,pairs:[...pairs.values()],computes,canvas,borderHelper});
  console.log(JSON.stringify({browser:browser.version(),...result}));
} finally {clearTimeout(deadline);await browser?.close();await new Promise(resolve=>server.close(resolve));}
