export async function gpuBoundaryProof({ surface = true } = {}) {
  const {DOLLY_ERRNO:E}=await import("../../dist/dolly-errno.mjs");
  const check=(value,message)=>{if(!value)throw Error(message);};
  const heap=new WebAssembly.Memory({initial:32n,maximum:64n,shared:true,address:"i64"});
  let memory=heap.buffer;
  const control=new Int32Array(new SharedArrayBuffer(8));
  const mailbox=64, reply=new Int32Array(memory,mailbox,16);
  let address=1024*1024;
  const worker=new Worker(new URL("../../src/gpu-worker.mjs",import.meta.url),{type:"module"});
  const canvas=surface?new OffscreenCanvas(64,64):undefined;
  worker.postMessage({type:"configure",memory:heap,mailbox,control:control.buffer,canvas},canvas?[canvas]:[]);
  let sequence=0,scope=1;
  function packet(op,body=[]) {
    const bytes=new Uint8Array(32+body.length),v=new DataView(bytes.buffer);
    v.setUint32(4,op,true);v.setBigUint64(8,BigInt(scope),true);v.setBigUint64(16,BigInt(++sequence),true);
    v.setUint32(24,body.length,true);bytes.set(body,32);return bytes;
  }
  function record(op,size,id) {
    const bytes=new Uint8Array(size),v=new DataView(bytes.buffer);
    v.setUint32(0,op,true);v.setUint32(4,size,true);v.setBigUint64(8,BigInt(id),true);return {bytes,v};
  }
  function batch(records) {
    const body=new Uint8Array(8+records.reduce((n,r)=>n+r.bytes.length,0));
    new DataView(body.buffer).setUint32(0,records.length,true);let at=8;
    for(const r of records){body.set(r.bytes,at);at+=r.bytes.length;}return packet(2,body);
  }
  async function send(bytes, mutate) {
    new Uint8Array(memory,address,bytes.length).set(bytes);Atomics.store(reply,0,0);Atomics.store(control,0,1);
    worker.postMessage({type:"request",address,bytes:bytes.length});
    const admission=Atomics.waitAsync(control,0,1,5000);await admission.value;
    check(Atomics.load(control,0)===0,"GPU admission timed out");
    if(Atomics.load(control,1)<0)return -Atomics.load(control,1);
    mutate?.();
    const end=performance.now()+10000;
    while(!Atomics.load(reply,0) && performance.now()<end)await new Promise(r=>setTimeout(r,1));
    check(Atomics.load(reply,0)===1,"GPU completion timed out");return Atomics.load(reply,3);
  }
  try {
    check(await send(packet(1,new Uint8Array(8)))===0,"GPU open failed");
    heap.grow(32n);memory=heap.buffer;address=3*1024*1024;
    check(await send(packet(6))===0,"GPU info failed");
    const limits=new DataView(memory,mailbox+64,80);
    const maxBuffer=limits.getBigUint64(8,true);
    check(limits.getUint32(0,true)<=1 && limits.getUint32(4,true)===16 && maxBuffer>0n && maxBuffer<=1073741824n,"GPU limits differ from the admitted contract");
    check(await send(packet(7))===0,"GPU capabilities failed");
    const capabilities=new DataView(memory,mailbox+64,128);
    check(capabilities.getBigUint64(8,true)===maxBuffer && capabilities.getUint32(4,true)===4096 && capabilities.getBigUint64(16,true)===4294967296n,"GPU capability quotas differ");
    check(new Uint8Array(memory,mailbox+64+96,32).every(n=>n===0),"Nonzero reserved capabilities");
    check(await send(packet(99))===E.ENOTSUP,"Unknown GPU operation accepted");
    // All records must have valid byte spans before earlier records can allocate.
    const first=record(1,32,1);first.v.setBigUint64(16,16n,true);first.v.setUint32(24,8,true);
    const malformed=record(2,32,1);malformed.v.setUint32(24,32,true);malformed.v.setUint32(28,0xffffffff,true);
    check(await send(batch([first,malformed]))===E.EINVAL,"Malformed upload accepted");
    const vertex=record(14,72,2);vertex.v.setUint32(32,1,true);vertex.v.setUint32(36,1,true);
    vertex.v.setUint32(40,16,true);vertex.v.setUint32(44,1,true);vertex.v.setUint32(52,4,true);vertex.v.setUint32(56,4,true);
    vertex.bytes[64]=118;vertex.bytes[65]=102;
    check(await send(batch([first,vertex]))===E.EINVAL,"Vertex attribute beyond stride accepted");
    const group=record(6,32+17*24,2);group.v.setUint32(24,17,true);
    check(await send(batch([first,group]))===E.EINVAL,"Binding count limit bypassed");
    check(await send(batch([first]))===0,"Rejected batch had allocation side effects");
    // Mutable Wasm bytes must not change an admitted command's handle.
    const release=record(12,16,1);
    check(await send(batch([release]),()=>new Uint8Array(memory,address,1024).fill(255))===0,"Provider retained guest packet bytes");
    check(await send(batch([release]))===E.EBADF,"Stale resource handle accepted");
    const huge=record(1,32,2);huge.v.setBigUint64(16,maxBuffer+1n,true);huge.v.setUint32(24,8,true);
    check(await send(batch([huge]))===E.ENOMEM,"GPU buffer quota bypassed");
    huge.v.setBigUint64(16,16n,true);
    check(await send(batch([huge]))===0,"Allocation refusal poisoned the scope");
    const storage=record(1,32,3);storage.v.setBigUint64(16,16n,true);storage.v.setUint32(24,140,true);
    const readback=record(1,32,4);readback.v.setBigUint64(16,16n,true);readback.v.setUint32(24,9,true);
    const code=new TextEncoder().encode('@group(0) @binding(0) var<storage,read_write> out:array<f32>; override scale:f32; @compute @workgroup_size(1) fn main(@builtin(global_invocation_id)i:vec3u){out[i.x]=f32(i.x)*scale+1.0;}');
    const shader=record(3,(24+code.length+7)&~7,5);shader.v.setUint32(16,code.length,true);shader.bytes.set(code,24);
    const pipeline=record(16,64,6);pipeline.v.setBigUint64(16,5n,true);pipeline.v.setUint32(24,4,true);pipeline.v.setUint32(28,1,true);
    pipeline.bytes.set(new TextEncoder().encode('main'),32);pipeline.v.setUint32(40,5,true);pipeline.v.setFloat64(48,NaN,true);pipeline.bytes.set(new TextEncoder().encode('scale'),56);
    check(await send(batch([storage,readback,shader,pipeline]))===E.EINVAL,"Nonfinite shader constant accepted");
    pipeline.v.setFloat64(48,3,true);
    const bindings=record(6,56,7);bindings.v.setBigUint64(16,6n,true);bindings.v.setUint32(24,1,true);bindings.v.setBigUint64(32,3n,true);bindings.v.setBigUint64(48,16n,true);
    const compute=record(8,40,6);compute.v.setBigUint64(16,7n,true);[4,1,1].forEach((n,i)=>compute.v.setUint32(24+i*4,n,true));
    const copy=record(9,48,3);copy.v.setBigUint64(16,4n,true);copy.v.setBigUint64(40,16n,true);
    const submit={bytes:new Uint8Array(8)};new DataView(submit.bytes.buffer).setUint32(0,13,true);new DataView(submit.bytes.buffer).setUint32(4,8,true);
    const map=record(10,32,4);map.v.setBigUint64(24,16n,true);
    check(await send(batch([storage,readback,shader,pipeline,bindings,compute,copy,submit,map]))===0,"Compute with override constants failed");
    const body=new Uint8Array(24),readView=new DataView(body.buffer);readView.setBigUint64(0,4n,true);readView.setBigUint64(16,16n,true);
    check(await send(packet(4,body))===0,"Compute readback failed");
    check([...new Float32Array(memory,mailbox+64,4)].join(',')==='1,4,7,10',"Wrong compute override result");
    const capture=record(17,32,4);capture.v.setUint32(24,2,true);capture.v.setUint32(28,2,true);
    check(await send(batch([capture]))===E.EINVAL,"Compute-only scope captured a surface");
    check(await send(packet(5))===0,"GPU close failed");
    check(await send(packet(3))===E.ESTALE,"Closed GPU scope accepted");
    if (surface) {
    scope=9;
    const surface=new Uint8Array(8);new DataView(surface.buffer).setUint32(0,64,true);new DataView(surface.buffer).setUint32(4,64,true);
    check(await send(packet(1,surface))===0,"Surface scope open failed");
    check(await send(packet(7))===0,"Capture capabilities failed");
    const features=new DataView(memory,mailbox+64,128).getUint32(0,true);
    check(features&16,"Capture capability missing");
    const frame=record(1,32,1);frame.v.setBigUint64(16,512n,true);frame.v.setUint32(24,9,true);
    const renderCode=new TextEncoder().encode('@vertex fn v(@builtin(vertex_index)i:u32)->@builtin(position)vec4f {let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));return vec4f(p[i],0,1);} @fragment fn f()->@location(0)vec4f{return vec4f(1,.25,0,1);}');
    const rs=record(3,(24+renderCode.length+7)&~7,2);rs.v.setUint32(16,renderCode.length,true);rs.bytes.set(renderCode,24);
    const rp=record(4,48,3);rp.v.setBigUint64(16,2n,true);rp.v.setUint32(32,1,true);rp.v.setUint32(36,1,true);rp.bytes.set([118,102],40);
    check(await send(batch([frame,rs,rp]))===0,"Capture resources failed");
    capture.v.setBigUint64(8,1n,true);
    check(await send(batch([capture]))===E.EINVAL,"Capture without render accepted");
    const draw=record(7,64,3);[3,1,64,64].forEach((n,i)=>draw.v.setUint32(24+i*4,n,true));draw.v.setUint32(56,1,true);
    capture.v.setUint32(16,63,true);
    check(await send(batch([draw,capture,submit]))===E.EINVAL,"Out-of-bounds capture accepted");
    capture.v.setUint32(16,5,true);capture.v.setUint32(20,7,true);
    capture.v.setUint32(28,4,true);
    check(await send(batch([draw,capture,submit]))===E.EINVAL,"Undersized capture buffer accepted");
    capture.v.setUint32(28,2,true);
    capture.v.setBigUint64(8,4n,true);
    check(await send(batch([draw,capture,submit]))===E.EBADF,"Foreign capture buffer accepted");
    capture.v.setBigUint64(8,1n,true);
    const fm=record(10,32,1);fm.v.setBigUint64(24,512n,true);
    check(await send(batch([draw,capture,submit,fm]))===0,"Rendered frame capture failed");
    readView.setBigUint64(0,1n,true);readView.setBigUint64(16,512n,true);
    check(await send(packet(4,body))===0,"Captured pixels readback failed");
    const pixels=new Uint8Array(memory,mailbox+64,512),expected=features&32?[0,64,255,255]:[255,64,0,255];
    for(const at of [0,4,256,260])check(expected.every((n,i)=>Math.abs(pixels[at+i]-n)<=1),"Wrong captured colors or row stride");
    check(await send(packet(5))===0,"Capture scope close failed");
    } else {
      const size=new Uint8Array(8);new DataView(size.buffer).setUint32(0,64,true);new DataView(size.buffer).setUint32(4,64,true);
      scope=9;check(await send(packet(1,size))===E.ENOSYS,"Headless GPU accepted a display surface");
    }
    scope=17;check(await send(packet(1,new Uint8Array(8)))===0,"Validation scope open failed");
    const invalidUsage=record(1,32,1);invalidUsage.v.setBigUint64(16,16n,true);invalidUsage.v.setUint32(24,129,true);
    // MAP_READ | STORAGE passes packet checks but WebGPU rejects the combination.
    for(const id of [1,2]){invalidUsage.v.setBigUint64(8,BigInt(id),true);check(await send(batch([invalidUsage]))===E.EINVAL,"WebGPU validation error was not reported");}
    invalidUsage.v.setBigUint64(8,3n,true);invalidUsage.v.setUint32(24,8,true);
    check(await send(batch([invalidUsage]))===0,"Validation failure leaked into the next batch");
    check(await send(packet(5))===0,"Validation scope close failed");
    return {memoryGrowth:true,surfaceCapture:surface,captureBounds:surface,captureOwnership:surface,headlessCompute:!surface,malformedPacket:true,vertexLayout:true,bindingLimit:true,info:true,copiedPacket:true,staleHandle:true,allocationQuota:true,capabilities:true,computeConstants:true,closedScope:true,deviceValidation:true};
  } finally {worker.terminate();}
}
