// The audio thread's side of microphone@0: hands the page the input's samples,
// 1024 frames at a time. The node mixes the input down to one channel.
class DollyMicrophone extends AudioWorkletProcessor {
  block = new Float32Array(1024);
  filled = 0;
  process([[channel]]) {
    for (let at = 0; channel && at < channel.length;) {
      const count = Math.min(channel.length - at, this.block.length - this.filled);
      this.block.set(channel.subarray(at, at + count), this.filled);
      this.filled += count; at += count;
      if (this.filled === this.block.length) {
        this.port.postMessage(this.block, [this.block.buffer]);
        this.block = new Float32Array(1024); this.filled = 0;
      }
    }
    return true;
  }
}
registerProcessor("dolly-microphone", DollyMicrophone);
