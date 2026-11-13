// The gpu@0 provider (docs/gpu.md): a Worker that turns a process's packets into WebGPU calls.
// A batch is checked in two steps. Each record's decode reads its bytes into a record and checks
// what the bytes alone decide, for every record before any runs (records). Its run then checks
// the record against the scope's objects, quotas and open pass, and makes the WebGPU calls.
import * as A from "./abi.mjs";
import { DOLLY_ERRNO as E } from "./abi.mjs";

const utf8 = new TextDecoder("utf-8", { fatal: true });
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
const blendFactors = ["zero", "one", "src", "one-minus-src", "dst", "one-minus-dst", "src-alpha", "one-minus-src-alpha",
  "dst-alpha", "one-minus-dst-alpha", "src-alpha-saturated", "constant", "one-minus-constant"];
const vertexFormats = [null, "float32", "float32x2", "float32x3", "float32x4", "unorm8x4", "snorm8x4", "uint8x4", "sint8x4",
  "unorm16x2", "unorm16x4", "uint16x2", "uint16x4", "float16x2", "float16x4",
  "uint8x2", "sint8x2", "unorm8x2", "snorm8x2", "sint16x2", "sint16x4", "snorm16x2", "snorm16x4", "uint32", "uint32x2", "uint32x3",
  "uint32x4", "sint32", "sint32x2", "sint32x3", "sint32x4", "unorm10-10-10-2"];
const vertexBytes = [0, 4, 8, 12, 16, 4, 4, 4, 4, 4, 8, 4, 8, 4, 8, 2, 2, 2, 2, 4, 8, 4, 8, 4, 8, 12, 16, 4, 8, 12, 16, 4];
const maxBytes = 4 * 1024 ** 3, bufferCeiling = 1024 ** 3, maxObjects = 65536;
// A surface shows one presented frame per animation frame, as a display does, and a frame
// retires once shown and finished by the GPU. Chrome's canvas also waits for its compositor;
// Firefox's does not, so without this its programs draw unpaced.
function present(scope, completed) {
  const shown = new Promise(resolve => scope.shows.push(resolve));
  const frame = Promise.all([completed, shown]).finally(() => scope.frames.splice(scope.frames.indexOf(frame), 1));
  scope.frames.push(frame);
  if (scope.shows.length === 1) void show(scope);
}
// The texture a surface scope draws a frame into: the canvas's, or, while another scope's surface
// covers it, a texture of its own, which the page never shows, charged to the quota.
function surfaceTexture(scope, width, height) {
  if (surfaces.at(-1) === scope) {
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    return context.getCurrentTexture();
  }
  if (scope.covered?.width !== width || scope.covered?.height !== height) {
    dropCovered(scope);
    ensure(width * height * 4 <= maxBytes - usedBytes, "Texture allocation quota", E.ENOMEM);
    scope.covered = device.createTexture({ size: [width, height], format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC });
    usedBytes += width * height * 4;
  }
  return scope.covered;
}
function dropCovered(scope) {
  if (!scope.covered) return;
  usedBytes -= scope.covered.width * scope.covered.height * 4;
  scope.covered.destroy();
  scope.covered = null;
}
// One frame per animation frame of the runtime Worker; a canvas no page shows waits for none.
async function show(scope) {
  while (scope.shows.length) {
    const wait = pageFrames && Atomics.waitAsync(pageFrames, 0, Atomics.load(pageFrames, 0));
    if (wait?.async) await wait.value;
    scope.shows.shift()();
  }
}
// Firefox settles onSubmittedWorkDone and mapAsync when its queue next submits, or on a 100 ms
// timer (bug 1870699): while a frame, a WAIT or a map is pending, empty submissions settle it.
function settled(device, promise) {
  let done = false;
  promise.then(() => { done = true; }, () => { done = true; });
  for (const ms of [2, 5, 10, 20, 40]) setTimeout(() => { if (!done) device.queue.submit([]); }, ms);
  return promise;
}
// What a scope may have queued before its next batch waits: 64 submissions, and
// for a surface three presented frames not yet retired (a frame may submit many
// times). Firefox settles completions on a 100 ms timer (bug 1870699), and a
// model token takes about 25 submissions.
const queueFull = scope => scope.surface && scope.frames.length >= 3 ? scope.frames[0]
  : scope.submissions.length >= 64 ? scope.submissions[0] : null;
const timestampQueries = A.DOLLY_GPU_MAX_COMMANDS * 2;
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
let queueProgress = { queued: 0, completed: 0 };
let usedBytes = 0, serial = Promise.resolve(), initializing;
// The scopes with a surface, in the order they opened it: the page shows the last one's, and the
// one below when it closes (the kernel admits a surface over another only for a descendant of its
// process, host/gpu/kernel.c).
const surfaces = [];
const stats = { packets: 0, packetBytes: 0, frames: 0, dispatches: 0, readbackBytes: 0, batchWallMilliseconds: 0 };

// CAPABILITIES: feature bits, then the quotas and the device's limits, in dolly-gpu-0.wat's order.
function capabilityBytes(adapter, created) {
  const bytes = new Uint8Array(128), v = new DataView(bytes.buffer), l = created.limits;
  const has = name => created.features.has(name);
  v.setUint32(0, (has("shader-f16") ? 1 : 0) | (has("subgroups") ? 2 : 0) |
    (navigator.gpu.wgslLanguageFeatures?.has("packed_4x8_integer_dot_product") ? 4 : 0) | (has("timestamp-query") ? 8 : 0) |
    A.DOLLY_GPU_FEATURE_CAPTURE_FRAME | A.DOLLY_GPU_FEATURE_TEXTURE_RENDER | A.DOLLY_GPU_FEATURE_LARGE_BATCH |
    A.DOLLY_GPU_FEATURE_VERTEX_F16 | A.DOLLY_GPU_FEATURE_EXPLICIT |
    (has("texture-compression-bc") ? A.DOLLY_GPU_FEATURE_TEXTURE_BC : 0) |
    (format === "bgra8unorm" ? A.DOLLY_GPU_FEATURE_SURFACE_BGRA : 0), true);
  v.setUint32(4, maxObjects, true);
  [maxBuffer, maxBytes, l.maxStorageBufferBindingSize].forEach((n, i) => v.setBigUint64(8 + i * 8, BigInt(n), true));
  [l.minUniformBufferOffsetAlignment, l.minStorageBufferOffsetAlignment, l.maxComputeWorkgroupStorageSize,
    l.maxComputeInvocationsPerWorkgroup, l.maxComputeWorkgroupSizeX, l.maxComputeWorkgroupSizeY,
    l.maxComputeWorkgroupSizeZ, l.maxComputeWorkgroupsPerDimension, A.DOLLY_GPU_MAX_BINDINGS,
    l.maxStorageBuffersPerShaderStage, l.maxUniformBuffersPerShaderStage, l.maxBindGroups]
    .forEach((n, i) => v.setUint32(32 + i * 4, n, true));
  v.setBigUint64(80, BigInt(l.maxUniformBufferBindingSize), true);
  v.setUint32(88, adapter.info?.subgroupMinSize ?? 4, true);
  v.setUint32(92, adapter.info?.subgroupMaxSize ?? 128, true);
  return bytes;
}
// LIMITS: a bit for each of reportedFeatures granted, then each of reportedLimits.
function limitBytes(created) {
  const bytes = new Uint8Array(8 + reportedLimits.length * 8), v = new DataView(bytes.buffer);
  const features = reportedFeatures.reduce((bits, name, i) => created.features.has(name) ? bits | (1 << i) : bits, 0);
  v.setBigUint64(0, BigInt(features), true);
  reportedLimits.forEach((name, i) => v.setBigUint64(8 + i * 8, BigInt(created.limits[name] ?? 0), true));
  return bytes;
}
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
    const created = await adapter.requestDevice({ requiredFeatures, requiredLimits });
    format = navigator.gpu.getPreferredCanvasFormat();
    maxBuffer = created.limits.maxBufferSize;
    capabilities = capabilityBytes(adapter, created);
    limits = limitBytes(created);
    device = created;
    const { vendor, architecture, description, isFallbackAdapter } = adapter.info;
    postMessage({ type: "status", info: { vendor, architecture, description, isFallbackAdapter, f16: created.features.has("shader-f16") } });
    queueProgress = { queued: 0, completed: 0 };
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

const u32 = (v, at) => v.getUint32(at, true);
const f32 = (v, at) => v.getFloat32(at, true);
const zero64 = (v, at) => v.getBigUint64(at, true) === 0n;
// A 64-bit field: a handle, an offset or a size, at most 2^53 - 1.
function integer(v, at) {
  const high = u32(v, at + 4);
  ensure(high <= 0x1fffff, "GPU integer exceeds host range");
  return high * 0x100000000 + u32(v, at);
}
function header(bytes) {
  ensure(bytes.length >= 32, "Short GPU packet");
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const scope = integer(v, 8), sequence = integer(v, 16);
  ensure(u32(v, 0) === A.DOLLY_GPU_VERSION && u32(v, 28) === 0 && u32(v, 24) === bytes.length - 32 &&
    scope > 0 && scope <= 0xffffffff && sequence > 0 && sequence <= 0xffffffff, "Invalid GPU header");
  return { op: u32(v, 4), scope, sequence, index: (scope - 1) % slots.length, bytes, v };
}
function text(bytes, start, count) {
  ensure(count > 0 && start <= bytes.length - count, "Invalid GPU text span");
  const value = utf8.decode(bytes.subarray(start, start + count));
  ensure(!value.includes("\0"), "NUL in GPU text");
  return value;
}

// A batch's records: framed, each decoded by its operation, before any runs.
function records(request) {
  const { bytes, v } = request;
  ensure(bytes.length >= 40 && (u32(v, 36) & ~A.DOLLY_GPU_BATCH_CONTINUE) === 0, "Invalid GPU batch");
  const count = u32(v, 32), result = [];
  ensure(count <= A.DOLLY_GPU_MAX_COMMANDS, "Too many GPU commands", E.E2BIG);
  let offset = 40;
  for (let position = 0; position < count; ++position) {
    ensure(offset <= bytes.length - 8, "Truncated GPU command");
    const op = u32(v, offset), size = u32(v, offset + 4), definition = operations.get(op);
    ensure(size >= 8 && size % 8 === 0 && size <= bytes.length - offset, "Invalid GPU command length");
    if (definition?.bytes) ensure(size === definition.bytes, "Wrong GPU command layout");
    else ensure(definition && size >= definition.least, "Unsupported GPU command", E.ENOTSUP);
    const b = bytes.subarray(offset, offset + size), w = new DataView(b.buffer, b.byteOffset, b.byteLength);
    try {
      const record = definition.decode?.(w, b) ?? {};
      record.op = op;
      record.position = position;
      result.push(record);
    } catch (error) {
      fail(error.errno ?? E.EINVAL, `record ${position} (opcode ${op}): ${error.message}`);
    }
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
  ensure(id > scope.high && id <= 0xffffffff && scope.objects.size + scope.retired.size < maxObjects,
    "Invalid or exhausted GPU object IDs", E.ENOSPC);
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
  if (scope.surface) {
    const shown = surfaces.at(-1) === scope;
    surfaces.splice(surfaces.indexOf(scope), 1);
    // The surface below is shown again from its next frame.
    const below = surfaces.at(-1);
    if (shown) postMessage(below ? { type: "status", active: true, ...below.size } : { type: "status", active: false });
  }
  scope.retiring = (async () => {
    try { if (scope.device) await scope.device.queue.onSubmittedWorkDone(); } catch {}
    for (const r of scope.objects.values()) {
      r.value.destroy?.();
      usedBytes -= r.size;
    }
    dropCovered(scope);
    scope.objects.clear();
    collectReleased(scope, Infinity);
    for (const t of scope.timers ?? []) { t.query.destroy(); t.resolve.destroy(); t.read.destroy(); }
    if (slots[scope.index] === scope) slots[scope.index] = null;
    postMessage({ type: "complete" });
  })();
  return scope.retiring;
}

// The batch being run: its scope, device and queue progress, the pipelines it compiles, and its
// encoder, open pass and surface texture, which a batch sent with BATCH_CONTINUE leaves to the
// scope's next one.
const commandEncoder = batch => batch.encoder ??= batch.device.createCommandEncoder();
function endCompute(batch) {
  batch.computePass?.end();
  batch.computePass = null;
  batch.explicitCompute = false;
}
function endRender(batch) {
  batch.renderPass?.end();
  batch.renderPass = null;
  batch.viewPass = false;
}
// A pass's timestamp writes; an encoder's passes beyond the query set's pairs go untimed.
function timestamps(batch) {
  batch.timer ??= batch.scope.timers?.find(t => !t.busy);
  if (!batch.timer || batch.queries + 2 > timestampQueries) return {};
  const beginningOfPassWriteIndex = batch.queries++, endOfPassWriteIndex = batch.queries++;
  return { timestampWrites: { querySet: batch.timer.query, beginningOfPassWriteIndex, endOfPassWriteIndex } };
}
// The texture the batch draws the scope's frame into, one size for the whole batch.
function surfaceFrame(batch, width, height) {
  if (!batch.texture) batch.texture = surfaceTexture(batch.scope, width, height);
  else ensure(batch.texture.width === width && batch.texture.height === height, "Surface resized within batch");
  return batch.texture;
}
// A batch's shaders and pipelines are created together and awaited before the batch first sets
// a pipeline, and at its end: Chrome compiles them in parallel so, one after another when each is
// awaited in turn.
function compile(batch, record, kind, creation, value = null) {
  creation.catch(() => {});
  insert(batch.scope, record.id, kind, value);
  const entry = batch.scope.objects.get(record.id), promise = creation.then(created => { entry.value = created; });
  promise.catch(() => {});
  batch.compiling.push({ record, promise });
}
async function compiled(batch) {
  const pending = batch.compiling.splice(0);
  for (const [i, result] of (await Promise.allSettled(pending.map(c => c.promise))).entries()) {
    if (result.status === "fulfilled") continue;
    const { record } = pending[i], error = result.reason;
    batch.scope.objects.delete(record.id);
    throw Object.assign(new Error(`record ${record.position} (opcode ${record.op}): ${error.message}`),
      { errno: error.errno ?? (error.reason === "validation" ? E.EINVAL : E.EIO), record: true });
  }
}

// Each record's operation: its byte length (`bytes` exactly, or at least `least` for a variable
// tail), whether it creates an object (charged to the scope's object quota before it runs), its
// decode and its run.
const operations = new Map();
const operation = (op, layout) => operations.set(op, layout);
const bufferRange = (w, at) => ({ buffer: integer(w, at), offset: integer(w, at + 8), size: integer(w, at + 16) });

operation(A.DOLLY_GPU_CREATE_BUFFER, { bytes: 32, creates: true,
  decode(w) {
    const usage = u32(w, 24);
    ensure(u32(w, 28) === 0 && usage > 0 && (usage & ~1023) === 0, "Buffer usage");
    return { id: integer(w, 8), size: integer(w, 16), usage };
  },
  run({ scope, device }, { id, size, usage }) {
    ensure(size > 0 && size <= maxBuffer && size <= maxBytes - usedBytes, "GPU allocation quota", E.ENOMEM);
    insert(scope, id, "buffer", device.createBuffer({ size, usage }), size);
    usedBytes += size;
  } });

operation(A.DOLLY_GPU_WRITE_BUFFER, { least: 32,
  decode(w, b) {
    const offset = integer(w, 16), at = u32(w, 24), length = u32(w, 28);
    ensure(at >= 32 && at <= b.length - length && length % 4 === 0, "Invalid GPU upload span");
    ensure(offset % 4 === 0, "Unaligned GPU upload");
    return { buffer: integer(w, 8), offset, data: b.subarray(at, at + length) };
  },
  run({ scope, device, progress }, { buffer, offset, data }) {
    const r = object(scope, buffer, "buffer");
    range(r, offset, data.length);
    ensure(!r.mapped, "Upload into a mapped buffer");
    device.queue.writeBuffer(r.value, offset, data);
    progress.queued++;
  } });

operation(A.DOLLY_GPU_CREATE_SHADER, { least: 24, creates: true,
  decode(w, b) {
    ensure(u32(w, 20) === 0, "Shader reserved field");
    return { id: integer(w, 8), code: text(b, 24, u32(w, 16)) };
  },
  run(batch, record) {
    const shader = batch.device.createShaderModule({ code: record.code });
    compile(batch, record, "shader", shader.getCompilationInfo().then(info => {
      const errors = info.messages.filter(m => m.type === "error");
      ensure(!errors.length, errors.map(m => `${m.lineNum}:${m.linePos} ${m.message}`).join("\n").slice(0, 2048));
      return shader;
    }), shader);
  } });

// The compact pipelines: one module's two entry points, drawn into the surface's format, and for
// VERTEX_PIPELINE one buffer of float vectors.
function decodeCompactPipeline(w, b, vertexLayout) {
  const topology = u32(w, 24), blend = u32(w, 28), vs = u32(w, 32), fs = u32(w, 36);
  ensure(vs <= 64 && fs <= 64, "GPU entry name too long");
  ensure(topology <= 1 && blend <= 2, "Unsupported render state");
  let at = 40, buffers = [];
  if (vertexLayout) {
    const stride = u32(w, 40), count = u32(w, 44), attributes = [], locations = new Set();
    ensure(count > 0 && count <= 8 && stride > 0 && stride <= 2048 && stride % 4 === 0 && b.length >= 48 + count * 16, "Vertex layout");
    for (let i = 0; i < count; i++) {
      const o = 48 + i * 16, location = u32(w, o), components = u32(w, o + 4), offset = u32(w, o + 8);
      ensure(location < 16 && !locations.has(location) && components >= 2 && components <= 4 && offset % 4 === 0 &&
        offset <= stride - components * 4 && u32(w, o + 12) === 0, "Vertex attribute");
      locations.add(location);
      attributes.push({ shaderLocation: location, format: `float32x${components}`, offset });
    }
    buffers = [{ arrayStride: stride, stepMode: "vertex", attributes }];
    at = 48 + count * 16;
  }
  return { id: integer(w, 8), shader: integer(w, 16), topology, blend, buffers,
    vertexEntry: text(b, at, vs), fragmentEntry: text(b, at + vs, fs) };
}
async function runCompactPipeline(batch, record) {
  await compiled(batch);
  const module = object(batch.scope, record.shader, "shader").value;
  const component = { srcFactor: "one", dstFactor: record.blend === 2 ? "one" : "one-minus-src-alpha", operation: "add" };
  const target = { format, ...(record.blend ? { blend: { color: component, alpha: component } } : {}) };
  const pipeline = await batch.device.createRenderPipelineAsync({ layout: "auto",
    vertex: { module, entryPoint: record.vertexEntry, buffers: record.buffers },
    fragment: { module, entryPoint: record.fragmentEntry, targets: [target] },
    primitive: { topology: record.topology ? "triangle-strip" : "triangle-list" } });
  insert(batch.scope, record.id, "render", pipeline);
}
operation(A.DOLLY_GPU_RENDER_PIPELINE, { least: 40, creates: true,
  decode: (w, b) => decodeCompactPipeline(w, b, false), run: runCompactPipeline });
operation(A.DOLLY_GPU_VERTEX_PIPELINE, { least: 48, creates: true,
  decode: (w, b) => decodeCompactPipeline(w, b, true), run: runCompactPipeline });

async function runCompactCompute(batch, record) {
  await compiled(batch);
  const module = object(batch.scope, record.shader, "shader").value;
  const pipeline = await batch.device.createComputePipelineAsync({ layout: "auto",
    compute: { module, entryPoint: record.entry, constants: record.constants } });
  insert(batch.scope, record.id, "compute", pipeline);
}
operation(A.DOLLY_GPU_COMPUTE_PIPELINE, { least: 32, creates: true,
  decode(w, b) {
    ensure(u32(w, 28) === 0 && u32(w, 24) <= 64, "Compute entry name");
    return { id: integer(w, 8), shader: integer(w, 16), entry: text(b, 32, u32(w, 24)), constants: Object.create(null) };
  },
  run: runCompactCompute });
operation(A.DOLLY_GPU_COMPUTE_CONSTANTS, { least: 32, creates: true,
  decode(w, b) {
    const entryBytes = u32(w, 24), count = u32(w, 28), constants = Object.create(null);
    ensure(entryBytes <= 64 && count <= 16, "Compute constants layout");
    const entry = text(b, 32, entryBytes);
    let at = (32 + entryBytes + 7) & ~7;
    for (let i = 0; i < count; i++) {
      ensure(at <= b.length - 16, "Truncated compute constant");
      const n = u32(w, at), value = w.getFloat64(at + 8, true);
      ensure(n <= 64 && u32(w, at + 4) === 0 && Number.isFinite(value), "Invalid compute constant");
      const name = text(b, at + 16, n);
      ensure(!(name in constants), "Duplicate compute constant");
      constants[name] = value;
      at = (at + 16 + n + 7) & ~7;
    }
    ensure(at === b.length, "Trailing compute constant bytes");
    return { id: integer(w, 8), shader: integer(w, 16), entry, constants };
  },
  run: runCompactCompute });

operation(A.DOLLY_GPU_BIND_GROUP, { least: 32, creates: true,
  decode(w, b) {
    const count = u32(w, 24), buffers = [];
    ensure(count <= A.DOLLY_GPU_MAX_BINDINGS && b.length === 32 + count * 24 && u32(w, 28) === 0, "Bind group layout");
    for (let i = 0; i < count; ++i) buffers.push(bufferRange(w, 32 + i * 24));
    return { id: integer(w, 8), pipeline: integer(w, 16), buffers };
  },
  run({ scope, device }, record) {
    const pipeline = object(scope, record.pipeline);
    ensure(pipeline.kind === "render" || pipeline.kind === "compute", "Invalid binding pipeline");
    const entries = record.buffers.map(({ buffer, offset, size }, binding) => {
      const r = object(scope, buffer, "buffer");
      range(r, offset, size);
      return { binding, resource: { buffer: r.value, offset, size } };
    });
    insert(scope, record.id, "group", device.createBindGroup({ layout: pipeline.value.getBindGroupLayout(0), entries }));
  } });

// A compact draw: a "render" pipeline into the scope's surface, in a render pass of its own.
function decodeSurfaceDraw(w, vertexBuffer) {
  const vertices = u32(w, 24), instances = u32(w, 28), width = u32(w, 32), height = u32(w, 36), load = u32(w, 56);
  const clearValue = [40, 44, 48, 52].map(at => f32(w, at));
  ensure(width > 0 && height > 0 && width <= 4096 && height <= 2304, "Invalid GPU surface dimensions");
  ensure(u32(w, 60) === 0 && load <= 1, "Render reserved field");
  ensure(vertices > 0 && instances > 0 && vertices * instances <= 4 * 1024 * 1024, "Draw limit", E.E2BIG);
  ensure(clearValue.every(Number.isFinite), "Invalid clear color");
  return { pipeline: integer(w, 8), group: integer(w, 16), vertices, instances, width, height, load, clearValue,
    vertexBuffer: vertexBuffer ? bufferRange(w, 64) : null };
}
function runSurfaceDraw(batch, record) {
  const { scope } = batch;
  ensure(scope.surface, "Invalid GPU surface dimensions");
  const pipeline = object(scope, record.pipeline, "render").value;
  const group = record.group ? object(scope, record.group, "group").value : null;
  let vertices = null;
  if (record.vertexBuffer) {
    vertices = object(scope, record.vertexBuffer.buffer, "buffer");
    range(vertices, record.vertexBuffer.offset, record.vertexBuffer.size);
  }
  const texture = surfaceFrame(batch, record.width, record.height);
  const pass = commandEncoder(batch).beginRenderPass({ ...timestamps(batch), colorAttachments: [{ view: texture.createView(),
    clearValue: record.clearValue, loadOp: record.load ? "clear" : "load", storeOp: "store" }] });
  pass.setPipeline(pipeline);
  if (group) pass.setBindGroup(0, group);
  if (vertices) pass.setVertexBuffer(0, vertices.value, record.vertexBuffer.offset, record.vertexBuffer.size);
  pass.draw(record.vertices, record.instances);
  pass.end();
}
operation(A.DOLLY_GPU_RENDER, { bytes: 64, decode: w => decodeSurfaceDraw(w, false), run: runSurfaceDraw });
operation(A.DOLLY_GPU_RENDER_VERTEX, { bytes: 88, decode: w => decodeSurfaceDraw(w, true), run: runSurfaceDraw });

operation(A.DOLLY_GPU_COMPUTE, { bytes: 40,
  decode(w) {
    const workgroups = [24, 28, 32].map(at => u32(w, at));
    ensure(u32(w, 36) === 0 && workgroups.every(n => n > 0 && n <= 65535) && workgroups.reduce((a, n) => a * n, 1) <= 1048576,
      "Dispatch limit", E.E2BIG);
    return { pipeline: integer(w, 8), group: integer(w, 16), workgroups };
  },
  run(batch, record) {
    const pipeline = object(batch.scope, record.pipeline, "compute").value, group = object(batch.scope, record.group, "group").value;
    // Consecutive COMPUTE records share one pass.
    batch.computePass ??= commandEncoder(batch).beginComputePass(timestamps(batch));
    batch.computePass.setPipeline(pipeline);
    batch.computePass.setBindGroup(0, group);
    batch.computePass.dispatchWorkgroups(...record.workgroups);
    stats.dispatches++;
  } });

operation(A.DOLLY_GPU_COPY_BUFFER, { bytes: 48,
  decode: w => ({ source: integer(w, 8), destination: integer(w, 16), sourceOffset: integer(w, 24),
    destinationOffset: integer(w, 32), size: integer(w, 40) }),
  run(batch, { source, destination, sourceOffset, destinationOffset, size }) {
    const from = object(batch.scope, source, "buffer"), to = object(batch.scope, destination, "buffer");
    range(from, sourceOffset, size);
    range(to, destinationOffset, size);
    commandEncoder(batch).copyBufferToBuffer(from.value, sourceOffset, to.value, destinationOffset, size);
  } });

operation(A.DOLLY_GPU_MAP_READ, { bytes: 32,
  decode(w) {
    const size = integer(w, 24);
    ensure(size <= 16 * 1024 * 1024, "Mapping limit", E.E2BIG);
    return { buffer: integer(w, 8), offset: integer(w, 16), size };
  },
  async run(batch, { buffer, offset, size }) {
    ensure(!batch.encoder, "Submit before mapping");
    const r = object(batch.scope, buffer, "buffer");
    range(r, offset, size);
    ensure(!r.mapped, "Mapping a mapped buffer");
    await settled(batch.device, r.value.mapAsync(GPUMapMode.READ, offset, size));
    r.mapped = r.value.getMappedRange(offset, size);
  } });

operation(A.DOLLY_GPU_UNMAP, { bytes: 16, decode: w => ({ buffer: integer(w, 8) }),
  run(batch, { buffer }) {
    const r = object(batch.scope, buffer, "buffer");
    r.value.unmap();
    r.mapped = null;
  } });

operation(A.DOLLY_GPU_RELEASE, { bytes: 16, decode: w => ({ handle: integer(w, 8) }),
  run(batch, { handle }) {
    ensure(!batch.encoder, "Submit before releasing GPU resources");
    release(batch.scope, handle, batch.progress);
  } });

// Submits the batch's encoder: its passes' timestamps resolve into the scope's timer, and a frame
// drawn into the surface is presented once the GPU has finished it.
operation(A.DOLLY_GPU_SUBMIT, { bytes: 8,
  async run(batch) {
    ensure(batch.encoder, "No GPU commands to submit");
    const { scope, device, progress } = batch;
    await queueFull(scope);
    const measured = batch.queries ? batch.timer : null, count = batch.queries;
    if (measured) {
      batch.encoder.resolveQuerySet(measured.query, 0, count, measured.resolve, 0);
      batch.encoder.copyBufferToBuffer(measured.resolve, 0, measured.read, 0, count * 8);
      measured.busy = true;
    }
    device.queue.submit([batch.encoder.finish()]);
    batch.encoder = null;
    const submittedWork = ++progress.queued;
    if (measured) measured.read.mapAsync(GPUMapMode.READ, 0, count * 8).then(() => {
      const values = new BigUint64Array(measured.read.getMappedRange(0, count * 8));
      let ns = 0n;
      for (let i = 0; i < count; i += 2) if (values[i + 1] >= values[i]) ns += values[i + 1] - values[i];
      if (!scope.lost) { scope.gpuMs = Number(ns) / 1e6; scope.gpuTotalMs += scope.gpuMs; scope.gpuSamples++; }
      measured.read.unmap();
    }).catch(() => {}).finally(() => { measured.busy = false; });
    batch.timer = null;
    batch.queries = 0;
    const completed = settled(device, device.queue.onSubmittedWorkDone()).then(() => {
      progress.completed = Math.max(progress.completed, submittedWork);
    }).finally(() => scope.submissions.splice(scope.submissions.indexOf(completed), 1));
    scope.submissions.push(completed);
    completed.catch(() => {});
    const { texture } = batch;
    if (!texture) return;
    present(scope, completed);
    scope.size = { width: texture.width, height: texture.height };
    if (surfaces.at(-1) === scope) {
      stats.frames++;
      postMessage({ type: "status", active: true, ...scope.size, stats: { ...stats, allocatedBytes: usedBytes } });
    }
    batch.texture = null;
  } });

operation(A.DOLLY_GPU_CAPTURE_FRAME, { bytes: 32,
  decode(w) {
    const [x, y, width, height] = [16, 20, 24, 28].map(at => u32(w, at));
    ensure(width > 0 && height > 0, "Capture rectangle outside surface");
    return { buffer: integer(w, 8), x, y, width, height };
  },
  run(batch, { buffer, x, y, width, height }) {
    const { scope, texture } = batch;
    ensure(scope.surface && texture, "Capture requires a rendered surface in this batch");
    ensure(x <= texture.width - width && y <= texture.height - height, "Capture rectangle outside surface");
    const destination = object(scope, buffer, "buffer"), bytesPerRow = Math.ceil(width * 4 / 256) * 256;
    range(destination, 0, bytesPerRow * (height - 1) + width * 4);
    ensure(!destination.mapped && (destination.value.usage & GPUBufferUsage.COPY_DST), "Capture destination is mapped or not writable");
    commandEncoder(batch).copyTextureToBuffer({ texture, origin: { x, y } }, { buffer: destination.value, bytesPerRow }, { width, height });
  } });

operation(A.DOLLY_GPU_CREATE_TEXTURE, { bytes: 48, creates: true,
  decode(w) {
    const [width, height, layers, mips, type, usage, dimension] = [16, 20, 24, 28, 32, 36, 40].map(at => u32(w, at));
    const samples = w.getUint16(44, true) || 1, viewFormat = w.getUint16(46, true);
    ensure(width > 0 && height > 0 && layers > 0 && mips > 0 && type > 0 && type < textureFormats.length && usage > 0 &&
      (usage & ~31) === 0 && dimension <= 3 && viewFormat < textureFormats.length && (samples === 1 || samples === 4), "Texture descriptor");
    // Dimension 0, the mesh records' 2D texture: one layer, or a cube's six, and no storage usage.
    if (dimension === 0) ensure((layers === 1 || (layers === 6 && width === height)) && !(usage & 8), "Texture descriptor");
    ensure(mips <= 1 + Math.floor(Math.log2(Math.max(width, height, dimension === 3 ? layers : 1))) &&
      (samples === 1 || (dimension !== 1 && dimension !== 3 && mips === 1 && layers === 1)), "Texture mips/samples");
    const block = compressedFormat(type) ? 4 : 1;
    if (block === 4) ensure(width % block === 0 && height % block === 0 && !(usage & 16), "BC texture descriptor");
    let size = 0;
    for (let i = 0; i < mips; i++) {
      const levelLayers = dimension === 3 ? Math.max(1, layers >> i) : layers;
      size += Math.ceil(Math.max(1, width >> i) / block) * Math.ceil(Math.max(1, height >> i) / block) * levelLayers *
        blockBytes[type] * samples;
    }
    return { id: integer(w, 8), width, height, layers, mips, type, usage, dimension, samples, viewFormat, size };
  },
  run({ scope, device }, record) {
    const { width, height, layers, mips, type, usage, dimension, samples, viewFormat, size } = record;
    const l = device.limits, largest = [0, l.maxTextureDimension1D, l.maxTextureDimension2D, l.maxTextureDimension3D][dimension];
    if (dimension === 0) {
      ensure(width <= Math.min(8192, l.maxTextureDimension2D) && height <= Math.min(8192, l.maxTextureDimension2D), "Texture descriptor");
    } else {
      ensure(width <= largest && height <= (dimension === 1 ? 1 : largest) &&
        layers <= (dimension === 3 ? largest : dimension === 1 ? 1 : l.maxTextureArrayLayers), "Texture dimensions");
    }
    if (compressedFormat(type)) ensure(device.features.has("texture-compression-bc"), "BC texture compression unavailable", E.ENOSYS);
    if (type === 45) ensure(device.features.has("depth32float-stencil8"), "depth32float-stencil8 unavailable", E.ENOSYS);
    ensure(size <= bufferCeiling && size <= maxBytes - usedBytes, "Texture allocation quota", E.ENOMEM);
    const value = device.createTexture({ size: { width, height, depthOrArrayLayers: layers }, mipLevelCount: mips,
      dimension: ["2d", "1d", "2d", "3d"][dimension], sampleCount: samples, format: textureFormats[type], usage,
      viewFormats: viewFormat ? [textureFormats[viewFormat]] : [] });
    insert(scope, record.id, "texture", value, size);
    usedBytes += size;
    Object.assign(object(scope, record.id), { width, height, layers, mips, type, dimension, samples });
  } });

operation(A.DOLLY_GPU_WRITE_TEXTURE, { least: 48,
  decode(w, b) {
    const [mip, layer, x, y, width, height, length] = [16, 20, 24, 28, 32, 36, 40].map(at => u32(w, at));
    ensure(u32(w, 44) === 0 && length > 0 && Math.ceil((48 + length) / 8) * 8 === b.length, "Texture upload span");
    ensure(width > 0 && height > 0, "Texture upload range");
    return { texture: integer(w, 8), mip, layer, x, y, width, height, data: b.subarray(48, 48 + length) };
  },
  run({ scope, device, progress }, { texture, mip, layer, x, y, width, height, data }) {
    const r = object(scope, texture, "texture"), block = compressedFormat(r.type) ? 4 : 1;
    ensure(!depthFormat(r.type) && !stencilFormat(r.type) && r.samples === 1 && mip < r.mips && layer < r.layers &&
      x % block === 0 && y % block === 0 && width % block === 0 && height % block === 0 &&
      x <= Math.ceil(Math.max(1, r.width >> mip) / block) * block - width &&
      y <= Math.ceil(Math.max(1, r.height >> mip) / block) * block - height &&
      data.length === (width / block) * (height / block) * blockBytes[r.type], "Texture upload range");
    device.queue.writeTexture({ texture: r.value, mipLevel: mip, origin: { x, y, z: layer } }, data,
      { bytesPerRow: width / block * blockBytes[r.type], rowsPerImage: height / block }, { width, height });
    progress.queued++;
  } });

operation(A.DOLLY_GPU_CREATE_SAMPLER, { least: 48, creates: true,
  decode(w, b) {
    ensure(b.length === 48 || b.length === 56, "Sampler layout");
    const filters = [16, 20, 24].map(at => u32(w, at)), address = [28, 32, 36].map(at => u32(w, at));
    const compare = u32(w, 40), maxAnisotropy = u32(w, 44);
    const [lodMinClamp, lodMaxClamp] = b.length === 56 ? [f32(w, 48), f32(w, 52)] : [0, 32];
    ensure(filters.every(n => n <= 1) && address.every(n => n <= 2) && compare <= 8 && maxAnisotropy >= 1 &&
      maxAnisotropy <= 16 && (maxAnisotropy === 1 || filters.every(n => n === 1)) &&
      Number.isFinite(lodMinClamp) && Number.isFinite(lodMaxClamp) && lodMinClamp >= 0 && lodMinClamp <= lodMaxClamp,
      "Sampler descriptor");
    const addresses = ["clamp-to-edge", "repeat", "mirror-repeat"], modes = ["nearest", "linear"];
    return { id: integer(w, 8), descriptor: { minFilter: modes[filters[0]], magFilter: modes[filters[1]],
      mipmapFilter: modes[filters[2]], addressModeU: addresses[address[0]], addressModeV: addresses[address[1]],
      addressModeW: addresses[address[2]], compare: compareOps[compare], maxAnisotropy, lodMinClamp, lodMaxClamp } };
  },
  run({ scope, device }, { id, descriptor }) {
    insert(scope, id, "sampler", device.createSampler(descriptor));
  } });

// A blend component: operation, source and destination factor.
function blendComponent(w, at) {
  const [blendOp, source, destination] = [0, 4, 8].map(o => u32(w, at + o));
  ensure(blendOp < blendOps.length && source < blendFactors.length && destination < blendFactors.length, "Blend state");
  return { operation: blendOps[blendOp], srcFactor: blendFactors[source], dstFactor: blendFactors[destination] };
}

// The mesh records, GRAPHICS_PIPELINE to DRAW_MESH: "main" entry points, a pipeline's own bind group
// layouts, and a DRAW_MESH that sets only what differs from the pass's last one.
operation(A.DOLLY_GPU_GRAPHICS_PIPELINE, { least: 112, creates: true,
  decode(w, b) {
    const [color, depth, topology, cull, front, compare, write] = [32, 36, 40, 44, 48, 52, 56].map(at => u32(w, at));
    const slope = f32(w, 64), clamp = f32(w, 68), mask = u32(w, 72), blend = u32(w, 76);
    ensure(color <= 4 && (depth === 0 || depth === 5 || depth === 6) && topology <= 3 && cull <= 2 && front <= 1 &&
      compare >= 1 && compare <= 8 && write <= 1 && Number.isFinite(slope) && Number.isFinite(clamp) && mask <= 15 && blend <= 1,
      "Graphics pipeline state");
    const colorBlend = blendComponent(w, 80), alphaBlend = blendComponent(w, 92);
    const bufferCount = u32(w, 104), attributeCount = u32(w, 108), buffers = [], locations = new Set();
    ensure(bufferCount <= 8 && attributeCount <= 16 && b.length === 112 + 16 * (bufferCount + attributeCount), "Graphics vertex layout");
    for (let i = 0; i < bufferCount; i++) {
      const at = 112 + i * 16, stride = u32(w, at), instanced = u32(w, at + 4);
      ensure(stride > 0 && stride <= 2048 && stride % 4 === 0 && instanced <= 1 && zero64(w, at + 8), "Graphics vertex stride");
      buffers.push({ arrayStride: stride, stepMode: instanced ? "instance" : "vertex", attributes: [] });
    }
    for (let i = 0; i < attributeCount; i++) {
      const at = 112 + (bufferCount + i) * 16, [slot, location, type, offset] = [0, 4, 8, 12].map(o => u32(w, at + o));
      ensure(slot < bufferCount && location < 16 && !locations.has(location) && type > 0 && type < vertexFormats.length &&
        offset % Math.min(4, vertexBytes[type]) === 0 && offset <= buffers[slot].arrayStride - vertexBytes[type],
        "Graphics vertex attribute");
      locations.add(location);
      buffers[slot].attributes.push({ shaderLocation: location, format: vertexFormats[type], offset });
    }
    return { id: integer(w, 8), vertexShader: integer(w, 16), fragmentShader: integer(w, 24), color, mask, buffers,
      blend: blend ? { color: colorBlend, alpha: alphaBlend } : null,
      primitive: { topology: ["triangle-list", "triangle-strip", "line-list", "point-list"][topology],
        ...(topology === 1 ? { stripIndexFormat: "uint16" } : {}), cullMode: ["none", "front", "back"][cull],
        frontFace: front ? "cw" : "ccw" },
      depthStencil: depth ? { format: textureFormats[depth], depthWriteEnabled: !!write, depthCompare: compareOps[compare],
        depthBias: w.getInt32(60, true), depthBiasSlopeScale: slope, depthBiasClamp: clamp } : null };
  },
  async run({ scope, device }, record) {
    const vertex = object(scope, record.vertexShader, "shader").value;
    const fragment = object(scope, record.fragmentShader, "shader").value;
    const target = { format: record.color ? textureFormats[record.color] : format, writeMask: record.mask,
      ...(record.blend ? { blend: record.blend } : {}) };
    const pipeline = await device.createRenderPipelineAsync({ layout: "auto",
      vertex: { module: vertex, entryPoint: "main", buffers: record.buffers },
      fragment: { module: fragment, entryPoint: "main", targets: [target] },
      primitive: record.primitive, ...(record.depthStencil ? { depthStencil: record.depthStencil } : {}) });
    insert(scope, record.id, "graphics", pipeline);
  } });

operation(A.DOLLY_GPU_RESOURCE_GROUP, { least: 32, creates: true,
  decode(w, b) {
    const index = u32(w, 24), count = u32(w, 28), bindings = new Set(), entries = [];
    ensure(index < 4 && count <= 16 && b.length === 32 + 32 * count, "Resource group layout");
    for (let i = 0; i < count; i++) {
      // Kind 0 is a buffer range, 1 a texture, 2 a cube texture, 3 a sampler.
      const at = 32 + i * 32, binding = u32(w, at), kind = u32(w, at + 4);
      ensure(binding < 32 && !bindings.has(binding) && kind <= 3 &&
        (kind === 0 || (zero64(w, at + 16) && zero64(w, at + 24))), "Resource binding");
      bindings.add(binding);
      entries.push({ binding, kind, resource: integer(w, at + 8), offset: integer(w, at + 16), size: integer(w, at + 24) });
    }
    return { id: integer(w, 8), pipeline: integer(w, 16), index, entries };
  },
  run({ scope, device }, record) {
    const pipeline = object(scope, record.pipeline, "graphics");
    const entries = record.entries.map(({ binding, kind, resource, offset, size }) => {
      const r = object(scope, resource, ["buffer", "texture", "texture", "sampler"][kind]);
      if (kind === 0) {
        range(r, offset, size);
        ensure(size > 0 && !r.mapped, "Invalid bound buffer");
        return { binding, resource: { buffer: r.value, offset, size } };
      }
      if (kind === 3) return { binding, resource: r.value };
      ensure(kind !== 2 || r.layers === 6, "Cube binding requires six layers");
      ensure(r.dimension === 0, "Resource groups bind two-dimensional textures");
      return { binding, resource: r.value.createView({ dimension: kind === 2 ? "cube" : "2d", arrayLayerCount: kind === 2 ? 6 : 1,
        aspect: r.type === 5 ? "depth-only" : "all" }) };
    });
    const layout = pipeline.value.getBindGroupLayout(record.index);
    insert(scope, record.id, "resource-group", device.createBindGroup({ layout, entries }));
    object(scope, record.id).index = record.index;
  } });

operation(A.DOLLY_GPU_BEGIN_RENDER_PASS, { bytes: 64,
  decode(w) {
    const width = u32(w, 24), height = u32(w, 28), colorClear = u32(w, 32), depthClear = u32(w, 36);
    const clearValue = [40, 44, 48, 52].map(at => f32(w, at)), depthClearValue = f32(w, 56), stencilClearValue = u32(w, 60);
    ensure(width > 0 && height > 0 && colorClear <= 1 && depthClear <= 1 && clearValue.every(Number.isFinite) &&
      depthClearValue >= 0 && depthClearValue <= 1 && stencilClearValue <= 255, "Render pass descriptor");
    return { color: integer(w, 8), depth: integer(w, 16), width, height, colorClear, depthClear, clearValue,
      depthClearValue, stencilClearValue };
  },
  run(batch, record) {
    const { scope } = batch, { width, height } = record;
    let colorTexture;
    if (record.color) {
      const r = object(scope, record.color, "texture");
      ensure(r.width === width && r.height === height && r.type <= 4 && r.layers === 1 && r.dimension === 0 && r.samples === 1,
        "Color attachment dimensions/format");
      colorTexture = r.value;
    } else {
      ensure(scope.surface && width <= 4096 && height <= 2304, "Surface attachment dimensions/ownership");
      colorTexture = surfaceFrame(batch, width, height);
    }
    let depthStencilAttachment;
    if (record.depth) {
      const r = object(scope, record.depth, "texture"), loadOp = record.depthClear ? "clear" : "load";
      ensure(r.width === width && r.height === height && (r.type === 5 || r.type === 6) && r.layers === 1 && r.dimension === 0 &&
        r.samples === 1, "Depth attachment dimensions/format");
      depthStencilAttachment = { view: r.value.createView({ mipLevelCount: 1 }), depthLoadOp: loadOp, depthStoreOp: "store",
        depthClearValue: record.depthClearValue,
        ...(r.type === 5 ? { stencilLoadOp: loadOp, stencilStoreOp: "store", stencilClearValue: record.stencilClearValue } : {}) };
    }
    const colorAttachment = { view: colorTexture.createView({ mipLevelCount: 1 }), loadOp: record.colorClear ? "clear" : "load",
      storeOp: "store", clearValue: record.clearValue };
    batch.renderPass = commandEncoder(batch).beginRenderPass({ ...timestamps(batch), colorAttachments: [colorAttachment],
      depthStencilAttachment });
    Object.assign(batch, { passWidth: width, passHeight: height, renderPipeline: null, renderGroups: [], renderBuffers: [],
      renderIndex: null });
  } });

operation(A.DOLLY_GPU_END_RENDER_PASS, { bytes: 8,
  run(batch) {
    ensure(batch.renderPass, "No active render pass");
    endRender(batch);
  } });

operation(A.DOLLY_GPU_VIEWPORT, { bytes: 48,
  decode(w) {
    const viewport = [8, 12, 16, 20, 24, 28].map(at => f32(w, at)), [x, y, width, height, min, max] = viewport;
    ensure(viewport.every(Number.isFinite) && x >= 0 && y >= 0 && width > 0 && height > 0 && min >= 0 && max <= 1 && min <= max,
      "Viewport/scissor bounds");
    return { viewport, scissor: [32, 36, 40, 44].map(at => u32(w, at)) };
  },
  run({ renderPass, passWidth, passHeight }, { viewport, scissor }) {
    ensure(renderPass, "Viewport outside render pass");
    const [x, y, width, height] = viewport;
    ensure(x <= passWidth - width && y <= passHeight - height && scissor[0] <= passWidth - scissor[2] &&
      scissor[1] <= passHeight - scissor[3], "Viewport/scissor bounds");
    renderPass.setViewport(...viewport);
    renderPass.setScissorRect(...scissor);
  } });

operation(A.DOLLY_GPU_DRAW_MESH, { least: 80,
  decode(w, b) {
    const groupCount = u32(w, 64), bufferCount = u32(w, 68);
    ensure(groupCount <= 4 && bufferCount <= 8 && b.length === 80 + 8 * groupCount + 24 * bufferCount && zero64(w, 72), "Mesh layout");
    const [count, instances, first] = [40, 44, 48].map(at => u32(w, at)), base = w.getInt32(52, true);
    const firstInstance = u32(w, 56), indexType = u32(w, 60);
    ensure(count > 0 && instances > 0 && count * instances <= 4 * 1024 * 1024 && first + count <= 0xffffffff &&
      firstInstance + instances <= 0xffffffff && indexType <= 2, "Mesh draw limit", E.E2BIG);
    const groups = Array.from({ length: groupCount }, (_, i) => integer(w, 80 + i * 8));
    const buffers = Array.from({ length: bufferCount }, (_, i) => bufferRange(w, 80 + 8 * groupCount + 24 * i));
    let index = null;
    if (indexType) {
      index = { ...bufferRange(w, 16), format: indexType === 1 ? "uint16" : "uint32" };
      ensure((first + count) * (indexType === 1 ? 2 : 4) <= index.size, "Index buffer range");
    } else {
      ensure(zero64(w, 16) && zero64(w, 24) && zero64(w, 32) && base === 0, "Unexpected nonindexed draw arguments");
    }
    return { pipeline: integer(w, 8), count, instances, first, base, firstInstance, groups, buffers, index };
  },
  run(batch, record) {
    const { scope, renderPass } = batch;
    ensure(renderPass, "Draw outside render pass");
    const pipeline = object(scope, record.pipeline, "graphics").value;
    if (batch.renderPipeline !== pipeline) {
      renderPass.setPipeline(pipeline);
      batch.renderPipeline = pipeline;
    }
    const groups = new Set();
    for (const handle of record.groups) {
      const r = object(scope, handle, "resource-group");
      ensure(!groups.has(r.index), "Duplicate mesh group");
      groups.add(r.index);
      if (batch.renderGroups[r.index] !== r.value) {
        renderPass.setBindGroup(r.index, r.value);
        batch.renderGroups[r.index] = r.value;
      }
    }
    record.buffers.forEach(({ buffer, offset, size }, slot) => {
      const r = object(scope, buffer, "buffer"), bound = batch.renderBuffers[slot];
      range(r, offset, size);
      ensure(!r.mapped && size > 0, "Invalid vertex buffer");
      if (bound?.[0] === r.value && bound[1] === offset && bound[2] === size) return;
      renderPass.setVertexBuffer(slot, r.value, offset, size);
      batch.renderBuffers[slot] = [r.value, offset, size];
    });
    if (!record.index) {
      renderPass.draw(record.count, record.instances, record.first, record.firstInstance);
      return;
    }
    const { buffer, offset, size, format: indexFormat } = record.index, r = object(scope, buffer, "buffer"), bound = batch.renderIndex;
    range(r, offset, size);
    ensure(!r.mapped, "Index buffer range");
    if (bound?.[0] !== r.value || bound[1] !== indexFormat || bound[2] !== offset || bound[3] !== size) {
      renderPass.setIndexBuffer(r.value, indexFormat, offset, size);
      batch.renderIndex = [r.value, indexFormat, offset, size];
    }
    renderPass.drawIndexed(record.count, record.instances, record.first, record.base, record.firstInstance);
  } });

// The explicit records (FEATURE_EXPLICIT) keep WebGPU's object model: views, layouts, whole
// pipeline descriptors, copies and pass state.
operation(A.DOLLY_GPU_CREATE_VIEW, { bytes: 56, creates: true,
  decode(w) {
    const [viewFormat, dimension, aspect, baseMip, mips, baseLayer, layers, swizzle] =
      [24, 28, 32, 36, 40, 44, 48, 52].map(at => u32(w, at));
    const channels = [0, 1, 2, 3].map(i => (swizzle >>> (8 * i)) & 255);
    ensure(viewFormat < textureFormats.length && dimension <= 6 && aspect <= 2 && channels.every(n => n <= 5),
      `View descriptor: format ${viewFormat}, dimension ${dimension}, aspect ${aspect}, swizzle ${swizzle.toString(16)}`);
    const descriptor = { aspect: aspects[aspect], baseMipLevel: baseMip, baseArrayLayer: baseLayer,
      ...(viewFormat ? { format: textureFormats[viewFormat] } : {}), ...(dimension ? { dimension: viewDimensions[dimension] } : {}),
      ...(mips ? { mipLevelCount: mips } : {}), ...(layers ? { arrayLayerCount: layers } : {}) };
    return { id: integer(w, 8), texture: integer(w, 16), viewFormat, baseMip, mips, descriptor,
      swizzle: swizzle === 0x03020100 ? null : channels.map(n => "rgba01"[n]).join("") };
  },
  run({ scope, device }, record) {
    const r = object(scope, record.texture, "texture"), { viewFormat, baseMip, mips, descriptor } = record;
    ensure(baseMip < r.mips && mips <= r.mips - baseMip, `View descriptor: mips ${baseMip}+${mips} of ${r.mips}`);
    if (srgbFormat(viewFormat) && r.value.usage & GPUTextureUsage.STORAGE_BINDING) {
      descriptor.usage = r.value.usage & ~GPUTextureUsage.STORAGE_BINDING;
    }
    if (record.swizzle) {
      ensure(device.features.has("texture-component-swizzle"), "Texture swizzles are unavailable", E.ENOTSUP);
      descriptor.swizzle = record.swizzle;
    }
    insert(scope, record.id, "view", r.value.createView(descriptor));
    Object.assign(object(scope, record.id), { texture: r, width: Math.max(1, r.width >> baseMip),
      height: Math.max(1, r.height >> baseMip), type: viewFormat || r.type });
  } });

// A bind group layout entry's type, 1 to 8, and its three fields (dolly-gpu-0.wat):
// a buffer (1-3) has a dynamic offset or not; a sampler (4-6) none; a texture (7) has its sample
// type, view dimension and multisampling; a storage texture (8) its access, view dimension and format.
function bindGroupLayoutEntry(w, at) {
  const [binding, visibility, type, first, second, third] = [0, 4, 8, 12, 16, 20].map(o => u32(w, at + o));
  const minBindingSize = integer(w, at + 24), entry = { binding, visibility };
  ensure(visibility > 0 && visibility <= 7 && type >= 1 && type <= 8, "Bind group layout entry");
  if (type <= 3) {
    ensure(first <= 1 && second === 0 && third === 0, "Buffer layout entry");
    entry.buffer = { type: ["uniform", "storage", "read-only-storage"][type - 1], hasDynamicOffset: first === 1, minBindingSize };
  } else if (type <= 6) {
    ensure(first === 0 && second === 0 && third === 0 && minBindingSize === 0, "Sampler layout entry");
    entry.sampler = { type: ["filtering", "non-filtering", "comparison"][type - 4] };
  } else if (type === 7) {
    ensure(first >= 1 && first <= 5 && second >= 1 && second <= 6 && third <= 1 && minBindingSize === 0, "Texture layout entry");
    entry.texture = { sampleType: ["float", "unfilterable-float", "depth", "sint", "uint"][first - 1],
      viewDimension: viewDimensions[second], multisampled: third === 1 };
  } else {
    ensure(first >= 1 && first <= 3 && second >= 1 && second <= 6 && third > 0 && third < textureFormats.length &&
      minBindingSize === 0, "Storage texture layout entry");
    entry.storageTexture = { access: ["write-only", "read-only", "read-write"][first - 1], format: textureFormats[third],
      viewDimension: viewDimensions[second] };
  }
  return entry;
}
operation(A.DOLLY_GPU_CREATE_BIND_GROUP_LAYOUT, { least: 24, creates: true,
  decode(w, b) {
    const count = u32(w, 16);
    ensure(count <= A.DOLLY_GPU_MAX_LAYOUT_ENTRIES && b.length === 24 + 32 * count && u32(w, 20) === 0, "Bind group layout layout");
    return { id: integer(w, 8), entries: Array.from({ length: count }, (_, i) => bindGroupLayoutEntry(w, 24 + i * 32)) };
  },
  run({ scope, device }, { id, entries }) {
    insert(scope, id, "group-layout", device.createBindGroupLayout({ entries }));
  } });

operation(A.DOLLY_GPU_CREATE_PIPELINE_LAYOUT, { least: 24, creates: true,
  decode(w, b) {
    const count = u32(w, 16);
    ensure(count <= 8 && b.length === 24 + 8 * count && u32(w, 20) === 0, "Pipeline layout layout");
    return { id: integer(w, 8), layouts: Array.from({ length: count }, (_, i) => integer(w, 24 + i * 8)) };
  },
  run({ scope, device }, { id, layouts }) {
    const bindGroupLayouts = layouts.map(layout => object(scope, layout, "group-layout").value);
    insert(scope, id, "pipeline-layout", device.createPipelineLayout({ bindGroupLayouts }));
  } });

operation(A.DOLLY_GPU_CREATE_BIND_GROUP, { least: 32, creates: true,
  decode(w, b) {
    const count = u32(w, 24), entries = [];
    ensure(count <= A.DOLLY_GPU_MAX_LAYOUT_ENTRIES && b.length === 32 + 32 * count && u32(w, 28) === 0, "Bind group entries");
    for (let i = 0; i < count; i++) {
      // Kind 0 is a buffer range, 1 a sampler, 2 a texture view.
      const at = 32 + i * 32, binding = u32(w, at), kind = u32(w, at + 4);
      ensure(kind <= 2, "Bind group entry kind");
      if (kind !== 0) ensure(zero64(w, at + 16) && zero64(w, at + 24), "Bind group entry range");
      entries.push({ binding, kind, resource: integer(w, at + 8), offset: integer(w, at + 16), size: integer(w, at + 24) });
    }
    return { id: integer(w, 8), layout: integer(w, 16), entries };
  },
  run({ scope, device }, record) {
    const layout = object(scope, record.layout, "group-layout").value;
    const entries = record.entries.map(({ binding, kind, resource, offset, size }) => {
      const r = object(scope, resource, ["buffer", "sampler", "view"][kind]);
      if (kind !== 0) return { binding, resource: r.value };
      range(r, offset, size);
      ensure(size > 0 && !r.mapped, "Invalid bound buffer");
      return { binding, resource: { buffer: r.value, offset, size } };
    });
    insert(scope, record.id, "bind-group", device.createBindGroup({ layout, entries }));
  } });

// A stencil face: compare, then the operations on fail, depth fail and pass.
function stencilFace(w, at) {
  const [compare, failOp, depthFailOp, passOp] = [0, 4, 8, 12].map(o => u32(w, at + o));
  ensure(compare >= 1 && compare <= 8 && [failOp, depthFailOp, passOp].every(n => n < stencilOps.length), "Stencil state");
  return { compare: compareOps[compare], failOp: stencilOps[failOp], depthFailOp: stencilOps[depthFailOp], passOp: stencilOps[passOp] };
}
// A render target; format 0 is the surface's, filled in by run.
function renderTarget(w, at) {
  const [targetFormat, writeMask, blend, absent] = [0, 4, 8, 36].map(o => u32(w, at + o));
  ensure(targetFormat < textureFormats.length && writeMask <= 15 && blend <= 1 && absent <= 1, "Render target");
  if (absent) {
    ensure(!targetFormat && !writeMask && !blend, "Absent render target");
    return null;
  }
  return { format: textureFormats[targetFormat], writeMask,
    ...(blend ? { blend: { color: blendComponent(w, at + 12), alpha: blendComponent(w, at + 24) } } : {}) };
}
operation(A.DOLLY_GPU_CREATE_RENDER_PIPELINE, { least: 160, creates: true,
  decode(w, b) {
    const field = at => u32(w, at);
    const [targetCount, bufferCount, attributeCount, constantCount, vs, fs] = [136, 140, 144, 148, 152, 156].map(field);
    ensure(targetCount <= 8 && bufferCount <= 16 && attributeCount <= 32 && constantCount <= 64 && vs <= 64 && fs <= 64 &&
      b.length === Math.ceil((160 + 40 * targetCount + 16 * (bufferCount + attributeCount + constantCount) + vs + fs) / 8) * 8,
      "Render pipeline layout");
    const [topology, stripFormat, front, cull, unclipped, depth, depthWrite, depthCompare] = [40, 44, 48, 52, 56, 60, 64, 68].map(field);
    const [samples, mask, coverage] = [124, 128, 132].map(field), slope = f32(w, 116), clamp = f32(w, 120);
    ensure(topology <= 4 && stripFormat <= 2 && (stripFormat === 0 || topology === 1 || topology === 3) && front <= 1 && cull <= 2 &&
      unclipped <= 1 && [0, 5, 6, 43, 44, 45].includes(depth) && depthWrite <= 1 && depthCompare <= 8 &&
      (depth === 0) === (depthCompare === 0) && Number.isFinite(slope) && Number.isFinite(clamp) &&
      (samples === 1 || samples === 4) && coverage <= 1, "Render pipeline state");
    let at = 160;
    const targets = [], buffers = [], vertexConstants = {}, fragmentConstants = {};
    for (let i = 0; i < targetCount; i++, at += 40) targets.push(renderTarget(w, at));
    for (let i = 0; i < bufferCount; i++, at += 16) {
      ensure(field(at + 4) <= 1 && zero64(w, at + 8), "Vertex buffer layout");
      buffers.push({ arrayStride: field(at), stepMode: field(at + 4) ? "instance" : "vertex", attributes: [] });
    }
    for (let i = 0; i < attributeCount; i++, at += 16) {
      const [slot, shaderLocation, type, offset] = [0, 4, 8, 12].map(o => field(at + o));
      ensure(slot < bufferCount && type > 0 && type < vertexFormats.length, "Vertex attribute");
      buffers[slot].attributes.push({ shaderLocation, format: vertexFormats[type], offset });
    }
    for (let i = 0; i < constantCount; i++, at += 16) {
      const constantId = field(at), stages = field(at + 4), value = w.getFloat64(at + 8, true);
      ensure(stages > 0 && stages <= 3 && Number.isFinite(value), "Override constant");
      if (stages & 1) vertexConstants[constantId] = value;
      if (stages & 2) fragmentConstants[constantId] = value;
    }
    const fragmentShader = integer(w, 32);
    if (!fragmentShader) ensure(fs === 0 && targetCount === 0, "Render targets without a fragment stage");
    return { id: integer(w, 8), layout: integer(w, 16), vertexShader: integer(w, 24), fragmentShader,
      vertexEntry: text(b, at, vs), fragmentEntry: fragmentShader ? text(b, at + vs, fs) : null,
      buffers, vertexConstants, fragmentConstants, targets,
      primitive: { topology: ["triangle-list", "triangle-strip", "line-list", "line-strip", "point-list"][topology],
        ...(stripFormat ? { stripIndexFormat: ["", "uint16", "uint32"][stripFormat] } : {}), frontFace: front ? "cw" : "ccw",
        cullMode: ["none", "front", "back"][cull], ...(unclipped ? { unclippedDepth: true } : {}) },
      multisample: { count: samples, mask, alphaToCoverageEnabled: coverage === 1 },
      depthStencil: depth ? { format: textureFormats[depth], depthWriteEnabled: depthWrite === 1,
        depthCompare: compareOps[depthCompare], stencilFront: stencilFace(w, 72), stencilBack: stencilFace(w, 88),
        stencilReadMask: field(104), stencilWriteMask: field(108), depthBias: w.getInt32(112, true),
        depthBiasSlopeScale: slope, depthBiasClamp: clamp } : null };
  },
  run(batch, record) {
    const { scope } = batch;
    const descriptor = { layout: object(scope, record.layout, "pipeline-layout").value,
      vertex: { module: object(scope, record.vertexShader, "shader").value, entryPoint: record.vertexEntry,
        buffers: record.buffers, constants: record.vertexConstants },
      primitive: record.primitive, multisample: record.multisample };
    if (record.fragmentShader) {
      descriptor.fragment = { module: object(scope, record.fragmentShader, "shader").value, entryPoint: record.fragmentEntry,
        targets: record.targets.map(target => target && { ...target, format: target.format ?? format }),
        constants: record.fragmentConstants };
    }
    if (record.depthStencil) descriptor.depthStencil = record.depthStencil;
    compile(batch, record, "view-render", batch.device.createRenderPipelineAsync(descriptor));
  } });

operation(A.DOLLY_GPU_CREATE_COMPUTE_PIPELINE, { least: 40, creates: true,
  decode(w, b) {
    const constantCount = u32(w, 32), entryBytes = u32(w, 36), constants = {};
    ensure(constantCount <= 64 && entryBytes <= 64 && b.length === Math.ceil((40 + 16 * constantCount + entryBytes) / 8) * 8,
      "Compute pipeline layout");
    for (let i = 0; i < constantCount; i++) {
      const at = 40 + i * 16, value = w.getFloat64(at + 8, true);
      ensure(u32(w, at + 4) === 0 && Number.isFinite(value), "Override constant");
      constants[u32(w, at)] = value;
    }
    return { id: integer(w, 8), layout: integer(w, 16), shader: integer(w, 24),
      entry: text(b, 40 + 16 * constantCount, entryBytes), constants };
  },
  run(batch, record) {
    const { scope } = batch, layout = object(scope, record.layout, "pipeline-layout").value;
    const module = object(scope, record.shader, "shader").value;
    compile(batch, record, "view-compute", batch.device.createComputePipelineAsync({ layout,
      compute: { module, entryPoint: record.entry, constants: record.constants } }));
  } });

operation(A.DOLLY_GPU_CREATE_QUERY_SET, { bytes: 24, creates: true,
  decode(w) {
    const count = u32(w, 16);
    ensure(count > 0 && count <= 4096 && u32(w, 20) === 0, "Query set");
    return { id: integer(w, 8), count };
  },
  run({ scope, device }, { id, count }) {
    ensure(device.features.has("timestamp-query"), "Timestamp queries are unavailable", E.ENOTSUP);
    ensure(count * 8 <= maxBytes - usedBytes, "Query set allocation quota", E.ENOMEM);
    insert(scope, id, "query-set", device.createQuerySet({ type: "timestamp", count }), count * 8);
    usedBytes += count * 8;
  } });

function decodeBufferTextureCopy(w) {
  const [bytesPerRow, rowsPerImage] = [24, 28].map(at => u32(w, at));
  const [mipLevel, aspect, x, y, z, width, height, depthOrArrayLayers] = [40, 44, 48, 52, 56, 60, 64, 68].map(at => u32(w, at));
  ensure(aspect <= 2 && bytesPerRow % 256 === 0, "Buffer-texture copy");
  return { buffer: integer(w, 8), offset: integer(w, 16), bytesPerRow, rowsPerImage, texture: integer(w, 32),
    mipLevel, origin: { x, y, z }, aspect: aspects[aspect], extent: { width, height, depthOrArrayLayers } };
}
// The buffer and texture sides of a copy between them.
function bufferTextureCopy({ scope }, record) {
  const r = object(scope, record.buffer, "buffer"), t = object(scope, record.texture, "texture");
  ensure(!r.mapped, "Buffer-texture copy");
  return [{ buffer: r.value, offset: record.offset, bytesPerRow: record.bytesPerRow, rowsPerImage: record.rowsPerImage },
    { texture: t.value, mipLevel: record.mipLevel, origin: record.origin, aspect: record.aspect }];
}
operation(A.DOLLY_GPU_COPY_BUFFER_TO_TEXTURE, { bytes: 72, decode: decodeBufferTextureCopy,
  run(batch, record) {
    const [buffer, image] = bufferTextureCopy(batch, record);
    commandEncoder(batch).copyBufferToTexture(buffer, image, record.extent);
  } });
operation(A.DOLLY_GPU_COPY_TEXTURE_TO_BUFFER, { bytes: 72, decode: decodeBufferTextureCopy,
  run(batch, record) {
    const [buffer, image] = bufferTextureCopy(batch, record);
    commandEncoder(batch).copyTextureToBuffer(image, buffer, record.extent);
  } });

operation(A.DOLLY_GPU_COPY_TEXTURE_TO_TEXTURE, { bytes: 72,
  decode(w) {
    const field = at => u32(w, at);
    ensure(field(68) === 0, "Texture copy reserved field");
    return { source: integer(w, 8), sourceMip: field(24), sourceOrigin: { x: field(28), y: field(32), z: field(36) },
      destination: integer(w, 16), destinationMip: field(40), destinationOrigin: { x: field(44), y: field(48), z: field(52) },
      extent: { width: field(56), height: field(60), depthOrArrayLayers: field(64) } };
  },
  run(batch, record) {
    const source = object(batch.scope, record.source, "texture"), destination = object(batch.scope, record.destination, "texture");
    commandEncoder(batch).copyTextureToTexture({ texture: source.value, mipLevel: record.sourceMip, origin: record.sourceOrigin },
      { texture: destination.value, mipLevel: record.destinationMip, origin: record.destinationOrigin }, record.extent);
  } });

operation(A.DOLLY_GPU_CLEAR_BUFFER, { bytes: 32,
  decode: w => ({ buffer: integer(w, 8), offset: integer(w, 16), size: integer(w, 24) }),
  run(batch, { buffer, offset, size }) {
    const r = object(batch.scope, buffer, "buffer");
    range(r, offset, size);
    ensure(!r.mapped, "Clearing a mapped buffer");
    commandEncoder(batch).clearBuffer(r.value, offset, size);
  } });

operation(A.DOLLY_GPU_WRITE_TIMESTAMP, { bytes: 24,
  decode(w) {
    ensure(u32(w, 20) === 0, "Timestamp reserved field");
    return { querySet: integer(w, 8), query: u32(w, 16) };
  },
  run(batch, record) {
    const querySet = object(batch.scope, record.querySet, "query-set").value;
    commandEncoder(batch).beginComputePass({ timestampWrites: { querySet, beginningOfPassWriteIndex: record.query } }).end();
  } });

operation(A.DOLLY_GPU_RESOLVE_QUERY_SET, { bytes: 40,
  decode: w => ({ querySet: integer(w, 8), first: u32(w, 16), count: u32(w, 20), buffer: integer(w, 24), offset: integer(w, 32) }),
  run(batch, record) {
    const querySet = object(batch.scope, record.querySet, "query-set"), r = object(batch.scope, record.buffer, "buffer");
    ensure(!r.mapped, "Resolving into a mapped buffer");
    commandEncoder(batch).resolveQuerySet(querySet.value, record.first, record.count, r.value, record.offset);
  } });

// A colour attachment, or null for an absent one; view 0 is the scope's surface.
function colourAttachment(w, at, absent) {
  const view = integer(w, at), resolve = integer(w, at + 8), load = u32(w, at + 16), store = u32(w, at + 20);
  const clearValue = [24, 28, 32, 36].map(o => f32(w, at + o));
  if (absent) {
    ensure(!view && !resolve && !load && !store && clearValue.every(v => v === 0), "Absent colour attachment");
    return null;
  }
  ensure(load <= 1 && store <= 1 && clearValue.every(Number.isFinite), "Colour attachment");
  return { view, resolve, loadOp: load ? "clear" : "load", storeOp: store ? "discard" : "store", clearValue };
}
// The depth and stencil aspects of a depth attachment, each read-only or loaded and stored.
function depthAttachment(w, view) {
  const [depthLoad, depthStore, depthReadOnly] = [28, 32, 36].map(at => u32(w, at)), depthClearValue = f32(w, 40);
  const [stencilLoad, stencilStore, stencilReadOnly, stencilClearValue] = [44, 48, 52, 56].map(at => u32(w, at));
  ensure(depthLoad <= 1 && depthStore <= 1 && depthReadOnly <= 1 && depthClearValue >= 0 && depthClearValue <= 1 &&
    stencilLoad <= 1 && stencilStore <= 1 && stencilReadOnly <= 1, "Depth attachment");
  return { view,
    depth: depthReadOnly ? { depthReadOnly: true }
      : { depthLoadOp: depthLoad ? "clear" : "load", depthStoreOp: depthStore ? "discard" : "store", depthClearValue },
    stencil: stencilReadOnly ? { stencilReadOnly: true }
      : { stencilLoadOp: stencilLoad ? "clear" : "load", stencilStoreOp: stencilStore ? "discard" : "store", stencilClearValue } };
}
operation(A.DOLLY_GPU_BEGIN_VIEW_PASS, { least: 64,
  decode(w, b) {
    const count = u32(w, 16), absent = u32(w, 60), depthView = integer(w, 8);
    ensure(count <= 8 && b.length === 64 + 40 * count && absent >>> count === 0, "View pass layout");
    return { width: u32(w, 20), height: u32(w, 24),
      colours: Array.from({ length: count }, (_, i) => colourAttachment(w, 64 + i * 40, absent >>> i & 1)),
      depth: depthView ? depthAttachment(w, depthView) : null };
  },
  run(batch, record) {
    const { scope } = batch, { width, height } = record;
    // The pass's size: its first attachment's.
    let size;
    const colorAttachments = record.colours.map(colour => {
      if (!colour) return null;
      let view;
      if (colour.view) {
        const r = object(scope, colour.view, "view");
        view = r.value;
        size ??= [r.width, r.height];
      } else {
        ensure(scope.surface && width > 0 && height > 0 && width <= 4096 && height <= 2304, "Surface attachment dimensions/ownership");
        view = surfaceFrame(batch, width, height).createView();
        size ??= [width, height];
      }
      const resolveTarget = colour.resolve ? { resolveTarget: object(scope, colour.resolve, "view").value } : {};
      return { view, ...resolveTarget, loadOp: colour.loadOp, storeOp: colour.storeOp, clearValue: colour.clearValue };
    });
    let depthStencilAttachment;
    if (record.depth) {
      const r = object(scope, record.depth.view, "view");
      depthStencilAttachment = { view: r.value, ...(depthFormat(r.type) ? record.depth.depth : {}),
        ...(stencilFormat(r.type) ? record.depth.stencil : {}) };
      size ??= [r.width, r.height];
    }
    ensure(size, "A render pass needs an attachment");
    batch.renderPass = commandEncoder(batch).beginRenderPass({ ...timestamps(batch), colorAttachments, depthStencilAttachment });
    batch.viewPass = true;
    [batch.passWidth, batch.passHeight] = size;
  } });

operation(A.DOLLY_GPU_BEGIN_COMPUTE_PASS, { bytes: 8,
  run(batch) {
    batch.computePass = commandEncoder(batch).beginComputePass(timestamps(batch));
    batch.explicitCompute = true;
  } });

operation(A.DOLLY_GPU_END_COMPUTE_PASS, { bytes: 8,
  run(batch) {
    ensure(batch.explicitCompute, "No active compute pass");
    endCompute(batch);
  } });

operation(A.DOLLY_GPU_SET_PIPELINE, { bytes: 16, decode: w => ({ pipeline: integer(w, 8) }),
  async run(batch, { pipeline }) {
    await compiled(batch);
    if (batch.viewPass) {
      batch.renderPass.setPipeline(object(batch.scope, pipeline, "view-render").value);
      return;
    }
    ensure(batch.explicitCompute, "Pipeline outside a pass");
    batch.computePass.setPipeline(object(batch.scope, pipeline, "view-compute").value);
  } });

operation(A.DOLLY_GPU_SET_BIND_GROUP, { least: 24,
  decode(w, b) {
    const index = u32(w, 16), count = u32(w, 20);
    ensure(count <= 16 && b.length === Math.ceil((24 + 4 * count) / 8) * 8, "Bind group offsets");
    ensure(index < 8, "Bind group index");
    return { group: integer(w, 8), index, offsets: Array.from({ length: count }, (_, i) => u32(w, 24 + i * 4)) };
  },
  run(batch, { group, index, offsets }) {
    ensure(batch.viewPass || batch.explicitCompute, "Bind group outside a pass");
    const value = object(batch.scope, group, "bind-group").value;
    (batch.viewPass ? batch.renderPass : batch.computePass).setBindGroup(index, value, offsets);
  } });

// SET_VERTEX_BUFFER's and SET_INDEX_BUFFER's buffer, in a view pass.
function boundBuffer(batch, record) {
  ensure(batch.viewPass, "Buffer binding outside a render pass");
  const r = object(batch.scope, record.buffer, "buffer");
  range(r, record.offset, record.size);
  ensure(!r.mapped, "Invalid vertex or index buffer");
  return r.value;
}
operation(A.DOLLY_GPU_SET_VERTEX_BUFFER, { bytes: 40,
  decode(w) {
    const slot = u32(w, 16);
    ensure(u32(w, 20) === 0, "Invalid vertex or index buffer");
    ensure(slot < 16, "Vertex buffer slot");
    return { slot, buffer: integer(w, 8), offset: integer(w, 24), size: integer(w, 32) };
  },
  run(batch, record) {
    const buffer = boundBuffer(batch, record);
    batch.renderPass.setVertexBuffer(record.slot, buffer, record.offset, record.size);
  } });
operation(A.DOLLY_GPU_SET_INDEX_BUFFER, { bytes: 40,
  decode(w) {
    const indexType = u32(w, 16);
    ensure(u32(w, 20) === 0, "Invalid vertex or index buffer");
    ensure(indexType === 1 || indexType === 2, "Index format");
    return { indexFormat: indexType === 1 ? "uint16" : "uint32", buffer: integer(w, 8), offset: integer(w, 24), size: integer(w, 32) };
  },
  run(batch, record) {
    const buffer = boundBuffer(batch, record);
    batch.renderPass.setIndexBuffer(buffer, record.indexFormat, record.offset, record.size);
  } });

operation(A.DOLLY_GPU_DRAW, { bytes: 24, decode: w => ({ args: [8, 12, 16, 20].map(at => u32(w, at)) }),
  run(batch, { args }) {
    ensure(batch.viewPass, "Draw outside a render pass");
    batch.renderPass.draw(...args);
  } });
operation(A.DOLLY_GPU_DRAW_INDEXED, { bytes: 32,
  decode(w) {
    ensure(u32(w, 28) === 0, "Draw reserved field");
    return { args: [u32(w, 8), u32(w, 12), u32(w, 16), w.getInt32(20, true), u32(w, 24)] };
  },
  run(batch, { args }) {
    ensure(batch.viewPass, "Draw outside a render pass");
    batch.renderPass.drawIndexed(...args);
  } });

// An indirect draw's or dispatch's arguments: a buffer and an offset in it.
const decodeIndirect = w => ({ buffer: integer(w, 8), offset: integer(w, 16) });
function indirectBuffer(batch, record) {
  const r = object(batch.scope, record.buffer, "buffer");
  ensure(!r.mapped, "Indirect arguments in a mapped buffer");
  return r.value;
}
operation(A.DOLLY_GPU_DRAW_INDIRECT, { bytes: 24, decode: decodeIndirect,
  run(batch, record) {
    const buffer = indirectBuffer(batch, record);
    ensure(batch.viewPass, "Draw outside a render pass");
    batch.renderPass.drawIndirect(buffer, record.offset);
  } });
operation(A.DOLLY_GPU_DRAW_INDEXED_INDIRECT, { bytes: 24, decode: decodeIndirect,
  run(batch, record) {
    const buffer = indirectBuffer(batch, record);
    ensure(batch.viewPass, "Draw outside a render pass");
    batch.renderPass.drawIndexedIndirect(buffer, record.offset);
  } });
operation(A.DOLLY_GPU_DISPATCH_INDIRECT, { bytes: 24, decode: decodeIndirect,
  run(batch, record) {
    const buffer = indirectBuffer(batch, record);
    ensure(batch.explicitCompute, "Dispatch outside a compute pass");
    batch.computePass.dispatchWorkgroupsIndirect(buffer, record.offset);
    stats.dispatches++;
  } });

operation(A.DOLLY_GPU_SET_BLEND_CONSTANT, { bytes: 24,
  decode(w) {
    const color = [8, 12, 16, 20].map(at => f32(w, at));
    ensure(color.every(Number.isFinite), "Blend constant");
    return { color };
  },
  run(batch, { color }) {
    ensure(batch.viewPass, "Blend constant");
    batch.renderPass.setBlendConstant(color);
  } });

operation(A.DOLLY_GPU_SET_STENCIL_REFERENCE, { bytes: 16,
  decode(w) {
    ensure(u32(w, 12) === 0, "Stencil reference");
    return { reference: u32(w, 8) };
  },
  run(batch, { reference }) {
    ensure(batch.viewPass, "Stencil reference");
    batch.renderPass.setStencilReference(reference);
  } });

operation(A.DOLLY_GPU_DISPATCH, { bytes: 24,
  decode(w) {
    ensure(u32(w, 20) === 0, "Dispatch reserved field");
    return { workgroups: [8, 12, 16].map(at => u32(w, at)) };
  },
  run(batch, { workgroups }) {
    ensure(batch.explicitCompute, "Dispatch outside a compute pass");
    batch.computePass.dispatchWorkgroups(...workgroups);
    stats.dispatches++;
  } });

async function runBatch(scope, records, flags) {
  const device = scope.device, progress = queueProgress;
  await queueFull(scope);
  const batch = scope.open ?? { explicitCompute: false, viewPass: false, queries: 0 };
  scope.open = null;
  Object.assign(batch, { scope, device, progress, compiling: [] });
  let keepOpen = false;
  const started = performance.now();
  device.pushErrorScope("validation");
  device.pushErrorScope("out-of-memory");
  try {
    for (const record of records) try {
      const { op } = record, definition = operations.get(op);
      if (op !== A.DOLLY_GPU_COMPUTE && !batch.explicitCompute) endCompute(batch);
      if (batch.renderPass) ensure((batch.viewPass ? viewPassRecords : renderPassRecords).has(op), "Command is invalid inside a render pass");
      if (batch.explicitCompute) ensure(computePassRecords.has(op), "Command is invalid inside a compute pass");
      if (definition.creates) {
        ensure(record.id > scope.high && record.id <= 0xffffffff && scope.objects.size + scope.retired.size < maxObjects,
          "GPU object quota", E.ENOSPC);
      }
      // Most runs are synchronous; awaiting only the others keeps a batch from yielding between them.
      const running = definition.run(batch, record);
      if (running) await running;
    } catch (error) {
      if (error.record) throw error;
      // WebGPU's own errors (a GPUPipelineError, a DOMException) keep their message read-only.
      fail(error.errno ?? (error.reason === "validation" ? E.EINVAL : E.EIO), `record ${record.position} (opcode ${record.op}): ${error.message}`);
    }
    await compiled(batch);
    if (flags & A.DOLLY_GPU_BATCH_CONTINUE) keepOpen = true;
    else ensure(!batch.encoder, "GPU batch has an unsubmitted encoder");
  } finally {
    if (keepOpen) scope.open = batch;
    else { endCompute(batch); endRender(batch); }
    validated(scope, Promise.all([device.popErrorScope(), device.popErrorScope()]));
    stats.batchWallMilliseconds += performance.now() - started;
  }
}
// WebGPU validates a batch on the GPU process's timeline, and Chrome answers an error scope only
// after a round trip there (3.6 ms a batch, 2026-11-08), so a batch is answered without it: the
// first error reaches the page's console when it is known and fails the scope's next WAIT.
function validated(scope, scopes) {
  const settled = scopes.then(([oom, validation]) => {
    const error = oom ? [E.ENOMEM, oom.message] : validation ? [E.EINVAL, validation.message] : null;
    if (!error || scope.lost) return;
    postMessage({ type: "status", error: error[1].slice(0, 2048) });
    scope.invalid ??= error;
  }, () => {}).finally(() => scope.validations.splice(scope.validations.indexOf(settled), 1));
  scope.validations.push(settled);
}

function publish(request, error, data = new Uint8Array()) {
  const base = mailbox + request.index * (64 + A.DOLLY_GPU_REPLY_BYTES), words = new Int32Array(memory, base, 16);
  new Uint8Array(memory, base + 64, data.length).set(data);
  Atomics.store(words, 1, request.scope);
  Atomics.store(words, 2, request.sequence);
  Atomics.store(words, 3, error);
  Atomics.store(words, 4, data.length);
  Atomics.store(words, 0, 1);
  postMessage({ type: "complete" });
}
async function open(request, scope) {
  scope.device = await getDevice();
  ensure(!scope.lost, "GPU scope cancelled", E.ECANCELED);
  const width = u32(request.v, 32), height = u32(request.v, 36);
  ensure((width === 0 && height === 0) || (width > 0 && height > 0 && width <= 4096 && height <= 2304), "Invalid surface size");
  ensure(!width || context, "GPU presentation requires the display provider", E.ENOSYS);
  scope.surface = width > 0;
  if (scope.surface) { scope.size = { width, height }; surfaces.push(scope); }
  scope.gpuMs = 0; scope.gpuTotalMs = 0; scope.gpuSamples = 0;
  if (device.features.has("timestamp-query")) scope.timers = Array.from({ length: 3 }, () => ({
    query: device.createQuerySet({ type: "timestamp", count: timestampQueries }),
    resolve: device.createBuffer({ size: timestampQueries * 8, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC }),
    read: device.createBuffer({ size: timestampQueries * 8, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }), busy: false }));
  // A fixed name: the adapter's vendor/description would fingerprint the device.
  const name = encode.encode("WebGPU"), output = new Uint8Array(16 + name.length), v = new DataView(output.buffer);
  v.setBigUint64(0, BigInt(scope.id), true);
  v.setUint32(8, width, true);
  v.setUint32(12, height, true);
  output.set(name, 16);
  return output;
}
async function wait(scope) {
  const submitted = queueProgress.queued;
  await Promise.all([settled(device, device.queue.onSubmittedWorkDone()), ...scope.validations]);
  queueProgress.completed = Math.max(queueProgress.completed, submitted);
  collectReleased(scope, queueProgress.completed);
  const invalid = scope.invalid;
  scope.invalid = null;
  if (invalid) throw Object.assign(new Error(invalid[1]), { errno: invalid[0], reported: true });
}
function readback(request, scope) {
  const r = object(scope, integer(request.v, 32), "buffer"), offset = integer(request.v, 40), size = integer(request.v, 48);
  ensure(r.mapped && size <= A.DOLLY_GPU_REPLY_BYTES && offset <= r.mapped.byteLength - size, "Invalid readback");
  stats.readbackBytes += size;
  return new Uint8Array(r.mapped, offset, size).slice();
}
function info(scope) {
  const output = new Uint8Array(80), v = new DataView(output.buffer);
  v.setUint32(0, scope.timers ? 1 : 0, true);
  v.setUint32(4, A.DOLLY_GPU_MAX_BINDINGS, true);
  v.setBigUint64(8, BigInt(maxBuffer), true);
  v.setBigUint64(16, BigInt(maxBytes), true);
  v.setFloat64(24, scope.gpuMs, true);
  v.setFloat64(32, scope.gpuTotalMs, true);
  v.setBigUint64(40, BigInt(scope.gpuSamples), true);
  v.setFloat64(48, stats.batchWallMilliseconds, true);
  v.setBigUint64(56, BigInt(stats.frames), true);
  v.setBigUint64(64, BigInt(stats.dispatches), true);
  v.setBigUint64(72, BigInt(usedBytes), true);
  return output;
}
async function execute(request, scope, parsed) {
  try {
    let output = new Uint8Array();
    if (request.op === A.DOLLY_GPU_OPEN) output = await open(request, scope);
    else {
      ensure(!scope.lost && device, "GPU scope lost", E.EIO);
      if (request.op === A.DOLLY_GPU_BATCH) await runBatch(scope, parsed, u32(request.v, 36));
      else if (request.op === A.DOLLY_GPU_WAIT) await wait(scope);
      else if (request.op === A.DOLLY_GPU_READ) output = readback(request, scope);
      else if (request.op === A.DOLLY_GPU_CLOSE) await retire(scope);
      else if (request.op === A.DOLLY_GPU_CAPABILITIES) output = capabilities;
      else if (request.op === A.DOLLY_GPU_LIMITS) output = limits;
      else if (request.op === A.DOLLY_GPU_INFO) output = info(scope);
    }
    publish(request, 0, output);
  } catch (error) {
    if (!error.reported) postMessage({ type: "status", error: String(error.message ?? error).slice(0, 2048) });
    if (request.op === A.DOLLY_GPU_OPEN) await retire(scope);
    publish(request, error.errno ?? E.EIO);
  } finally { scope.busy = false; }
}

// A request names its packet in shared memory, which is copied before it is checked; address 0
// cancels the scope that `bytes` names.
self.onmessage = event => {
  const m = event.data;
  if (m.type === "configure") {
    heap = m.memory; memory = heap.buffer; mailbox = m.mailbox; canvas = m.canvas; control = new Int32Array(m.control);
    pageFrames = m.shown ? new Int32Array(m.shown) : null;
    ensure(memory instanceof SharedArrayBuffer && Number.isSafeInteger(mailbox) && mailbox > 0 && mailbox % 64 === 0 &&
      mailbox <= memory.byteLength - slots.length * (64 + A.DOLLY_GPU_REPLY_BYTES), "Invalid GPU mailbox");
    postMessage({ type: "ready" });
    return;
  }
  if (m.type !== "request") return;
  memory = heap.buffer;
  let status = 0;
  try {
    const address = Number(m.address), size = Number(m.bytes);
    if (address === 0) {
      ensure(Number.isSafeInteger(size) && size > 0 && size <= 0xffffffff, "Invalid scope cancellation");
      const scope = slots[(size - 1) % slots.length];
      if (scope?.id === size) {
        scope.lost = true;
        serial = serial.then(() => retire(scope));
      }
    } else {
      ensure(Number.isSafeInteger(address) && Number.isSafeInteger(size) && address > 0 && size >= 32 &&
        size <= A.DOLLY_GPU_PACKET_BYTES && address <= memory.byteLength - size, "Invalid GPU request span", E.EFAULT);
      const request = header(new Uint8Array(memory, address, size).slice());
      ensure(request.op >= A.DOLLY_GPU_OPEN && request.op <= A.DOLLY_GPU_LIMITS, "Unknown GPU operation", E.ENOTSUP);
      ensure(!requestBytes.has(request.op) || requestBytes.get(request.op) === size, "GPU operation layout");
      const parsed = request.op === A.DOLLY_GPU_BATCH ? records(request) : null;
      let scope = slots[request.index];
      if (request.op === A.DOLLY_GPU_OPEN) {
        ensure(!scope && request.scope > generations[request.index], "GPU scope slot is busy", E.EBUSY);
        scope = { id: request.scope, index: request.index, sequence: 0, objects: new Map(), retired: new Map(), high: 0,
          submissions: [], frames: [], shows: [], validations: [], invalid: null, lost: false, surface: false };
        generations[request.index] = scope.id;
        slots[request.index] = scope;
      }
      ensure(scope?.id === request.scope, "Stale GPU scope", E.ESTALE);
      ensure(!scope.busy && request.sequence > scope.sequence, "GPU request is busy or repeated", E.EBUSY);
      scope.sequence = request.sequence;
      scope.busy = true;
      stats.packets++;
      stats.packetBytes += size;
      serial = serial.then(() => execute(request, scope, parsed)).catch(error => {
        publish(request, E.EIO);
        scope.busy = false;
        postMessage({ type: "status", error: String(error).slice(0, 2048) });
      });
    }
  } catch (error) { status = -(error.errno ?? E.EINVAL); }
  finally { Atomics.store(control, 1, status); Atomics.store(control, 0, 0); Atomics.notify(control, 0); }
};
