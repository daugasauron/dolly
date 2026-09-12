import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { encodeBatch, parameters } from '../src/bhop/agent/codec.mjs';
import registerTools, { review, modelContext } from '../src/bhop/agent/player.js';

test('browser tool encoding reaches native ticks with exact signed fractional mouse movement', () => {
  const directory = fs.mkdtempSync(join(tmpdir(), 'bhop-timeline-')), binary = join(directory, 'check');
  try {
    const build = spawnSync('cc', ['-std=c17','-O2','-Wall','-Wextra','-Werror','-I',resolve('src/bhop/agent'),'-x','c','-','-o',binary], {encoding:'utf8',input:`
#include <stdio.h>
#include <assert.h>
#include "timeline.h"
int main(void) {
  bh_request request; bh_action actions[BH_INPUT_ACTIONS];
  assert(fread(&request,sizeof(request),1,stdin)==1);
  assert(request.magic==BH_INPUT_MAGIC && request.version==1 && request.id==17 && request.generation==9);
  assert(fread(actions,sizeof(bh_action),request.count,stdin)==request.count);
  assert(bh_actions_valid(actions,request.count));
  unsigned ticks=0; long long x=0,y=0;
  for(unsigned n=0;n<request.count;n++) for(unsigned t=0;t<actions[n].ticks;t++) {
    ++ticks; x+=bh_mouse_step(actions[n].mouse_x,t,actions[n].ticks); y+=bh_mouse_step(actions[n].mouse_y,t,actions[n].ticks);
  }
  assert(ticks==3000 && x==-15999999 && y==87654);
  actions[0].reserved=1; assert(!bh_actions_valid(actions,request.count)); actions[0].reserved=0;
  actions[0].keys=256; assert(!bh_actions_valid(actions,request.count));
  puts("exact input timeline passed");
}`});
    assert.equal(build.status,0,build.stderr);
    const input=encodeBatch([{ticks:7,keys:['W','Space'],mouse_dx:0.001,mouse_dy:123.456},
      {ticks:2993,keys:['D'],mouse_dx:-16000,mouse_dy:-35.802,wheel:-1}],17,9);
    const result=spawnSync(binary,[],{input});
    assert.equal(result.status,0,result.stderr.toString());
    assert.match(result.stdout.toString(),/exact input timeline passed/);
  } finally { fs.rmSync(directory,{recursive:true,force:true}); }
});

test('agent controls reject practice shortcuts, hidden-state queries and invalid timings', () => {
  assert.deepEqual(parameters.properties.actions.items.properties.keys.items.enum,['W','A','S','D','Space','ArrowLeft','ArrowRight','R']);
  for(const action of [{ticks:1,keys:['F']},{ticks:1,keys:['1']},{ticks:1,keys:['W','W']},
    {ticks:0,keys:[]},{ticks:3001,keys:[]},{ticks:1,keys:[],mouse_dx:0.0001},
    {ticks:1,keys:[],mouse_dy:Infinity},{ticks:1,keys:[],wheel:2},{ticks:1,keys:[],position:[1,2,3]}]) {
    assert.throws(()=>encodeBatch([action],1,1));
  }
  assert.throws(()=>encodeBatch([{ticks:2000,keys:[]},{ticks:1001,keys:[]}],1,1));
  assert.equal(encodeBatch([],1,1).length,24);
});

test('attempt review returns only selected recorded frames and retains their historical identity', () => {
  const run=fs.mkdtempSync(join(tmpdir(),'bhop-review-'));
  try {
    fs.mkdirSync(`${run}/attempt-000001`);
    fs.writeFileSync(`${run}/attempt-000001/frames.jsonl`,[0,1,2].map(index=>JSON.stringify({index,tick:index*10,milliseconds:index*100})).join('\n'));
    for(let n=0;n<3;n++)fs.writeFileSync(`${run}/attempt-000001/frame-00000${n}.png`,Buffer.from([n,1,2]));
    const result=review(fs,run,1,[0,2]);
    assert.deepEqual(result.content.filter(c=>c.type==='image').map(c=>Buffer.from(c.data,'base64')[0]),[0,2]);
    assert.match(result.content[0].text,/not the current live state/);
    assert.throws(()=>review(fs,run,1,[3]));
    assert.throws(()=>review(fs,run,1,['../../secrets']));
    const history=[{role:'user',content:[{type:'text',text:'initial view'},{type:'image',data:'old'}]},
      {role:'toolResult',content:result.content},{role:'assistant',content:[{type:'text',text:'reviewing'}]}];
    const context=modelContext(history);
    assert.deepEqual(context[0].content,[{type:'text',text:'initial view'}]);
    assert.equal(context[1].content,result.content);
    assert.equal(history[0].content.length,2);
  } finally {fs.rmSync(run,{recursive:true,force:true});}
});

test('recording failures return a live view and an explicit gap warning without reading the archive', async () => {
  const directory=fs.mkdtempSync(join(tmpdir(),'bhop-live-')),previous=globalThis.__janisBuiltin;
  const environment=[process.env.DOLLY_BHOP_DIR,process.env.DOLLY_BHOP_RUN];
  try {
    const control=Buffer.alloc(8);control.writeUInt32LE(1);control.writeUInt32LE(2,4);fs.writeFileSync(`${directory}/control`,control);
    const png=Buffer.alloc(24);png.writeUInt32BE(960,16);png.writeUInt32BE(540,20);
    globalThis.__janisBuiltin=()=>({...fs,renameSync(source,target) {
      fs.renameSync(source,target);
      if(target===`${directory}/request`) {
        fs.writeFileSync(`${directory}/response.png`,png);
        fs.writeFileSync(`${directory}/response`,JSON.stringify({version:1,id:1,status:0,frame:123,milliseconds:456,attempt:1,recording_failures:6}));
      }
    }});
    process.env.DOLLY_BHOP_DIR=directory;process.env.DOLLY_BHOP_RUN=`${directory}/missing-archive`;
    const tools=[];registerTools({on(){},registerTool(tool){tools.push(tool);}});
    const result=await tools.find(tool=>tool.name==='game_input').execute('test',{actions:[]});
    assert.match(result.content[0].text,/6 snapshots could not be saved.*archive has gaps.*current live view/);
    assert.deepEqual(result.content.filter(part=>part.type==='image').map(part=>part.data),[png.toString('base64')]);
    assert.equal(result.details.frame,123);
  } finally {
    globalThis.__janisBuiltin=previous;
    for(const [index,name] of ['DOLLY_BHOP_DIR','DOLLY_BHOP_RUN'].entries()) {
      if(environment[index]===undefined)delete process.env[name];else process.env[name]=environment[index];
    }
    fs.rmSync(directory,{recursive:true,force:true});
  }
});
