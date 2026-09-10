import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { ClassicRoom, decodeWorld } from "../src/classicube/agent/room.mjs";

const named = (type, name, value) => { const b = Buffer.alloc(3); b[0] = type; b.writeUInt16BE(name.length, 1); return Buffer.concat([b,Buffer.from(name),value]); };
const short = n => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; };
const cw = () => {
  const blocks = Buffer.alloc(16 * 8 * 16), length = Buffer.alloc(4); blocks.fill(2,0,16*16); length.writeUInt32BE(blocks.length);
  return named(10, "ClassicWorld", Buffer.concat([
    ...[16,8,16].map((n,i)=>named(2,"XYZ"[i],short(n))),
    named(10,"Spawn",Buffer.concat([named(2,"X",short(4)),named(2,"Y",short(1)),named(2,"Z",short(4)),Buffer.from([0])])),
    named(7,"BlockArray",Buffer.concat([length,blocks])),Buffer.from([0]),
  ]));
};
const login = () => { const b=Buffer.alloc(131,32); b[0]=0; b[1]=7; return b; };
const block = (x,y,z,type) => { const b=Buffer.alloc(9);b[0]=5;b.writeUInt16BE(x,1);b.writeUInt16BE(y,3);b.writeUInt16BE(z,5);b[7]=1;b[8]=type;return b; };
const packets = bytes => {
  const result=[], sizes={0:131,2:1,3:1028,4:7,6:8,7:74,8:10,12:2,13:66,14:65};
  for(let offset=0;offset<bytes.length;){const size=sizes[bytes[offset]];assert.ok(size);result.push(bytes.subarray(offset,offset+size));offset+=size;}
  return result;
};
function fixture(t, compress = async b => gzipSync(b)) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'classicube-room-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const changes=[],room=new ClassicRoom(fs,decodeWorld(cw()),compress,(type,event)=>changes.push({type,...event}));
  const add = id => { const directory=path.join(root,String(id));fs.mkdirSync(directory);room.add(id,directory,'Player '+id);return room.clients.get(id); };
  const drain = client => { const files=fs.readdirSync(client.directory).filter(n=>n.startsWith('net.in.')).sort((a,b)=>+a.split('.').at(-1)-+b.split('.').at(-1));
    const result=Buffer.concat(files.map(n=>fs.readFileSync(path.join(client.directory,n))));files.forEach(n=>fs.unlinkSync(path.join(client.directory,n)));return packets(result); };
  return {room,add,drain,changes};
}
const joined = async (room, client) => { room.receive(client, login());await new Promise(r=>setImmediate(r));room.tick();assert.equal(client.connected,true); };

test('ClassicWorld parsing preserves the bytes used for durable block edits and rejects malformed input',()=>{
  const world=decodeWorld(cw());assert.deepEqual([world.width,world.height,world.length],[16,8,16]);
  world.blocks[300]=4;assert.equal(decodeWorld(world.data).blocks[300],4);
  assert.equal(world.spawn.X,4);
  for(const bytes of [Buffer.alloc(0),cw().subarray(0,12),Buffer.from([10,255,255])])assert.throws(()=>decodeWorld(bytes));
});
test('real Classic packets join two distinct players and replicate blocks and movement',async t=>{
  const {room,add,drain,changes}=fixture(t),a=add(1),b=add(2);
  await joined(room,a);const first=drain(a);assert.equal(first[0][0],0);
  const map=gunzipSync(Buffer.concat(first.filter(p=>p[0]===3).map(p=>p.subarray(3,3+p.readUInt16BE(1)))));
  assert.equal(map.readUInt32BE(0),room.world.blocks.length);assert.deepEqual(map.subarray(4),room.world.blocks);
  await joined(room,b);assert.ok(drain(b).some(p=>p[0]===7&&p[1]===1));assert.ok(drain(a).some(p=>p[0]===7&&p[1]===2));
  const update=block(4,1,4,5);room.receive(a,update.subarray(0,3));room.receive(a,update.subarray(3));room.tick();
  assert.equal(room.world.blocks[4+4*16+1*256],5);assert.equal(room.revision,1);
  for(const client of [a,b])assert.ok(drain(client).some(p=>p[0]===6&&p[7]===5));
  const move=Buffer.from([8,255,0,144,0,83,0,144,25,30]);room.receive(a,move);room.tick();
  assert.deepEqual(a.position,[144,83,144,25,30]);assert.ok(drain(b).some(p=>p[0]===8&&p[1]===1));
  room.remove(1);room.tick();assert.ok(drain(b).some(p=>p[0]===12&&p[1]===1));
  assert.ok(changes.some(e=>e.type==='block'&&e.player===1));
});
test('edits during a late join follow its map snapshot and a malformed client does not stop peers',async t=>{
  let finish;
  const {room,add,drain}=fixture(t, bytes=>new Promise(resolve=>finish=()=>resolve(gzipSync(bytes))));
  const a=add(1);room.receive(a,login());finish();await new Promise(r=>setImmediate(r));room.tick();drain(a);
  const b=add(2);room.receive(b,login());room.receive(a,block(4,1,4,20));finish();
  await new Promise(r=>setImmediate(r));room.tick();const received=drain(b);
  assert.ok(received.findIndex(p=>p[0]===6)>received.findIndex(p=>p[0]===4),'updates follow level finalisation');
  fs.writeFileSync(path.join(a.directory,'net.out.1'),Buffer.from([255]));room.tick();room.tick();assert.equal(drain(a).at(-1)[0],14);
  room.receive(b,block(5,1,4,4));room.tick();assert.equal(room.world.blocks[5+4*16+256],4);
});
test('chat preserves Classic character bytes and broadcasts the whole message to every client',async t=>{
  const {room,add,drain,changes}=fixture(t),a=add(1),b=add(2);
  await joined(room,a);await joined(room,b);drain(a);drain(b);
  const message=Buffer.concat([Buffer.from("Hello! "),Buffer.from([0x82]),Buffer.from('x'.repeat(56))]);
  const request=Buffer.alloc(66,32);request[0]=13;request[1]=255;message.copy(request,2);
  room.receive(a,request);room.tick();
  for(const client of [a,b]) {
    const lines=drain(client).filter(p=>p[0]===13);
    assert.equal(lines.length,2,'the name prefix must not truncate a full chat message');
    const received=Buffer.concat(lines.map(p=>p.subarray(2)));
    const expected=Buffer.concat([Buffer.from('Player 1: '),message]);
    assert.deepEqual(received.subarray(0,expected.length),expected);
  }
  assert.deepEqual(changes.find(e=>e.type==='chat').bytes,Array.from(message));
});
