// Same 64x64 uniform upload + triangle as gpu-demo --bench, without Dolly RPC.
async function directGpuBenchmark(canvas) {
  const adapter=await navigator.gpu.requestAdapter({powerPreference:"high-performance"});
  const device=await adapter.requestDevice();
  const context=canvas.getContext("webgpu");
  const format=navigator.gpu.getPreferredCanvasFormat();context.configure({device,format,alphaMode:"opaque"});
  const module=device.createShaderModule({code:"@group(0) @binding(0) var<uniform> color:vec4f; @vertex fn vs(@builtin(vertex_index) i:u32)->@builtin(position) vec4f{return vec4f(f32((i<<1u)&2u)*2.-1.,f32(i&2u)*2.-1.,0,1);} @fragment fn fs()->@location(0) vec4f{return color;}"});
  const pipeline=await device.createRenderPipelineAsync({layout:"auto",vertex:{module,entryPoint:"vs"},fragment:{module,entryPoint:"fs",targets:[{format}]},primitive:{topology:"triangle-list"}});
  const buffer=device.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer,offset:0,size:16}}]});
  const color=new Float32Array([.2,.4,.6,1]),samples=[];let inflight=0;
  try {
    for(let sample=0;sample<4;sample++) {
      const start=performance.now();
      for(let i=0;i<200;i++) {
        if(inflight>=3)await device.queue.onSubmittedWorkDone();
        device.pushErrorScope("validation");device.pushErrorScope("out-of-memory");
        device.queue.writeBuffer(buffer,0,color);
        const encoder=device.createCommandEncoder();
        const pass=encoder.beginRenderPass({colorAttachments:[{view:context.getCurrentTexture().createView(),clearValue:[0,0,0,0],loadOp:"clear",storeOp:"store"}]});
        pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.draw(3,1);pass.end();device.queue.submit([encoder.finish()]);
        inflight++;device.queue.onSubmittedWorkDone().finally(()=>inflight--);
        const oom=await device.popErrorScope(),validation=await device.popErrorScope();if(oom||validation)throw Error((oom||validation).message);
      }
      await device.queue.onSubmittedWorkDone();if(sample)samples.push((performance.now()-start)*1000/200);
    }
    return samples;
  } finally {buffer.destroy();device.destroy();}
}

self.onmessage=({data})=>directGpuBenchmark(data.canvas)
  .then(result=>postMessage({result}),error=>postMessage({error:String(error)}));
