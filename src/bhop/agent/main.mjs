// Shared Pi supervision, settings and viewer; bhop supplies only its input adapter. SPDX-License-Identifier: GPL-2.0-or-later
import { runAgent } from '../../game-agent/mission.mjs';
import { writeAtomic } from '../../game-agent/settings.mjs';
import { connect, describe, toolText } from './player.js';
import { exportReplay } from './replay.mjs';
const fs=globalThis.__janisBuiltin('fs'),{spawn}=globalThis.__janisBuiltin('child_process');
const profile='/home/dolly/.config/bhop',history='/workspace/bhop-runs';
for(const path of [profile,history])fs.mkdirSync(path,{recursive:true});
for(const name of fs.readdirSync('/tmp'))if(name.startsWith('bhop-agent-'))fs.rmSync(`/tmp/${name}`,{recursive:true,force:true});
const scratch=fs.mkdtempSync('/tmp/bhop-agent-'),runFile=`${profile}/recording-run.txt`;
let run=fs.existsSync(runFile)?fs.readFileSync(runFile,'utf8').trim():'';
if(!/^\/workspace\/bhop-runs\/run-[\w-]+$/.test(run)||!fs.existsSync(run))run=fs.mkdtempSync(`${history}/run-`);
writeAtomic(fs,runFile,run);
writeAtomic(fs,`${scratch}/players.txt`,`1\tRunner\t${profile}\t${scratch}`);writeAtomic(fs,`${scratch}/watching`,'1');
const viewer=spawn('bhop-viewer',[scratch,profile,'960','540','1','Airtime / Foundry'],{stdio:['ignore','inherit','inherit']});
const closed=new Promise(resolve=>viewer.once('close',()=>{writeAtomic(fs,`${scratch}/stop`,'1');resolve();}));
viewer.on('error',error=>{console.error(error.message);writeAtomic(fs,`${scratch}/stop`,'1');});
const environment=(scratch,run)=>({DOLLY_BHOP_DIR:scratch,DOLLY_BHOP_RUN:run});
try {
  await runAgent({fs,spawn,world:'/workspace',run,scratch,directory:profile,app:{
    command:'bhop',connect,describe,toolText,tools:['game_input','review_attempt'],
    extension:'/usr/src/dolly/bhop/agent/player.js',instructions:'/usr/src/dolly/bhop/agent/PLAYER.md',
    agentEnvironment:environment,gameEnvironment:environment,review:exportReplay,
    idleStatus:'Trying again shortly',
    idlePrompt:'Review the snapshots from your last attempt, explain what went wrong, and try again to complete the course. Use only ordinary mouse and keyboard inputs.',
  }});
} finally {
  viewer.kill('SIGTERM');const force=setTimeout(()=>viewer.kill('SIGKILL'),2000);await closed;clearTimeout(force);
  fs.rmSync(scratch,{recursive:true,force:true});console.log(`Bhop attempts and profile saved. Recordings: ${run}`);
}
