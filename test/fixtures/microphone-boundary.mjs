// What a hostile guest can reach through microphone@0, tried at the page's provider.
export async function microphoneBoundaryProof() {
  const [{createMicrophoneProvider}, M, {DOLLY_ERRNO: E}] = await Promise.all([
    import("../../host/microphone/provider.mjs"), import("../../host/microphone/abi.mjs"), import("../../src/process-constants.mjs")]);
  const check = (ok, message) => { if (!ok) throw Error(message); };
  let sequence = 0, asked = 0;
  // A request as the lease bridge hands it on: the bridge checks the header.
  function packet(operation, scope = 1, frames) {
    const body = new Uint8Array(frames === undefined ? 0 : 8);
    if (frames !== undefined) new DataView(body.buffer).setUint32(0, frames, true);
    return { operation, scope, sequence: ++sequence, body };
  }
  const devices = navigator.mediaDevices, native = devices.getUserMedia;
  devices.getUserMedia = function(constraints) {
    ++asked;
    check(constraints.audio === true && constraints.video === false, "More than the default audio input was asked for");
    return native.call(this, constraints);
  };
  const provider = createMicrophoneProvider();
  try {
    check(provider.dispatch(packet(M.DOLLY_MICROPHONE_READ, 1, 128)).error === E.EBADF, "A read without a lease");
    check(provider.dispatch(packet(M.DOLLY_MICROPHONE_STATUS)).error === E.EBADF, "A status without a lease");
    check(provider.dispatch({ ...packet(M.DOLLY_MICROPHONE_OPEN), body: new Uint8Array(4) }).error === E.EINVAL, "An open with a body");
    check(provider.dispatch(packet(9)).error === E.EBADF, "An unknown operation without a lease");
    check(asked === 0, "The browser was asked before a valid open");
    check(provider.dispatch(packet(M.DOLLY_MICROPHONE_OPEN)).error === 0 && asked === 1, "Open failed");
    check(provider.dispatch(packet(M.DOLLY_MICROPHONE_OPEN, 2)).error === E.EBUSY && asked === 1, "A second capture was admitted");
    check(provider.dispatch(packet(9)).error === E.ENOSYS, "An unknown operation");
    check(provider.dispatch(packet(M.DOLLY_MICROPHONE_READ, 1, 0)).error === E.EINVAL, "A read of no frames");
    check(provider.dispatch(packet(M.DOLLY_MICROPHONE_READ, 1, 4097)).error === E.EINVAL, "A read beyond the reply");
    const replayed = packet(M.DOLLY_MICROPHONE_STATUS);
    check(provider.dispatch(replayed).error === 0 && provider.dispatch(replayed).error === E.ESTALE, "Sequence replay accepted");
    for (let waited = 0; provider.status().state !== "capturing" || !provider.status().queuedFrames; waited += 20) {
      check(waited < 10000, `The capture never started: ${provider.status().state}`);
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    const read = provider.dispatch(packet(M.DOLLY_MICROPHONE_READ, 1, 4096)), frames = new DataView(read.bytes.buffer).getUint32(0, true);
    check(read.error === 0 && frames > 0 && frames <= 4096 && read.bytes.length === 8 + frames * 4, "A read's reply is not its frames");
    check(provider.status().liveTracks === 1, "The device is not held");
    provider.release(1);
    check(provider.status().liveTracks === 0 && provider.status().active === 0, "Revocation left the device held");
    check(provider.dispatch(packet(M.DOLLY_MICROPHONE_READ, 1, 128)).error === E.EBADF, "A revoked lease read samples");
    check(provider.dispatch(packet(M.DOLLY_MICROPHONE_OPEN)).error === E.ESTALE && asked === 1, "A lease was reused");
    check(provider.dispatch(packet(M.DOLLY_MICROPHONE_OPEN, 2)).error === 0 && asked === 2, "A new lease was refused");
    provider.release(1);
    check(provider.dispatch(packet(M.DOLLY_MICROPHONE_STATUS, 2)).error === 0, "A stale revocation ended a new lease");
    check(provider.dispatch(packet(M.DOLLY_MICROPHONE_CLOSE, 2)).error === 0 && provider.status().active === 0, "Close failed");
  } finally {
    provider.close();
    devices.getUserMedia = native;
  }
}
