import fs from 'node:fs';
const trace=[];let sample=-1;
await new Promise(resolve=>{
 const timer=setInterval(()=>{
  if(!Game.frame()){clearInterval(timer);resolve();return;}
  const state=Game.call('state'),world=Game.call('world');
  if(state.piloting&&world.seconds-sample>.08){sample=world.seconds;trace.push({t:sample,wall:Date.now(),camera:state.camera,eyes:state.eyes,sensors:state.driverSensors,playerId:state.playerId});}
 },16);
});
Game.call('save');fs.writeFileSync('/workspace/driver-trace.lua',Game.call('encode_data',trace));
