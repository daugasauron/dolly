import fs from 'node:fs';

Game.call('watch',true);
const trace=[],captures=[];let previous,followed,probe,freeCamera;
while(Game.frame()){
 const state=Game.call('state'),world=Game.call('world'),target=world.creatures.find(c=>c.id===state.camera.follow);
 trace.push({mode:state.mode,camera:state.camera,view:state.view,parts:state.parts.map(({x,y,z})=>[x,y,z]),target:target&&[target.x,target.y,target.z]});
 if(state.camera.follow)followed=true;
 else if(followed&&!probe&&state.mode==='world'&&freeCamera===JSON.stringify(state.camera)){
  Game.call('build',{parts:[{x:0,y:0,z:0,parent:-1,joint:0}],anchored:true});
  Game.call('install',{name:'Camera removal probe',source:'function(t){if(t>4)throw Error("camera removal probe");return ""}'});
  probe=Game.call('spawn',{x:-90,z:-70});Game.call('build',{parts:state.parts,anchored:state.anchored});Game.call('watch',true);
 }
 freeCamera=state.camera.follow?undefined:JSON.stringify(state.camera);
 const view=JSON.stringify(state.view);
 if(view!==previous){
  const name='focus-view-'+captures.length+'.png';fs.writeFileSync('/workspace/'+name,Buffer.from(Game.call('snapshot')));captures.push({name,view:state.view});previous=view;
 }
 await new Promise(resolve=>setTimeout(resolve,16));
}
fs.writeFileSync('/workspace/slopyard-focus.json',JSON.stringify({trace,captures,probe,removals:Game.call('world').recentRemovals,prompt:Game.call('prompt')}));
