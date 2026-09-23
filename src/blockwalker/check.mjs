import fs from 'node:fs';
const assert=(value,message)=>{if(!value)throw Error(message);};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const timer=setInterval(()=>Game.frame(),16);
try {
 const before=Game.call('state');assert(before.parts.length>0,'builder has parts');
 assert(Game.call('world').creatures.length===0,'explicit empty saved world remains empty');
 const examples=Game.call('designs');assert(examples.some(d=>d.parts>50&&d.anchored)&&examples.some(d=>d.sea),'fresh image includes larger learned mechanisms and water designs');
 Game.call('watch',true);Game.call('camera',{x:140,y:12,z:-70,distance:60,yaw:1.2,pitch:.4});
 const worldCamera=Game.call('state').camera;Game.call('watch',true);
 assert(JSON.stringify(Game.call('state').camera)===JSON.stringify(worldCamera),'watch preserves a travelled world camera');
 Game.call('watch',false);assert(JSON.stringify(Game.call('state').camera)===JSON.stringify(before.camera),'workshop camera restored');
 Game.call('watch',true);assert(JSON.stringify(Game.call('state').camera)===JSON.stringify(worldCamera),'world camera restored');
 let invalidCamera=false;try{Game.call('camera',{x:NaN});}catch{invalidCamera=true;}assert(invalidCamera&&Game.call('state').camera.x===140,'nonfinite camera rejected without mutation');
 Game.call('camera',{x:0,y:1,z:0,distance:24,yaw:.52,pitch:.45});Game.call('watch',false);
 Game.call('enable',true);Game.call('reset');
 const png=Buffer.from(Game.call('snapshot'));assert(png.subarray(1,4).toString()==='PNG','actual GPU PNG');
 fs.writeFileSync('/workspace/blockwalker-observation.png',png);
 const boundKey=before.parts.find(p=>p.joint&&p.joint!==6&&p.positive).positive;
 Game.call('advance',{keys:String.fromCharCode(boundKey),steps:60});Game.call('watch',true);while(Game.call('state').remaining)await sleep(20);
 Game.call('watch',false);const after=Game.call('state');assert(after.steps===60,'exact physics timing');
 assert(after.parts.some((p,i)=>p.pose.some((v,j)=>Math.abs(v-before.parts[i].pose[j])>.01)),'keys and gravity change poses');
 Game.call('release');await sleep(200);assert(Game.call('state').steps===60,'practice pauses while reasoning');
 Game.call('build',{parts:[{x:0,y:2,z:0,parent:-1,joint:0},{x:1,y:2,z:0,parent:0,joint:4,axis:0,negative:81,positive:65},{x:0,y:3,z:0,parent:0,joint:2,axis:1,negative:87,positive:83},{x:0,y:4,z:0,parent:2,joint:0},{x:-1,y:2,z:0,parent:0,joint:3,axis:0,negative:79,positive:75}]});
 Game.call('reset');Game.call('camera',{x:4,y:7,z:2,distance:14});const practiceCamera=Game.call('state');
 Game.call('advance',{keys:'ASK',steps:60});while(Game.call('state').remaining)await sleep(20);
 const actuators=Game.call('state');assert(actuators.parts[2].angle>.7,'piston extends under load');assert(actuators.distance>.1,'thruster moves the body');
 for(const [axis,index] of [['x',0],['y',1],['z',2]])assert(Math.abs((actuators.camera[axis]-actuators.parts[0].pose[index])-(practiceCamera.camera[axis]-practiceCamera.parts[0].pose[index]))<.001,'practice camera preserves its offset while following actual movement');
 fs.writeFileSync('/workspace/blockwalker-actuators.png',Buffer.from(Game.call('snapshot')));Game.call('release');
 const hoist=[{x:0,y:0,z:0,parent:-1,joint:0},{x:0,y:1,z:0,parent:0,joint:0},{x:0,y:2,z:0,parent:1,joint:0},{x:1,y:2,z:0,parent:2,joint:0},{x:2,y:2,z:0,parent:3,joint:2,axis:1,direction:1,negative:81,positive:65},{x:2,y:1,z:0,parent:4,joint:5,axis:1,direction:-1,negative:83,positive:87,force:24}];
 Game.call('build',{parts:hoist,anchored:true});Game.call('reset');Game.call('cargo',{x:2,y:.5,z:0,material:2});
 const advance=async(keys,steps)=>{Game.call('advance',{keys,steps});while(Game.call('state').remaining)await sleep(20);return Game.call('state');};
 const captured=await advance('W',30);assert(captured.sensors.magnets[5].attached,'magnet captures a foreign cargo body');
 assert(captured.sensors.magnets[5].targetSupportForce>0,'magnet senses support under its grounded practice cargo');
 const lifted=await advance('A',180);assert(lifted.cargo[0].y>1.7&&lifted.sensors.magnets[5].power===1&&lifted.sensors.magnets[5].load<=24,'latched finite magnet force lifts cargo');
 assert(lifted.sensors.magnets[5].targetSupportForce===0,'magnetic lift is not reported as surface support');
 fs.writeFileSync('/workspace/blockwalker-magnet.png',Buffer.from(Game.call('snapshot')));
 const released=await advance('S',180);assert(released.cargo[0].y<.6&&!released.sensors.magnets[5].attached&&released.sensors.magnets[5].power===0,'Off drops the cargo');
 Game.call('install',{name:'Cargo hoist',source:'function(t){return t<0.5?"W":t<3.5?"A":""}'});Game.call('program_trial',{steps:300});
 while(Game.call('state').remaining)await sleep(20);
 const repeated=Game.call('state');assert(repeated.cargo.length===1&&repeated.cargo[0].y>1.7&&repeated.sensors.magnets[5].attached,'program trial restores cargo and repeats pickup');
 fs.writeFileSync('/workspace/blockwalker-magnet.json',JSON.stringify({captured:captured.sensors.magnets[5],lifted:lifted.cargo[0],load:lifted.sensors.magnets[5].load,released:released.cargo[0],repeated:repeated.cargo[0]}));
 Game.call('spawn',{x:20,z:0});const cargoId=Game.call('cargo',{world:true,x:22,z:0});
 const boat=[{x:0,y:1,z:0,parent:-1,joint:0,material:1,finish:1}];
 for(let side=0;side<2;side++){
   const x=side?1:-1,deck=boat.push({x,y:1,z:0,parent:0,joint:0,material:1,finish:1,color:side+1})-1;
   const hull=boat.push({x,y:0,z:0,parent:deck,joint:0,material:1,finish:1,color:side+1})-1;
   boat.push({x,y:0,z:1,parent:hull,joint:0,material:1,finish:1,color:side+1});
   const stern=boat.push({x,y:0,z:-1,parent:hull,joint:0,material:1,finish:1,color:side+1})-1;
   boat.push({x,y:0,z:-2,parent:stern,joint:3,axis:2,material:1,finish:2,force:4,negative:side?87:81,positive:side?83:65});
 }
 Game.call('build',{parts:boat});Game.call('install',{name:'Harbor boat',source:'function(){return {A:0.3,S:0.3}}',hz:20});Game.call('program_trial',{steps:360,sea:true});
 while(Game.call('state').remaining)await sleep(40);
 const sailing=Game.call('state');assert(sailing.steps===360&&sailing.sensors.y>-2&&sailing.up>.8&&sailing.distance>1,'boat floats and propels through actual water');
 assert(sailing.sensors.submerged.some(v=>v>0&&v<1)&&sailing.sensors.ground===-12,'water feedback senses partial submersion above the seabed');
 fs.writeFileSync('/workspace/blockwalker-water.png',Buffer.from(Game.call('snapshot')));Game.call('spawn',{x:125,z:10});
 const drone=[{x:0,y:1,z:0,parent:-1,joint:0}];
 for(let i=0;i<4;i++)drone.push({x:i<2?(i?1:-1):0,y:1,z:i>=2?(i===2?1:-1):0,parent:0,joint:3,axis:1,negative:'QWOP'.charCodeAt(i),positive:'ASKL'.charCodeAt(i),force:24,color:i+1});
 Game.call('build',{parts:drone});
 const hover=function(t,s,m,r){
   const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),target=t<7?3.5:4.5,e=target-s.y;
   m.i=clamp((m.i||0)+e*s.dt,-2,2);
   const base=(s.mass*4+9*e+2*m.i-9*s.vy)/4;
   const tx=-10*s.gravity[2]/4-6*s.gyroscope[0],tz=10*s.gravity[0]/4-6*s.gyroscope[2];
   return {A:clamp((base-tz/2)/24,0,1),S:clamp((base+tz/2)/24+(t>3&&t<3.15?.35:0),0,1),K:clamp((base-tx/2)/24,0,1),L:clamp((base+tx/2)/24,0,1)};
 };
 Game.call('install',{name:'Feedback hover',source:hover.toString(),hz:60});Game.call('program_trial',{steps:900,sea:false});
 let peakTilt=0,peakHeight=0;while(Game.call('state').remaining){const state=Game.call('state');peakTilt=Math.max(peakTilt,1-state.up);peakHeight=Math.max(peakHeight,state.sensors.y);await sleep(40);}
 const flight=Game.call('state');assert(flight.steps===900,'feedback controller completes at 60 Hz');
 assert(Math.abs(flight.sensors.y-4.5)<.3&&Math.abs(flight.sensors.vy)<.15&&flight.up>.995,'PID changes altitude and recovers from asymmetric thrust');
 assert(peakTilt>.0001&&peakHeight>3,'real flight and attitude disturbance');
 assert(flight.sensors.touching.every(t=>!t),'airborne contact sensors');
 fs.writeFileSync('/workspace/blockwalker-feedback.png',Buffer.from(Game.call('snapshot')));
 fs.writeFileSync('/workspace/blockwalker-feedback.json',JSON.stringify({peakTilt,peakHeight,final:flight.sensors,commands:flight.parts.map(p=>p.command)}));
 Game.call('spawn',{x:0,z:8});
 Game.call('release');
 const bridge=[];for(let y=0;y<=3;y++)bridge.push({x:0,y,z:0,parent:y-1,joint:0,finish:1});
 bridge.push({x:1,y:3,z:0,parent:3,joint:0,finish:1},{x:2,y:3,z:0,parent:4,joint:1,negative:81,positive:65,force:60,finish:2},{x:3,y:3,z:0,parent:5,joint:0,material:1,finish:3},{x:4,y:3,z:0,parent:6,joint:0,material:1,finish:3});
 Game.call('build',{parts:bridge,anchored:true});Game.call('install',{name:'Harbor bridge',source:'function(t){return Math.sin(t)>0?"A":"Q"}'});Game.call('spawn',{x:96,z:20});
 const platform=[{x:0,y:0,z:0,parent:-1,joint:0},{x:1,y:0,z:0,parent:0,joint:0},{x:0,y:0,z:1,parent:0,joint:0},{x:1,y:0,z:1,parent:1,joint:0},{x:0,y:1,z:0,parent:0,joint:1,negative:81,positive:65,axis:1}];
 Game.call('build',{parts:platform});Game.call('install',{name:'Spinner',source:'function(t,s,m,random){m.turns=(m.turns||0)+1;return t%2<1?"A":"Q"}'});
 Game.call('spawn',{x:-4,z:0,seed:17});Game.call('spawn',{x:4,z:0,seed:19});
 const archCargo=Game.call('cargo',{world:true,x:164,z:40});
 assert(Game.call('designs').filter(d=>d.name==='Spinner').length===1,'identical releases share one saved design');
 const draftSource='function(t,s,m){m.ticks=(m.ticks||0)+1;return "Q"}';
 Game.call('install',{name:'Unreleased experiment',source:draftSource});Game.call('program_trial',{steps:1});while(Game.call('state').remaining)await sleep(20);
 const draftState=JSON.stringify(Game.call('state')),draftMemory=JSON.stringify(Game.call('installed_program').memory),draftWorld=JSON.stringify(Game.call('world'));
 const draftId=Game.call('save_design');assert(Game.call('save_design')===draftId,'saving the same experiment reuses its library entry');
 assert(JSON.stringify(Game.call('state'))===draftState&&JSON.stringify(Game.call('installed_program').memory)===draftMemory&&JSON.stringify(Game.call('world'))===draftWorld,'saving preserves practice and existing world state without releasing a creature');
 Game.call('install',{name:'Bad loop',source:'function(t,s,m){m.entered=true;while(true){}}'});Game.call('spawn',{x:0,z:5});
 Game.call('program_trial',{steps:600});while(Game.call('state').remaining)await sleep(20);
 const broken=Game.call('installed_program');assert(broken.failure.cause==='controller'&&broken.memory.entered&&Game.call('state').steps===0,'controller failure stops immediately and retains its diagnostic memory');
 Game.call('build',{parts:[{x:0,y:3,z:0,parent:-1,joint:0},{x:0,y:2,z:0,parent:0,joint:1,negative:81,positive:65,speed:3,axis:2},{x:0,y:1,z:0,parent:1,joint:0},{x:0,y:0,z:0,parent:2,joint:0}]});
 Game.call('install',{name:'Toppler',source:'function(){return "A"}'});Game.call('spawn',{x:0,z:-5});Game.call('program_trial',{steps:600});
 Game.call('watch',true);const started=Game.call('world').seconds;
 while(Game.call('world').seconds-started<10)await sleep(40);
 const practiceFailure=Game.call('installed_program').failure;assert(practiceFailure.cause==='posture'&&practiceFailure.seconds>3&&Game.call('state').steps<600&&Game.call('state').remaining===0,'sustained collapse stops practice before its requested end');
 const population=Game.call('world');assert(population.creatures.length===8&&population.deaths===2,'shared physics keeps cargo, hoist, boat, bridge and land/air creatures, removes failed controllers and fallen torsos');
 assert(Math.abs(population.creatures.find(c=>c.id===archCargo).y-4.485)<.01,'a body under the island arch survives on the actual floor');
 const failed=population.recentRemovals.find(r=>r.name==='Bad loop'),toppled=population.recentRemovals.find(r=>r.name==='Toppler');
 assert(failed.cause==='controller'&&failed.detail&&failed.seconds<1&&toppled.cause==='posture'&&toppled.seconds>3,'controller failure and physical collapse record distinct causes and final state');
 const fallen=Game.call('designs').find(d=>d.name==='Toppler');assert(fallen&&!population.creatures.some(c=>c.name==='Toppler'),'fallen creature retains its programmed design');
 const reopened=Game.call('open_design',{id:fallen.id});assert(reopened.parts.length===4&&reopened.source==='function(){return "A"}','reopening restores the body and controller');
 Game.call('program_trial',{steps:60});while(Game.call('state').remaining)await sleep(20);assert(Game.call('state').parts[1].angle>.1,'saved controller actually drives its restored hinge');Game.call('watch',true);
 const crane=population.creatures.find(c=>c.name==='Cargo hoist'),cargo=population.creatures.find(c=>c.id===cargoId);assert(crane.magnets[5].attached&&crane.magnets[5].power===1&&cargo.y>1.7,'world crane carries a separate cargo creature');
 const harbor=population.creatures.find(c=>c.name==='Harbor boat'),anchored=population.creatures.find(c=>c.name==='Harbor bridge');assert(harbor.y>-2&&harbor.up>.8&&anchored.x===96,'boat remains afloat and structure stays anchored');
 Game.call('camera',{x:116,y:-1,z:20,distance:50,pitch:.5});
 const worldPng=Buffer.from(Game.call('snapshot'));fs.writeFileSync('/workspace/blockwalker-world.png',worldPng);Game.call('save');
 const saved=JSON.parse(fs.readFileSync('/workspace/blockwalker-world.json','utf8'));
 assert(saved.creatures.filter(c=>c.hz===60).length===1&&saved.creatures.filter(c=>c.hz===10).length===6,'feedback and legacy controller rates persist');
 assert(saved.creatures.find(c=>c.name==='Cargo hoist').magnets[5].creature===cargoId,'magnet attachment saves the stable target identity');
 assert(saved.creatures.some(c=>c.anchored)&&saved.creatures.find(c=>c.name==='Harbor boat').blueprint.every(p=>p.material===1),'anchoring and hull materials persist');
 fs.writeFileSync('/workspace/blockwalker-integration.json',JSON.stringify({embedded:true,pngBytes:png.length,steps:after.steps,parts:after.parts,population}));
 Game.call('open_design',{id:examples.find(d=>d.sea&&!d.anchored).id});Game.call('reset');assert(Game.call('state').sea,'reset keeps the water surface selected by a saved boat');
 await checkContactForces();
 await checkLargeController();
 console.log('BLOCKWALKER EMBED CHECK: direct C calls, GPU PNG, timed keyboard, paused inference, shared world, controller timeout, survivors, persistence');
}finally{clearInterval(timer);Game.call('exit');}

async function checkContactForces(){
 const sum=a=>a.reduce((s,x)=>s+x,0),advance=async(keys,steps)=>{Game.call('advance',{keys,steps});while(Game.call('state').remaining)await sleep(20);return Game.call('state');};
 Game.call('enable',true);Game.call('build',{parts:[{x:0,y:0,z:0,parent:-1,joint:0}]});Game.call('reset',{sea:false});
 const falling=await advance('',6);assert(sum(falling.sensors.supportForce)===0&&sum(falling.sensors.selfContactForce)===0,'free fall has no collision force');
 const weight=falling.sensors.mass*4,readings=[];
 for(const hz of [10,60]){
  Game.call('install',{name:'Contact sensor check',hz,source:'function(t,s,m){if(t>.5){m.force=(m.force||0)+s.supportForce[0];m.samples=(m.samples||0)+1;}return "";}'});
  Game.call('program_trial',{steps:120,sea:false});while(Game.call('state').remaining)await sleep(20);
  const memory=Game.call('installed_program').memory,force=memory.force/memory.samples;readings.push({hz,force,weight});
  assert(Math.abs(force-weight)<weight*.05,'settled support equals weight at either controller frequency: '+JSON.stringify(readings));
 }
 const arm=Array.from({length:5},(_,y)=>({x:0,y,z:0,parent:y-1,joint:0}));
 arm.push({x:0,y:5,z:0,parent:4,joint:1,axis:2,negative:81,positive:65,force:30},
  {x:1,y:5,z:0,parent:5,joint:0},{x:2,y:5,z:0,parent:6,joint:0},{x:2,y:4,z:0,parent:7,joint:0});
 Game.call('build',{parts:arm,anchored:true});Game.call('reset',{sea:false});let selfPeak=0,supportAtPeak=0;
 for(let i=0;i<12;i++){const s=(await advance('Q',10)).sensors,force=Math.max(...s.selfContactForce);if(force>selfPeak){selfPeak=force;supportAtPeak=sum(s.supportForce);}}
 assert(selfPeak>1&&supportAtPeak<.01,'anchored arm pressing its own blocks reports self force without outside support');
 const beam=[{x:-2,y:1,z:0,parent:-1,joint:0},{x:-1,y:1,z:0,parent:0,joint:0},{x:0,y:1,z:0,parent:1,joint:0},{x:0,y:0,z:0,parent:2,joint:0}];
 Game.call('build',{parts:beam});Game.call('reset',{sea:false});Game.call('cargo',{x:-2,y:.5,z:0});const supported=await advance('',180);
 assert(supported.sensors.supportForce[0]>.1&&sum(supported.sensors.selfContactForce)<.01,'a separate dynamic crate supports the cantilever without self force');
 const result={readings,selfPeak,supportAtPeak,dynamicSupport:supported.sensors.supportForce,beamMass:supported.sensors.mass};
 fs.writeFileSync('/workspace/blockwalker-contact-sensors.json',JSON.stringify(result));console.log(JSON.stringify(result));
}

async function checkLargeController(){
 const trajectory=Array.from({length:2048},(_,i)=>(.6*Math.sin(i*2*Math.PI/600)).toFixed(8));
 const source='(()=>{const trajectory=['+trajectory.join(',')+'];return function(t,s,m){m.target=trajectory[Math.floor(t*60)%trajectory.length];const u=Math.max(-1,Math.min(1,3*(m.target-s.angles[1])-.3*s.rates[1]));return {A:Math.max(0,u),Q:Math.max(0,-u)};};})()';
 Game.call('build',{parts:[{x:0,y:0,z:0,parent:-1,joint:0},{x:1,y:0,z:0,parent:0,joint:1,axis:2,negative:81,positive:65}],anchored:true});
 Game.call('install',{name:'Recorded trajectory',source,hz:60});const id=Game.call('save_design');
 Game.call('program_trial',{steps:120,sea:false});while(Game.call('state').remaining)await sleep(20);
 const state=Game.call('state'),program=Game.call('installed_program');assert(state.steps===120&&state.parts[1].angle>.3&&Math.abs(state.parts[1].angle-program.memory.target)<.12,'large trajectory controller drives a real motor');
 let rejected=false;try{Game.call('install',{name:'Oversized literal',source:'(()=>{const data="'+'x'.repeat(5*1024*1024)+'";return function(){return data;};})()'});}catch{rejected=true;}
 assert(rejected&&Game.call('installed_program').source===source,'compiler heap rejection preserves the installed controller');
 Game.call('save');fs.writeFileSync('/workspace/blockwalker-large-controller.json',JSON.stringify({id,sourceBytes:source.length,angle:state.parts[1].angle,target:program.memory.target,heapRejected:rejected}));
 const restored=Game.call('open_design',{id});assert(restored.source===source,'saved large controller reopens exactly');
}
