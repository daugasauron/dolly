import fs from 'node:fs';

const frame=Game.frame,trace=[];
Game.frame=()=>{
 const active=frame(),{mode,camera}=Game.call('state'),sample={mode,camera};
 if(JSON.stringify(sample)!==JSON.stringify(trace.at(-1)))trace.push(sample);
 return active;
};
try{await import('/usr/src/dolly/blockwalker/agent.mjs');}
finally{fs.writeFileSync('/workspace/blockwalker-camera.json',JSON.stringify(trace));}
