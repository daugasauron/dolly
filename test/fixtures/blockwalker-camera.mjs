import fs from 'node:fs';

const blueprint=Game.call('state');
Game.call('install',{name:'Navigation beacon',source:'function(){return ""}'});
for(let i=0;i<12;i++){
 const parts=Array.from({length:i===11?12:1},(_,x)=>({x,y:0,z:0,parent:x-1,joint:0}));
 Game.call('build',{parts,anchored:true});Game.call('spawn',{x:30+i*3,z:50});
}
Game.call('build',{parts:blueprint.parts,anchored:blueprint.anchored});
const frame=Game.frame,trace=[],magnets=[];
Game.frame=()=>{
 const active=frame(),state=Game.call('state'),{mode,camera}=state,sample={mode,camera};
 if(JSON.stringify(sample)!==JSON.stringify(trace.at(-1)))trace.push(sample);
 if(state.cargo.length&&state.sensors?.magnets[5]){
  const magnet=state.sensors.magnets[5],last=magnets.at(-1);
  if(!last||last.power!==magnet.power||last.attached!==magnet.attached)magnets.push({...magnet,minY:state.cargo[0].y,maxY:state.cargo[0].y});
  else{last.minY=Math.min(last.minY,state.cargo[0].y);last.maxY=Math.max(last.maxY,state.cargo[0].y);}
 }
 return active;
};
try{await import('/usr/src/dolly/blockwalker/agent.mjs');}
finally{fs.writeFileSync('/workspace/blockwalker-camera.json',JSON.stringify(trace));fs.writeFileSync('/workspace/blockwalker-magnet-ui.json',JSON.stringify(magnets));}
