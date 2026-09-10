// Shared world and independent Pi conversations, entirely inside Dolly.
// SPDX-License-Identifier: GPL-2.0-or-later
import { runPlayer } from "./mission.mjs";
import { ClassicRoom, decodeWorld } from "./room.mjs";
import { settingsDirectory, writeAtomic } from "./settings.mjs";
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function runWorld() {
  const fs = globalThis.__janisBuiltin("fs"), { spawn } = globalThis.__janisBuiltin("child_process");
  const world = "/home/dolly/classicube", map = `${world}/maps/agent-world.cw`;
  for (const path of [settingsDirectory,`${world}/maps`,"/workspace/classicube-runs"]) fs.mkdirSync(path,{recursive:true});
  for (const name of fs.readdirSync("/tmp")) if (name.startsWith("classicube-agent-")) fs.rmSync(`/tmp/${name}`,{recursive:true,force:true});
  const hub = fs.mkdtempSync("/tmp/classicube-agent-"), run = fs.mkdtempSync("/workspace/classicube-runs/run-");
  const readJSON = (path, fallback) => { try { return JSON.parse(fs.readFileSync(path,"utf8")); } catch { return fallback; } };
  let saved = readJSON(`${settingsDirectory}/room.json`,{}), stopped = false, compressionSerial = 0, saving, savedRevision = 0, lastSave = 0, lastSelected = 0, room;
  const players = [], jobs = [], children = new Set();
  const command = (program, args, options = {}) => new Promise((resolve,reject) => {
    const child = spawn(program,args,options); children.add(child);
    child.once("error",reject); child.once("close",code=>{children.delete(child);if(code)reject(Error(`${program} exited (${code})`));else resolve();});
  });
  const gzip = async (bytes, decompress = false) => {
    const path = `${hub}/gzip-${++compressionSerial}`, output = path + ".out";
    fs.writeFileSync(path,bytes); const fd = fs.openSync(output,"w");
    try {
      const done = command(decompress?"gzip":"classicube-pack",decompress?["-dc",path]:[path],{stdio:["ignore",fd,"inherit"]}); fs.closeSync(fd);
      await done; return fs.readFileSync(output);
    } finally { fs.rmSync(path,{force:true});fs.rmSync(output,{force:true}); }
  };
  const roster = () => writeAtomic(fs,`${hub}/players.txt`,players.map(p=>`${p.id}\t${p.name}\t${p.directory}\t${p.scratch}`).join("\n"));
  const setup = (id, name, clone) => {
    const directory = id === 1 ? settingsDirectory : `${settingsDirectory}/players/${id}`;
    const scratch = `${hub}/players/${id}`, cwd = `${world}/players/${id}`;
    for (const path of [directory,scratch,cwd,`${cwd}/maps`,`${cwd}/texpacks`]) fs.mkdirSync(path,{recursive:true});
    if (!fs.existsSync(`${cwd}/texpacks/default.zip`)) fs.copyFileSync(`${world}/texpacks/default.zip`,`${cwd}/texpacks/default.zip`);
    if (!fs.existsSync(`${cwd}/options.txt`)) fs.copyFileSync(`${world}/options.txt`,`${cwd}/options.txt`);
    if (clone && !fs.existsSync(`${directory}/agent.json`) && fs.existsSync(`${clone.directory}/agent.json`))
      fs.copyFileSync(`${clone.directory}/agent.json`,`${directory}/agent.json`);
    writeAtomic(fs,`${scratch}/status.txt`,"Preparing world…");
    const player = {id,name,directory,scratch,cwd}; players.push(player); roster(); return player;
  };
  const persist = () => {
    const selected = Number(fs.existsSync(`${hub}/watching`) && fs.readFileSync(`${hub}/watching`,"utf8")) || 1;
    lastSelected = selected;
    writeAtomic(fs,`${settingsDirectory}/room.json`,JSON.stringify({selected,players:players.map(p=>({id:p.id,name:p.name,position:room?.clients.get(p.id)?.position || p.position}))}));
  };
  const start = player => {
    room.add(player.id,player.scratch,player.name,saved.players?.find(p=>p.id===player.id)?.position);
    const directory = `${run}/player-${player.id}`;fs.mkdirSync(directory,{recursive:true});
    const job = runPlayer({fs,spawn,world:player.cwd,run:directory,scratch:player.scratch,directory:player.directory,
      args:[player.name,"local-room","127.0.0.1","25565"],
      env:{DOLLY_CLASSICUBE_NET:player.scratch,DOLLY_CLASSICUBE_PLAYER:String(player.id),DOLLY_CLASSICUBE_WATCH:`${hub}/watching`}})
      .catch(error=>writeAtomic(fs,`${player.scratch}/ended`,error.message)).finally(()=>{ room.tick();player.position=room.clients.get(player.id)?.position;room.remove(player.id); });
    jobs.push(job);
  };
  const save = () => {
    if (saving) return saving;
    persist();
    if (room.revision === savedRevision) return Promise.resolve();
    const revision = room.revision, bytes = Buffer.from(room.world.data);
    saving = gzip(bytes).then(compressed=>{writeAtomic(fs,map,compressed);savedRevision=revision;}).finally(()=>{saving=undefined;});
    return saving;
  };
  const initial = Array.isArray(saved.players) && saved.players.length && saved.players.length <= 4 &&
    saved.players.every((p,i)=>p.id===i+1 && typeof p.name==='string' && /^[\w -]{1,24}$/.test(p.name)) ? saved.players : [{id:1,name:"Player 1"}];
  for (const p of initial) setup(p.id,p.name);
  writeAtomic(fs,`${hub}/watching`,String(players.some(p=>p.id===saved.selected)?saved.selected:1));
  const viewer = spawn("classicube-viewer",[hub,settingsDirectory],{stdio:["ignore","inherit","inherit"]});
  const viewerClosed = new Promise(resolve=>viewer.once("close",()=>{stopped=true;resolve();}));
  viewer.on("error",()=>{stopped=true;});
  try {
    if (!fs.existsSync(map)) {
      const seed = `${hub}/seed`;fs.mkdirSync(seed);
      await command("classicube",["--singleplayer"],{cwd:world,env:{...process.env,SDL_VIDEODRIVER:"dummy",DOLLY_CLASSICUBE_DIR:seed,DOLLY_CLASSICUBE_SEED:"1"},stdio:["ignore","inherit","inherit"]});
      fs.rmSync(seed,{recursive:true,force:true});
    }
    room = new ClassicRoom(fs,decodeWorld(await gzip(fs.readFileSync(map),true)),gzip,
      (type,event)=>fs.appendFileSync(`${run}/world.events.jsonl`,JSON.stringify({time:Date.now(),type,...event})+"\n"));
    for (const player of players) start(player);
    persist();
    while (!stopped) {
      room.tick();
      if (Number(fs.readFileSync(`${hub}/watching`,"utf8")) !== lastSelected) persist();
      const add = `${hub}/add-player`;
      if (fs.existsSync(add)) {
        const source = Number(fs.readFileSync(add,"utf8"));fs.unlinkSync(add);
        if (players.length < 4) {
          const player = setup(players.length+1,`Player ${players.length+1}`,players.find(p=>p.id===source));
          start(player);writeAtomic(fs,`${hub}/select-player`,String(player.id));persist();
        }
      }
      if (Date.now()-lastSave>=5000) { lastSave=Date.now();void save().catch(error=>writeAtomic(fs,`${hub}/error.txt`,error.message)); }
      await wait(33);
    }
  } finally {
    for (const player of players) writeAtomic(fs,`${player.scratch}/stop`,"1");
    let drained = false;const finished = Promise.all(jobs).then(()=>{drained=true;});
    while (!drained) { room?.tick();await wait(33); }
    await finished;
    if (room) { await saving;await save();persist(); }
    viewer.kill("SIGTERM");for (const child of children) child.kill("SIGTERM");
    const force = setTimeout(()=>{viewer.kill("SIGKILL");for (const child of children) child.kill("SIGKILL");},5000);
    await viewerClosed;clearTimeout(force);
    fs.rmSync(hub,{recursive:true,force:true});
    console.log(`World and ${players.length} player profiles saved. History: ${run}`);
  }
}
