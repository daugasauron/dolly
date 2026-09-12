import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAgent } from '../src/game-agent/mission.mjs';

test('supervisor exceptions survive cleanup in the saved exit reason', async t => {
  const root=fs.mkdtempSync(join(tmpdir(),'game-supervisor-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const scratch=join(root,'scratch'),run=join(root,'run'),profile=join(root,'profile');
  for(const path of [scratch,run,profile])fs.mkdirSync(path);
  const child=new EventEmitter();
  child.kill=()=>child.emit('close',0);
  const errors=[];t.mock.method(console,'error',message=>errors.push(message));
  const filesystem={...fs,
    existsSync(path) {
      if(path===`${scratch}/command.1`)throw Error('command queue read failed');
      return fs.existsSync(path);
    },
    writeFileSync(path,...args) {
      fs.writeFileSync(path,...args);
      if(path===`${scratch}/stop`)queueMicrotask(()=>child.emit('close',0));
    },
  };
  const reason=await runAgent({fs:filesystem,spawn:()=>child,world:root,run,scratch,directory:profile,
    app:{command:'bhop',connect:()=>()=>{},gameEnvironment:()=>({}),idlePrompt:'Try again'}});
  assert.equal(reason,'Supervisor error: command queue read failed');
  assert.deepEqual(errors,[reason]);
  assert.equal(fs.readFileSync(`${run}/result.txt`,'utf8'),reason+'\n');
  assert.equal(fs.readFileSync(`${scratch}/ended`,'utf8'),reason);
});
