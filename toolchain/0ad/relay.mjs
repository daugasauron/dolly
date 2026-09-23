import {randomBytes} from "node:crypto";
import {createServer} from "node:http";

const MAGIC = 0x4e594c44, DATAGRAM = 4096, QUEUE_BYTES = 65536;
const reject = status => { throw Object.assign(new Error("Relay request rejected"), {status}); };

// A room routes only bounded datagrams between its pre-created participants.
// It never opens UDP/TCP destinations or loads game code/files.
export function createRelayRoom(participantCount = 2, clock = Date.now) {
  if (!Number.isInteger(participantCount) || participantCount < 2 || participantCount > 8) throw Error("Room needs 2–8 participants");
  const participants = Array.from({length: participantCount}, (_, index) => ({
    path: `/relay/${randomBytes(24).toString("base64url")}`,
    host: Buffer.from([10, 0, 0, index + 1]).readUInt32LE(), sockets: new Map(),
    nextPort: 49152, requests: 0, window: clock()
  }));
  let nextLease = 1;
  const counters = {requests: 0, sent: 0, received: 0, dropped: 0, bytes: 0, peakQueuedBytes: 0};
  function status() {
    const sockets = participants.flatMap(peer => [...peer.sockets.values()]);
    const queuedBytes = sockets.reduce((sum, socket) => sum + socket.bytes, 0);
    counters.peakQueuedBytes = Math.max(counters.peakQueuedBytes, queuedBytes);
    return {...counters, sockets: sockets.length, queuedBytes};
  }
  function reply(host = 0, port = 0, value = 0, data = Buffer.alloc(0)) {
    const bytes = Buffer.alloc(16 + data.length);
    [MAGIC, host, port, value].forEach((number, index) => bytes.writeUInt32LE(number, index * 4));
    data.copy(bytes, 16); return bytes;
  }
  function dispatch(path, bytes) {
    const peer = participants.find(peer => peer.path === path);
    if (!peer) reject(403);
    const now = clock();
    if (now - peer.window >= 1000) { peer.requests = 0; peer.window = now; }
    if (++peer.requests > 1000) reject(429);
    if (bytes.length < 16 || bytes.length > 24 + DATAGRAM || bytes.readUInt32LE(0) !== MAGIC) reject(400);
    const op = bytes.readUInt32LE(4), lease = bytes.readUInt32LE(8), arg = bytes.readUInt32LE(12);
    for (const participant of participants) for (const [id, socket] of participant.sockets)
      if (now - socket.seen > 60000) participant.sockets.delete(id);
    ++counters.requests;
    if (op === 0 || op === 1) {
      if (lease || bytes.length !== 16 || arg > 65535 || (op === 0 && arg)) reject(400);
      if (op === 0) return reply(peer.host);
      if (peer.sockets.size >= 8 || nextLease > 0xffffffff) reject(429);
      const used = port => [...peer.sockets.values()].some(socket => socket.port === port);
      let port = arg;
      if (!port) {
        do { port = peer.nextPort++; if (peer.nextPort > 65535) peer.nextPort = 49152; } while (used(port));
      }
      if (used(port)) reject(409);
      const id = nextLease++;
      peer.sockets.set(id, {port, seen: now, queue: [], bytes: 0});
      return reply(peer.host, port, id);
    }
    const socket = peer.sockets.get(lease);
    if (!socket) reject(410);
    socket.seen = now;
    if (op === 2) {
      if (!arg || arg > DATAGRAM || bytes.length !== 24 + arg) reject(400);
      const host = bytes.readUInt32LE(16), port = bytes.readUInt32LE(20);
      if (!port || port > 65535) reject(400);
      const destination = participants.find(peer => peer.host === host);
      if (!destination) reject(403);
      const target = [...destination.sockets.values()].find(socket => socket.port === port);
      ++counters.sent; counters.bytes += arg;
      if (!target || target.queue.length >= 64 || target.bytes + arg > QUEUE_BYTES) ++counters.dropped;
      else {
        target.queue.push({host: peer.host, port: socket.port, data: Buffer.from(bytes.subarray(24))});
        target.bytes += arg; status();
      }
      return reply();
    }
    if (bytes.length !== 16 || arg) reject(400);
    if (op === 3) {
      const packet = socket.queue.shift();
      if (!packet) return reply();
      socket.bytes -= packet.data.length; ++counters.received;
      return reply(packet.host, packet.port, packet.data.length, packet.data);
    }
    if (op === 4) { peer.sockets.delete(lease); return reply(); }
    reject(400);
  }
  async function handle(request, response, allowedOrigin) {
    response.setHeader("cache-control", "no-store");
    response.setHeader("cross-origin-resource-policy", "cross-origin");
    if (request.headers.origin === allowedOrigin) {
      response.setHeader("access-control-allow-origin", allowedOrigin);
      response.setHeader("access-control-allow-methods", "POST");
      response.setHeader("access-control-allow-headers", "content-type");
      response.setHeader("vary", "origin");
    }
    try {
      if (!participants.some(peer => peer.path === request.url)) reject(403);
      if (request.method === "OPTIONS") { response.writeHead(204).end(); return; }
      if (request.method !== "POST") reject(405);
      let size = 0; const chunks = [];
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 24 + DATAGRAM) reject(413);
        chunks.push(chunk);
      }
      const result = dispatch(request.url, Buffer.concat(chunks, size));
      response.writeHead(200, {"content-type": "application/octet-stream"}).end(result);
    } catch (error) { if (!response.destroyed) response.writeHead(error.status ?? 500).end(); }
  }
  return {endpoints: participants.map((peer, index) => ({path: peer.path,
    address: `10.0.0.${index + 1}`})), dispatch, handle, status};
}

if (process.argv[1] === import.meta.filename) {
  const [port = "8090", origin] = process.argv.slice(2);
  if (!origin) throw Error("usage: node toolchain/0ad/relay.mjs PORT BROWSER_ORIGIN");
  const allowedOrigin = new URL(origin).origin, room = createRelayRoom();
  const server = createServer((request, response) => void room.handle(request, response, allowedOrigin));
  server.requestTimeout = 10000;
  server.maxConnections = 32;
  server.listen(Number(port), "127.0.0.1", () => {
    for (const [index, peer] of room.endpoints.entries())
      console.log(`Player ${index + 1}: ${peer.address}; DOLLY_ENET_RELAY=http://127.0.0.1:${server.address().port}${peer.path}`);
  });
}
