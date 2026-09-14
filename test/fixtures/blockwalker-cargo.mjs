import fs from 'node:fs';

const read=()=>{Game.call('save');return JSON.parse(fs.readFileSync('/workspace/blockwalker-world.json','utf8'));};
const resumed=fs.existsSync('/workspace/cargo-first.json'),initial=read(),created={};
if(!resumed){
 Game.call('reset',{sea:false});
 created.deck=Game.call('cargo',{world:true,x:158,y:1,z:-16});
 created.sea=Game.call('cargo',{world:true,x:125,z:35,material:1});
 created.island=Game.call('cargo',{world:true,x:184,z:40});
 created.high=Game.call('cargo',{world:true,x:-50,y:8,z:0});
 const count=Game.call('world').creatures.length;
 for(const args of [{x:NaN},{x:249},{z:Infinity},{z:-249},{y:NaN},{y:Infinity},{y:-13},{y:129},{material:3}]){
  let rejected=false;try{Game.call('cargo',{world:true,...args});}catch{rejected=true;}
  if(!rejected||Game.call('world').creatures.length!==count)throw Error('Invalid cargo placement changed the world');
 }
}
const placed=read(),trace=[];Game.call('watch',true);Game.call('camera',{x:162,y:1,z:-6,yaw:-1.8,pitch:.35,distance:24});
let sampled=-1;
while(Game.call('world').seconds-initial.seconds<(resumed?8:34)){
 if(!Game.frame())throw Error('Game exited before cargo trial finished');
 const age=Game.call('world').seconds-initial.seconds;
 if(age-sampled>=.25){
  const world=read();trace.push({seconds:world.seconds,creatures:world.creatures.map(c=>({id:c.id,x:c.x,y:c.y,z:c.z,up:c.up,poses:c.poses}))});sampled=age;
 }
 await new Promise(resolve=>setTimeout(resolve,16));
}
fs.writeFileSync('/workspace/cargo-'+(resumed?'restored':'first')+'.json',JSON.stringify({initial,placed,created,trace,final:read()}));
fs.writeFileSync('/workspace/cargo-'+(resumed?'restored':'first')+'.png',Buffer.from(Game.call('snapshot')));
