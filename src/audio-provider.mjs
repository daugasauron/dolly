import * as A from "./audio-abi.mjs";
import { DOLLY_ERRNO as E } from "../dist/dolly-errno.mjs";

const fail = errno => { throw Object.assign(new Error("Audio request failed"), {errno}); };
const response = size => new Uint8Array(size);

export function createAudioProvider(report = () => {}) {
  const streams = new Map(), generations = new Uint32Array(A.DOLLY_AUDIO_SLOTS);
  let context, resumePending = false;
  const counters = {writtenFrames: 0, playedFrames: 0, underruns: 0, peakQueuedFrames: 0, peakBuffers: 0};

  function finish(stream, node) {
    if (!stream.nodes.delete(node)) return;
    node.source.disconnect();
    stream.played += node.frames;
    counters.playedFrames += node.frames;
  }
  function queued(stream) {
    const now = context.currentTime;
    let frames = 0;
    for (const node of stream.nodes) {
      if (now >= node.end) finish(stream, node);
      else frames += node.frames - Math.max(0, Math.floor((now - node.start) * A.DOLLY_AUDIO_RATE));
    }
    return frames;
  }
  function status() {
    let queuedFrames = 0, buffers = 0;
    for (const stream of streams.values()) { queuedFrames += queued(stream); buffers += stream.nodes.size; }
    counters.peakQueuedFrames = Math.max(counters.peakQueuedFrames, queuedFrames);
    counters.peakBuffers = Math.max(counters.peakBuffers, buffers);
    return {...counters, activeScopes: streams.size, queuedFrames, buffers, state: context?.state ?? "closed"};
  }
  function publish() { report(status()); }
  function resume() {
    if (context?.state === "suspended" && streams.size) {
      resumePending = true;
      const settled = () => { resumePending = false; publish(); };
      void context.resume().then(settled, settled);
    }
  }
  function release(scope) {
    const stream = streams.get(scope);
    if (!stream) return;
    streams.delete(scope);
    for (const node of stream.nodes) { node.source.onended = null; node.source.stop(); node.source.disconnect(); }
    stream.nodes.clear();
    publish();
  }
  function dispatch(packet) {
    try {
      if (!(packet instanceof Uint8Array) || packet.byteLength < 32 || packet.byteLength > A.DOLLY_AUDIO_PACKET_BYTES) fail(E.EINVAL);
      packet = packet.slice();
      const view = new DataView(packet.buffer, packet.byteOffset, packet.byteLength);
      const op = view.getUint32(4, true), scope = view.getUint32(8, true), sequence = view.getUint32(16, true);
      if (view.getUint32(0, true) !== A.DOLLY_AUDIO_VERSION || view.getUint32(12, true) || view.getUint32(20, true) ||
          !scope || !sequence || view.getUint32(24, true) !== packet.length - 32 || view.getUint32(28, true)) fail(E.EINVAL);
      const slot = (scope - 1) % A.DOLLY_AUDIO_SLOTS;
      let stream = streams.get(scope), result;
      if (op === A.DOLLY_AUDIO_OPEN) {
        if (packet.length !== 32) fail(E.EINVAL);
        if (scope <= generations[slot]) fail(E.ESTALE);
        if ([...streams.keys()].some(key => (key - 1) % A.DOLLY_AUDIO_SLOTS === slot)) fail(E.EBUSY);
        if (!context) {
          if (typeof AudioContext !== "function") fail(E.ENOSYS);
          context = new AudioContext({sampleRate: A.DOLLY_AUDIO_RATE, latencyHint: "interactive"});
        }
        if (context.state === "closed") fail(E.EIO);
        stream = {scope, sequence, nodes: new Set(), end: context.currentTime, played: 0};
        streams.set(scope, stream); generations[slot] = scope;
        result = response(16);
        const output = new DataView(result.buffer);
        output.setBigUint64(0, BigInt(scope), true);
        output.setUint32(8, A.DOLLY_AUDIO_RATE, true); output.setUint32(12, A.DOLLY_AUDIO_CHANNELS, true);
        if (!resumePending) resume();
      } else {
        if (!stream) fail(E.EBADF);
        if (sequence <= stream.sequence) fail(E.ESTALE);
        stream.sequence = sequence;
        if (op === A.DOLLY_AUDIO_WRITE) {
          if (packet.length < 40) fail(E.EINVAL);
          const frames = view.getUint32(32, true);
          if (frames < A.DOLLY_AUDIO_MIN_FRAMES || frames > A.DOLLY_AUDIO_MAX_FRAMES ||
              view.getUint32(36, true) || packet.length !== 40 + frames * 8) fail(E.EINVAL);
          for (let at = 40; at < packet.length; at += 4) if (!Number.isFinite(view.getFloat32(at, true))) fail(E.EINVAL);
          const pending = queued(stream);
          if (pending + frames > A.DOLLY_AUDIO_QUEUE_FRAMES || stream.nodes.size >= A.DOLLY_AUDIO_MAX_BUFFERS) fail(E.EAGAIN);
          const buffer = context.createBuffer(A.DOLLY_AUDIO_CHANNELS, frames, A.DOLLY_AUDIO_RATE);
          for (let channel = 0; channel < A.DOLLY_AUDIO_CHANNELS; ++channel) {
            const data = buffer.getChannelData(channel);
            for (let i = 0; i < frames; ++i) data[i] = Math.max(-1, Math.min(1, view.getFloat32(40 + (i * 2 + channel) * 4, true)));
          }
          const source = context.createBufferSource(); source.buffer = buffer;
          source.connect(context.destination);
          const now = context.currentTime, start = Math.max(stream.end, now + 0.01);
          if (stream.played && stream.end < now) ++counters.underruns;
          const node = {source, frames, start, end: start + frames / A.DOLLY_AUDIO_RATE};
          source.onended = () => { finish(stream, node); publish(); };
          source.start(start); stream.end = node.end; stream.nodes.add(node);
          counters.writtenFrames += frames;
          result = response(4); new DataView(result.buffer).setUint32(0, frames, true);
        } else if (op === A.DOLLY_AUDIO_STATUS) {
          if (packet.length !== 32) fail(E.EINVAL);
          const pending = queued(stream);
          let played = stream.played;
          for (const node of stream.nodes) played += Math.min(node.frames, Math.max(0, Math.floor((context.currentTime - node.start) * A.DOLLY_AUDIO_RATE)));
          result = response(16);
          const output = new DataView(result.buffer);
          output.setUint32(0, pending, true); output.setUint32(4, context.state === "running" ? 1 : 2, true);
          output.setBigUint64(8, BigInt(played), true);
        } else if (op === A.DOLLY_AUDIO_CLOSE) {
          if (packet.length !== 32) fail(E.EINVAL);
          release(scope); result = response(0);
        } else fail(E.ENOSYS);
      }
      publish();
      return {bytes: result, error: 0};
    } catch (error) {
      if (!error.errno) console.warn("Dolly audio:", error);
      return {bytes: response(0), error: error.errno ?? E.EIO};
    }
  }
  async function close() {
    for (const scope of [...streams.keys()]) release(scope);
    if (context && context.state !== "closed") await context.close();
  }
  return {dispatch, release, resume, status, close};
}
