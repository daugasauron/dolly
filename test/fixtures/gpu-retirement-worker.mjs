import "../../src/gpu-worker.mjs";

// Real GPU work finishes normally; the test controls when completion becomes
// visible to the provider, making retirement accounting deterministic.
let hold=true;
let phase="release";
const pending=[];
const requestDevice=GPUAdapter.prototype.requestDevice;
GPUAdapter.prototype.requestDevice=async function(...args) {
  const device=await requestDevice.apply(this,args);
  const completed=device.queue.onSubmittedWorkDone.bind(device.queue);
  device.queue.onSubmittedWorkDone=()=>{
    postMessage({type:"test-fence",phase});
    return completed().then(()=>hold?new Promise(resolve=>pending.push(resolve)):undefined);
  };
  return device;
};
self.addEventListener("message",({data})=>{
  if(data.type==="test-phase")phase=data.phase;
  if(data.type!=="test-completion")return;
  hold=data.hold;
  if(!hold)for(const resolve of pending.splice(0))resolve();
});
