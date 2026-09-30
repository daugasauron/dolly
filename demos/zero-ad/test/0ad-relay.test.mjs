import assert from "node:assert/strict";
import test from "node:test";
import {createRelayRoom} from "../toolchain/relay.mjs";

function request(op, lease = 0, arg = 0, payload = Buffer.alloc(0)) {
  const bytes = Buffer.alloc(16 + payload.length);
  [0x4e594c44, op, lease, arg].forEach((n, i) => bytes.writeUInt32LE(n, i * 4));
  payload.copy(bytes, 16); return bytes;
}
function datagram(host, port, length) {
  const bytes = Buffer.alloc(8 + length, 123);
  bytes.writeUInt32LE(host, 0); bytes.writeUInt32LE(port, 4); return bytes;
}
const rejected = (fn, status) => assert.throws(fn, error => error.status === status);

test("relay assigns packet sources and confines traffic to the capability's room", () => {
  const room = createRelayRoom(), [a, b] = room.endpoints.map(peer => peer.path);
  const one = room.dispatch(a, request(1, 0, 20595)), two = room.dispatch(b, request(1));
  const leaseA = one.readUInt32LE(12), leaseB = two.readUInt32LE(12);
  const hostA = one.readUInt32LE(4), hostB = two.readUInt32LE(4), portB = two.readUInt32LE(8);
  rejected(() => room.dispatch(a + "/anything", request(0)), 403);
  rejected(() => room.dispatch(a, request(1, 0, 20595)), 409);
  rejected(() => room.dispatch(b, request(4, leaseA)), 410);
  rejected(() => room.dispatch(a, request(2, leaseA, 10, datagram(0x0100007f, 80, 10))), 403);
  rejected(() => room.dispatch(a, request(2, leaseA, 11, datagram(hostB, portB, 10))), 400);
  const bytes = request(2, leaseA, 10, datagram(hostB, portB, 10));
  room.dispatch(a, bytes); bytes.fill(255);
  const received = room.dispatch(b, request(3, leaseB));
  assert.equal(received.readUInt32LE(4), hostA);
  assert.equal(received.readUInt32LE(8), 20595);
  assert.equal(received.readUInt32LE(12), 10);
  assert.ok(received.subarray(16).every(n => n === 123), "Queued datagram retained caller bytes");
  assert.equal(room.dispatch(b, request(3, leaseB)).readUInt32LE(12), 0);
  room.dispatch(a, request(4, leaseA)); room.dispatch(b, request(4, leaseB));
  assert.equal(room.status().sockets, 0);
  rejected(() => room.dispatch(a, request(3, leaseA)), 410);
});

test("relay bounds bytes, datagrams, sockets, request rate and abandoned leases", () => {
  let now = 100000;
  const room = createRelayRoom(2, () => now), [a, b] = room.endpoints.map(peer => peer.path);
  const one = room.dispatch(a, request(1)), two = room.dispatch(b, request(1));
  const leaseA = one.readUInt32LE(12), leaseB = two.readUInt32LE(12);
  const send = size => room.dispatch(a, request(2, leaseA, size,
    datagram(two.readUInt32LE(4), two.readUInt32LE(8), size)));
  for (let i = 0; i < 17; ++i) send(4096);
  assert.equal(room.status().queuedBytes, 65536);
  assert.equal(room.status().dropped, 1);
  for (let i = 0; i < 16; ++i) assert.equal(room.dispatch(b, request(3, leaseB)).readUInt32LE(12), 4096);
  for (let i = 0; i < 65; ++i) send(1);
  assert.equal(room.status().queuedBytes, 64);
  assert.equal(room.status().dropped, 2);
  for (let i = 0; i < 7; ++i) room.dispatch(a, request(1));
  rejected(() => room.dispatch(a, request(1)), 429);
  rejected(() => send(4097), 400);
  let limited = false;
  for (let i = 0; i < 1001; ++i) {
    try { room.dispatch(b, request(0)); } catch (error) { assert.equal(error.status, 429); limited = true; break; }
  }
  assert.ok(limited);
  now += 60001;
  room.dispatch(a, request(0));
  assert.equal(room.status().sockets, 0);
  assert.equal(room.status().queuedBytes, 0);
  rejected(() => room.dispatch(a, request(3, leaseA)), 410);
});
