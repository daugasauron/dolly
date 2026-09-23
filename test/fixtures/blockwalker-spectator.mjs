import fs from 'node:fs';
const trace=[];let sampled=-1;
await new Promise(resolve=>{
 const timer=setInterval(()=>{
  if(!Game.frame()){clearInterval(timer);resolve();return;}
  const state=Game.call('state'),world=Game.call('world');
  if(state.mode!=='world'||world.seconds-sampled<.5)return;
  sampled=world.seconds;
  const frame={t:sampled,piloting:state.piloting,eyes:state.eyes,camera:state.camera};
  if(state.eyes){
   Game.call('save');
   const saved=JSON.parse(fs.readFileSync('/workspace/blockwalker-world.json','utf8'));
   const actor=saved.creatures.find(c=>c.id===state.camera.follow),eye=actor.blueprint.findIndex(b=>b.joint===6);
   if(eye<0)throw Error('Eyes camera selected a character without Eyes');
   frame.actor={id:actor.id,name:actor.name,position:[actor.x,actor.y,actor.z],seconds:actor.seconds};
   frame.block=actor.blueprint[eye];frame.pose=actor.poses[eye];
  }
  trace.push(frame);
 },16);
});
Game.call('save');fs.writeFileSync('/workspace/spectator-trace.json',JSON.stringify(trace));
