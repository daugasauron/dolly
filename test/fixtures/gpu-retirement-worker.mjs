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
  const submit=device.queue.submit.bind(device.queue);
  device.queue.submit=(...commands)=>{submit(...commands);postMessage({type:"test-submit"});};
  device.queue.onSubmittedWorkDone=()=>{
    postMessage({type:"test-fence",phase});
    return completed().then(()=>hold?new Promise(resolve=>{
      pending.push(resolve);postMessage({type:"test-held"});
    }):undefined);
  };
  return device;
};
self.addEventListener("message",({data})=>{
  if(data.type==="test-phase")phase=data.phase;
  if(data.type!=="test-completion")return;
  if(data.count){for(let n=0;n<data.count;n++)pending.shift()?.();return;}
  hold=data.hold;
  if(!hold)for(const resolve of pending.splice(0))resolve();
});
