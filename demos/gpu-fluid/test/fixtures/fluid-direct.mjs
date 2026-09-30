// Replay captured upstream workload inputs through browser WebGPU, without the
// Dolly process/kernel/worker admission path. This is not a native C benchmark.
self.onmessage=async({data:{packets,canvas}})=>{
 let device;
 try {
  const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
  const timing=adapter.features.has('timestamp-query');
  device=await adapter.requestDevice({requiredFeatures:timing?['timestamp-query']:[]});
  const context=canvas.getContext('webgpu'),format=navigator.gpu.getPreferredCanvasFormat();
  context.configure({device,format,alphaMode:'opaque'});
  const objects=new Map(),decode=new TextDecoder();
  const timers=timing?Array.from({length:3},()=>({query:device.createQuerySet({type:'timestamp',count:512}),resolve:device.createBuffer({size:4096,usage:512|4}),read:device.createBuffer({size:4096,usage:1|8}),busy:false})):[];
  let frames=0,inflight=0,gpuTotal=0,gpuSamples=0,start,baseFrames,baseGpu,baseSamples,result,readbackSum=0,readbackNonzero=0;
  const pending=new Set();
  for(const raw of packets){
   const bytes=new Uint8Array(raw),v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),op=v.getUint32(4,true);
   const u64=(view,o)=>Number(view.getBigUint64(o,true));
   if(op===1){canvas.width=v.getUint32(32,true);canvas.height=v.getUint32(36,true);continue;}
   if(op===3){await device.queue.onSubmittedWorkDone();await Promise.all(pending);continue;}
   if(op===6&&frames){
    if(start===undefined){start=performance.now();baseFrames=frames;baseGpu=gpuTotal;baseSamples=gpuSamples;}
    else if(!result)result={wall_ms:(performance.now()-start)/(frames-baseFrames),gpu_ms:gpuSamples>baseSamples?(gpuTotal-baseGpu)/(gpuSamples-baseSamples):-1,gpu_samples:gpuSamples-baseSamples,steps:frames-baseFrames};
    continue;
   }
   if(op===4){const r=objects.get(u64(v,32));const a=new Float32Array(r.mapped,u64(v,40),u64(v,48)/4);for(const f of a){if(!Number.isFinite(f))throw Error('Non-finite replay output');readbackSum+=f;if(Math.abs(f)>1e-6)readbackNonzero++;}continue;}
   if(op!==2)continue;
   if(inflight>=3)await device.queue.onSubmittedWorkDone();
   device.pushErrorScope('validation');device.pushErrorScope('out-of-memory');
   let encoder,compute,texture,timer,queries=0;
   const encode=()=>encoder??=device.createCommandEncoder();
   const endCompute=()=>{compute?.end();compute=null;};
   const stamps=()=>{timer??=timers.find(t=>!t.busy);return timer?{timestampWrites:{querySet:timer.query,beginningOfPassWriteIndex:queries++,endOfPassWriteIndex:queries++}}:{};};
   for(let i=0,at=40;i<v.getUint32(32,true);i++){
    const code=v.getUint32(at,true),length=v.getUint32(at+4,true),w=new DataView(bytes.buffer,bytes.byteOffset+at,length),b=new Uint8Array(bytes.buffer,bytes.byteOffset+at,length);
    const id=length>=16?u64(w,8):0;
    if(code!==8)endCompute();
    if(code===1)objects.set(id,{value:device.createBuffer({size:u64(w,16),usage:w.getUint32(24,true)})});
    else if(code===2)device.queue.writeBuffer(objects.get(id).value,u64(w,16),b.subarray(w.getUint32(24,true),w.getUint32(24,true)+w.getUint32(28,true)));
    else if(code===3){const value=device.createShaderModule({code:decode.decode(b.subarray(24,24+w.getUint32(16,true)))});await value.getCompilationInfo();objects.set(id,{value});}
    else if(code===4||code===14){
     const a=w.getUint32(32,true),f=w.getUint32(36,true),module=objects.get(u64(w,16)).value;let entry=40,buffers=[];
     if(code===14){const attributes=[];for(let j=0;j<w.getUint32(44,true);j++){const p=48+j*16;attributes.push({shaderLocation:w.getUint32(p,true),format:`float32x${w.getUint32(p+4,true)}`,offset:w.getUint32(p+8,true)});}entry=48+attributes.length*16;buffers=[{arrayStride:w.getUint32(40,true),stepMode:'vertex',attributes}];}
     objects.set(id,{value:await device.createRenderPipelineAsync({layout:'auto',vertex:{module,entryPoint:decode.decode(b.subarray(entry,entry+a)),buffers},fragment:{module,entryPoint:decode.decode(b.subarray(entry+a,entry+a+f)),targets:[{format}]},primitive:{topology:'triangle-list'}})});
    } else if(code===5)objects.set(id,{value:await device.createComputePipelineAsync({layout:'auto',compute:{module:objects.get(u64(w,16)).value,entryPoint:decode.decode(b.subarray(32,32+w.getUint32(24,true)))}})});
    else if(code===6){const entries=[];for(let j=0;j<w.getUint32(24,true);j++){const p=32+j*24;entries.push({binding:j,resource:{buffer:objects.get(u64(w,p)).value,offset:u64(w,p+8),size:u64(w,p+16)}});}objects.set(id,{value:device.createBindGroup({layout:objects.get(u64(w,16)).value.getBindGroupLayout(0),entries})});}
    else if(code===8){compute??=encode().beginComputePass(stamps());compute.setPipeline(objects.get(id).value);compute.setBindGroup(0,objects.get(u64(w,16)).value);compute.dispatchWorkgroups(w.getUint32(24,true),w.getUint32(28,true),w.getUint32(32,true));}
    else if(code===9)encode().copyBufferToBuffer(objects.get(id).value,u64(w,24),objects.get(u64(w,16)).value,u64(w,32),u64(w,40));
    else if(code===7||code===15){
     texture??=context.getCurrentTexture();const pass=encode().beginRenderPass({...stamps(),colorAttachments:[{view:texture.createView(),clearValue:[40,44,48,52].map(o=>w.getFloat32(o,true)),loadOp:w.getUint32(56,true)?'clear':'load',storeOp:'store'}]});
     pass.setPipeline(objects.get(id).value);pass.setBindGroup(0,objects.get(u64(w,16)).value);if(code===15)pass.setVertexBuffer(0,objects.get(u64(w,64)).value,u64(w,72),u64(w,80));pass.draw(w.getUint32(24,true),w.getUint32(28,true));pass.end();
    } else if(code===13){
     const measured=queries?timer:null,count=queries;
     if(measured){encoder.resolveQuerySet(measured.query,0,count,measured.resolve,0);encoder.copyBufferToBuffer(measured.resolve,0,measured.read,0,count*8);measured.busy=true;}
     if(inflight>=3)await device.queue.onSubmittedWorkDone();
     device.queue.submit([encoder.finish()]);inflight++;device.queue.onSubmittedWorkDone().finally(()=>inflight--);
     encoder=null;if(texture)frames++;texture=null;
     if(measured){const promise=measured.read.mapAsync(1,0,count*8).then(()=>{const a=new BigUint64Array(measured.read.getMappedRange(0,count*8));let ns=0n;for(let j=0;j<count;j+=2)if(a[j+1]>=a[j])ns+=a[j+1]-a[j];gpuTotal+=Number(ns)/1e6;gpuSamples++;measured.read.unmap();}).finally(()=>{measured.busy=false;pending.delete(promise);});pending.add(promise);}
     queries=0;timer=null;
    } else if(code===10){const r=objects.get(id);await r.value.mapAsync(1,u64(w,16),u64(w,24));r.mapped=r.value.getMappedRange(u64(w,16),u64(w,24));}
    else if(code===11){objects.get(id).value.unmap();objects.get(id).mapped=null;}
    else if(code===12){objects.get(id).value.destroy?.();objects.delete(id);}
    else throw Error(`Unexpected replay opcode ${code}`);
    at+=length;
   }
   endCompute();const oom=await device.popErrorScope(),invalid=await device.popErrorScope();if(oom||invalid)throw Error((oom??invalid).message);
  }
  await device.queue.onSubmittedWorkDone();await Promise.all(pending);
  if(!result)throw Error('No measured fluid frames captured');
  postMessage({result:{...result,readbackSum,readbackNonzero,adapter:[adapter.info.vendor,adapter.info.architecture].join(' '),baseline:'Direct browser replay of identical upstream GPU commands and data'}});
 } catch(error){postMessage({error:String(error.stack??error)});}
 finally {device?.destroy();}
};
