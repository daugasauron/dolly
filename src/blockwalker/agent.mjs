import fs from 'node:fs';
const directory='/workspace/blockwalker-agent';
fs.mkdirSync(directory,{recursive:true});
const call=(op,args)=>Game.call(op,args),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const log=text=>{call('log',text);};
async function piSdk(){
  // Match Pi CLI's module order before resolving its cyclic SDK re-exports in QuickJS.
  await import('/usr/lib/node_modules/@earendil-works/pi-coding-agent/dist/main.js');
  return import('/usr/lib/node_modules/@earendil-works/pi-coding-agent/dist/index.js');
}
const configPath=directory+'/config.json';
let config={enabled:false,prompt:'',model:'gpt-6-astra',effort:'xhigh'};try{config={...config,...JSON.parse(fs.readFileSync(configPath,'utf8'))};}catch{}
config.model='gpt-6-astra';config.effort='xhigh';
const events=directory+'/events.jsonl';let eventBytes=fs.existsSync(events)?fs.statSync(events).size:0;
function record(event){const row=JSON.stringify({time:Date.now(),...event})+'\n';if(eventBytes+row.length>2*1024*1024){fs.renameSync(events,events+'.previous');eventBytes=0;}fs.appendFileSync(events,row);eventBytes+=row.length;}
let running=true,session,abortRequested=false,requestError=null,failures=0;
function abort(){session?.abortCompaction();session?.abortBranchSummary();return session?.abort();}
call('enable',Boolean(config.enabled));
const timer=setInterval(()=>{
  if(!Game.frame()){running=false;clearInterval(timer);abort();return;}
  const enabled=call('enabled');if(enabled!==config.enabled){config.enabled=enabled;fs.writeFileSync(configPath,JSON.stringify({...config,model:'gpt-6-astra',effort:'xhigh'}));}
  if(session&&!call('enabled')&&!abortRequested){abortRequested=true;abort();}
  const prompt=call('prompt');if(prompt){config.prompt=prompt;fs.writeFileSync(configPath,JSON.stringify(config));log(`\nYou: ${prompt}\n`);if(session?.isStreaming)session.steer(prompt);else pending=prompt;}
},16);
let pending=config.prompt||'Make a creature that actually walks. Learn a repeatable gait with timed keyboard trials and framebuffer observations. Measure travel and stability, embed the gait, then release it. Keep making varied moving creatures; stationary platforms are not success.';
const snapshot=()=>({type:'image',mimeType:'image/png',data:Buffer.from(call('snapshot')).toString('base64')});
const text=value=>({type:'text',text:typeof value==='string'?value:JSON.stringify(value)});
const object=properties=>({type:'object',properties,additionalProperties:false});
const integer={type:'integer'},num={type:'number'},str={type:'string'},boolean={type:'boolean'};
const part=object({x:integer,y:integer,z:integer,parent:integer,joint:{type:'integer',minimum:0,maximum:7},color:{type:'integer',minimum:0,maximum:5},axis:{type:'integer',minimum:0,maximum:2},negative:integer,positive:integer,speed:{type:'number',minimum:.5,maximum:6},limit:{type:'number',minimum:15,maximum:150},travel:{type:'number',minimum:.25,maximum:3},force:{type:'number',minimum:2,maximum:100},direction:{type:'integer',enum:[-1,1]},material:{type:'integer',minimum:0,maximum:2},finish:{type:'integer',minimum:0,maximum:3}});
part.required=['x','y','z','parent','joint'];
const tools=[];
function tool(name,description,parameters,execute){tools.push({name,label:name,description,parameters,executionMode:'sequential',execute:async(id,args,signal)=>{
  if(signal?.aborted)throw Error('Interrupted');
  record({event:'tool_start',tool:name,args});const content=await execute(args,signal);record({event:'tool_end',tool:name,text:content.filter(c=>c.type==='text'),images:content.filter(c=>c.type==='image').map(c=>({mimeType:c.mimeType,bytes:c.data.length}))});return {content,details:{}};
}});}
tool('observe','Inspect the current builder or practice state and one actual GPU framebuffer image.',object({}),async()=>[text({workshop:call('state'),world:call('world')}),snapshot()]);
tool('design_library','List saved programmed designs, including learned examples. Released designs remain here after their creatures fall. IDs select designs to reopen; this does not spawn or replace anything.',object({}),async()=>[text(call('designs'))]);
tool('save_design','Save the current blueprint and controller in the design library and return its ID. Save experiments before replacing the workshop or opening another design, so their exact code and structure can be restored later. Existing identical entries are reused. Practice continues and no creature is released.',object({}),async()=>[text({id:call('save_design')})]);
tool('inspect_program','Read the current workshop controller source, name, frequency and practice memory. Memory is a JSON snapshot up to 8 KiB, null before practice or after reset/stop; memoryError explains unavailable snapshots. Store compact phase, PID and gait diagnostics in memory to inspect after a trial. Does not advance physics or replace the character or program.',object({}),async()=>[text(call('installed_program'))]);
tool('open_design','Load a saved blueprint and its controller into the workshop by library ID. Existing world copies stay alive. Returns the controller source for reuse or improvement; reset practice, test it, then release a copy when ready. Boat examples select water trials automatically.',{...object({id:integer}),required:['id']},async args=>[text(call('open_design',args)),snapshot()]);
tool('build','Replace the workshop blueprint with adjacent 3D blocks. First part is a box, parent=-1. Every other parent precedes its child and is one grid cell away. Face-adjacent rigid blocks (boxes, eyes, thrusters, magnets) also weld to every rigid neighbor, regardless of parent. Hinges, pistons, wheels and turntables connect through their explicit parent/child attachments; leave a gap between moving rigid assemblies or they will weld together. y>=0. joint=0 rigid box; 1 mechanical servo hinge with an angle dial and angular limit; 2 telescoping piston with travel 0..travel metres; 3 reversible thruster fixed to its parent, pushing along its own local axis; 4 cylindrical motor wheel with unlimited rotation; 5 powered magnet rigidly attached to its parent; 6 rigid Eyes block, no keys, camera facing direction along axis; 7 motorized Turntable with unlimited rotation that carries attached blocks. Mount a Turntable on a hinge to tilt its spinning plane. axis 0/1/2 = X/Y/Z, relative to the parent at creation (thruster axis rotates with its own body). A piston extends along direction times its selected axis (direction defaults +1, may be -1) and carries descendants; a wheel rotates descendants, so attach wheels as leaves. A magnet faces direction (+1 or -1) along its local axis: use axis:1,direction:-1 for a downward crane head. Positive key switches it on at that strength, negative key switches it off; releasing keys keeps its power latched. It attracts one nearby foreign dynamic body within 0.65 m of its face, applies at most force N with equal reaction on the crane, and lets go when switched off or stretched beyond 1.2 m. It never grabs its own character. negative/positive are unique ASCII letter/digit codes (Q=81,A=65,W=87,S=83,O=79,K=75,P=80,L=76); 0 means unbound. Motors hold when no key is pressed. Defaults speed=2.5 rad/s (piston m/s), limit=75 degrees (hinge only), travel=1.5 m (piston), force=24 N (piston/thruster) or Nm (hinge/wheel). Zero keys brake hinge/piston/wheel; thrusters coast. material: 0 alloy (default density), 1 sealed buoyant hull (quarter density), 2 heavy ballast (triple density). finish: 0 plain, 1 panel, 2 indicator trim, 3 hazard stripes. Optional anchored=true pins the starting block for cranes/bridges; other parts still obey physics. Fully 3D gravity; no balance assistance.',{...object({parts:{type:'array',items:part,minItems:1},anchored:boolean}),required:['parts']},async args=>[text(call('build',args))]);
tool('drop_cargo','Create a loose box at world x/y/z coordinates. Practice requires reset_practice first; its cargo returns to the initial position on reset or program_trial and is cleared by build. Set world:true for persistent shared-world cargo. Omit y for terrain/water-surface placement, or set y above a boat deck or lift so gravity drops the new crate onto it. This only creates new cargo; it cannot reposition existing cargo. Material 0 alloy, 1 buoyant hull, 2 heavy ballast. Does not replace your blueprint or controller.',object({x:num,y:num,z:num,material:{type:'integer',minimum:0,maximum:2},world:boolean}),async args=>[text(call('cargo',args)),snapshot()]);
tool('reset_practice','Drop the workshop character onto ground, or use sea:true for the harbor water at x=125,z=10. Sealed hull blocks have quarter density and float; ballast sinks. Waves and drag act at eight points per body, so weight distribution affects stability. Simulation pauses between keyboard trials.',object({sea:boolean}),async args=>[text(call('reset',args)),snapshot()]);
tool('keyboard_trial','Learn movement by holding joint keyboard keys through a timed sequence. Each item replaces held keys; empty string releases all. Returns at most three actual framebuffer images at start, midpoint and end, with measured poses, distance from reset, horizontal speed and torso up. Compare start/end positions; a stable stationary design has not walked. Total duration <=20 seconds, each item <=10 seconds. These are physics seconds; inference time is excluded.',{...object({sequence:{type:'array',minItems:1,maxItems:20,items:{...object({keys:str,seconds:{type:'number',minimum:1/60,maximum:10}}),required:['keys','seconds']}}}),required:['sequence']},async(args,signal)=>{
  const segments=args.sequence.map(s=>({keys:s.keys,steps:Math.max(1,Math.round(s.seconds*60))}));
  const total=segments.reduce((sum,s)=>sum+s.steps,0);if(total>1200)throw Error('Trial exceeds 20 simulation seconds');
  const content=[text({sample:'start',state:call('state')}),snapshot()];let elapsed=0,midpoint=Math.floor(total/2),sampled=false;
  try{
    for(const segment of segments){let remaining=segment.steps;
      while(remaining){const n=!sampled&&elapsed<midpoint?Math.min(remaining,midpoint-elapsed):remaining;
        call('advance',{keys:segment.keys,steps:n});
        while(call('state').remaining>0){if(!running||signal?.aborted||!call('enabled')||!call('state').agentControl)throw Error('Trial interrupted');await sleep(40);}
        elapsed+=n;remaining-=n;
        if(!sampled&&elapsed>=midpoint){content.push(text({sample:'midpoint',seconds:elapsed/60,state:call('state')}),snapshot());sampled=true;}
      }
    }
    content.push(text({sample:'end',seconds:elapsed/60,state:call('state')}),snapshot());return content;
  }finally{call('release');}
});
tool('camera','Move or orbit the actual game camera before observing. x/y/z set the target in world metres; yaw/pitch are radians. Negative pitch looks from below the floor. World and workshop cameras keep separate positions. Use watch_world then camera to visit distant creatures.',object({x:num,y:num,z:num,yaw:num,pitch:num,distance:{type:'number',minimum:3,maximum:512}}),async args=>{call('camera',args);return [text(call('state').camera),snapshot()];});
tool('program','Embed a JavaScript function(t,sensors,memory,random). Return held uppercase letters/digits (full strength), or an object mapping assigned keys to strengths 0..1, e.g. {A:0.35,S:0.6}. Opposite keys subtract. Magnet positive/negative keys latch power on/off; no keys preserve its state. A hinge/wheel command scales target angular speed; piston scales target linear speed; thruster scales force. Motors brake at zero; jets coast. hz may be 10 (default), 20, 30 or 60; use 60 for feedback/PID. t and sensors.dt are simulation seconds. Sensors: root x,y,z,vx,vy,vz and up; rotation quaternion [x,y,z,w]; angularVelocity world XYZ rad/s; gyroscope body-local XYZ rad/s; gravity body-local XYZ m/s²; localVelocity body-local XYZ m/s; total mass kg; centerOfMass world XYZ; angles and rates indexed by part (radians and rad/s, piston metres and m/s); positions gives each part world center of mass; touching gives per-part contact booleans (any body/world contact). supportForce is per-part upward normal force from bodies outside this character; selfContactForce is summed normal collision force against its own blocks. contactsReady is false before the first solver step; do not treat that as evidence of lost support. Both forces estimate newtons in the final 1/480 s solver substep of the last physics tick, regardless of controller hz; a contact earlier in that tick may read zero. Exclude friction, joints, magnets and buoyancy. An internal contact appears on both involved parts. ground is terrain height under the root; waterHeight is the current wave surface when testing at sea or in the shared world; submerged gives each part wet fraction 0..1. magnets is indexed by part; magnet entries contain power (0..1), attached (boolean), load (newtons) and targetSupportForce (upward external contact force on the attached body, newtons; zero when detached or airborne). Use support to detect set-down even when cargo is tilted; the same contactsReady and last-substep limits apply. Shared-world sensors also include id, cargoDelivered, nearby (up to 12 nearest objects within 48 m: id/name, x/y/z, vx/vz, horizontal radius, low/high bounds, anchored, cargo, delivered and carriedBy), depots (name, x/z, radius) and groundSamples (16 world XYZ samples at radii 6/16 m, starting +Z and spaced 45 degrees). obstacles gives nearby terrain AABBs within 24 m that rise above the root floor: x/z center, halfX/halfZ, low/high. Check vertical clearance before routing around an overhang. Practice has an empty nearby list. Use peers for yielding, rendezvous and cargo pickup; check terrain samples before choosing a route. Deliver a previously carried crate to a striped depot and release it to settle; each crate scores once. Initial body axes are +X right, +Y up, +Z forward. All vectors are arrays. Memory persists and random() is seeded. No I/O or physics mutation, 4 MiB heap, 128 KiB stack, bounded computation per call. Use simulation t and sensors.dt for timing. Learn key behavior first, then test feedback with program_trial before release. Balance must come from your controller.',{...object({name:str,source:str,hz:{type:'integer',enum:[10,20,30,60]}}),required:['name','source']},async args=>{call('install',args);return [text('Controller installed. Test it with program_trial, then release a copy into the shared world.')];});
tool('program_trial','Run the installed controller in practice from a fresh drop with fresh controller memory for up to 300 simulation seconds. It reads real physics sensors at its chosen rate, and applies proportional joint/jet commands. Returns at most three timed GPU images and measured state. Sustained physical failure or a controller error ends the trial early with its failure cause, actual state and controller memory. Brief recoverable stumbles are allowed. Physics pauses afterwards; no creature is released.',{...object({seconds:{type:'number',minimum:.1,maximum:300},sea:boolean}),required:['seconds']},async(args,signal)=>{
  const steps=Math.round(args.seconds*60);call('program_trial',{steps,...(args.sea===undefined?{}:{sea:args.sea})});
  const content=[text({sample:'start',state:call('state')}),snapshot()];let sampled=false;
  try{
    while(call('state').remaining>0){
      if(!running||signal?.aborted||!call('enabled')||!call('state').agentControl)throw Error('Trial interrupted');
      const state=call('state');if(!sampled&&state.steps>=steps/2){content.push(text({sample:'midpoint',state}),snapshot());sampled=true;}await sleep(40);
    }
    const state=call('state'),{memory,memoryError,failure}=call('installed_program');
    if(!running||signal?.aborted||!call('enabled')||!state.agentControl||(state.steps!==steps&&!failure))throw Error('Trial interrupted');
    content.push(text({sample:'end',state,memory,memoryError,failure}),snapshot());return content;
  }finally{call('release');}
});
tool('release_creature','Release a copy of the workshop character with its installed controller into the shared survival world. First measure useful locomotion, or test an anchored mechanism. For static landmarks install a no-op controller returning an empty string. Existing creatures stay active and collide. Optional seed changes its random sequence; optional x/z choose the spawn position within +/-248 m. The central 200 m square is land; sea surrounds it. Boats can spawn at x=125,z=10; harbor is near x=112,z=20, eastern island x=170,z=30. Anchoring is part of the blueprint, not an automatic stabilizer. Tilted-over or collapsed torsos are removed after 3 seconds initial grace plus 2 seconds fallen; no automatic balance assistance.',object({seed:integer,x:num,z:num}),async args=>[text({id:call('spawn',args),world:call('world')})]);
tool('watch_world','Watch the programmed population running together for up to 20 simulation seconds. Returns an actual GPU snapshot before and after, plus survivor positions and deaths. Workshop blueprint is preserved.',{...object({seconds:{type:'number',minimum:0,maximum:20}}),required:['seconds']},async(args,signal)=>{
  call('watch',true);const before=call('world'),content=[text(before),snapshot()];
  while(call('world').seconds-before.seconds<args.seconds){if(signal?.aborted||!running||!call('enabled'))throw Error('Interrupted');await sleep(100);}
  content.push(text(call('world')),snapshot());return content;
});
const system=`You are Pi, embodied in Blockwalker. This is a C game with raylib UI, fully 3D Box3D physics and WebGPU graphics. Your tools call the game directly in the same Wasm process. There is no shell or control-file workflow.\nDesign chunky industrial machines in a muted late-1990s Japanese PlayStation style: low-poly forms, worn panels, mechanical servo joints, ivory markings and restrained hazard stripes. This is a coastal machine works with a quarry, docks and survey islands. Design strange connected creatures in the workshop. Practice by pressing joint keys. Inspect the few timed framebuffer pictures and quantitative poses, improve the structure or keyboard pattern, then embed a small controller program and release it into the survival world. Walking and balance are supposed to be hard like QWOP. Do not fake observations or silently remove gravity. Try diverse bodies, wide feet, asymmetric limbs and controlled randomness. Keep going after each experiment; create a varied moving world. For legged walkers, aim to advance at least two block widths over ten simulation seconds without falling. A flat base with wiggling appendages does not count; neither do wheels or jets as walking. Start with a quadruped, four grounded feet and alternating support, then improve gait timing from actual trials. Also explore wheeled and hydraulic creatures as separate experiments. Release mobile designs with measured movement; anchored structures may be static landmarks or tested moving mechanisms. The user disliked stationary crabs and platforms. Movement programs now have physics feedback and analog key strengths. Explore a self-balancing two-wheel Segway using your own PID controller, contact-aware walkers, and flying thruster creatures. Use program_trial at 60 Hz for feedback experiments. The world now has a 512 m sea with islands and docks. Build buoyant boats from hull-material blocks, use differential thrusters for steering, and test with sea:true. Also build anchored cranes, bridges and larger varied machines. Powered magnet blocks and drop_cargo let cranes pick up real loose boxes. Practice a pickup, lift, carry and release sequence using magnet feedback before releasing a crane. Material changes affect mass; trim/panel/striped finishes change appearance. Preserve successful older creatures. World observations include recentRemovals with the actual cause, controller error and last physical state; use those records before claiming a creature fell. There is no automatic stabilizer. Explain discoveries briefly. Images are actual GPU renders, never every frame.`;
try{
  log('Pi inside the game. Import proxy models.json, then Start.\nAstra · xhigh · timed GPU observations\n');
  while(running){
    const imported=call('proxy_import');
    if(imported){
      let message;
      try{
        await abort();
        const {ModelRuntime}=await piSdk();
        const candidate=await ModelRuntime.create({modelsPath:imported,authPath:directory+'/auth.json',allowModelNetwork:false,refreshOnCreate:false});
        if(candidate.getError())throw Error(candidate.getError());
        if(!candidate.getModel('codex-local','gpt-6-astra'))throw Error('Proxy configuration has no codex-local / gpt-6-astra model.');
        fs.renameSync(imported,directory+'/models.json');
        session?.dispose();session=null;failures=0;abortRequested=false;
        message='Proxy configuration saved. Press Start to connect.';
      }catch(error){message=`Configuration unchanged: ${error.message??error}`;}
      finally{if(fs.existsSync(imported))fs.unlinkSync(imported);call('proxy_import_done',message);}
    }
    if(!call('enabled')){await sleep(200);continue;}
    try{
      if(!session){
        const {createAgentSession,ModelRuntime,DefaultResourceLoader}=await piSdk();

        if(!fs.existsSync(directory+'/models.json'))throw Error('Import the local Codex proxy models.json first.');
        const {SessionManager,getDefaultSessionDir}=await import('/usr/lib/node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.js');
        const sessionManager=SessionManager.continueRecent('/workspace',getDefaultSessionDir('/workspace',directory));
        if(sessionManager.getLeafId()){pending='Resume the saved experiment. Practice restarts from the saved blueprint; keep what you learned. '+pending;log('Restored Pi session.\n');}
        const modelRuntime=await ModelRuntime.create({modelsPath:directory+'/models.json',authPath:directory+'/auth.json'});
        const model=modelRuntime.getModel('codex-local','gpt-6-astra');if(!model)throw Error('Proxy configuration has no gpt-6-astra model.');
        const {gameCompaction}=await import('./compaction.mjs');
        const resourceLoader=new DefaultResourceLoader({cwd:'/workspace',agentDir:directory,noExtensions:true,extensionFactories:[gameCompaction(record,log)],noSkills:true,noPromptTemplates:true,noThemes:true,noContextFiles:true,systemPrompt:system});
        await resourceLoader.reload();
        ({session}=await createAgentSession({cwd:'/workspace',agentDir:directory,sessionManager,modelRuntime,model,thinkingLevel:'xhigh',resourceLoader,noTools:'builtin',tools:tools.map(t=>t.name),customTools:tools}));
        const convert=session.agent.convertToLlm;
        session.agent.convertToLlm=async messages=>{
          const context=await convert(messages);let remaining=3;
          return context.slice().reverse().map(message=>{
            if(!Array.isArray(message.content))return message;
            const content=message.content.slice().reverse().map(item=>item.type!=='image'||remaining-->0?item:{type:'text',text:'[Earlier framebuffer omitted; the measured state remains above.]'}).reverse();
            return {...message,content};
          }).reverse();
        };
        session.subscribe(event=>{
          const delta=event.assistantMessageEvent;
          if(event.type==='compaction_start'){record({event:event.type,reason:event.reason});log('\nSummarizing the conversation...\n');}
          if(event.type==='compaction_end'){
            record({event:event.type,reason:event.reason,aborted:event.aborted,error:event.errorMessage,tokensBefore:event.result?.tokensBefore});
            log(event.aborted?'\nSummary cancelled.\n':event.errorMessage?`\nSummary failed: ${event.errorMessage}\n`:'\nConversation summary finished.\n');
          }
          if(event.type==='message_update'&&(delta?.type==='thinking_delta'||delta?.type==='text_delta'))log(delta.delta??'');
          if(event.type==='tool_execution_start')log(`\n→ ${event.toolName}\n`);
          if(event.type==='tool_execution_end')log(event.isError?'Tool failed\n':'');
          if(event.type==='message_end'&&event.message?.role==='assistant')record({event:'assistant',message:event.message});
          if(event.type==='message_end'&&event.message?.role==='assistant'&&event.message.errorMessage){requestError=event.message.errorMessage;log(`\n${requestError}\n`);}
        });
        log('Connected: codex-local / gpt-6-astra / xhigh\n');
      }
      if(!running||!call('enabled'))continue;
      abortRequested=false;const prompt=pending||`Continue the latest request and current experiment. Preserve successful designs and use measured physics and a few timed pictures. Keep the world varied and moving; explore its islands when choosing new locations. Do not wait for more input. Latest request: ${config.prompt}`;pending='';
      requestError=null;await session.prompt(prompt);if(requestError)throw Error(requestError);failures=0;if(running&&call('enabled'))await sleep(2000);
    }catch(error){record({event:'error',error:String(error.message??error)});log(`\nPi: ${error.message??error}\n`);const until=Date.now()+Math.min(60000,5000*2**Math.min(failures++,4));while(running&&call('enabled')&&Date.now()<until)await sleep(200);}
  }
}finally{clearInterval(timer);call('save');await abort();}
