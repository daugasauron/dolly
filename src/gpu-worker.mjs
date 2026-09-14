import * as A from "./gpu-abi.mjs";
import { DOLLY_ERRNO as E } from "../dist/dolly-errno.mjs";

const decode = new TextDecoder("utf-8", { fatal: true });
const encode = new TextEncoder();
const fail = (code, message) => { throw Object.assign(new Error(message), { errno: code }); };
const ensure = (condition, message, code = E.EINVAL) => { if (!condition) fail(code, message); };
const maxBytes = 4 * 1024 ** 3, bufferCeiling = 1024 ** 3, maxObjects = 4096;
let maxBuffer = bufferCeiling, capabilities;
const slots = Array(A.DOLLY_GPU_SLOTS).fill(null), generations = slots.map(() => 0);
let memory, mailbox, control, canvas, context, device, format, adapterName = "WebGPU";
let usedBytes = 0, serial = Promise.resolve(), initializing;
const stats = { packets: 0, packetBytes: 0, frames: 0, dispatches: 0, readbackBytes: 0, batchWallMilliseconds: 0 };

async function getDevice() {
  if (device) return device;
  if (initializing) return initializing;
  initializing = (async () => {
    ensure(navigator.gpu, "This browser has no WebGPU provider", E.ENOSYS);
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    ensure(adapter, "This browser did not provide a GPU adapter", E.ENODEV);
    adapterName = [adapter.info?.vendor, adapter.info?.architecture, adapter.info?.description].filter(Boolean).join(" ") || "WebGPU adapter";
    const requiredFeatures = ["timestamp-query", "shader-f16", "subgroups"].filter(name => adapter.features.has(name));
    const requiredLimits = {};
    for (const [name, ceiling] of Object.entries({maxBufferSize: bufferCeiling,
      maxStorageBufferBindingSize: bufferCeiling, maxStorageBuffersPerShaderStage: A.DOLLY_GPU_MAX_BINDINGS,
      maxComputeWorkgroupStorageSize: 65536, maxComputeInvocationsPerWorkgroup: 1024,
      maxComputeWorkgroupSizeX: 1024, maxComputeWorkgroupSizeY: 1024})) {
      requiredLimits[name] = Math.min(adapter.limits[name], ceiling);
    }
    const created = await adapter.requestDevice({requiredFeatures, requiredLimits});
    maxBuffer = created.limits.maxBufferSize;
    const l = created.limits;
    capabilities = new Uint8Array(128);
    const v = new DataView(capabilities.buffer);
    v.setUint32(0, (created.features.has("shader-f16") ? 1 : 0) | (created.features.has("subgroups") ? 2 : 0) |
      (navigator.gpu.wgslLanguageFeatures?.has("packed_4x8_integer_dot_product") ? 4 : 0) |
      (created.features.has("timestamp-query") ? 8 : 0), true);
    v.setUint32(4, maxObjects, true);
    [maxBuffer, maxBytes, l.maxStorageBufferBindingSize].forEach((n,i) => v.setBigUint64(8+i*8, BigInt(n), true));
    [l.minUniformBufferOffsetAlignment, l.minStorageBufferOffsetAlignment, l.maxComputeWorkgroupStorageSize,
      l.maxComputeInvocationsPerWorkgroup, l.maxComputeWorkgroupSizeX, l.maxComputeWorkgroupSizeY,
      l.maxComputeWorkgroupSizeZ, l.maxComputeWorkgroupsPerDimension, A.DOLLY_GPU_MAX_BINDINGS,
      l.maxStorageBuffersPerShaderStage, l.maxUniformBuffersPerShaderStage, l.maxBindGroups]
      .forEach((n,i) => v.setUint32(32+i*4,n,true));
    v.setBigUint64(80,BigInt(l.maxUniformBufferBindingSize),true);
    v.setUint32(88,adapter.info?.subgroupMinSize ?? 4,true);
    v.setUint32(92,adapter.info?.subgroupMaxSize ?? 128,true);
    device = created;
    format = navigator.gpu.getPreferredCanvasFormat();
    context = canvas.getContext("webgpu");
    ensure(context, "WebGPU canvas unavailable", E.ENOSYS);
    context.configure({ device, format, alphaMode: "opaque" });
    created.lost.then(info => {
      if (device !== created) return;
      device = null;
      for (const scope of slots) if (scope) scope.lost = true;
      postMessage({ type: "status", active: false, error: `GPU device lost: ${info.message}` });
    });
    return created;
  })();
  try { return await initializing; } finally { initializing = null; }
}

function integer(v, o) {
  const n = v.getBigUint64(o, true);
  ensure(n <= BigInt(Number.MAX_SAFE_INTEGER), "GPU integer exceeds host range");
  return Number(n);
}
function header(bytes) {
  ensure(bytes.length >= 32, "Short GPU packet");
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const scope = integer(v, 8), sequence = integer(v, 16);
  ensure(v.getUint32(0, true) === 0 && v.getUint32(28, true) === 0 &&
    v.getUint32(24, true) === bytes.length - 32 && scope > 0 && scope <= 0xffffffff &&
    sequence > 0 && sequence <= 0xffffffff, "Invalid GPU header");
  return { op: v.getUint32(4, true), scope, sequence, index: (scope - 1) % slots.length, bytes, v };
}
function text(bytes, start, count) {
  ensure(count > 0 && count <= 128 * 1024 && start <= bytes.length - count, "Invalid GPU text span");
  const value = decode.decode(bytes.subarray(start, start + count));
  ensure(!value.includes("\0"), "NUL in GPU text");
  return value;
}
function records(request) {
  const { bytes, v } = request;
  ensure(bytes.length >= 40 && v.getUint32(36, true) === 0, "Invalid GPU batch");
  const count = v.getUint32(32, true), result = [];
  ensure(count <= 256, "Too many GPU commands", E.E2BIG);
  let offset = 40;
  for (let i = 0; i < count; ++i) {
    ensure(offset <= bytes.length - 8, "Truncated GPU command");
    const opcode = v.getUint32(offset, true), size = v.getUint32(offset + 4, true);
    ensure(size >= 8 && size % 8 === 0 && size <= bytes.length - offset, "Invalid GPU command length");
    const b = bytes.subarray(offset, offset + size), w = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const fixed = { 1: 32, 7: 64, 8: 40, 9: 48, 10: 32, 11: 16, 12: 16, 13: 8, 15: 88 }[opcode];
    if (fixed) ensure(size === fixed, "Wrong GPU command layout");
    else {
      const minimum = { 2: 32, 3: 24, 4: 40, 5: 32, 6: 32, 14: 48, 16: 32 }[opcode];
      ensure(minimum && size >= minimum, "Unsupported GPU command", E.ENOTSUP);
    }
    // Validate every variable-length span before any command has side effects.
    if (opcode === 2) {
      const at = w.getUint32(24, true), n = w.getUint32(28, true);
      ensure(at >= 32 && at <= size - n && n % 4 === 0, "Invalid GPU upload span");
    } else if (opcode === 3) {
      ensure(w.getUint32(20, true) === 0, "Shader reserved field");
      text(b, 24, w.getUint32(16, true));
    } else if (opcode === 4 || opcode === 14) {
      const vs = w.getUint32(32, true), fs = w.getUint32(36, true);
      ensure(vs <= 64 && fs <= 64, "GPU entry name too long");
      let at = 40;
      if (opcode === 14) {
        const count = w.getUint32(44, true), stride = w.getUint32(40, true);
        ensure(count > 0 && count <= 8 && stride > 0 && stride <= 2048 && stride % 4 === 0 && size >= 48 + count * 16, "Vertex layout");
        const locations = new Set();
        for (let i = 0; i < count; i++) {
          const o = 48 + i * 16, location = w.getUint32(o, true), components = w.getUint32(o + 4, true), offset = w.getUint32(o + 8, true);
          ensure(location < 16 && !locations.has(location) && components >= 2 && components <= 4 && offset % 4 === 0 && offset <= stride - components * 4 && w.getUint32(o + 12, true) === 0, "Vertex attribute");
          locations.add(location);
        }
        at = 48 + count * 16;
      }
      text(b, at, vs); text(b, at + vs, fs);
    } else if (opcode === 5) {
      ensure(w.getUint32(28, true) === 0 && w.getUint32(24, true) <= 64, "Compute entry name");
      text(b, 32, w.getUint32(24, true));
    } else if (opcode === 16) {
      const entryBytes = w.getUint32(24,true), count = w.getUint32(28,true);
      ensure(entryBytes <= 64 && count <= 16, "Compute constants layout");
      text(b,32,entryBytes);
      let at = (32+entryBytes+7)&~7;
      const names = new Set();
      for (let i=0;i<count;i++) {
        ensure(at<=size-16,"Truncated compute constant");
        const n=w.getUint32(at,true);
        ensure(n<=64 && w.getUint32(at+4,true)===0 && Number.isFinite(w.getFloat64(at+8,true)),"Invalid compute constant");
        const name=text(b,at+16,n);
        ensure(!names.has(name),"Duplicate compute constant");names.add(name);
        at=(at+16+n+7)&~7;
      }
      ensure(at===size,"Trailing compute constant bytes");
    } else if (opcode === 6) {
      const n = w.getUint32(24, true);
      ensure(n <= A.DOLLY_GPU_MAX_BINDINGS && size === 32 + n * 24 && w.getUint32(28, true) === 0, "Bind group layout");
    }
    result.push({ opcode, b, w });
    offset += size;
  }
  ensure(offset === bytes.length, "Trailing GPU packet bytes");
  return result;
}
function object(scope, id, kind) {
  const result = scope.objects.get(id);
  ensure(result && (!kind || result.kind === kind), "Invalid GPU resource handle", E.EBADF);
  return result;
}
function insert(scope, id, kind, value, size = 0) {
  ensure(id > scope.high && id <= 0xffffffff && scope.objects.size < maxObjects, "Invalid or exhausted GPU object IDs", E.ENOSPC);
  scope.high = id;
  scope.objects.set(id, { kind, value, size, mapped: null });
}
function range(resource, offset, length) {
  ensure(offset >= 0 && length >= 0 && offset <= resource.size - length, "GPU buffer range");
}
function retire(scope) {
  if (scope.retiring) return scope.retiring;
  scope.lost = true;
  if (scope.surface) postMessage({ type: "status", active: false });
  scope.retiring = (async () => {
    try { if (scope.device) await scope.device.queue.onSubmittedWorkDone(); } catch {}
    for (const r of scope.objects.values()) {
      r.value.destroy?.();
      usedBytes -= r.size;
    }
    scope.objects.clear();
    for (const t of scope.timers ?? []) { t.query.destroy(); t.resolve.destroy(); t.read.destroy(); }
    if (slots[scope.index] === scope) slots[scope.index] = null;
    postMessage({ type: "complete" });
  })();
  return scope.retiring;
}

async function batch(scope, commands) {
  const device = scope.device;
  if (scope.inflight >= 3) await device.queue.onSubmittedWorkDone();
  let encoder, texture, computePass, timer, queries = 0;
  const getEncoder = () => encoder ??= device.createCommandEncoder();
  const endCompute = () => { computePass?.end(); computePass = null; };
  const timestamps = () => {
    timer ??= scope.timers?.find(t => !t.busy);
    if (!timer) return {};
    const beginningOfPassWriteIndex = queries++, endOfPassWriteIndex = queries++;
    return {timestampWrites: {querySet: timer.query, beginningOfPassWriteIndex, endOfPassWriteIndex}};
  };
  const started = performance.now();
  device.pushErrorScope("validation");
  device.pushErrorScope("out-of-memory");
  try {
    for (const { opcode: op, b, w } of commands) {
      const id = b.length >= 16 ? integer(w, 8) : 0;
      if (op !== A.DOLLY_GPU_COMPUTE) endCompute();
      if ([1,3,4,5,6,14,16].includes(op)) ensure(id > scope.high && id <= 0xffffffff && scope.objects.size < maxObjects, "GPU object quota", E.ENOSPC);
      if (op === A.DOLLY_GPU_CREATE_BUFFER) {
        const size = integer(w, 16), usage = w.getUint32(24, true);
        ensure(size > 0 && size <= maxBuffer && size <= maxBytes - usedBytes, "GPU allocation quota", E.ENOMEM);
        ensure(w.getUint32(28, true) === 0 && usage > 0 && (usage & ~1023) === 0, "Buffer usage");
        ensure(id > scope.high && scope.objects.size < maxObjects, "GPU resource quota", E.ENOSPC);
        const buffer = device.createBuffer({ size, usage });
        insert(scope, id, "buffer", buffer, size); usedBytes += size;
      } else if (op === A.DOLLY_GPU_WRITE_BUFFER) {
        const r = object(scope, id, "buffer"), offset = integer(w, 16), n = w.getUint32(28, true);
        range(r, offset, n); ensure(offset % 4 === 0 && !r.mapped, "Unaligned or mapped GPU upload");
        device.queue.writeBuffer(r.value, offset, b.subarray(w.getUint32(24, true), w.getUint32(24, true) + n));
      } else if (op === A.DOLLY_GPU_CREATE_SHADER) {
        const shader = device.createShaderModule({ code: text(b, 24, w.getUint32(16, true)) });
        const info = await shader.getCompilationInfo();
        const errors = info.messages.filter(m => m.type === "error");
        ensure(!errors.length, errors.map(m => `${m.lineNum}:${m.linePos} ${m.message}`).join("\n").slice(0,2048));
        insert(scope, id, "shader", shader);
      } else if (op === A.DOLLY_GPU_RENDER_PIPELINE || op === A.DOLLY_GPU_VERTEX_PIPELINE) {
        const shader = object(scope, integer(w, 16), "shader").value;
        const topology = w.getUint32(24, true), blend = w.getUint32(28, true);
        ensure(topology <= 1 && blend <= 2, "Unsupported render state");
        const component = { srcFactor: "one", dstFactor: blend === 2 ? "one" : "one-minus-src-alpha", operation: "add" };
        const vs = w.getUint32(32, true), fs = w.getUint32(36, true);
        let at = 40, buffers = [];
        if (op === A.DOLLY_GPU_VERTEX_PIPELINE) {
          const count = w.getUint32(44, true), attributes = [];
          for (let i = 0; i < count; i++) {
            const o = 48 + i * 16;
            attributes.push({shaderLocation:w.getUint32(o,true),format:`float32x${w.getUint32(o+4,true)}`,offset:w.getUint32(o+8,true)});
          }
          buffers = [{arrayStride:w.getUint32(40,true),stepMode:"vertex",attributes}];
          at = 48 + count * 16;
        }
        const pipeline = await device.createRenderPipelineAsync({ layout: "auto",
          vertex: { module: shader, entryPoint: text(b,at,vs), buffers },
          fragment: { module: shader, entryPoint: text(b,at+vs,fs), targets: [{ format, ...(blend ? { blend: { color: component, alpha: component } } : {}) }] },
          primitive: { topology: topology ? "triangle-strip" : "triangle-list" } });
        insert(scope, id, "render", pipeline);
      } else if (op === A.DOLLY_GPU_COMPUTE_PIPELINE || op === A.DOLLY_GPU_COMPUTE_CONSTANTS) {
        const constants=Object.create(null);
        if(op===A.DOLLY_GPU_COMPUTE_CONSTANTS) {
          let at=(32+w.getUint32(24,true)+7)&~7;
          for(let i=0;i<w.getUint32(28,true);i++) {
            const n=w.getUint32(at,true);constants[text(b,at+16,n)]=w.getFloat64(at+8,true);at=(at+16+n+7)&~7;
          }
        }
        const pipeline = await device.createComputePipelineAsync({ layout: "auto", compute: {
          module: object(scope,integer(w,16),"shader").value, entryPoint: text(b,32,w.getUint32(24,true)), constants } });
        insert(scope,id,"compute",pipeline);
      } else if (op === A.DOLLY_GPU_BIND_GROUP) {
        const pipeline = object(scope,integer(w,16));
        ensure(["render","compute"].includes(pipeline.kind), "Invalid binding pipeline");
        const entries = [];
        for (let i=0; i<w.getUint32(24,true); ++i) {
          const at=32+i*24, r=object(scope,integer(w,at),"buffer"), offset=integer(w,at+8), size=integer(w,at+16);
          range(r,offset,size); entries.push({binding:i,resource:{buffer:r.value,offset,size}});
        }
        insert(scope,id,"group",device.createBindGroup({layout:pipeline.value.getBindGroupLayout(0),entries}));
      } else if (op === A.DOLLY_GPU_RENDER || op === A.DOLLY_GPU_RENDER_VERTEX) {
        const width=w.getUint32(32,true), height=w.getUint32(36,true);
        ensure(scope.surface && width>0 && height>0 && width<=4096 && height<=2304, "Invalid GPU surface dimensions");
        ensure(w.getUint32(60,true)===0 && w.getUint32(56,true)<=1, "Render reserved field");
        const vertices=w.getUint32(24,true), instances=w.getUint32(28,true);
        ensure(vertices>0 && instances>0 && vertices*instances<=4*1024*1024, "Draw limit",E.E2BIG);
        if (!texture) {
          if(canvas.width!==width || canvas.height!==height) { canvas.width=width; canvas.height=height; }
          texture=context.getCurrentTexture();
        } else ensure(canvas.width===width && canvas.height===height,"Surface resized within batch");
        const clearValue=[40,44,48,52].map(o=>w.getFloat32(o,true));
        ensure(clearValue.every(Number.isFinite), "Invalid clear color");
        const pass=getEncoder().beginRenderPass({...timestamps(),colorAttachments:[{view:texture.createView(),clearValue,
          loadOp:w.getUint32(56,true)?"clear":"load",storeOp:"store"}]});
        pass.setPipeline(object(scope,id,"render").value);
        const group=integer(w,16); if(group)pass.setBindGroup(0,object(scope,group,"group").value);
        if(op===A.DOLLY_GPU_RENDER_VERTEX) {
          const r=object(scope,integer(w,64),"buffer"), offset=integer(w,72), size=integer(w,80);
          range(r,offset,size);pass.setVertexBuffer(0,r.value,offset,size);
        }
        pass.draw(vertices,instances); pass.end();
      } else if (op === A.DOLLY_GPU_COMPUTE) {
        const xyz=[24,28,32].map(o=>w.getUint32(o,true));
        ensure(w.getUint32(36,true)===0 && xyz.every(n=>n>0 && n<=65535) && xyz.reduce((a,n)=>a*n,1)<=1048576, "Dispatch limit",E.E2BIG);
        computePass ??= getEncoder().beginComputePass(timestamps());
        computePass.setPipeline(object(scope,id,"compute").value);
        computePass.setBindGroup(0,object(scope,integer(w,16),"group").value); computePass.dispatchWorkgroups(...xyz); stats.dispatches++;
      } else if (op === A.DOLLY_GPU_COPY_BUFFER) {
        const src=object(scope,id,"buffer"), dst=object(scope,integer(w,16),"buffer"), so=integer(w,24), to=integer(w,32), n=integer(w,40);
        range(src,so,n);range(dst,to,n);getEncoder().copyBufferToBuffer(src.value,so,dst.value,to,n);
      } else if (op === A.DOLLY_GPU_SUBMIT) {
        ensure(encoder,"No GPU commands to submit");
        if (scope.inflight >= 3) await device.queue.onSubmittedWorkDone();
        const measured = queries ? timer : null, count = queries;
        if (measured) {
          encoder.resolveQuerySet(measured.query,0,count,measured.resolve,0);
          encoder.copyBufferToBuffer(measured.resolve,0,measured.read,0,count*8);
          measured.busy = true;
        }
        device.queue.submit([encoder.finish()]);encoder=null;scope.inflight++;
        if (measured) measured.read.mapAsync(GPUMapMode.READ,0,count*8).then(() => {
          const values=new BigUint64Array(measured.read.getMappedRange(0,count*8));
          let ns=0n;for(let i=0;i<count;i+=2)if(values[i+1]>=values[i])ns+=values[i+1]-values[i];
          if (!scope.lost) {scope.gpuMs=Number(ns)/1e6;scope.gpuTotalMs+=scope.gpuMs;scope.gpuSamples++;}
          measured.read.unmap();
        }).catch(()=>{}).finally(()=>{measured.busy=false;});
        timer=null;queries=0;
        device.queue.onSubmittedWorkDone().catch(()=>{}).finally(()=>scope.inflight--);
        if(texture){stats.frames++;postMessage({type:"status",active:true,width:canvas.width,height:canvas.height,adapter:adapterName,stats:{...stats,allocatedBytes:usedBytes}});texture=null;}
      } else if (op === A.DOLLY_GPU_MAP_READ) {
        ensure(!encoder,"Submit before mapping");
        const r=object(scope,id,"buffer"), offset=integer(w,16), size=integer(w,24);range(r,offset,size);
        ensure(!r.mapped && size<=16*1024*1024,"Mapping limit",E.E2BIG);
        await r.value.mapAsync(GPUMapMode.READ,offset,size);r.mapped=r.value.getMappedRange(offset,size);
      } else if (op === A.DOLLY_GPU_UNMAP) {
        const r=object(scope,id,"buffer");r.value.unmap();r.mapped=null;
      } else if (op === A.DOLLY_GPU_RELEASE) {
        const r=object(scope,id);
        if(r.size) await device.queue.onSubmittedWorkDone();
        r.value.destroy?.();usedBytes-=r.size;scope.objects.delete(id);
      }
    }
    ensure(!encoder,"GPU batch has an unsubmitted encoder");
  } finally {
    endCompute();
    const oom=await device.popErrorScope(), validation=await device.popErrorScope();
    stats.batchWallMilliseconds += performance.now()-started;
    if(oom)fail(E.ENOMEM,oom.message);if(validation)fail(E.EINVAL,validation.message);
  }
}

function publish(request, error, data = new Uint8Array()) {
  const base=mailbox+request.index*(64+A.DOLLY_GPU_REPLY_BYTES), words=new Int32Array(memory,base,16);
  new Uint8Array(memory,base+64,data.length).set(data);
  Atomics.store(words,1,request.scope);Atomics.store(words,2,request.sequence);
  Atomics.store(words,3,error);Atomics.store(words,4,data.length);Atomics.store(words,0,1);
  postMessage({type:"complete"});
}
async function execute(request, scope, parsed) {
  try {
    let output=new Uint8Array();
    if(request.op===A.DOLLY_GPU_OPEN) {
      scope.device=await getDevice();
      ensure(!scope.lost,"GPU scope cancelled",E.ECANCELED);
      const width=request.v.getUint32(32,true),height=request.v.getUint32(36,true);
      ensure((width===0&&height===0)||(width>0&&height>0&&width<=4096&&height<=2304),"Invalid surface size");
      ensure(!width || !slots.some(s=>s && s!==scope && s.surface),"GPU surface is busy",E.EBUSY);
      scope.surface=width>0;
      scope.gpuMs=0;scope.gpuTotalMs=0;scope.gpuSamples=0;
      if(device.features.has("timestamp-query")) scope.timers=Array.from({length:3},()=>({
        query:device.createQuerySet({type:"timestamp",count:512}),
        resolve:device.createBuffer({size:4096,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC}),
        read:device.createBuffer({size:4096,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST}),busy:false}));
      output=new Uint8Array(16+Math.min(240,encode.encode(adapterName).length));
      const v=new DataView(output.buffer);v.setBigUint64(0,BigInt(scope.id),true);v.setUint32(8,width,true);v.setUint32(12,height,true);
      output.set(encode.encode(adapterName).subarray(0,240),16);
    } else {
      ensure(!scope.lost && device,"GPU scope lost",E.EIO);
      if(request.op===A.DOLLY_GPU_BATCH)await batch(scope,parsed);
      else if(request.op===A.DOLLY_GPU_WAIT)await device.queue.onSubmittedWorkDone();
      else if(request.op===A.DOLLY_GPU_READ) {
        const r=object(scope,integer(request.v,32),"buffer"),offset=integer(request.v,40),size=integer(request.v,48);
        ensure(r.mapped && size<=A.DOLLY_GPU_REPLY_BYTES && offset<=r.mapped.byteLength-size,"Invalid readback");
        output=new Uint8Array(r.mapped,offset,size).slice();stats.readbackBytes+=size;
      } else if(request.op===A.DOLLY_GPU_CLOSE)await retire(scope);
      else if(request.op===A.DOLLY_GPU_CAPABILITIES)output=capabilities;
      else if(request.op===A.DOLLY_GPU_INFO) {
        output=new Uint8Array(80);const v=new DataView(output.buffer);
        v.setUint32(0,scope.timers?1:0,true);v.setUint32(4,A.DOLLY_GPU_MAX_BINDINGS,true);
        v.setBigUint64(8,BigInt(maxBuffer),true);v.setBigUint64(16,BigInt(maxBytes),true);
        v.setFloat64(24,scope.gpuMs,true);v.setFloat64(32,scope.gpuTotalMs,true);v.setBigUint64(40,BigInt(scope.gpuSamples),true);
        v.setFloat64(48,stats.batchWallMilliseconds,true);v.setBigUint64(56,BigInt(stats.frames),true);
        v.setBigUint64(64,BigInt(stats.dispatches),true);v.setBigUint64(72,BigInt(usedBytes),true);
      }
    }
    publish(request,0,output);
  } catch(error) {
    postMessage({type:"status",error:String(error.message??error).slice(0,2048)});
    publish(request,error.errno??E.EIO);
    if(request.op===A.DOLLY_GPU_OPEN)await retire(scope);
  } finally {scope.busy=false;}
}

self.onmessage = event => {
  const m=event.data;
  if(m.type==="configure") {
    memory=m.memory;mailbox=m.mailbox;canvas=m.canvas;control=new Int32Array(m.control);
    ensure(memory instanceof SharedArrayBuffer && Number.isSafeInteger(mailbox) && mailbox>0 && mailbox%64===0 &&
      mailbox<=memory.byteLength-slots.length*(64+A.DOLLY_GPU_REPLY_BYTES),"Invalid GPU mailbox");
    return;
  }
  if(m.type!=="request")return;
  let status=0;
  try {
    const address=Number(m.address),size=Number(m.bytes);
    if(address===0) {
      ensure(Number.isSafeInteger(size)&&size>0&&size<=0xffffffff,"Invalid scope cancellation");
      const scope=slots[(size-1)%slots.length];
      if(scope?.id===size) {
        scope.lost=true;
        serial=serial.then(()=>retire(scope));
      }
    } else {
      ensure(Number.isSafeInteger(address)&&Number.isSafeInteger(size)&&address>0&&size>=32&&size<=A.DOLLY_GPU_PACKET_BYTES&&address<=memory.byteLength-size,"Invalid GPU request span",E.EFAULT);
      const request=header(new Uint8Array(memory,address,size).slice());
      ensure(request.op>=1&&request.op<=7,"Unknown GPU operation",E.ENOTSUP);
      ensure((request.op!==1||size===40)&&(![3,5,6,7].includes(request.op)||size===32)&&(request.op!==4||size===56),"GPU operation layout");
      const parsed=request.op===2?records(request):null;
      let scope=slots[request.index];
      if(request.op===1) {
        ensure(!scope&&request.scope>generations[request.index],"GPU scope slot is busy",E.EBUSY);
        scope={id:request.scope,index:request.index,sequence:0,objects:new Map(),high:0,inflight:0,lost:false,surface:false};
        generations[request.index]=scope.id;slots[request.index]=scope;
      }
      ensure(scope?.id===request.scope,"Stale GPU scope",E.ESTALE);
      ensure(!scope.busy&&request.sequence>scope.sequence,"GPU request is busy or repeated",E.EBUSY);
      scope.sequence=request.sequence;scope.busy=true;stats.packets++;stats.packetBytes+=size;
      serial=serial.then(()=>execute(request,scope,parsed)).catch(error=>{publish(request,E.EIO);scope.busy=false;postMessage({type:"status",error:String(error).slice(0,2048)});});
    }
  } catch(error) {status=-(error.errno??E.EINVAL);}
  finally {Atomics.store(control,1,status);Atomics.store(control,0,0);Atomics.notify(control,0);}
};
