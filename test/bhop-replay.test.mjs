import test from 'node:test';
import assert from 'node:assert/strict';
import { exportReplay } from '../src/bhop/agent/replay.mjs';

async function replay(frameCount, pngBytes) {
  const run='/runs/example',scratch='/tmp/review',files=new Map(),png=Buffer.alloc(pngBytes);
  for(const id of [1,2]) {
    const directory=`${run}/attempt-${String(id).padStart(6,'0')}`;
    const frames=Array.from({length:frameCount},(_,index)=>({index,tick:index*10,milliseconds:index*100}));
    files.set(`${directory}/frames.jsonl`,Buffer.from(frames.map(f=>JSON.stringify(f)).join('\n')));
    files.set(`${directory}/inputs.jsonl`,Buffer.from('{"tick":10,"type":1,"code":"Space","action":1}\n'));
    for(const frame of frames) files.set(`${directory}/frame-${String(frame.index).padStart(6,'0')}.png`,png);
  }
  const original=new Map(files),reads=[];
  const fs={
    readdirSync:path=>[...new Set([...files.keys()].filter(p=>p.startsWith(path+'/')).map(p=>p.slice(path.length+1).split('/')[0]))],
    existsSync:path=>files.has(path),
    statSync:path=>({size:files.get(path).length}),
    readFileSync:(path,encoding)=>{if(path.endsWith('.png'))reads.push(path);const bytes=files.get(path);return encoding?bytes.toString(encoding):bytes;},
    writeFileSync:(path,bytes)=>files.set(path,Buffer.from(bytes)),
  };
  await exportReplay(fs,run,scratch,async(command,args)=>{
    assert.equal(command,'download');assert.deepEqual(args,[`${scratch}/bhop-attempts.html`]);return 0;
  });
  for(const [path,bytes] of original) assert.equal(files.get(path),bytes,'original recordings are untouched');
  const html=files.get(`${scratch}/bhop-attempts.html`).toString();
  const attempts=JSON.parse(html.match(/const attempts=(.*),select=document/)[1]);
  return {html,attempts,reads};
}

test('short portable bhop replays retain every frame and input',async()=>{
  const {attempts,reads}=await replay(3,32);
  assert.equal(reads.length,6);
  for(const a of attempts) {
    assert.equal(a.totalFrames,3);assert.deepEqual(a.frames.map(f=>f.index),[0,1,2]);
    assert.equal(a.inputs[0].code,'Space');
  }
});

test('long portable bhop replays fit the download limit without discarding recordings',async()=>{
  const {html,attempts,reads}=await replay(130,256*1024);
  assert.ok(Buffer.byteLength(html)<64*1024*1024);
  assert.match(html,/Sampled portable preview; full PNGs remain in Dolly/);
  assert.deepEqual(attempts.map(a=>a.id),[1,2]);
  assert.equal(reads.length,attempts.reduce((sum,a)=>sum+a.frames.length,0),'only selected PNG payloads are read');
  for(const a of attempts) {
    assert.equal(a.totalFrames,130);assert.ok(a.frames.length<130);
    assert.equal(a.frames[0].index,0);assert.equal(a.frames.at(-1).index,129);
    assert.equal(a.frames.at(-1).milliseconds,12900);assert.equal(a.inputs.length,1);
  }
});
