const parts=[],cells=new Map();
const order=Array.from({length:16},(_,i)=>[i%4-1,Math.floor(i/4)-1]).sort((a,b)=>Math.abs(a[0])+Math.abs(a[1])-Math.abs(b[0])-Math.abs(b[1]));
for(let i=0;i<order.length;i++){
 const cell=order[i];
 const x=cell[0],z=cell[1];
 const parent=parts.length?parts.findIndex(p=>Math.abs(p.x-x)+Math.abs(p.z-z)===1):-1;
 parts.push({x,y:0,z,parent,joint:0,color:4});cells.set(x+','+z,parts.length-1);
}
parts.push({x:0,y:1,z:0,parent:cells.get('0,0'),joint:7,axis:1,size:1,color:3,negative:81,positive:65});
Game.call('build',{parts,anchored:true});Game.call('camera',{x:.5,y:1,z:.5,yaw:.55,pitch:.65,distance:10});
while(Game.frame())await new Promise(resolve=>setTimeout(resolve,16));
