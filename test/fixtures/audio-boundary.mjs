export async function audioBoundaryProof() {
  const [{createAudioProvider}, {createLeaseBridge}, {lease}, {DOLLY_ERRNO: E}] = await Promise.all([
    import("../../host/audio/provider.mjs"), import("../../host/lease-bridge.mjs"), import("../../host/audio/audio.mjs"),
    import("../../src/process-constants.mjs")]);
  const check = (ok, message) => { if (!ok) throw Error(message); };
  let sequence = 0;
  function packet(op, scope = 1, frames = 0) {
    const bytes = new Uint8Array(frames ? 40 + frames * 8 : 32), v = new DataView(bytes.buffer);
    v.setUint32(4, op, true); v.setUint32(8, scope, true); v.setUint32(16, ++sequence, true);
    v.setUint32(24, bytes.length - 32, true);
    if (frames) v.setUint32(32, frames, true);
    return bytes;
  }
  const provider = createAudioProvider();
  const NativeAudioContext = globalThis.AudioContext;
  let context;
  globalThis.AudioContext = new Proxy(NativeAudioContext, {construct(target, args) {
    return context = Reflect.construct(target, args);
  }});
  try { check(provider.dispatch(packet(1)).error === 0, "Audio open failed"); }
  finally { globalThis.AudioContext = NativeAudioContext; }
  try {
    for (let scope = 2; scope <= 4; ++scope) check(provider.dispatch(packet(1, scope)).error === 0, "Four audio leases unavailable");
    check(provider.dispatch(packet(1, 5)).error === E.EBUSY, "Audio slot quota bypassed");
    check(provider.dispatch(packet(1)).error === E.ESTALE, "Audio lease reused");
    await context.resume(); await context.suspend();
    const nativeResume = context.resume;
    let resumeCalls = 0, settleResume;
    context.resume = () => { ++resumeCalls; return new Promise(resolve => { settleResume = resolve; }); };
    provider.resume(); provider.resume(); provider.resume();
    check(resumeCalls === 1, "Repeated gestures queued unbounded resume requests");
    settleResume(); await Promise.resolve();
    context.resume = nativeResume;
    const invalid = packet(2, 1, 128);
    new DataView(invalid.buffer).setFloat32(40, NaN, true);
    check(provider.dispatch(invalid).error === E.EINVAL, "Nonfinite PCM accepted");
    check(provider.status().buffers === 0, "Rejected PCM allocated a buffer");
    const oversized = packet(2, 1, 4097);
    check(provider.dispatch(oversized).error === E.EINVAL, "Oversized PCM accepted");
    const stale = packet(3);
    check(provider.dispatch(stale).error === 0 && provider.dispatch(stale).error === E.ESTALE, "Sequence replay accepted");
    for (let i = 0; i < 11; ++i) check(provider.dispatch(packet(2, 1, 4096)).error === 0, "PCM quota prematurely exhausted");
    check(provider.dispatch(packet(2, 1, 2944)).error === 0, "Final PCM quota chunk rejected");
    check(provider.dispatch(packet(2, 1, 128)).error === E.EAGAIN, "PCM frame quota bypassed");
    for (let i = 0; i < 64; ++i) check(provider.dispatch(packet(2, 2, 128)).error === 0, "Buffer quota prematurely exhausted");
    check(provider.dispatch(packet(2, 2, 128)).error === E.EAGAIN, "PCM buffer quota bypassed");
    const bounded = provider.status();
    check(bounded.queuedFrames === 56192 && bounded.buffers === 76, "PCM quota accounting differs");
    provider.release(1); provider.release(2);
    check(provider.status().buffers === 0 && provider.status().queuedFrames === 0, "Revoked output retained buffers");
    check(provider.dispatch(packet(2, 1, 128)).error === E.EBADF, "Revoked stream accepted PCM");
    check(provider.dispatch(packet(1, 5)).error === 0, "New audio generation rejected");
    provider.release(1);
    check(provider.dispatch(packet(3, 5)).error === 0, "Stale revocation killed a new lease");
    check(provider.dispatch(packet(4, 5)).error === 0, "Audio close failed");
  } finally { await provider.close(); }

  const memory = new WebAssembly.Memory({initial: 1, maximum: 2, shared: true});
  const mailbox = 64, address = 1024, messages = [];
  let completions = 0;
  const bridge = createLeaseBridge(lease, memory, mailbox, message => messages.push(message), () => ++completions);
  function send(bytes) {
    new Uint8Array(memory.buffer, address, bytes.length).set(bytes);
    return bridge.dispatch({address, bytes: bytes.length});
  }
  check(send(packet(1)) === 0, "Bridge open failed");
  new Uint8Array(memory.buffer, address, 32).fill(255);
  check(new DataView(messages[0].packet.buffer).getUint32(4, true) === 1, "Bridge retained mutable guest packet");
  Atomics.store(new Int32Array(memory.buffer, mailbox), 0, 1);
  check(send(packet(1, 5)) === -E.EBUSY, "Forged guest completion bypassed admission");
  bridge.acknowledge({scope: 1, sequence: messages[0].sequence + 1, error: 0, bytes: new Uint8Array()});
  check(send(packet(1, 5)) === -E.EBUSY, "Wrong sequence acknowledged a pending request");
  for (let scope = 2; scope <= 4; ++scope) check(send(packet(1, scope)) === 0, "Bridge slot unavailable");
  check(messages.length === 4, "Bridge sent unbounded pending messages");
  bridge.acknowledge({scope: 2, sequence: messages[1].sequence, error: 0, bytes: new Uint8Array(16)});
  check(send(packet(1, 2)) === -E.EBUSY, "Duplicate open discarded an existing bridge lease");
  bridge.dispatch({address: 0, bytes: 1}); bridge.dispatch({address: 0, bytes: 1});
  check(messages.length === 5, "Repeated revocation flooded the host");
  bridge.acknowledge({scope: 1, sequence: messages[0].sequence, error: 0, bytes: new Uint8Array(16)});
  check(send(packet(1, 5)) === -E.EBUSY, "Lease reused before revocation completed");
  bridge.acknowledge({scope: 1, revoked: true});
  check(send(packet(1, 5)) === 0, "Revocation did not free bridge admission");
  const current = messages.at(-1);
  bridge.acknowledge({scope: 1, revoked: true});
  check(send(packet(1, 9)) === -E.EBUSY, "Stale completion removed a new generation");
  memory.grow(1);
  bridge.acknowledge({scope: 5, sequence: current.sequence, error: 0, bytes: new Uint8Array(17)});
  check(Atomics.load(new Int32Array(memory.buffer, mailbox), 3) === E.EIO, "Oversized reply escaped validation");
  check(completions >= 3, "Audio completions did not wake the supervisor");
  return {frameQuota: 48000, bufferQuota: 64, scopes: 4, copiedPackets: true, revoked: true, forgedCompletionDenied: true};
}
