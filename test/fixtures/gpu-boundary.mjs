const check=(value,message)=>{if(!value)throw Error(message);};

function gpuFixture(workerUrl=new URL("../../host/gpu/worker.mjs",import.meta.url), surface=true) {
  const heap=new WebAssembly.Memory({initial:32n,maximum:64n,shared:true,address:"i64"});
  let memory=heap.buffer, address=1024*1024;
  const control=new Int32Array(new SharedArrayBuffer(8));
  const mailbox=64, reply=new Int32Array(memory,mailbox,16);
  const worker=new Worker(workerUrl,{type:"module"});
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
    v.setUint32(0,op,true);v.setUint32(4,size,true);
    if(size>=16)v.setBigUint64(8,BigInt(id),true);
    return {bytes,v};
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
  return {worker,get memory(){return memory;},mailbox,get address(){return address;},packet,record,batch,send,
    setScope:id=>{scope=id;}, grow(){heap.grow(32n);memory=heap.buffer;address=3*1024*1024;}};
}

export async function gpuBoundaryProof({surface=true}={}) {
  const {DOLLY_ERRNO:E}=await import("../../dist/dolly-errno.mjs");
  const fixture=gpuFixture(undefined,surface);
  const {worker,mailbox,packet,record,batch,send,setScope}=fixture;
  let {memory,address}=fixture;
  try {
    check(await send(packet(1,new Uint8Array(8)))===0,"GPU open failed");
    fixture.grow();({memory,address}=fixture);
    check(await send(packet(6))===0,"GPU info failed");
    const limits=new DataView(memory,mailbox+64,80);
    const maxBuffer=limits.getBigUint64(8,true);
    check(limits.getUint32(0,true)<=1 && limits.getUint32(4,true)===16 && maxBuffer>0n && maxBuffer<=1073741824n,"GPU limits differ from the admitted contract");
    check(await send(packet(7))===0,"GPU capabilities failed");
    const capabilities=new DataView(memory,mailbox+64,128);
    check(capabilities.getUint32(0,true)&128,"Large batch capability missing");
    check(capabilities.getBigUint64(8,true)===maxBuffer && capabilities.getUint32(4,true)===4096 && capabilities.getBigUint64(16,true)===4294967296n,"GPU capability quotas differ");
    check(new Uint8Array(memory,mailbox+64+96,32).every(n=>n===0),"Nonzero reserved capabilities");
    check(await send(packet(99))===E.ENOTSUP,"Unknown GPU operation accepted");
    // All records must have valid byte spans before earlier records can allocate.
    const first=record(1,32,1);first.v.setBigUint64(16,16n,true);first.v.setUint32(24,8,true);
    const malformed=record(2,32,1);malformed.v.setUint32(24,32,true);malformed.v.setUint32(28,0xffffffff,true);
    check(await send(batch([first,malformed]))===E.EINVAL,"Malformed upload accepted");
    check(await send(batch([...Array(1023).fill(first),malformed]))===E.EINVAL,"Late malformed record in large batch accepted");
    check(await send(batch(Array(1025).fill(first)))===E.E2BIG,"GPU command quota bypassed");
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
    huge.v.setBigUint64(16,0x1fffffffffffffn,true);
    check(await send(batch([huge]))===E.ENOMEM,"Largest exact GPU integer was misdecoded");
    for(const size of [0x20000000000000n,0xffffffffffffffffn]) {
      huge.v.setBigUint64(16,size,true);
      check(await send(batch([huge]))===E.EINVAL,"Inexact GPU integer reached allocation");
    }
    huge.v.setBigUint64(16,16n,true);
    check(await send(batch([huge]))===0,"Allocation refusal poisoned the scope");
    const wideWrite=record(2,40,2);wideWrite.v.setUint32(28,4,true);
    for(const offset of [0x100000000n,0x1fffffffffffffn,0x20000000000000n,0xffffffffffffffffn]) {
      wideWrite.v.setBigUint64(16,offset,true);
      check(await send(batch([wideWrite]))===E.EINVAL,"Wide GPU offset escaped its buffer range");
    }
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
    setScope(9);
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
    // Exercise the full command and timestamp capacity, then verify the pixels.
    check(await send(batch([...Array(1021).fill(draw),capture,submit,fm]))===0,"Maximum render batch failed");
    readView.setBigUint64(0,1n,true);readView.setBigUint64(16,512n,true);
    check(await send(packet(4,body))===0,"Captured pixels readback failed");
    const pixels=new Uint8Array(memory,mailbox+64,512),expected=features&32?[0,64,255,255]:[255,64,0,255];
    for(const at of [0,4,256,260])check(expected.every((n,i)=>Math.abs(pixels[at+i]-n)<=1),"Wrong captured colors or row stride");
    check(await send(packet(5))===0,"Capture scope close failed");
    } else {
      const size=new Uint8Array(8);new DataView(size.buffer).setUint32(0,64,true);new DataView(size.buffer).setUint32(4,64,true);
      setScope(9);check(await send(packet(1,size))===E.ENOSYS,"Headless GPU accepted a display surface");
    }
    setScope(17);check(await send(packet(1,new Uint8Array(8)))===0,"Validation scope open failed");
    const invalidUsage=record(1,32,1);invalidUsage.v.setBigUint64(16,16n,true);invalidUsage.v.setUint32(24,129,true);
    // MAP_READ | STORAGE passes packet checks but WebGPU rejects the combination.
    for(const id of [1,2]){invalidUsage.v.setBigUint64(8,BigInt(id),true);check(await send(batch([invalidUsage]))===E.EINVAL,"WebGPU validation error was not reported");}
    invalidUsage.v.setBigUint64(8,3n,true);invalidUsage.v.setUint32(24,8,true);
    check(await send(batch([invalidUsage]))===0,"Validation failure leaked into the next batch");
    check(await send(packet(5))===0,"Validation scope close failed");
    return {largeBatch:true,commandQuota:true,integerRanges:true,memoryGrowth:true,surfaceCapture:surface,captureBounds:surface,captureOwnership:surface,headlessCompute:!surface,malformedPacket:true,vertexLayout:true,bindingLimit:true,info:true,copiedPacket:true,staleHandle:true,allocationQuota:true,capabilities:true,computeConstants:true,closedScope:true,deviceValidation:true};
  } finally {worker.terminate();}
}

export async function gpuRetirementProof() {
  const {DOLLY_ERRNO:E}=await import("../../dist/dolly-errno.mjs");
  const {worker,memory,mailbox,packet,record,batch,send,setScope}=gpuFixture(
    new URL("./gpu-retirement-worker.mjs",import.meta.url));
  const create=id=>{
    const r=record(1,32,id);r.v.setBigUint64(16,16n,true);r.v.setUint32(24,8,true);return r;
  };
  const upload=id=>{
    const r=record(2,40,id);r.v.setUint32(24,32,true);r.v.setUint32(28,4,true);return r;
  };
  const allocated=async()=>{
    check(await send(packet(6))===0,"Retirement info failed");
    return new DataView(memory,mailbox+64,80).getBigUint64(72,true);
  };
  try {
    check(await send(packet(1,new Uint8Array(8)))===0,"Retirement scope open failed");
    check(await send(packet(7))===0,"Retirement capabilities failed");
    const limit=new DataView(memory,mailbox+64,128).getUint32(4,true);
    for(let base=0;base<limit;base+=1024)
      check(await send(batch(Array.from({length:Math.min(1024,limit-base)},(_,i)=>create(base+i+1))))===0,"Object quota setup failed");
    check(await send(batch([upload(1)]))===0,"Retirement upload failed");
    for(let base=0;base<limit;base+=1024)
      check(await send(batch(Array.from({length:Math.min(1024,limit-base)},(_,i)=>record(12,16,base+i+1))))===0,"Release waited for held queue completion");
    check(await send(batch([upload(1)]))===E.EBADF,"Released buffer handle remained usable");
    check(await allocated()===BigInt(limit*16),"Released allocations stopped counting before completion");
    check(await send(batch([create(limit+1)]))===E.ENOSPC,"Pending retirement bypassed object quota");
    worker.postMessage({type:"test-completion",hold:false});
    const end=performance.now()+10000;
    while(await allocated()!==0n) {
      check(performance.now()<end,"Completed allocations were never reclaimed");
      await new Promise(resolve=>setTimeout(resolve,10));
    }
    check(await send(batch([create(limit+1)]))===0,"Retired object slot was not reusable");
    worker.postMessage({type:"test-completion",hold:true});
    check(await send(batch([upload(limit+1),record(12,16,limit+1)]))===0,"Second retirement failed");
    worker.postMessage({type:"test-phase",phase:"close"});
    const fenced=new Promise(resolve=>worker.addEventListener("message",function listener({data}) {
      if(data.type!=="test-fence"||data.phase!=="close")return;
      worker.removeEventListener("message",listener);resolve();
    }));
    let closed=false;
    const closing=send(packet(5)).then(status=>{closed=true;return status;});
    await fenced;
    check(!closed,"Close released the scope before outstanding work settled");
    worker.postMessage({type:"test-completion",hold:false});
    check(await closing===0,"Retirement close failed");
    setScope(9);
    check(await send(packet(1,new Uint8Array(8)))===0,"Retirement scope restart failed");
    check(await allocated()===0n,"Close and fence completion charged allocations twice");
    check(await send(packet(5))===0,"Restarted scope close failed");
    return {nonblockingRelease:true,staleHandles:true,retiredBytesCharged:true,retiredObjectsCharged:true,closeAndRestart:true};
  } finally {worker.terminate();}
}

export async function gpuSubmissionProof() {
  const {worker,packet,record,batch,send}=gpuFixture(
    new URL("./gpu-retirement-worker.mjs",import.meta.url));
  let submitted=0,held=0,finished=false;
  worker.addEventListener("message",({data})=>{
    if(data.type==="test-submit")submitted++;
    if(data.type==="test-held")held++;
  });
  try {
    check(await send(packet(1,new Uint8Array(8)))===0,"Submission scope open failed");
    const buffers=[1,2].map(id=>{
      const r=record(1,32,id);r.v.setBigUint64(16,16n,true);r.v.setUint32(24,12,true);return r;
    });
    check(await send(batch(buffers))===0,"Submission buffers failed");
    const copy=record(9,48,1);copy.v.setBigUint64(16,2n,true);copy.v.setBigUint64(40,16n,true);
    const submit=record(13,8);
    const completion=send(batch(Array.from({length:4},()=>[copy,submit]).flat()))
      .then(status=>{finished=true;return status;});
    const deadline=performance.now()+10000;
    while(held<3) {
      check(performance.now()<deadline,"GPU submissions never reached the limit");
      await new Promise(resolve=>setTimeout(resolve,1));
    }
    check(submitted===3&&!finished,"More than three submissions ran without completion");
    worker.postMessage({type:"test-completion",count:1});
    check(await completion===0,"The oldest completion did not admit the next submission");
    while(held<4) {
      check(performance.now()<deadline,"The fourth completion was never held");
      await new Promise(resolve=>setTimeout(resolve,1));
    }
    check(submitted===4,"The fourth submission did not reach the GPU");
    worker.postMessage({type:"test-completion",hold:false});
    check(await send(packet(5))===0,"Submission scope close failed");
    return {boundedSubmissions:true,oldestCompletionUnblocks:true};
  } finally {worker.terminate();}
}
