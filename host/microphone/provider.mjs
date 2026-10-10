import * as M from "./abi.mjs";
import { DOLLY_ERRNO as E } from "../../src/process-constants.mjs";

const fail = errno => { throw Object.assign(new Error("Microphone request failed"), {errno}); };
const response = size => new Uint8Array(size);
const names = { [M.DOLLY_MICROPHONE_WAITING]: "waiting", [M.DOLLY_MICROPHONE_CAPTURING]: "capturing",
  [M.DOLLY_MICROPHONE_DENIED]: "denied", [M.DOLLY_MICROPHONE_UNAVAILABLE]: "unavailable" };

// The page side of microphone@0: one capture of the browser's default input.
// OPEN asks the browser, whose own prompt decides; nothing here grants it.
// `changed` runs whenever the capture's state does.
export function createMicrophoneProvider(changed = () => {}) {
  let capture, generation = 0;

  function set(target, state) {
    if (target.released || target.state === state) return;
    target.state = state;
    changed();
  }
  // Stops the tracks, which is what releases the device and ends the browser's own indicator.
  function stop(target) {
    if (target.node) { target.node.port.onmessage = null; target.node.disconnect(); }
    target.source?.disconnect();
    for (const track of target.stream?.getTracks() ?? []) track.stop();
    if (target.context && target.context.state !== "closed") target.context.close().catch(() => {});
  }
  function queue(target, samples) {
    if (target.released || !(samples instanceof Float32Array) || samples.length > target.samples.length) return;
    const size = target.samples.length, overflow = Math.max(0, target.length + samples.length - size);
    target.start = (target.start + overflow) % size;
    target.length -= overflow; target.dropped += overflow;
    const end = (target.start + target.length) % size, first = Math.min(samples.length, size - end);
    target.samples.set(samples.subarray(0, first), end);
    target.samples.set(samples.subarray(first), 0);
    target.length += samples.length; target.captured += samples.length;
  }
  async function start(target) {
    try {
      target.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (target.released) return stop(target);
      target.context = new AudioContext({ sampleRate: M.DOLLY_MICROPHONE_RATE });
      await target.context.audioWorklet.addModule(new URL("./worklet.mjs", import.meta.url));
      if (target.released) return stop(target);
      target.source = target.context.createMediaStreamSource(target.stream);
      target.node = new AudioWorkletNode(target.context, "dolly-microphone", { numberOfInputs: 1, numberOfOutputs: 0,
        channelCount: M.DOLLY_MICROPHONE_CHANNELS, channelCountMode: "explicit", channelInterpretation: "speakers" });
      target.node.port.onmessage = event => queue(target, event.data);
      target.source.connect(target.node);
      for (const track of target.stream.getAudioTracks()) {
        track.addEventListener("ended", () => set(target, M.DOLLY_MICROPHONE_UNAVAILABLE));
      }
      set(target, M.DOLLY_MICROPHONE_CAPTURING);
      // A capture closed at once ends this promise in a rejection of its own making.
      target.context.resume().catch(() => {});
    } catch (error) {
      const denied = error?.name === "NotAllowedError" || error?.name === "SecurityError";
      if (!denied && error?.name !== "NotFoundError") console.warn("Dolly microphone:", error);
      stop(target);
      set(target, denied ? M.DOLLY_MICROPHONE_DENIED : M.DOLLY_MICROPHONE_UNAVAILABLE);
    }
  }
  function release(scope) {
    if (capture?.scope !== scope) return;
    const target = capture;
    capture = undefined;
    target.released = true;
    stop(target);
    changed();
  }
  function status() {
    return { active: capture ? 1 : 0, state: capture ? names[capture.state] : "closed",
      queuedFrames: capture?.length ?? 0, capturedFrames: capture?.captured ?? 0, droppedFrames: capture?.dropped ?? 0,
      liveTracks: capture?.stream?.getTracks().filter(track => track.readyState === "live").length ?? 0 };
  }
  function dispatch(packet) {
    try {
      if (!(packet instanceof Uint8Array) || packet.byteLength < 32 || packet.byteLength > M.DOLLY_MICROPHONE_PACKET_BYTES) fail(E.EINVAL);
      packet = packet.slice();
      const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
      const op = view.getUint32(4, true), scope = view.getUint32(8, true), sequence = view.getUint32(16, true);
      if (view.getUint32(0, true) !== M.DOLLY_MICROPHONE_VERSION || view.getUint32(12, true) || view.getUint32(20, true) ||
          !scope || !sequence || view.getUint32(24, true) !== packet.length - 32 || view.getUint32(28, true)) fail(E.EINVAL);
      let result;
      if (op === M.DOLLY_MICROPHONE_OPEN) {
        if (packet.length !== 32) fail(E.EINVAL);
        if (scope <= generation) fail(E.ESTALE);
        if (capture) fail(E.EBUSY);
        if (typeof navigator.mediaDevices?.getUserMedia !== "function" || typeof AudioWorkletNode !== "function") fail(E.ENOSYS);
        capture = { scope, sequence, state: M.DOLLY_MICROPHONE_WAITING, released: false,
          samples: new Float32Array(M.DOLLY_MICROPHONE_QUEUE_FRAMES), start: 0, length: 0, captured: 0, dropped: 0 };
        generation = scope;
        void start(capture);
        changed();
        result = response(16);
        const output = new DataView(result.buffer);
        output.setBigUint64(0, BigInt(scope), true);
        output.setUint32(8, M.DOLLY_MICROPHONE_RATE, true); output.setUint32(12, M.DOLLY_MICROPHONE_CHANNELS, true);
      } else {
        if (capture?.scope !== scope) fail(E.EBADF);
        if (sequence <= capture.sequence) fail(E.ESTALE);
        capture.sequence = sequence;
        if (op === M.DOLLY_MICROPHONE_READ) {
          if (packet.length !== 40) fail(E.EINVAL);
          const frames = view.getUint32(32, true);
          if (!frames || frames > M.DOLLY_MICROPHONE_MAX_FRAMES || view.getUint32(36, true)) fail(E.EINVAL);
          const count = Math.min(frames, capture.length), size = capture.samples.length;
          if (!count && capture.state === M.DOLLY_MICROPHONE_DENIED) fail(E.EACCES);
          if (!count && capture.state === M.DOLLY_MICROPHONE_UNAVAILABLE) fail(E.ENODEV);
          result = response(8 + count * 4);
          const output = new DataView(result.buffer);
          output.setUint32(0, count, true); output.setUint32(4, capture.state, true);
          for (let i = 0; i < count; ++i) output.setFloat32(8 + i * 4, capture.samples[(capture.start + i) % size], true);
          capture.start = (capture.start + count) % size; capture.length -= count;
        } else if (op === M.DOLLY_MICROPHONE_STATUS) {
          if (packet.length !== 32) fail(E.EINVAL);
          result = response(24);
          const output = new DataView(result.buffer);
          output.setUint32(0, capture.length, true); output.setUint32(4, capture.state, true);
          output.setBigUint64(8, BigInt(capture.captured), true); output.setBigUint64(16, BigInt(capture.dropped), true);
        } else if (op === M.DOLLY_MICROPHONE_CLOSE) {
          if (packet.length !== 32) fail(E.EINVAL);
          release(scope); result = response(0);
        } else fail(E.ENOSYS);
      }
      return {bytes: result, error: 0};
    } catch (error) {
      if (!error.errno) console.warn("Dolly microphone:", error);
      return {bytes: response(0), error: error.errno ?? E.EIO};
    }
  }
  return {dispatch, release, status, close() { if (capture) release(capture.scope); }};
}
