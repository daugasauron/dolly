import fs from 'node:fs';
const car=Game.call('state').parts,parts=[];
for(let y=0;y<5;y++)parts.push({x:0,y,z:0,parent:y-1,joint:0});
parts.push({x:0,y:5,z:0,parent:4,joint:1,axis:2,negative:81,positive:65,force:100});
parts.push({x:0,y:6,z:0,parent:5,joint:0},{x:0,y:7,z:0,parent:6,joint:0});
parts.push({x:0,y:8,z:0,parent:7,joint:7,axis:1,negative:87,positive:83,speed:2});
parts.push({x:1,y:8,z:0,parent:8,joint:0,color:3});
Game.call('build',{parts,anchored:true});
Game.call('install',{name:'Tilted turntable',hz:60,source:'function(t,s){const u=Math.max(-1,Math.min(1,(Math.PI/4-s.angles[5])*3));return {Q:Math.max(0,-u),A:Math.max(0,u),S:t>3?1:0};}'});
Game.call('program_trial',{steps:600,sea:false});
const trace=[];let sample=-1,capture=0;
while(Game.call('state').remaining){
 if(!Game.frame())throw Error('Turntable trial interrupted');
 const state=Game.call('state');
 if(state.steps>300&&state.steps>sample+12){sample=state.steps;trace.push({step:sample,angle:state.sensors.angles[5],tip:state.sensors.positions[9],separation:state.maxSeparation});}
 if(state.steps>360+capture*120&&capture<2){fs.writeFileSync('/workspace/turntable-'+capture+'.png',Buffer.from(Game.call('snapshot')));capture++;}
 await new Promise(resolve=>setTimeout(resolve,16));
}
if(!trace.length||Math.abs(trace.at(-1).angle-Math.PI/4)>.04||trace.some(s=>s.separation>.03))throw Error('Tilted assembly failed');
for(let k=0;k<3;k++)if(Math.max(...trace.map(s=>s.tip[k]))-Math.min(...trace.map(s=>s.tip[k]))<(k===2?1.8:1))throw Error('Attached block does not rotate in a tilted plane');
fs.writeFileSync('/workspace/turntable-proof.json',JSON.stringify(trace));
Game.call('build',{parts:car,anchored:false});
