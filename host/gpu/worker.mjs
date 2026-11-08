import * as A from "./abi.mjs";
import { DOLLY_ERRNO as E } from "./abi.mjs";

const decode = new TextDecoder("utf-8", { fatal: true });
const encode = new TextEncoder();
const fail = (code, message) => { throw Object.assign(new Error(message), { errno: code }); };
const ensure = (condition, message, code = E.EINVAL) => { if (!condition) fail(code, message); };
const textureFormats = [null, "rgba8unorm", "rgba8unorm-srgb", "r8unorm", "rg8unorm", "depth24plus-stencil8", "depth32float",
  "bc1-rgba-unorm", "bc2-rgba-unorm", "bc3-rgba-unorm",
  "r8snorm", "r8uint", "r8sint", "r16uint", "r16sint", "r16float", "rg8snorm", "rg8uint", "rg8sint", "r32uint", "r32sint",
  "r32float", "rg16uint", "rg16sint", "rg16float", "rgba8snorm", "rgba8uint", "rgba8sint", "bgra8unorm", "bgra8unorm-srgb",
  "rgb9e5ufloat", "rgb10a2uint", "rgb10a2unorm", "rg11b10ufloat", "rg32uint", "rg32sint", "rg32float", "rgba16uint",
  "rgba16sint", "rgba16float", "rgba32uint", "rgba32sint", "rgba32float", "stencil8", "depth16unorm", "depth32float-stencil8",
  "bc1-rgba-unorm-srgb", "bc2-rgba-unorm-srgb", "bc3-rgba-unorm-srgb", "bc4-r-unorm", "bc4-r-snorm", "bc5-rg-unorm",
  "bc5-rg-snorm", "bc6h-rgb-ufloat", "bc6h-rgb-float", "bc7-rgba-unorm", "bc7-rgba-unorm-srgb",
  "r16unorm", "r16snorm", "rg16unorm", "rg16snorm", "rgba16unorm", "rgba16snorm"];
// Bytes of a texel, or of a 4x4 block for the block-compressed formats.
const blockBytes = [0, 4, 4, 1, 2, 4, 4, 8, 16, 16, 1, 1, 1, 2, 2, 2, 2, 2, 2, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4,
  8, 8, 8, 8, 8, 8, 16, 16, 16, 1, 2, 8, 8, 16, 16, 8, 8, 16, 16, 16, 16, 16, 16, 2, 2, 4, 4, 8, 8];
const compressedFormat = type => (type >= 7 && type <= 9) || (type >= 46 && type <= 56);
// The sRGB formats, which views of a texture take that has none of their usages (storage).
const srgbFormat = type => type === 2 || type === 29 || (type >= 46 && type <= 48) || type === 56;
const depthFormat = type => type === 5 || type === 6 || type === 44 || type === 45;
const stencilFormat = type => type === 5 || type === 43 || type === 45;
const viewDimensions = [undefined, "1d", "2d", "2d-array", "cube", "cube-array", "3d"];
const aspects = ["all", "stencil-only", "depth-only"];
const stencilOps = ["keep", "zero", "replace", "invert", "increment-clamp", "decrement-clamp", "increment-wrap", "decrement-wrap"];
const compareOps = [undefined, "never", "less", "equal", "less-equal", "greater", "not-equal", "greater-equal", "always"];
const blendOps = ["add", "subtract", "reverse-subtract", "min", "max"];
const blendFactors = ["zero", "one", "src", "one-minus-src", "dst", "one-minus-dst", "src-alpha", "one-minus-src-alpha", "dst-alpha", "one-minus-dst-alpha", "src-alpha-saturated", "constant", "one-minus-constant"];
const vertexFormats = [null, "float32", "float32x2", "float32x3", "float32x4", "unorm8x4", "snorm8x4", "uint8x4", "sint8x4", "unorm16x2", "unorm16x4", "uint16x2", "uint16x4", "float16x2", "float16x4",
  "uint8x2", "sint8x2", "unorm8x2", "snorm8x2", "sint16x2", "sint16x4", "snorm16x2", "snorm16x4", "uint32", "uint32x2", "uint32x3",
  "uint32x4", "sint32", "sint32x2", "sint32x3", "sint32x4", "unorm10-10-10-2"];
const vertexBytes = [0, 4, 8, 12, 16, 4, 4, 4, 4, 4, 8, 4, 8, 4, 8, 2, 2, 2, 2, 4, 8, 4, 8, 4, 8, 12, 16, 4, 8, 12, 16, 4];
const maxBytes = 4 * 1024 ** 3, bufferCeiling = 1024 ** 3, maxObjects = 65536;
// A surface shows one presented frame per page animation frame, as a display does, and a frame
// retires once shown and finished by the GPU. Chrome's canvas also waits for its compositor;
// Firefox's does not, so without this its programs draw unpaced.
function present(scope, completed) {
  const shown = new Promise(resolve => scope.shows.push(resolve));
  const frame = Promise.all([completed, shown]).finally(() => scope.frames.splice(scope.frames.indexOf(frame), 1));
  scope.frames.push(frame);
  if (scope.shows.length === 1) void show(scope);
}
// One frame per page animation frame; a canvas no page shows has nothing to wait for.
async function show(scope) {
  while (scope.shows.length) {
    const wait = pageFrames && Atomics.waitAsync(pageFrames, 0, Atomics.load(pageFrames, 0));
    if (wait?.async) await wait.value;
    scope.shows.shift()();
  }
}
// What a scope may have queued before its next batch waits: 64 submissions, and
// for a surface three presented frames not yet retired (a frame may submit many
// times). Firefox settles completions on a 100 ms timer (bug 1870699), and a
// model token takes about 25 submissions.
const queueFull = scope => scope.surface && scope.frames.length >= 3 ? scope.frames[0]
  : scope.submissions.length >= 64 ? scope.submissions[0] : null;
const timestampQueries = A.DOLLY_GPU_MAX_COMMANDS * 2;
// A batch record's byte length: exact for one of fixed layout, the least for
// one with a variable tail, which records() checks.
const fixedRecordBytes = new Map([[A.DOLLY_GPU_CREATE_BUFFER, 32], [A.DOLLY_GPU_RENDER, 64],
  [A.DOLLY_GPU_COMPUTE, 40], [A.DOLLY_GPU_COPY_BUFFER, 48], [A.DOLLY_GPU_MAP_READ, 32], [A.DOLLY_GPU_UNMAP, 16],
  [A.DOLLY_GPU_RELEASE, 16], [A.DOLLY_GPU_SUBMIT, 8], [A.DOLLY_GPU_RENDER_VERTEX, 88],
  [A.DOLLY_GPU_CAPTURE_FRAME, 32], [A.DOLLY_GPU_CREATE_TEXTURE, 48],
  [A.DOLLY_GPU_BEGIN_RENDER_PASS, 64], [A.DOLLY_GPU_END_RENDER_PASS, 8], [A.DOLLY_GPU_VIEWPORT, 48],
  [A.DOLLY_GPU_CREATE_VIEW, 56], [A.DOLLY_GPU_CREATE_QUERY_SET, 24], [A.DOLLY_GPU_COPY_BUFFER_TO_TEXTURE, 72],
  [A.DOLLY_GPU_COPY_TEXTURE_TO_BUFFER, 72], [A.DOLLY_GPU_COPY_TEXTURE_TO_TEXTURE, 72], [A.DOLLY_GPU_CLEAR_BUFFER, 32],
  [A.DOLLY_GPU_WRITE_TIMESTAMP, 24], [A.DOLLY_GPU_RESOLVE_QUERY_SET, 40], [A.DOLLY_GPU_BEGIN_COMPUTE_PASS, 8],
  [A.DOLLY_GPU_END_COMPUTE_PASS, 8], [A.DOLLY_GPU_SET_PIPELINE, 16], [A.DOLLY_GPU_SET_VERTEX_BUFFER, 40],
  [A.DOLLY_GPU_SET_INDEX_BUFFER, 40], [A.DOLLY_GPU_DRAW, 24], [A.DOLLY_GPU_DRAW_INDEXED, 32],
  [A.DOLLY_GPU_DRAW_INDIRECT, 24], [A.DOLLY_GPU_DRAW_INDEXED_INDIRECT, 24], [A.DOLLY_GPU_SET_BLEND_CONSTANT, 24],
  [A.DOLLY_GPU_SET_STENCIL_REFERENCE, 16], [A.DOLLY_GPU_DISPATCH, 24], [A.DOLLY_GPU_DISPATCH_INDIRECT, 24]]);
const leastRecordBytes = new Map([[A.DOLLY_GPU_WRITE_BUFFER, 32], [A.DOLLY_GPU_CREATE_SHADER, 24],
  [A.DOLLY_GPU_RENDER_PIPELINE, 40], [A.DOLLY_GPU_COMPUTE_PIPELINE, 32], [A.DOLLY_GPU_BIND_GROUP, 32],
  [A.DOLLY_GPU_VERTEX_PIPELINE, 48], [A.DOLLY_GPU_COMPUTE_CONSTANTS, 32], [A.DOLLY_GPU_WRITE_TEXTURE, 48],
  [A.DOLLY_GPU_GRAPHICS_PIPELINE, 112], [A.DOLLY_GPU_RESOURCE_GROUP, 32], [A.DOLLY_GPU_DRAW_MESH, 80],
  [A.DOLLY_GPU_CREATE_SAMPLER, 48], [A.DOLLY_GPU_CREATE_BIND_GROUP_LAYOUT, 24], [A.DOLLY_GPU_CREATE_PIPELINE_LAYOUT, 24],
  [A.DOLLY_GPU_CREATE_BIND_GROUP, 32], [A.DOLLY_GPU_CREATE_RENDER_PIPELINE, 160], [A.DOLLY_GPU_CREATE_COMPUTE_PIPELINE, 40],
  [A.DOLLY_GPU_BEGIN_VIEW_PASS, 64], [A.DOLLY_GPU_SET_BIND_GROUP, 24]]);
// Records whose bytes 8..15 are not a handle.
const unhandledRecords = new Set([A.DOLLY_GPU_VIEWPORT, A.DOLLY_GPU_DRAW, A.DOLLY_GPU_DRAW_INDEXED,
  A.DOLLY_GPU_SET_BLEND_CONSTANT, A.DOLLY_GPU_SET_STENCIL_REFERENCE, A.DOLLY_GPU_DISPATCH]);
// The records a render pass may hold, between BEGIN_RENDER_PASS and END_RENDER_PASS.
const renderPassRecords = new Set([A.DOLLY_GPU_CREATE_BUFFER, A.DOLLY_GPU_WRITE_BUFFER, A.DOLLY_GPU_CREATE_SHADER,
  A.DOLLY_GPU_CREATE_TEXTURE, A.DOLLY_GPU_CREATE_SAMPLER, A.DOLLY_GPU_GRAPHICS_PIPELINE, A.DOLLY_GPU_RESOURCE_GROUP,
  A.DOLLY_GPU_END_RENDER_PASS, A.DOLLY_GPU_DRAW_MESH, A.DOLLY_GPU_VIEWPORT]);
// The records a pass begun by BEGIN_VIEW_PASS or BEGIN_COMPUTE_PASS may hold.
const viewPassRecords = new Set([A.DOLLY_GPU_SET_PIPELINE, A.DOLLY_GPU_SET_BIND_GROUP, A.DOLLY_GPU_SET_VERTEX_BUFFER,
  A.DOLLY_GPU_SET_INDEX_BUFFER, A.DOLLY_GPU_DRAW, A.DOLLY_GPU_DRAW_INDEXED, A.DOLLY_GPU_DRAW_INDIRECT,
  A.DOLLY_GPU_DRAW_INDEXED_INDIRECT, A.DOLLY_GPU_VIEWPORT, A.DOLLY_GPU_SET_BLEND_CONSTANT,
  A.DOLLY_GPU_SET_STENCIL_REFERENCE, A.DOLLY_GPU_END_RENDER_PASS]);
const computePassRecords = new Set([A.DOLLY_GPU_SET_PIPELINE, A.DOLLY_GPU_SET_BIND_GROUP, A.DOLLY_GPU_DISPATCH,
  A.DOLLY_GPU_DISPATCH_INDIRECT, A.DOLLY_GPU_END_COMPUTE_PASS]);
// The records that create an object, charged to the scope's object quota before they run.
const creatingRecords = new Set([A.DOLLY_GPU_CREATE_BUFFER, A.DOLLY_GPU_CREATE_SHADER, A.DOLLY_GPU_RENDER_PIPELINE,
  A.DOLLY_GPU_COMPUTE_PIPELINE, A.DOLLY_GPU_BIND_GROUP, A.DOLLY_GPU_VERTEX_PIPELINE, A.DOLLY_GPU_COMPUTE_CONSTANTS,
  A.DOLLY_GPU_CREATE_TEXTURE, A.DOLLY_GPU_CREATE_SAMPLER, A.DOLLY_GPU_GRAPHICS_PIPELINE, A.DOLLY_GPU_RESOURCE_GROUP,
  A.DOLLY_GPU_CREATE_VIEW, A.DOLLY_GPU_CREATE_BIND_GROUP_LAYOUT, A.DOLLY_GPU_CREATE_PIPELINE_LAYOUT,
  A.DOLLY_GPU_CREATE_BIND_GROUP, A.DOLLY_GPU_CREATE_RENDER_PIPELINE, A.DOLLY_GPU_CREATE_COMPUTE_PIPELINE,
  A.DOLLY_GPU_CREATE_QUERY_SET]);
// A request's byte length, header included; BATCH's is its records'.
const requestBytes = new Map([[A.DOLLY_GPU_OPEN, 40], [A.DOLLY_GPU_WAIT, 32], [A.DOLLY_GPU_READ, 56],
  [A.DOLLY_GPU_CLOSE, 32], [A.DOLLY_GPU_INFO, 32], [A.DOLLY_GPU_CAPABILITIES, 32], [A.DOLLY_GPU_LIMITS, 32]]);
// The device features and limits LIMITS reports, in its order; the GPU Worker asks the adapter
// for each limit, bounded by the scope quotas above where they are lower.
const reportedFeatures = ["depth-clip-control", "depth32float-stencil8", "texture-compression-bc", "timestamp-query",
  "indirect-first-instance", "shader-f16", "rg11b10ufloat-renderable", "float32-filterable", "float32-blendable",
  "subgroups", "texture-component-swizzle", "texture-formats-tier1", "texture-formats-tier2"];
const reportedLimits = ["maxTextureDimension1D", "maxTextureDimension2D", "maxTextureDimension3D", "maxTextureArrayLayers",
  "maxBindGroups", "maxBindingsPerBindGroup", "maxDynamicUniformBuffersPerPipelineLayout",
  "maxDynamicStorageBuffersPerPipelineLayout", "maxSampledTexturesPerShaderStage", "maxSamplersPerShaderStage",
  "maxStorageBuffersPerShaderStage", "maxStorageTexturesPerShaderStage", "maxUniformBuffersPerShaderStage",
  "maxUniformBufferBindingSize", "maxStorageBufferBindingSize", "minUniformBufferOffsetAlignment",
  "minStorageBufferOffsetAlignment", "maxVertexBuffers", "maxBufferSize", "maxVertexAttributes",
  "maxVertexBufferArrayStride", "maxInterStageShaderVariables", "maxColorAttachments", "maxColorAttachmentBytesPerSample",
  "maxComputeWorkgroupStorageSize", "maxComputeInvocationsPerWorkgroup", "maxComputeWorkgroupSizeX",
  "maxComputeWorkgroupSizeY", "maxComputeWorkgroupSizeZ", "maxComputeWorkgroupsPerDimension",
  "maxStorageBuffersInVertexStage", "maxStorageBuffersInFragmentStage", "maxStorageTexturesInVertexStage",
  "maxStorageTexturesInFragmentStage"];
const limitCeilings = { maxBufferSize: bufferCeiling, maxStorageBufferBindingSize: bufferCeiling,
  maxComputeWorkgroupStorageSize: 65536 };
let maxBuffer = bufferCeiling, capabilities, limits;
const slots = Array(A.DOLLY_GPU_SLOTS).fill(null), generations = slots.map(() => 0);
let heap, memory, mailbox, control, canvas, context, device, format, pageFrames;
let queueProgress = {queued: 0, completed: 0};
let usedBytes = 0, serial = Promise.resolve(), initializing;
const stats = { packets: 0, packetBytes: 0, frames: 0, dispatches: 0, readbackBytes: 0, batchWallMilliseconds: 0 };

async function getDevice() {
  if (device) return device;
  if (initializing) return initializing;
  initializing = (async () => {
    ensure(navigator.gpu, "This browser has no WebGPU provider", E.ENODEV);
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
    ensure(adapter, "This browser did not provide a GPU adapter", E.ENODEV);
    const requiredFeatures = reportedFeatures.filter(name => adapter.features.has(name));
    const requiredLimits = {};
    for (const name of reportedLimits) if (adapter.limits[name] !== undefined)
      requiredLimits[name] = Math.min(adapter.limits[name], limitCeilings[name] ?? Infinity);
    const created = await adapter.requestDevice({requiredFeatures, requiredLimits});
    format = navigator.gpu.getPreferredCanvasFormat();
    maxBuffer = created.limits.maxBufferSize;
    const l = created.limits;
    capabilities = new Uint8Array(128);
    const v = new DataView(capabilities.buffer);
    v.setUint32(0, (created.features.has("shader-f16") ? 1 : 0) | (created.features.has("subgroups") ? 2 : 0) |
      (navigator.gpu.wgslLanguageFeatures?.has("packed_4x8_integer_dot_product") ? 4 : 0) |
      (created.features.has("timestamp-query") ? 8 : 0) | A.DOLLY_GPU_FEATURE_CAPTURE_FRAME | A.DOLLY_GPU_FEATURE_TEXTURE_RENDER | A.DOLLY_GPU_FEATURE_LARGE_BATCH | A.DOLLY_GPU_FEATURE_VERTEX_F16 | A.DOLLY_GPU_FEATURE_EXPLICIT |
      (created.features.has("texture-compression-bc") ? A.DOLLY_GPU_FEATURE_TEXTURE_BC : 0) |
      (format === "bgra8unorm" ? A.DOLLY_GPU_FEATURE_SURFACE_BGRA : 0), true);
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
    limits = new Uint8Array(8 + reportedLimits.length * 8);
    const lv = new DataView(limits.buffer);
    lv.setBigUint64(0, BigInt(reportedFeatures.reduce((bits, name, i) => created.features.has(name) ? bits | (1 << i) : bits, 0)), true);
    reportedLimits.forEach((name, i) => lv.setBigUint64(8 + i * 8, BigInt(l[name] ?? 0), true));
    device = created;
    const { vendor, architecture, description, isFallbackAdapter } = adapter.info;
    postMessage({ type: "status", info: { vendor, architecture, description, isFallbackAdapter, f16: created.features.has("shader-f16") } });
    queueProgress = {queued: 0, completed: 0};
    if (canvas) {
      context = canvas.getContext("webgpu");
      ensure(context, "WebGPU canvas unavailable", E.ENOSYS);
      context.configure({ device, format, alphaMode: "opaque", usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    }
    created.lost.then(info => {
      if (device !== created) return;
      device = null;
      for (const scope of slots) if (scope) scope.lost = true;
      postMessage({ type: "status", active: false, error: `GPU device lost: ${info.message}` });
    });
    return created;
  })();
  try { return await initializing; }
  catch (error) { postMessage({ type: "status", unavailable: String(error.message ?? error).slice(0, 2048) }); throw error; }
  finally { initializing = null; }
}

function integer(v, o) {
  const high = v.getUint32(o + 4, true);
  ensure(high <= 0x1fffff, "GPU integer exceeds host range");
  return high * 0x100000000 + v.getUint32(o, true);
}
function header(bytes) {
  ensure(bytes.length >= 32, "Short GPU packet");
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const scope = integer(v, 8), sequence = integer(v, 16);
  ensure(v.getUint32(0, true) === A.DOLLY_GPU_VERSION && v.getUint32(28, true) === 0 &&
    v.getUint32(24, true) === bytes.length - 32 && scope > 0 && scope <= 0xffffffff &&
    sequence > 0 && sequence <= 0xffffffff, "Invalid GPU header");
  return { op: v.getUint32(4, true), scope, sequence, index: (scope - 1) % slots.length, bytes, v };
}
function text(bytes, start, count) {
  ensure(count > 0 && start <= bytes.length - count, "Invalid GPU text span");
  const value = decode.decode(bytes.subarray(start, start + count));
  ensure(!value.includes("\0"), "NUL in GPU text");
  return value;
}
function records(request) {
  const { bytes, v } = request;
  ensure(bytes.length >= 40 && (v.getUint32(36, true) & ~A.DOLLY_GPU_BATCH_CONTINUE) === 0, "Invalid GPU batch");
  const count = v.getUint32(32, true), result = [];
  ensure(count <= A.DOLLY_GPU_MAX_COMMANDS, "Too many GPU commands", E.E2BIG);
  let offset = 40;
  for (let i = 0; i < count; ++i) {
    ensure(offset <= bytes.length - 8, "Truncated GPU command");
    const opcode = v.getUint32(offset, true), size = v.getUint32(offset + 4, true);
    ensure(size >= 8 && size % 8 === 0 && size <= bytes.length - offset, "Invalid GPU command length");
    const b = bytes.subarray(offset, offset + size), w = new DataView(b.buffer, b.byteOffset, b.byteLength);
    if (fixedRecordBytes.has(opcode)) ensure(size === fixedRecordBytes.get(opcode), "Wrong GPU command layout");
    else ensure(leastRecordBytes.has(opcode) && size >= leastRecordBytes.get(opcode), "Unsupported GPU command", E.ENOTSUP);
    // Validate every variable-length span before any command has side effects.
    if (opcode === A.DOLLY_GPU_WRITE_BUFFER) {
      const at = w.getUint32(24, true), n = w.getUint32(28, true);
      ensure(at >= 32 && at <= size - n && n % 4 === 0, "Invalid GPU upload span");
    } else if (opcode === A.DOLLY_GPU_CREATE_SHADER) {
      ensure(w.getUint32(20, true) === 0, "Shader reserved field");
      text(b, 24, w.getUint32(16, true));
    } else if (opcode === A.DOLLY_GPU_RENDER_PIPELINE || opcode === A.DOLLY_GPU_VERTEX_PIPELINE) {
      const vs = w.getUint32(32, true), fs = w.getUint32(36, true);
      ensure(vs <= 64 && fs <= 64, "GPU entry name too long");
      let at = 40;
      if (opcode === A.DOLLY_GPU_VERTEX_PIPELINE) {
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
    } else if (opcode === A.DOLLY_GPU_COMPUTE_PIPELINE) {
      ensure(w.getUint32(28, true) === 0 && w.getUint32(24, true) <= 64, "Compute entry name");
      text(b, 32, w.getUint32(24, true));
    } else if (opcode === A.DOLLY_GPU_COMPUTE_CONSTANTS) {
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
    } else if (opcode === A.DOLLY_GPU_BIND_GROUP) {
      const n = w.getUint32(24, true);
      ensure(n <= A.DOLLY_GPU_MAX_BINDINGS && size === 32 + n * 24 && w.getUint32(28, true) === 0, "Bind group layout");
    }
    if (opcode === A.DOLLY_GPU_WRITE_TEXTURE) {
      ensure(w.getUint32(44,true) === 0 && w.getUint32(40,true) > 0 &&
        Math.ceil((48+w.getUint32(40,true))/8)*8 === size, "Texture upload span");
    } else if (opcode === A.DOLLY_GPU_GRAPHICS_PIPELINE) {
      const buffers=w.getUint32(104,true), attributes=w.getUint32(108,true);
      ensure(buffers<=8 && attributes<=16 && size===112+16*(buffers+attributes), "Graphics vertex layout");
      const locations=new Set();
      for(let i=0;i<buffers;i++) {
        const at=112+i*16, stride=w.getUint32(at,true);
        ensure(stride>0 && stride<=2048 && stride%4===0 && w.getUint32(at+4,true)<=1 &&
          w.getBigUint64(at+8,true)===0n, "Graphics vertex stride");
      }
      for(let i=0;i<attributes;i++) {
        const at=112+(buffers+i)*16, slot=w.getUint32(at,true), location=w.getUint32(at+4,true),
          type=w.getUint32(at+8,true), offset=w.getUint32(at+12,true);
        ensure(slot<buffers && location<16 && !locations.has(location) && type>0 && type<vertexFormats.length &&
          offset%Math.min(4,vertexBytes[type])===0 && offset<=w.getUint32(112+slot*16,true)-vertexBytes[type], "Graphics vertex attribute");
        locations.add(location);
      }
    } else if (opcode === A.DOLLY_GPU_RESOURCE_GROUP) {
      ensure(w.getUint32(24,true)<4 && w.getUint32(28,true)<=16 && size===32+32*w.getUint32(28,true), "Resource group layout");
      const bindings=new Set();
      for(let i=0;i<w.getUint32(28,true);i++) {
        const at=32+i*32, binding=w.getUint32(at,true), kind=w.getUint32(at+4,true);
        ensure(binding<32 && !bindings.has(binding) && kind<=3 && (kind===0 ||
          (w.getBigUint64(at+16,true)===0n && w.getBigUint64(at+24,true)===0n)), "Resource binding");
        bindings.add(binding);
      }
    } else if (opcode === A.DOLLY_GPU_DRAW_MESH) {
      const groups=w.getUint32(64,true), buffers=w.getUint32(68,true);
      ensure(groups<=4 && buffers<=8 && size===80+8*groups+24*buffers && w.getBigUint64(72,true)===0n, "Mesh layout");
    } else if (opcode === A.DOLLY_GPU_CREATE_SAMPLER) {
      ensure(size===48 || size===56, "Sampler layout");
    } else if (opcode === A.DOLLY_GPU_CREATE_BIND_GROUP_LAYOUT) {
      const n=w.getUint32(16,true);
      ensure(n<=A.DOLLY_GPU_MAX_LAYOUT_ENTRIES && size===24+32*n && w.getUint32(20,true)===0, "Bind group layout layout");
    } else if (opcode === A.DOLLY_GPU_CREATE_PIPELINE_LAYOUT) {
      const n=w.getUint32(16,true);
      ensure(n<=8 && size===24+8*n && w.getUint32(20,true)===0, "Pipeline layout layout");
    } else if (opcode === A.DOLLY_GPU_CREATE_BIND_GROUP) {
      const n=w.getUint32(24,true);
      ensure(n<=A.DOLLY_GPU_MAX_LAYOUT_ENTRIES && size===32+32*n && w.getUint32(28,true)===0, "Bind group entries");
    } else if (opcode === A.DOLLY_GPU_CREATE_RENDER_PIPELINE) {
      const [targets,buffers,attributes,constants,vs,fs]=[136,140,144,148,152,156].map(at=>w.getUint32(at,true));
      ensure(targets<=8 && buffers<=16 && attributes<=32 && constants<=64 && vs<=64 && fs<=64 &&
        size===Math.ceil((160+40*targets+16*(buffers+attributes+constants)+vs+fs)/8)*8, "Render pipeline layout");
      const names=160+40*targets+16*(buffers+attributes+constants);
      text(b,names,vs);
      if(fs)text(b,names+vs,fs);
    } else if (opcode === A.DOLLY_GPU_CREATE_COMPUTE_PIPELINE) {
      const constants=w.getUint32(32,true), entry=w.getUint32(36,true);
      ensure(constants<=64 && entry<=64 && size===Math.ceil((40+16*constants+entry)/8)*8, "Compute pipeline layout");
      text(b,40+16*constants,entry);
    } else if (opcode === A.DOLLY_GPU_BEGIN_VIEW_PASS) {
      const n=w.getUint32(16,true);
      ensure(n<=8 && size===64+40*n && w.getUint32(60,true)>>>n===0, "View pass layout");
    } else if (opcode === A.DOLLY_GPU_SET_BIND_GROUP) {
      const n=w.getUint32(20,true);
      ensure(n<=16 && size===Math.ceil((24+4*n)/8)*8, "Bind group offsets");
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
  ensure(id > scope.high && id <= 0xffffffff && scope.objects.size + scope.retired.size < maxObjects, "Invalid or exhausted GPU object IDs", E.ENOSPC);
  scope.high = id;
  scope.objects.set(id, { kind, value, size, mapped: null });
}
function range(resource, offset, length) {
  ensure(offset >= 0 && length >= 0 && offset <= resource.size - length, "GPU buffer range");
}
function collectReleased(scope, completed) {
  for (const [id, resource] of scope.retired) {
    if (resource.submission > completed) continue;
    resource.value.destroy?.();
    usedBytes -= resource.size;
    scope.retired.delete(id);
  }
}
function release(scope, id, progress) {
  const resource = object(scope, id);
  scope.objects.delete(id);
  if (!resource.size || progress.completed >= progress.queued) {
    resource.value.destroy?.();
    usedBytes -= resource.size;
    return;
  }
  resource.submission = progress.queued;
  scope.retired.set(id, resource);
  if (scope.releaseFence !== resource.submission) {
    const submitted = scope.releaseFence = resource.submission;
    // Invalid handles disappear immediately; allocations and object slots remain
    // charged until the queue releases them. One fence covers a release cohort.
    scope.device.queue.onSubmittedWorkDone().catch(() => {}).then(() => {
      progress.completed = Math.max(progress.completed, submitted);
      collectReleased(scope, progress.completed);
    });
  }
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
    collectReleased(scope, Infinity);
    for (const t of scope.timers ?? []) { t.query.destroy(); t.resolve.destroy(); t.read.destroy(); }
    if (slots[scope.index] === scope) slots[scope.index] = null;
    postMessage({ type: "complete" });
  })();
  return scope.retiring;
}

async function batch(scope, commands, flags) {
  const device = scope.device;
  const progress = queueProgress;
  await queueFull(scope);
  // A batch sent with BATCH_CONTINUE leaves its encoder and open pass to the scope's next one.
  const continued = scope.open ?? {};
  scope.open = null;
  let {encoder, texture, computePass, explicitCompute = false, renderPass, viewPass = false, passWidth, passHeight,
    timer, queries = 0, renderPipeline, renderGroups, renderBuffers, renderIndex} = continued;
  let keepOpen = false;
  const getEncoder = () => encoder ??= device.createCommandEncoder();
  const endCompute = () => { computePass?.end(); computePass = null; explicitCompute = false; };
  const endRender = () => { renderPass?.end(); renderPass = null; viewPass = false; };
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
    for (const [index, { opcode: op, b, w }] of commands.entries()) try {
      const id = b.length >= 16 && !unhandledRecords.has(op) ? integer(w, 8) : 0;
      if (op !== A.DOLLY_GPU_COMPUTE && !explicitCompute) endCompute();
      if (renderPass) ensure((viewPass ? viewPassRecords : renderPassRecords).has(op), "Command is invalid inside a render pass");
      if (explicitCompute) ensure(computePassRecords.has(op), "Command is invalid inside a compute pass");
      if (creatingRecords.has(op)) ensure(id > scope.high && id <= 0xffffffff && scope.objects.size + scope.retired.size < maxObjects, "GPU object quota", E.ENOSPC);
      if (op === A.DOLLY_GPU_CREATE_BUFFER) {
        const size = integer(w, 16), usage = w.getUint32(24, true);
        ensure(size > 0 && size <= maxBuffer && size <= maxBytes - usedBytes, "GPU allocation quota", E.ENOMEM);
        ensure(w.getUint32(28, true) === 0 && usage > 0 && (usage & ~1023) === 0, "Buffer usage");
        const buffer = device.createBuffer({ size, usage });
        insert(scope, id, "buffer", buffer, size); usedBytes += size;
      } else if (op === A.DOLLY_GPU_WRITE_BUFFER) {
        const r = object(scope, id, "buffer"), offset = integer(w, 16), n = w.getUint32(28, true);
        range(r, offset, n); ensure(offset % 4 === 0 && !r.mapped, "Unaligned or mapped GPU upload");
        device.queue.writeBuffer(r.value, offset, b.subarray(w.getUint32(24, true), w.getUint32(24, true) + n));
        progress.queued++;
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
      } else if (op === A.DOLLY_GPU_CREATE_TEXTURE) {
        const width=w.getUint32(16,true), height=w.getUint32(20,true), layers=w.getUint32(24,true),
          mips=w.getUint32(28,true), type=w.getUint32(32,true), usage=w.getUint32(36,true),
          dimension=w.getUint32(40,true), samples=w.getUint16(44,true)||1, viewFormat=w.getUint16(46,true);
        const l=device.limits, largest=[0,l.maxTextureDimension1D,l.maxTextureDimension2D,l.maxTextureDimension3D][dimension];
        ensure(width>0 && height>0 && layers>0 && mips>0 && type>0 && type<textureFormats.length && usage>0 &&
          (usage&~31)===0 && dimension<=3 && viewFormat<textureFormats.length && (samples===1 || samples===4), "Texture descriptor");
        if(dimension===0) ensure(width<=Math.min(8192,l.maxTextureDimension2D) && height<=Math.min(8192,l.maxTextureDimension2D) &&
          (layers===1 || (layers===6 && width===height)) && !(usage&8), "Texture descriptor");
        else ensure(width<=largest && height<=(dimension===1?1:largest) &&
          layers<=(dimension===3?largest:dimension===1?1:l.maxTextureArrayLayers), "Texture dimensions");
        ensure(mips<=1+Math.floor(Math.log2(Math.max(width,height,dimension===3?layers:1))) &&
          (samples===1 || (dimension!==1 && dimension!==3 && mips===1 && layers===1)), "Texture mips/samples");
        let size=0;
        const block=compressedFormat(type)?4:1;
        if(block===4) {
          ensure(device.features.has("texture-compression-bc"), "BC texture compression unavailable", E.ENOSYS);
          ensure(width%block===0 && height%block===0 && !(usage&16), "BC texture descriptor");
        }
        if(type===45) ensure(device.features.has("depth32float-stencil8"), "depth32float-stencil8 unavailable", E.ENOSYS);
        for(let i=0;i<mips;i++)size+=Math.ceil(Math.max(1,width>>i)/block)*Math.ceil(Math.max(1,height>>i)/block)*
          (dimension===3?Math.max(1,layers>>i):layers)*blockBytes[type]*samples;
        ensure(size<=bufferCeiling && size<=maxBytes-usedBytes, "Texture allocation quota", E.ENOMEM);
        const value=device.createTexture({size:{width,height,depthOrArrayLayers:layers},mipLevelCount:mips,
          dimension:["2d","1d","2d","3d"][dimension],sampleCount:samples,format:textureFormats[type],usage,
          viewFormats:viewFormat?[textureFormats[viewFormat]]:[]});
        insert(scope,id,"texture",value,size);usedBytes+=size;
        Object.assign(object(scope,id),{width,height,layers,mips,type,dimension,samples});
      } else if (op === A.DOLLY_GPU_WRITE_TEXTURE) {
        const r=object(scope,id,"texture"), mip=w.getUint32(16,true), layer=w.getUint32(20,true),
          x=w.getUint32(24,true), y=w.getUint32(28,true), width=w.getUint32(32,true), height=w.getUint32(36,true), n=w.getUint32(40,true);
        const block=compressedFormat(r.type)?4:1;
        ensure(!depthFormat(r.type) && !stencilFormat(r.type) && r.samples===1 && mip<r.mips && layer<r.layers && width>0 && height>0 &&
          x%block===0 && y%block===0 && width%block===0 && height%block===0 &&
          x<=Math.ceil(Math.max(1,r.width>>mip)/block)*block-width &&
          y<=Math.ceil(Math.max(1,r.height>>mip)/block)*block-height &&
          n===(width/block)*(height/block)*blockBytes[r.type], "Texture upload range");
        device.queue.writeTexture({texture:r.value,mipLevel:mip,origin:{x,y,z:layer}},b.subarray(48,48+n),
          {bytesPerRow:width/block*blockBytes[r.type],rowsPerImage:height/block},{width,height});
        progress.queued++;
      } else if (op === A.DOLLY_GPU_CREATE_SAMPLER) {
        const filters=[16,20,24].map(at=>w.getUint32(at,true)), address=[28,32,36].map(at=>w.getUint32(at,true)),
          compare=w.getUint32(40,true), maxAnisotropy=w.getUint32(44,true);
        const [lodMinClamp,lodMaxClamp]=b.length===56?[w.getFloat32(48,true),w.getFloat32(52,true)]:[0,32];
        ensure(filters.every(n=>n<=1) && address.every(n=>n<=2) && compare<=8 && maxAnisotropy>=1 &&
          maxAnisotropy<=16 && (maxAnisotropy===1 || filters.every(n=>n===1)) &&
          Number.isFinite(lodMinClamp) && Number.isFinite(lodMaxClamp) && lodMinClamp>=0 && lodMinClamp<=lodMaxClamp, "Sampler descriptor");
        const addresses=["clamp-to-edge","repeat","mirror-repeat"], modes=["nearest","linear"];
        insert(scope,id,"sampler",device.createSampler({minFilter:modes[filters[0]],magFilter:modes[filters[1]],
          mipmapFilter:modes[filters[2]],addressModeU:addresses[address[0]],addressModeV:addresses[address[1]],
          addressModeW:addresses[address[2]],compare:compareOps[compare],maxAnisotropy,lodMinClamp,lodMaxClamp}));
      } else if (op === A.DOLLY_GPU_GRAPHICS_PIPELINE) {
        const color=w.getUint32(32,true), depth=w.getUint32(36,true), topology=w.getUint32(40,true),
          cull=w.getUint32(44,true), front=w.getUint32(48,true), compare=w.getUint32(52,true), write=w.getUint32(56,true),
          slope=w.getFloat32(64,true), clamp=w.getFloat32(68,true), mask=w.getUint32(72,true), blend=w.getUint32(76,true);
        ensure(color<=4 && (depth===0 || depth===5 || depth===6) && topology<=3 && cull<=2 && front<=1 &&
          compare>=1 && compare<=8 && write<=1 && Number.isFinite(slope) && Number.isFinite(clamp) && mask<=15 && blend<=1,
          "Graphics pipeline state");
        const component=at=>{
          const op=w.getUint32(at,true), src=w.getUint32(at+4,true), dst=w.getUint32(at+8,true);
          ensure(op<blendOps.length && src<blendFactors.length && dst<blendFactors.length,"Blend state");
          return {operation:blendOps[op],srcFactor:blendFactors[src],dstFactor:blendFactors[dst]};
        };
        const colorBlend=component(80), alphaBlend=component(92), count=w.getUint32(104,true), buffers=[];
        for(let i=0;i<count;i++)buffers.push({arrayStride:w.getUint32(112+i*16,true),
          stepMode:w.getUint32(116+i*16,true)?"instance":"vertex",attributes:[]});
        for(let i=0;i<w.getUint32(108,true);i++) {
          const at=112+(count+i)*16;
          buffers[w.getUint32(at,true)].attributes.push({shaderLocation:w.getUint32(at+4,true),
            format:vertexFormats[w.getUint32(at+8,true)],offset:w.getUint32(at+12,true)});
        }
        const value=await device.createRenderPipelineAsync({layout:"auto",
          vertex:{module:object(scope,integer(w,16),"shader").value,entryPoint:"main",buffers},
          fragment:{module:object(scope,integer(w,24),"shader").value,entryPoint:"main",
            targets:[{format:color?textureFormats[color]:format,writeMask:mask,...(blend?{blend:{color:colorBlend,alpha:alphaBlend}}:{})}]},
          primitive:{topology:["triangle-list","triangle-strip","line-list","point-list"][topology],
            ...(topology===1?{stripIndexFormat:"uint16"}:{}),cullMode:["none","front","back"][cull],frontFace:front?"cw":"ccw"},
          ...(depth?{depthStencil:{format:textureFormats[depth],depthWriteEnabled:!!write,depthCompare:compareOps[compare],
            depthBias:w.getInt32(60,true),depthBiasSlopeScale:slope,depthBiasClamp:clamp}}:{})});
        insert(scope,id,"graphics",value);
      } else if (op === A.DOLLY_GPU_RESOURCE_GROUP) {
        const pipeline=object(scope,integer(w,16),"graphics"), index=w.getUint32(24,true), entries=[];
        for(let i=0;i<w.getUint32(28,true);i++) {
          const at=32+i*32, binding=w.getUint32(at,true), kind=w.getUint32(at+4,true),
            r=object(scope,integer(w,at+8),["buffer","texture","texture","sampler"][kind]);
          let resource;
          if(kind===0) {
            const offset=integer(w,at+16), size=integer(w,at+24);range(r,offset,size);
            ensure(size>0 && !r.mapped,"Invalid bound buffer");resource={buffer:r.value,offset,size};
          } else if(kind===3)resource=r.value;
          else {
            ensure(kind!==2 || r.layers===6,"Cube binding requires six layers");
            ensure(r.dimension===0,"Resource groups bind two-dimensional textures");
            resource=r.value.createView({dimension:kind===2?"cube":"2d",arrayLayerCount:kind===2?6:1,
              aspect:r.type===5?"depth-only":"all"});
          }
          entries.push({binding,resource});
        }
        insert(scope,id,"resource-group",device.createBindGroup({layout:pipeline.value.getBindGroupLayout(index),entries}));
        object(scope,id).index=index;
      } else if (op === A.DOLLY_GPU_BEGIN_RENDER_PASS) {
        const depth=integer(w,16), width=w.getUint32(24,true), height=w.getUint32(28,true),
          colorClear=w.getUint32(32,true), depthClear=w.getUint32(36,true), clearValue=[40,44,48,52].map(at=>w.getFloat32(at,true)),
          depthClearValue=w.getFloat32(56,true), stencilClearValue=w.getUint32(60,true);
        ensure(width>0 && height>0 && colorClear<=1 && depthClear<=1 && clearValue.every(Number.isFinite) &&
          depthClearValue>=0 && depthClearValue<=1 && stencilClearValue<=255,"Render pass descriptor");
        let colorTexture;
        if(id) {
          const r=object(scope,id,"texture");
          ensure(r.width===width && r.height===height && r.type<=4 && r.layers===1 && r.dimension===0 && r.samples===1,"Color attachment dimensions/format");
          colorTexture=r.value;
        } else {
          ensure(scope.surface && width<=4096 && height<=2304,"Surface attachment dimensions/ownership");
          if(!texture) {
            if(canvas.width!==width || canvas.height!==height){canvas.width=width;canvas.height=height;}
            texture=context.getCurrentTexture();
          } else ensure(canvas.width===width && canvas.height===height,"Surface resized within batch");
          colorTexture=texture;
        }
        let depthStencilAttachment;
        if(depth) {
          const r=object(scope,depth,"texture");
          ensure(r.width===width && r.height===height && (r.type===5 || r.type===6) && r.layers===1 && r.dimension===0 && r.samples===1,"Depth attachment dimensions/format");
          depthStencilAttachment={view:r.value.createView({mipLevelCount:1}),depthLoadOp:depthClear?"clear":"load",depthStoreOp:"store",depthClearValue,
            ...(r.type===5?{stencilLoadOp:depthClear?"clear":"load",stencilStoreOp:"store",stencilClearValue}:{})};
        }
        renderPass=getEncoder().beginRenderPass({...timestamps(),colorAttachments:[{view:colorTexture.createView({mipLevelCount:1}),
          loadOp:colorClear?"clear":"load",storeOp:"store",clearValue}],depthStencilAttachment});
        passWidth=width;passHeight=height;
        renderPipeline=null;renderGroups=[];renderBuffers=[];renderIndex=null;
      } else if (op === A.DOLLY_GPU_END_RENDER_PASS) {
        ensure(renderPass,"No active render pass");endRender();
      } else if (op === A.DOLLY_GPU_VIEWPORT) {
        ensure(renderPass,"Viewport outside render pass");
        const [x,y,width,height,min,max]=[8,12,16,20,24,28].map(at=>w.getFloat32(at,true)),
          scissor=[32,36,40,44].map(at=>w.getUint32(at,true));
        ensure([x,y,width,height,min,max].every(Number.isFinite) && x>=0 && y>=0 && width>0 && height>0 &&
          x<=passWidth-width && y<=passHeight-height && min>=0 && max<=1 && min<=max &&
          scissor[0]<=passWidth-scissor[2] && scissor[1]<=passHeight-scissor[3],"Viewport/scissor bounds");
        renderPass.setViewport(x,y,width,height,min,max);renderPass.setScissorRect(...scissor);
      } else if (op === A.DOLLY_GPU_DRAW_MESH) {
        ensure(renderPass,"Draw outside render pass");
        const count=w.getUint32(40,true), instances=w.getUint32(44,true), first=w.getUint32(48,true),
          base=w.getInt32(52,true), firstInstance=w.getUint32(56,true), indexType=w.getUint32(60,true),
          groupCount=w.getUint32(64,true), bufferCount=w.getUint32(68,true);
        ensure(count>0 && instances>0 && count*instances<=4*1024*1024 && first+count<=0xffffffff &&
          firstInstance+instances<=0xffffffff && indexType<=2,"Mesh draw limit",E.E2BIG);
        const pipeline=object(scope,id,"graphics").value;
        if(renderPipeline!==pipeline){renderPass.setPipeline(pipeline);renderPipeline=pipeline;}
        const groups=new Set();
        for(let i=0;i<groupCount;i++) {
          const r=object(scope,integer(w,80+i*8),"resource-group");
          ensure(!groups.has(r.index),"Duplicate mesh group");groups.add(r.index);
          if(renderGroups[r.index]!==r.value){renderPass.setBindGroup(r.index,r.value);renderGroups[r.index]=r.value;}
        }
        for(let i=0;i<bufferCount;i++) {
          const at=80+8*groupCount+24*i, r=object(scope,integer(w,at),"buffer"), offset=integer(w,at+8), size=integer(w,at+16);
          range(r,offset,size);ensure(!r.mapped && size>0,"Invalid vertex buffer");
          const slot=i*3;
          if(renderBuffers[slot]!==r.value || renderBuffers[slot+1]!==offset || renderBuffers[slot+2]!==size){
            renderPass.setVertexBuffer(i,r.value,offset,size);
            renderBuffers[slot]=r.value;renderBuffers[slot+1]=offset;renderBuffers[slot+2]=size;
          }
        }
        if(indexType) {
          const r=object(scope,integer(w,16),"buffer"), offset=integer(w,24), size=integer(w,32), stride=indexType===1?2:4;
          range(r,offset,size);ensure(!r.mapped && (first+count)*stride<=size,"Index buffer range");
          if(!renderIndex || renderIndex[0]!==r.value || renderIndex[1]!==indexType || renderIndex[2]!==offset || renderIndex[3]!==size){
            renderPass.setIndexBuffer(r.value,indexType===1?"uint16":"uint32",offset,size);
            renderIndex=[r.value,indexType,offset,size];
          }
          renderPass.drawIndexed(count,instances,first,base,firstInstance);
        } else {
          ensure(w.getBigUint64(16,true)===0n && w.getBigUint64(24,true)===0n && w.getBigUint64(32,true)===0n && base===0,
            "Unexpected nonindexed draw arguments");
          renderPass.draw(count,instances,first,firstInstance);
        }
      } else if (op === A.DOLLY_GPU_COMPUTE) {
        const xyz=[24,28,32].map(o=>w.getUint32(o,true));
        ensure(w.getUint32(36,true)===0 && xyz.every(n=>n>0 && n<=65535) && xyz.reduce((a,n)=>a*n,1)<=1048576, "Dispatch limit",E.E2BIG);
        computePass ??= getEncoder().beginComputePass(timestamps());
        computePass.setPipeline(object(scope,id,"compute").value);
        computePass.setBindGroup(0,object(scope,integer(w,16),"group").value); computePass.dispatchWorkgroups(...xyz); stats.dispatches++;
      } else if (op === A.DOLLY_GPU_COPY_BUFFER) {
        const src=object(scope,id,"buffer"), dst=object(scope,integer(w,16),"buffer"), so=integer(w,24), to=integer(w,32), n=integer(w,40);
        range(src,so,n);range(dst,to,n);getEncoder().copyBufferToBuffer(src.value,so,dst.value,to,n);
      } else if (op === A.DOLLY_GPU_CAPTURE_FRAME) {
        ensure(scope.surface && texture, "Capture requires a rendered surface in this batch");
        const x=w.getUint32(16,true), y=w.getUint32(20,true), width=w.getUint32(24,true), height=w.getUint32(28,true);
        ensure(width>0 && height>0 && x<=texture.width-width && y<=texture.height-height, "Capture rectangle outside surface");
        const dst=object(scope,id,"buffer"), bytesPerRow=Math.ceil(width*4/256)*256;
        range(dst,0,bytesPerRow*(height-1)+width*4);
        ensure(!dst.mapped && (dst.value.usage & GPUBufferUsage.COPY_DST), "Capture destination is mapped or not writable");
        getEncoder().copyTextureToBuffer({texture,origin:{x,y}}, {buffer:dst.value,bytesPerRow}, {width,height});
      } else if (op === A.DOLLY_GPU_SUBMIT) {
        ensure(encoder,"No GPU commands to submit");
        await queueFull(scope);
        const measured = queries ? timer : null, count = queries;
        if (measured) {
          encoder.resolveQuerySet(measured.query,0,count,measured.resolve,0);
          encoder.copyBufferToBuffer(measured.resolve,0,measured.read,0,count*8);
          measured.busy = true;
        }
        device.queue.submit([encoder.finish()]);encoder=null;
        const submittedWork = ++progress.queued;
        if (measured) measured.read.mapAsync(GPUMapMode.READ,0,count*8).then(() => {
          const values=new BigUint64Array(measured.read.getMappedRange(0,count*8));
          let ns=0n;for(let i=0;i<count;i+=2)if(values[i+1]>=values[i])ns+=values[i+1]-values[i];
          if (!scope.lost) {scope.gpuMs=Number(ns)/1e6;scope.gpuTotalMs+=scope.gpuMs;scope.gpuSamples++;}
          measured.read.unmap();
        }).catch(()=>{}).finally(()=>{measured.busy=false;});
        timer=null;queries=0;
        const completed=device.queue.onSubmittedWorkDone().then(()=>{
          progress.completed=Math.max(progress.completed,submittedWork);
        }).finally(()=>{
          scope.submissions.splice(scope.submissions.indexOf(completed),1);

        });
        scope.submissions.push(completed);
        if(texture)present(scope,completed);
        completed.catch(()=>{});
        if(texture){stats.frames++;postMessage({type:"status",active:true,width:canvas.width,height:canvas.height,stats:{...stats,allocatedBytes:usedBytes}});texture=null;}
      } else if (op === A.DOLLY_GPU_CREATE_VIEW) {
        const r=object(scope,integer(w,16),"texture"), [format,dimension,aspect,baseMip,mips,baseLayer,layers,swizzle]=
          [24,28,32,36,40,44,48,52].map(at=>w.getUint32(at,true));
        const channels=[0,1,2,3].map(i=>(swizzle>>>(8*i))&255);
        ensure(format<textureFormats.length && dimension<=6 && aspect<=2 && baseMip<r.mips && mips<=r.mips-baseMip &&
          channels.every(n=>n<=5), `View descriptor: format ${format}, dimension ${dimension}, aspect ${aspect}, mips ${baseMip}+${mips} of ${r.mips}, swizzle ${swizzle.toString(16)}`);
        const descriptor={aspect:aspects[aspect],baseMipLevel:baseMip,baseArrayLayer:baseLayer,
          ...(format?{format:textureFormats[format]}:{}),...(dimension?{dimension:viewDimensions[dimension]}:{}),
          ...(mips?{mipLevelCount:mips}:{}),...(layers?{arrayLayerCount:layers}:{}),
          ...(srgbFormat(format) && r.value.usage & GPUTextureUsage.STORAGE_BINDING?{usage:r.value.usage & ~GPUTextureUsage.STORAGE_BINDING}:{})};
        if(swizzle!==0x03020100) {
          ensure(device.features.has("texture-component-swizzle"),"Texture swizzles are unavailable",E.ENOTSUP);
          descriptor.swizzle=channels.map(n=>"rgba01"[n]).join("");
        }
        insert(scope,id,"view",r.value.createView(descriptor));
        Object.assign(object(scope,id),{texture:r,width:Math.max(1,r.width>>baseMip),height:Math.max(1,r.height>>baseMip),
          type:format||r.type});
      } else if (op === A.DOLLY_GPU_CREATE_BIND_GROUP_LAYOUT) {
        const entries=[];
        for(let i=0;i<w.getUint32(16,true);i++) {
          const at=24+i*32, [binding,visibility,type,a,bb,c]=[0,4,8,12,16,20].map(o=>w.getUint32(at+o,true)),
            minBindingSize=integer(w,at+24), entry={binding,visibility};
          ensure(visibility>0 && visibility<=7 && type>=1 && type<=8, "Bind group layout entry");
          if(type<=3) {
            ensure(a<=1 && bb===0 && c===0, "Buffer layout entry");
            entry.buffer={type:["uniform","storage","read-only-storage"][type-1],hasDynamicOffset:a===1,minBindingSize};
          } else if(type<=6) {
            ensure(a===0 && bb===0 && c===0 && minBindingSize===0, "Sampler layout entry");
            entry.sampler={type:["filtering","non-filtering","comparison"][type-4]};
          } else if(type===7) {
            ensure(a>=1 && a<=5 && bb>=1 && bb<=6 && c<=1 && minBindingSize===0, "Texture layout entry");
            entry.texture={sampleType:["float","unfilterable-float","depth","sint","uint"][a-1],viewDimension:viewDimensions[bb],multisampled:c===1};
          } else {
            ensure(a>=1 && a<=3 && bb>=1 && bb<=6 && c>0 && c<textureFormats.length && minBindingSize===0, "Storage texture layout entry");
            entry.storageTexture={access:["write-only","read-only","read-write"][a-1],format:textureFormats[c],viewDimension:viewDimensions[bb]};
          }
          entries.push(entry);
        }
        insert(scope,id,"group-layout",device.createBindGroupLayout({entries}));
      } else if (op === A.DOLLY_GPU_CREATE_PIPELINE_LAYOUT) {
        const bindGroupLayouts=[];
        for(let i=0;i<w.getUint32(16,true);i++)bindGroupLayouts.push(object(scope,integer(w,24+i*8),"group-layout").value);
        insert(scope,id,"pipeline-layout",device.createPipelineLayout({bindGroupLayouts}));
      } else if (op === A.DOLLY_GPU_CREATE_BIND_GROUP) {
        const layout=object(scope,integer(w,16),"group-layout").value, entries=[];
        for(let i=0;i<w.getUint32(24,true);i++) {
          const at=32+i*32, binding=w.getUint32(at,true), kind=w.getUint32(at+4,true);
          ensure(kind<=2, "Bind group entry kind");
          const r=object(scope,integer(w,at+8),["buffer","sampler","view"][kind]);
          let resource=r.value;
          if(kind===0) {
            const offset=integer(w,at+16), size=integer(w,at+24);range(r,offset,size);
            ensure(size>0 && !r.mapped,"Invalid bound buffer");resource={buffer:r.value,offset,size};
          } else ensure(w.getBigUint64(at+16,true)===0n && w.getBigUint64(at+24,true)===0n, "Bind group entry range");
          entries.push({binding,resource});
        }
        insert(scope,id,"bind-group",device.createBindGroup({layout,entries}));
      } else if (op === A.DOLLY_GPU_CREATE_RENDER_PIPELINE) {
        const field=at=>w.getUint32(at,true);
        const [topology,stripFormat,front,cull,unclipped,depth,depthWrite,depthCompare]=[40,44,48,52,56,60,64,68].map(field);
        const [samples,mask,coverage,targetCount,bufferCount,attributeCount,constantCount,vs,fs]=[124,128,132,136,140,144,148,152,156].map(field);
        const stencil=at=>{
          const [compare,failOp,depthFailOp,passOp]=[0,4,8,12].map(o=>field(at+o));
          ensure(compare>=1 && compare<=8 && [failOp,depthFailOp,passOp].every(n=>n<stencilOps.length), "Stencil state");
          return {compare:compareOps[compare],failOp:stencilOps[failOp],depthFailOp:stencilOps[depthFailOp],passOp:stencilOps[passOp]};
        };
        const slope=w.getFloat32(116,true), clamp=w.getFloat32(120,true);
        ensure(topology<=4 && stripFormat<=2 && (stripFormat===0 || topology===1 || topology===3) && front<=1 && cull<=2 &&
          unclipped<=1 && [0,5,6,43,44,45].includes(depth) && depthWrite<=1 && depthCompare<=8 && (depth===0) === (depthCompare===0) &&
          Number.isFinite(slope) && Number.isFinite(clamp) && (samples===1 || samples===4) && coverage<=1, "Render pipeline state");
        let at=160;
        const targets=[];
        for(let i=0;i<targetCount;i++,at+=40) {
          const [targetFormat,writeMask,blend]=[0,4,8].map(o=>field(at+o));
          const component=o=>{
            const [operation,src,dst]=[0,4,8].map(n=>field(at+o+n));
            ensure(operation<blendOps.length && src<blendFactors.length && dst<blendFactors.length, "Blend state");
            return {operation:blendOps[operation],srcFactor:blendFactors[src],dstFactor:blendFactors[dst]};
          };
          const absent=field(at+36);
          ensure(targetFormat<textureFormats.length && writeMask<=15 && blend<=1 && absent<=1, "Render target");
          if(absent) {
            ensure(!targetFormat && !writeMask && !blend, "Absent render target");
            targets.push(null);
            continue;
          }
          targets.push({format:targetFormat?textureFormats[targetFormat]:format,writeMask,...(blend?{blend:{color:component(12),alpha:component(24)}}:{})});
        }
        const buffers=[];
        for(let i=0;i<bufferCount;i++,at+=16) {
          ensure(field(at+4)<=1 && w.getBigUint64(at+8,true)===0n, "Vertex buffer layout");
          buffers.push({arrayStride:field(at),stepMode:field(at+4)?"instance":"vertex",attributes:[]});
        }
        for(let i=0;i<attributeCount;i++,at+=16) {
          const [slot,shaderLocation,type,offset]=[0,4,8,12].map(o=>field(at+o));
          ensure(slot<bufferCount && type>0 && type<vertexFormats.length, "Vertex attribute");
          buffers[slot].attributes.push({shaderLocation,format:vertexFormats[type],offset});
        }
        const vertexConstants={}, fragmentConstants={};
        for(let i=0;i<constantCount;i++,at+=16) {
          const constantId=field(at), stages=field(at+4), value=w.getFloat64(at+8,true);
          ensure(stages>0 && stages<=3 && Number.isFinite(value), "Override constant");
          if(stages&1)vertexConstants[constantId]=value;
          if(stages&2)fragmentConstants[constantId]=value;
        }
        const vertexEntry=text(b,at,vs), fragmentShader=integer(w,32);
        const descriptor={layout:object(scope,integer(w,16),"pipeline-layout").value,
          vertex:{module:object(scope,integer(w,24),"shader").value,entryPoint:vertexEntry,buffers,constants:vertexConstants},
          primitive:{topology:["triangle-list","triangle-strip","line-list","line-strip","point-list"][topology],
            ...(stripFormat?{stripIndexFormat:["","uint16","uint32"][stripFormat]}:{}),frontFace:front?"cw":"ccw",
            cullMode:["none","front","back"][cull],...(unclipped?{unclippedDepth:true}:{})},
          multisample:{count:samples,mask,alphaToCoverageEnabled:coverage===1}};
        if(fragmentShader) descriptor.fragment={module:object(scope,fragmentShader,"shader").value,entryPoint:text(b,at+vs,fs),
          targets,constants:fragmentConstants};
        else ensure(fs===0 && targetCount===0, "Render targets without a fragment stage");
        if(depth) descriptor.depthStencil={format:textureFormats[depth],depthWriteEnabled:depthWrite===1,
          depthCompare:compareOps[depthCompare],stencilFront:stencil(72),stencilBack:stencil(88),
          stencilReadMask:field(104),stencilWriteMask:field(108),depthBias:w.getInt32(112,true),
          depthBiasSlopeScale:slope,depthBiasClamp:clamp};
        insert(scope,id,"view-render",await device.createRenderPipelineAsync(descriptor));
      } else if (op === A.DOLLY_GPU_CREATE_COMPUTE_PIPELINE) {
        const constantCount=w.getUint32(32,true), constants={};
        for(let i=0;i<constantCount;i++) {
          const at=40+i*16, value=w.getFloat64(at+8,true);
          ensure(w.getUint32(at+4,true)===0 && Number.isFinite(value), "Override constant");
          constants[w.getUint32(at,true)]=value;
        }
        insert(scope,id,"view-compute",await device.createComputePipelineAsync({
          layout:object(scope,integer(w,16),"pipeline-layout").value,
          compute:{module:object(scope,integer(w,24),"shader").value,entryPoint:text(b,40+16*constantCount,w.getUint32(36,true)),constants}}));
      } else if (op === A.DOLLY_GPU_CREATE_QUERY_SET) {
        const count=w.getUint32(16,true);
        ensure(device.features.has("timestamp-query"),"Timestamp queries are unavailable",E.ENOTSUP);
        ensure(count>0 && count<=4096 && w.getUint32(20,true)===0 && count*8<=maxBytes-usedBytes, "Query set");
        insert(scope,id,"query-set",device.createQuerySet({type:"timestamp",count}),count*8);usedBytes+=count*8;
      } else if (op === A.DOLLY_GPU_COPY_BUFFER_TO_TEXTURE || op === A.DOLLY_GPU_COPY_TEXTURE_TO_BUFFER) {
        const r=object(scope,id,"buffer"), t=object(scope,integer(w,32),"texture");
        const [bytesPerRow,rowsPerImage]=[24,28].map(at=>w.getUint32(at,true)),
          [mipLevel,aspect,x,y,z,width,height,depthOrArrayLayers]=[40,44,48,52,56,60,64,68].map(at=>w.getUint32(at,true));
        ensure(!r.mapped && aspect<=2 && bytesPerRow%256===0, "Buffer-texture copy");
        const buffer={buffer:r.value,offset:integer(w,16),bytesPerRow,rowsPerImage},
          image={texture:t.value,mipLevel,origin:{x,y,z},aspect:aspects[aspect]}, extent={width,height,depthOrArrayLayers};
        if(op===A.DOLLY_GPU_COPY_BUFFER_TO_TEXTURE)getEncoder().copyBufferToTexture(buffer,image,extent);
        else getEncoder().copyTextureToBuffer(image,buffer,extent);
      } else if (op === A.DOLLY_GPU_COPY_TEXTURE_TO_TEXTURE) {
        const field=at=>w.getUint32(at,true);
        ensure(field(68)===0, "Texture copy reserved field");
        getEncoder().copyTextureToTexture(
          {texture:object(scope,id,"texture").value,mipLevel:field(24),origin:{x:field(28),y:field(32),z:field(36)}},
          {texture:object(scope,integer(w,16),"texture").value,mipLevel:field(40),origin:{x:field(44),y:field(48),z:field(52)}},
          {width:field(56),height:field(60),depthOrArrayLayers:field(64)});
      } else if (op === A.DOLLY_GPU_CLEAR_BUFFER) {
        const r=object(scope,id,"buffer"), offset=integer(w,16), size=integer(w,24);
        range(r,offset,size);ensure(!r.mapped,"Clearing a mapped buffer");
        getEncoder().clearBuffer(r.value,offset,size);
      } else if (op === A.DOLLY_GPU_WRITE_TIMESTAMP) {
        const q=object(scope,id,"query-set"), index=w.getUint32(16,true);
        ensure(w.getUint32(20,true)===0, "Timestamp reserved field");
        getEncoder().beginComputePass({timestampWrites:{querySet:q.value,beginningOfPassWriteIndex:index}}).end();
      } else if (op === A.DOLLY_GPU_RESOLVE_QUERY_SET) {
        const q=object(scope,id,"query-set"), r=object(scope,integer(w,24),"buffer");
        ensure(!r.mapped, "Resolving into a mapped buffer");
        getEncoder().resolveQuerySet(q.value,w.getUint32(16,true),w.getUint32(20,true),r.value,integer(w,32));
      } else if (op === A.DOLLY_GPU_BEGIN_VIEW_PASS) {
        const field=at=>w.getUint32(at,true), count=field(16), width=field(20), height=field(24), absent=field(60);
        const colorAttachments=[];
        let size;
        for(let i=0;i<count;i++) {
          const at=64+i*40, view=integer(w,at), resolve=integer(w,at+8), load=field(at+16), store=field(at+20),
            clearValue=[24,28,32,36].map(o=>w.getFloat32(at+o,true));
          if(absent>>>i&1) {
            ensure(!view && !resolve && !load && !store && clearValue.every(v=>v===0), "Absent colour attachment");
            colorAttachments.push(null);
            continue;
          }
          ensure(load<=1 && store<=1 && clearValue.every(Number.isFinite), "Colour attachment");
          let attachment;
          if(view) {
            const r=object(scope,view,"view");attachment=r.value;size??=[r.width,r.height];
          } else {
            ensure(scope.surface && width>0 && height>0 && width<=4096 && height<=2304,"Surface attachment dimensions/ownership");
            if(!texture) {
              if(canvas.width!==width || canvas.height!==height){canvas.width=width;canvas.height=height;}
              texture=context.getCurrentTexture();
            } else ensure(canvas.width===width && canvas.height===height,"Surface resized within batch");
            attachment=texture.createView();size??=[width,height];
          }
          colorAttachments.push({view:attachment,...(resolve?{resolveTarget:object(scope,resolve,"view").value}:{}),
            loadOp:load?"clear":"load",storeOp:store?"discard":"store",clearValue});
        }
        let depthStencilAttachment;
        const depthView=integer(w,8);
        if(depthView) {
          const r=object(scope,depthView,"view"), [depthLoad,depthStore,depthReadOnly]=[28,32,36].map(field),
            depthClearValue=w.getFloat32(40,true), [stencilLoad,stencilStore,stencilReadOnly,stencilClearValue]=[44,48,52,56].map(field);
          ensure(depthLoad<=1 && depthStore<=1 && depthReadOnly<=1 && depthClearValue>=0 && depthClearValue<=1 &&
            stencilLoad<=1 && stencilStore<=1 && stencilReadOnly<=1, "Depth attachment");
          depthStencilAttachment={view:r.value};
          if(depthFormat(r.type)) Object.assign(depthStencilAttachment, depthReadOnly?{depthReadOnly:true}:
            {depthLoadOp:depthLoad?"clear":"load",depthStoreOp:depthStore?"discard":"store",depthClearValue});
          if(stencilFormat(r.type)) Object.assign(depthStencilAttachment, stencilReadOnly?{stencilReadOnly:true}:
            {stencilLoadOp:stencilLoad?"clear":"load",stencilStoreOp:stencilStore?"discard":"store",stencilClearValue});
          size??=[r.width,r.height];
        }
        ensure(size, "A render pass needs an attachment");
        renderPass=getEncoder().beginRenderPass({...timestamps(),colorAttachments,depthStencilAttachment});
        viewPass=true;[passWidth,passHeight]=size;
      } else if (op === A.DOLLY_GPU_BEGIN_COMPUTE_PASS) {
        computePass=getEncoder().beginComputePass(timestamps());explicitCompute=true;
      } else if (op === A.DOLLY_GPU_END_COMPUTE_PASS) {
        ensure(explicitCompute,"No active compute pass");endCompute();
      } else if (op === A.DOLLY_GPU_SET_PIPELINE) {
        if(viewPass)renderPass.setPipeline(object(scope,id,"view-render").value);
        else {ensure(explicitCompute,"Pipeline outside a pass");computePass.setPipeline(object(scope,id,"view-compute").value);}
      } else if (op === A.DOLLY_GPU_SET_BIND_GROUP) {
        ensure(viewPass || explicitCompute,"Bind group outside a pass");
        const index=w.getUint32(16,true), offsets=[];
        for(let i=0;i<w.getUint32(20,true);i++)offsets.push(w.getUint32(24+i*4,true));
        ensure(index<8,"Bind group index");
        (viewPass?renderPass:computePass).setBindGroup(index,object(scope,id,"bind-group").value,offsets);
      } else if (op === A.DOLLY_GPU_SET_VERTEX_BUFFER || op === A.DOLLY_GPU_SET_INDEX_BUFFER) {
        ensure(viewPass,"Buffer binding outside a render pass");
        const r=object(scope,id,"buffer"), kind=w.getUint32(16,true), offset=integer(w,24), size=integer(w,32);
        range(r,offset,size);ensure(!r.mapped && w.getUint32(20,true)===0,"Invalid vertex or index buffer");
        if(op===A.DOLLY_GPU_SET_VERTEX_BUFFER) {ensure(kind<16,"Vertex buffer slot");renderPass.setVertexBuffer(kind,r.value,offset,size);}
        else {ensure(kind===1 || kind===2,"Index format");renderPass.setIndexBuffer(r.value,kind===1?"uint16":"uint32",offset,size);}
      } else if (op === A.DOLLY_GPU_DRAW) {
        ensure(viewPass,"Draw outside a render pass");
        renderPass.draw(...[8,12,16,20].map(at=>w.getUint32(at,true)));
      } else if (op === A.DOLLY_GPU_DRAW_INDEXED) {
        ensure(viewPass && w.getUint32(28,true)===0,"Draw outside a render pass");
        renderPass.drawIndexed(w.getUint32(8,true),w.getUint32(12,true),w.getUint32(16,true),w.getInt32(20,true),w.getUint32(24,true));
      } else if (op === A.DOLLY_GPU_DRAW_INDIRECT || op === A.DOLLY_GPU_DRAW_INDEXED_INDIRECT || op === A.DOLLY_GPU_DISPATCH_INDIRECT) {
        const r=object(scope,id,"buffer"), offset=integer(w,16);
        ensure(!r.mapped,"Indirect arguments in a mapped buffer");
        if(op===A.DOLLY_GPU_DISPATCH_INDIRECT) {ensure(explicitCompute,"Dispatch outside a compute pass");computePass.dispatchWorkgroupsIndirect(r.value,offset);stats.dispatches++;}
        else {
          ensure(viewPass,"Draw outside a render pass");
          if(op===A.DOLLY_GPU_DRAW_INDIRECT)renderPass.drawIndirect(r.value,offset);else renderPass.drawIndexedIndirect(r.value,offset);
        }
      } else if (op === A.DOLLY_GPU_SET_BLEND_CONSTANT) {
        const color=[8,12,16,20].map(at=>w.getFloat32(at,true));
        ensure(viewPass && color.every(Number.isFinite),"Blend constant");renderPass.setBlendConstant(color);
      } else if (op === A.DOLLY_GPU_SET_STENCIL_REFERENCE) {
        ensure(viewPass && w.getUint32(12,true)===0,"Stencil reference");renderPass.setStencilReference(w.getUint32(8,true));
      } else if (op === A.DOLLY_GPU_DISPATCH) {
        ensure(explicitCompute && w.getUint32(20,true)===0,"Dispatch outside a compute pass");
        computePass.dispatchWorkgroups(w.getUint32(8,true),w.getUint32(12,true),w.getUint32(16,true));stats.dispatches++;
      } else if (op === A.DOLLY_GPU_MAP_READ) {
        ensure(!encoder,"Submit before mapping");
        const r=object(scope,id,"buffer"), offset=integer(w,16), size=integer(w,24);range(r,offset,size);
        ensure(!r.mapped && size<=16*1024*1024,"Mapping limit",E.E2BIG);
        await r.value.mapAsync(GPUMapMode.READ,offset,size);r.mapped=r.value.getMappedRange(offset,size);
      } else if (op === A.DOLLY_GPU_UNMAP) {
        const r=object(scope,id,"buffer");r.value.unmap();r.mapped=null;
      } else if (op === A.DOLLY_GPU_RELEASE) {
        ensure(!encoder,"Submit before releasing GPU resources");
        release(scope, id, progress);
      }
    } catch (error) {
      // WebGPU's own errors (a GPUPipelineError, a DOMException) keep their message read-only.
      fail(error.errno ?? (error.reason === "validation" ? E.EINVAL : E.EIO), `record ${index} (opcode ${op}): ${error.message}`);
    }
    if (flags & A.DOLLY_GPU_BATCH_CONTINUE) keepOpen = true;
    else ensure(!encoder,"GPU batch has an unsubmitted encoder");
  } finally {
    if (keepOpen) scope.open = {encoder, texture, computePass, explicitCompute, renderPass, viewPass, passWidth, passHeight,
      timer, queries, renderPipeline, renderGroups, renderBuffers, renderIndex};
    else {endCompute();endRender();}
    validated(scope, Promise.all([device.popErrorScope(), device.popErrorScope()]));
    stats.batchWallMilliseconds += performance.now()-started;
  }
}
// WebGPU validates a batch on the GPU process's timeline, and Chrome answers an error scope only
// after a round trip there (3.6 ms a batch, 2026-11-08), so a batch is answered without it: the
// first error reaches the page's console when it is known and fails the scope's next WAIT.
function validated(scope, scopes) {
  const settled = scopes.then(([oom, validation]) => {
    const error = oom ? [E.ENOMEM, oom.message] : validation ? [E.EINVAL, validation.message] : null;
    if (!error || scope.lost) return;
    postMessage({type:"status",error:error[1].slice(0,2048)});
    scope.invalid ??= error;
  }, () => {}).finally(() => scope.validations.splice(scope.validations.indexOf(settled), 1));
  scope.validations.push(settled);
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
      ensure(!width || context, "GPU presentation requires the display provider", E.ENOSYS);
      scope.surface=width>0;
      scope.gpuMs=0;scope.gpuTotalMs=0;scope.gpuSamples=0;
      if(device.features.has("timestamp-query")) scope.timers=Array.from({length:3},()=>({
        query:device.createQuerySet({type:"timestamp",count:timestampQueries}),
        resolve:device.createBuffer({size:timestampQueries*8,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC}),
        read:device.createBuffer({size:timestampQueries*8,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST}),busy:false}));
      // A fixed name: the adapter's vendor/description would fingerprint the device.
      const name=encode.encode("WebGPU");
      output=new Uint8Array(16+name.length);
      const v=new DataView(output.buffer);
      v.setBigUint64(0,BigInt(scope.id),true);v.setUint32(8,width,true);v.setUint32(12,height,true);
      output.set(name,16);
    } else {
      ensure(!scope.lost && device,"GPU scope lost",E.EIO);
      if(request.op===A.DOLLY_GPU_BATCH)await batch(scope,parsed,request.v.getUint32(36,true));
      else if(request.op===A.DOLLY_GPU_WAIT) {
        const submitted=queueProgress.queued;
        await Promise.all([device.queue.onSubmittedWorkDone(), ...scope.validations]);
        queueProgress.completed=Math.max(queueProgress.completed,submitted);
        collectReleased(scope,queueProgress.completed);
        const invalid=scope.invalid;scope.invalid=null;
        if(invalid)throw Object.assign(new Error(invalid[1]),{errno:invalid[0],reported:true});
      }
      else if(request.op===A.DOLLY_GPU_READ) {
        const r=object(scope,integer(request.v,32),"buffer"),offset=integer(request.v,40),size=integer(request.v,48);
        ensure(r.mapped && size<=A.DOLLY_GPU_REPLY_BYTES && offset<=r.mapped.byteLength-size,"Invalid readback");
        output=new Uint8Array(r.mapped,offset,size).slice();stats.readbackBytes+=size;
      } else if(request.op===A.DOLLY_GPU_CLOSE)await retire(scope);
      else if(request.op===A.DOLLY_GPU_CAPABILITIES)output=capabilities;
      else if(request.op===A.DOLLY_GPU_LIMITS)output=limits;
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
    if(!error.reported)postMessage({type:"status",error:String(error.message??error).slice(0,2048)});
    if(request.op===A.DOLLY_GPU_OPEN)await retire(scope);
    publish(request,error.errno??E.EIO);
  } finally {scope.busy=false;}
}

self.onmessage = event => {
  const m=event.data;
  if(m.type==="configure") {
    heap=m.memory;memory=heap.buffer;mailbox=m.mailbox;canvas=m.canvas;control=new Int32Array(m.control);
    pageFrames=m.shown?new Int32Array(m.shown):null;
    ensure(memory instanceof SharedArrayBuffer && Number.isSafeInteger(mailbox) && mailbox>0 && mailbox%64===0 &&
      mailbox<=memory.byteLength-slots.length*(64+A.DOLLY_GPU_REPLY_BYTES),"Invalid GPU mailbox");
    postMessage({type:"ready"});
    return;
  }
  if(m.type!=="request")return;
  memory=heap.buffer;
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
      ensure(request.op>=A.DOLLY_GPU_OPEN&&request.op<=A.DOLLY_GPU_LIMITS,"Unknown GPU operation",E.ENOTSUP);
      ensure(!requestBytes.has(request.op)||requestBytes.get(request.op)===size,"GPU operation layout");
      const parsed=request.op===A.DOLLY_GPU_BATCH?records(request):null;
      let scope=slots[request.index];
      if(request.op===A.DOLLY_GPU_OPEN) {
        ensure(!scope&&request.scope>generations[request.index],"GPU scope slot is busy",E.EBUSY);
        scope={id:request.scope,index:request.index,sequence:0,objects:new Map(),retired:new Map(),high:0,submissions:[],frames:[],shows:[],validations:[],invalid:null,lost:false,surface:false};
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
