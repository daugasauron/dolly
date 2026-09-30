// Classic protocol server; transport and world state live in Dolly's filesystem.
// SPDX-License-Identifier: MIT
import { writeAtomic } from "./settings.mjs";

const view = bytes => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

export function decodeWorld(data) {
  let offset = 0;
  const take = size => {
    if (!Number.isSafeInteger(size) || size < 0 || offset + size > data.length) throw Error("Truncated ClassicWorld file");
    const start = offset; offset += size; return start;
  };
  const string = () => { const size = view(data).getUint16(take(2)); return data.subarray(take(size), offset).toString("utf8"); };
  function value(type, depth = 0) {
    if (depth > 32) throw Error("ClassicWorld nesting is too deep");
    if (type === 1) return view(data).getUint8(take(1));
    if (type === 2) return view(data).getInt16(take(2));
    if (type === 3) return view(data).getInt32(take(4));
    if (type === 4 || type === 6) { take(8); return; }
    if (type === 5) { take(4); return; }
    if (type === 8) return string();
    if ([7,11,12].includes(type)) {
      const length = view(data).getInt32(take(4)) * (type === 7 ? 1 : type === 11 ? 4 : 8);
      return data.subarray(take(length), offset);
    }
    if (type === 9) {
      const item = view(data).getUint8(take(1)), count = view(data).getInt32(take(4));
      if (count < 0 || count > data.length) throw Error("Invalid ClassicWorld list");
      for (let n = 0; n < count; n++) value(item, depth + 1);
      return;
    }
    if (type !== 10) throw Error("Invalid ClassicWorld tag");
    const fields = Object.create(null);
    for (;;) {
      const next = view(data).getUint8(take(1)); if (!next) return fields;
      const name = string(); fields[name] = value(next, depth + 1);
    }
  }
  if (view(data).getUint8(take(1)) !== 10) throw Error("Expected a ClassicWorld compound");
  string(); const world = value(10), { X: width, Y: height, Z: length, BlockArray: blocks } = world;
  if (![width,height,length].every(n => Number.isInteger(n) && n > 0 && n <= 1023) ||
      !Buffer.isBuffer(blocks) || blocks.length !== width * height * length || world.BlockArray2?.some(n => n))
    throw Error("World does not fit the Classic multiplayer protocol");
  return { data, width, height, length, blocks, spawn: world.Spawn || {} };
}
const packet = (id, size) => { const bytes = Buffer.alloc(size); bytes[0] = id; return bytes; };
const string = (bytes, offset, text) => { bytes.fill(32, offset, offset + 64); Buffer.from(text).copy(bytes, offset, 0, 64); };
const position = (bytes, offset, values) => {
  for (let i = 0; i < 3; i++) view(bytes).setUint16(offset + i * 2, values[i]);
  bytes[offset + 6] = values[3]; bytes[offset + 7] = values[4];
};

export class ClassicRoom {
  constructor(fs, world, compress, changed = () => {}) {
    this.fs = fs; this.world = world; this.compress = compress; this.changed = changed;
    this.clients = new Map(); this.revision = 0;
  }
  add(id, directory, name, savedPosition) {
    if (!Number.isInteger(id) || id < 1 || id > 254 || this.clients.has(id)) throw Error("Invalid player ID");
    const w = this.world;
    const x = Math.max(1, Math.min(w.width - 2, (w.spawn.X || w.width / 2) + (id - 1) * 2));
    const z = Math.max(1, Math.min(w.length - 2, w.spawn.Z || w.length / 2));
    let y = w.height - 1;
    while (y > 0 && !w.blocks[Math.floor(x) + Math.floor(z) * w.width + y * w.width * w.length]) y--;
    const spawn = [Math.floor(x) * 32 + 16, Math.min(y + 1, w.height) * 32 + 51, Math.floor(z) * 32 + 16, w.spawn.H || 0, w.spawn.P || 0];
    const valid = Array.isArray(savedPosition) && savedPosition.length === 5 && savedPosition.every((v,i) => Number.isInteger(v) && v >= (i < 3 ? -32768 : 0) && v <= (i < 3 ? 32767 : 255));
    this.clients.set(id, { id, directory, name, position: valid ? savedPosition : spawn, input: Buffer.alloc(0), inSerial: 0, outSerial: 0, out: [], connected: false, joining: false });
  }
  remove(id) {
    if (!this.clients.delete(id)) return;
    const gone = packet(12, 2); gone[1] = id; this.broadcast(gone);
  }
  broadcast(bytes, except = 0, joining = false) {
    for (const client of this.clients.values()) if (client.id !== except && (client.connected || (joining && client.joining))) client.out.push(bytes);
  }
  spawn(client, self = false) {
    const p = packet(7, 74); p[1] = self ? 255 : client.id; string(p, 2, client.name); position(p, 66, client.position); return p;
  }
  async join(client) {
    client.joining = true; client.connected = false;
    try {
      const w = this.world, level = Buffer.alloc(w.blocks.length + 4);
      level.writeUInt32BE(w.blocks.length, 0); w.blocks.copy(level, 4);
      const compressed = await this.compress(level);
      if (this.clients.get(client.id) !== client || client.failed) return;
      const hello = packet(0, 131); hello[1] = 7;
      string(hello, 2, "Dolly shared world"); string(hello, 66, "Build and explore together"); hello[130] = 100;
      const packets = [hello, packet(2, 1)];
      for (let offset = 0; offset < compressed.length; offset += 1024) {
        const count = Math.min(1024, compressed.length - offset), chunk = packet(3, 1028);
        view(chunk).setUint16(1, count); compressed.copy(chunk, 3, offset, offset + count);
        chunk[1027] = Math.floor((offset + count) * 100 / compressed.length); packets.push(chunk);
      }
      const end = packet(4, 7); view(end).setUint16(1, w.width); view(end).setUint16(3, w.height); view(end).setUint16(5, w.length);
      packets.push(end, this.spawn(client, true));
      for (const peer of this.clients.values()) if (peer.connected && peer !== client) packets.push(this.spawn(peer));
      this.broadcast(this.spawn(client), client.id);
      client.out = packets.concat(client.out); client.connected = true; client.joining = false;
      this.changed("join", { player: client.id });
    } catch (error) { this.fail(client, error); }
  }
  fail(client, error) {
    const kick = packet(14, 65); string(kick, 1, String(error.message));
    client.out = [kick]; client.connected = false; client.joining = false; client.failed = true; client.input = Buffer.alloc(0);
    this.changed("error", { player: client.id, message: error.message });
  }
  receive(client, bytes) {
    if (client.failed) return;
    client.input = Buffer.concat([client.input, bytes]);
    if (client.input.length > 1024 * 1024) throw Error("Oversized Classic client input");
    const sizes = { 0: 131, 1: 1, 5: 9, 8: 10, 13: 66 };
    let offset = 0;
    while (offset < client.input.length) {
      const id = client.input[offset], size = sizes[id];
      if (!size) throw Error(`Unsupported Classic packet ${id}`);
      if (offset + size > client.input.length) break;
      const p = client.input.subarray(offset, offset + size); offset += size;
      if (id === 0) {
        if (p[1] !== 7 || client.joining || client.connected) throw Error("Invalid Classic handshake");
        void this.join(client);
      } else if (!client.connected) continue;
      else if (id === 8) {
        client.position = [view(p).getInt16(2),view(p).getInt16(4),view(p).getInt16(6),p[8],p[9]];
        const move = Buffer.from(p); move[1] = client.id; this.broadcast(move, client.id);
      } else if (id === 5) {
        const w = this.world, x = view(p).getUint16(1), y = view(p).getUint16(3), z = view(p).getUint16(5);
        if (x >= w.width || y >= w.height || z >= w.length || p[7] > 1 || p[8] > 49) continue;
        const block = p[7] ? p[8] : 0, at = x + z * w.width + y * w.width * w.length;
        const previous = w.blocks[at]; w.blocks[at] = block;
        const update = packet(6, 8); p.copy(update, 1, 1, 7); update[7] = block;
        this.broadcast(update, 0, true);
        if (previous !== block) { ++this.revision; this.changed("block", { player: client.id, x, y, z, previous, block, revision: this.revision }); }
      } else if (id === 13) {
        let end = p.length; while (end > 2 && (p[end - 1] === 32 || p[end - 1] === 0)) --end;
        const message = p.subarray(2, end);
        if (!message.length) continue;
        const line = Buffer.concat([Buffer.from(`${client.name}: `), message]);
        for (let offset = 0; offset < line.length; offset += 64) {
          const chat = packet(13, 66); chat.fill(32, 2); line.copy(chat, 2, offset, offset + 64); this.broadcast(chat);
        }
        this.changed("chat", { player: client.id, bytes: Array.from(message) });
      }
    }
    client.input = Buffer.from(client.input.subarray(offset));
  }
  tick() {
    for (const client of this.clients.values()) {
      try {
        for (let n = 0; n < 64; n++) {
          const path = `${client.directory}/net.out.${client.inSerial + 1}`;
          if (!this.fs.existsSync(path)) break;
          const bytes = this.fs.readFileSync(path); this.fs.unlinkSync(path); ++client.inSerial;
          this.receive(client, bytes);
        }
        if ((client.connected || client.failed) && client.out.length) {
          writeAtomic(this.fs, `${client.directory}/net.in.${++client.outSerial}`, Buffer.concat(client.out)); client.out = [];
        }
      } catch (error) { this.fail(client, error); }
    }
  }
}
