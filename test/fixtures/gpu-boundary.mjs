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
    check(await send(packet(99))===E.ENOTSUP,"Unknown GPU operation accepted");
    // All records must have valid byte spans before earlier records can allocate.
    const first=record(1,32,1);first.v.setBigUint64(16,16n,true);first.v.setUint32(24,8,true);
    const malformed=record(2,32,1);malformed.v.setUint32(24,32,true);malformed.v.setUint32(28,0xffffffff,true);
    check(await send(batch([first,malformed]))===E.EINVAL,"Malformed upload accepted");
    check(await send(batch([first]))===0,"Rejected batch had allocation side effects");
    // Mutable Wasm bytes must not change an admitted command's handle.
    const release=record(12,16,1);
    check(await send(batch([release]),()=>new Uint8Array(memory,address,1024).fill(255))===0,"Provider retained guest packet bytes");
    check(await send(batch([release]))===E.EBADF,"Stale resource handle accepted");
    const huge=record(1,32,2);huge.v.setBigUint64(16,67108865n,true);huge.v.setUint32(24,8,true);
    check(await send(batch([huge]))===E.ENOMEM,"GPU buffer quota bypassed");
    huge.v.setBigUint64(16,16n,true);
    check(await send(batch([huge]))===0,"Allocation refusal poisoned the scope");
    check(await send(packet(5))===0,"GPU close failed");
    check(await send(packet(3))===E.ESTALE,"Closed GPU scope accepted");
    return {malformedPacket:true,copiedPacket:true,staleHandle:true,allocationQuota:true,closedScope:true};
  } finally {worker.terminate();}
}
