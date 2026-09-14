import fs from 'node:fs';

const blueprint=Game.call('state');
Game.call('install',{name:'Navigation beacon',source:'function(){return ""}'});
for(let i=0;i<12;i++){
 const parts=Array.from({length:i===11?12:1},(_,x)=>({x,y:0,z:0,parent:x-1,joint:0}));
 Game.call('build',{parts,anchored:true});Game.call('spawn',{x:30+i*3,z:50});
}
Game.call('build',{parts:blueprint.parts,anchored:blueprint.anchored});
const frame=Game.frame,trace=[];
Game.frame=()=>{
 const active=frame(),{mode,camera}=Game.call('state'),sample={mode,camera};
 if(JSON.stringify(sample)!==JSON.stringify(trace.at(-1)))trace.push(sample);
 return active;
};
try{await import('/usr/src/dolly/blockwalker/agent.mjs');}
finally{fs.writeFileSync('/workspace/blockwalker-camera.json',JSON.stringify(trace));}
