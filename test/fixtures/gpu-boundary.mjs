export async function gpuBoundaryProof() {
  const {DOLLY_ERRNO:E}=await import("../../dist/dolly-errno.mjs");
  const check=(value,message)=>{if(!value)throw Error(message);};
  const memory=new SharedArrayBuffer(2*1024*1024), control=new Int32Array(new SharedArrayBuffer(8));
  const mailbox=64, address=1024*1024, reply=new Int32Array(memory,mailbox,16);
  const worker=new Worker(new URL("../../src/gpu-worker.mjs",import.meta.url),{type:"module"});
  const canvas=new OffscreenCanvas(64,64);
  worker.postMessage({type:"configure",memory,mailbox,control:control.buffer,canvas},[canvas]);
  let sequence=0;
  function packet(op,body=[]) {
    const bytes=new Uint8Array(32+body.length),v=new DataView(bytes.buffer);
    v.setUint32(4,op,true);v.setBigUint64(8,1n,true);v.setBigUint64(16,BigInt(++sequence),true);
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
    check(await send(packet(5))===0,"GPU close failed");
    check(await send(packet(3))===E.ESTALE,"Closed GPU scope accepted");
    return {malformedPacket:true,vertexLayout:true,bindingLimit:true,info:true,copiedPacket:true,staleHandle:true,allocationQuota:true,capabilities:true,computeConstants:true,closedScope:true};
  } finally {worker.terminate();}
}
