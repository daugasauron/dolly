import { DOLLY_ERRNO as E } from "../dist/dolly-errno.mjs";
import { DOLLY_GPU_SLOTS, DOLLY_GPU_REPLY_BYTES } from "./gpu-abi.mjs";

export function createGpuBridge(memory, mailbox, canvas, complete, status) {
  const worker = new Worker(new URL("./gpu-worker.mjs", import.meta.url), { type: "module", name: "dolly-gpu" });
  const control = new Int32Array(new SharedArrayBuffer(8));
  let failed = false;
  function stop(message) {
    if (failed) return;
    failed = true;
    worker.terminate();
    // A failed provider must wake every admitted process, including a wait.
    for (let i=0; i<DOLLY_GPU_SLOTS; ++i) {
      const words = new Int32Array(memory.buffer, mailbox+i*(64+DOLLY_GPU_REPLY_BYTES), 16);
      Atomics.store(words,3,E.EIO); Atomics.store(words,4,0); Atomics.store(words,0,1);
    }
    status({active:false,error:message});
    queueMicrotask(complete);
  }
  worker.onmessage = ({data}) => {
    if (data.type === "complete") complete();
    else if (data.type === "status") status(data);
  };
  worker.onerror = () => stop("GPU provider worker failed");
  worker.postMessage({type:"configure", memory:memory.buffer, mailbox, canvas, control:control.buffer}, [canvas]);
  return ({address, bytes}) => {
    if (failed) return -E.EIO;
    Atomics.store(control,0,1);
    worker.postMessage({type:"request",address,bytes});
    // Only wait for a bounded packet copy/admission, never for GPU execution.
    if (Atomics.wait(control,0,1,5000) === "timed-out") {
      stop("GPU provider stopped acknowledging requests");
      return -E.EIO;
    }
    return Atomics.load(control,1);
  };
}
