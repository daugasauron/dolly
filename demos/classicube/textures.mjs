#!/usr/bin/env node
// usage: textures.mjs OUTPUT.zip
// Writes Dolly's own ClassiCube default.zip (MIT): procedural block tiles in
// terrain.png and a plain hotbar in gui.png. Upstream's cc_textures.zip names
// no licence, so Dolly does not redistribute it.
import { writeFile } from "node:fs/promises";
import { crc32, deflateSync } from "node:zlib";

function png(width, height, pixel) {
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    rows.set(pixel(x, y), y * (width * 4 + 1) + 1 + x * 4);
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const frame = Buffer.alloc(body.length + 8);
    frame.writeUInt32BE(data.length);
    body.copy(frame, 4);
    frame.writeUInt32BE(crc32(body), body.length + 4);
    return frame;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from("\x89PNG\r\n\x1a\n", "latin1"), chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// Stored entries with fixed times: the same bytes on every run.
function zip(files) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, data] of files) {
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    local.copy(central, 8, 6, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, Buffer.from(name), data);
    centrals.push(central, Buffer.from(name));
    offset += 30 + name.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const noise = (x, y, seed) => {
  let h = Math.imul(x * 374761393 + y * 668265263 + seed * 2147483647, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) & 255) / 255;
};
// Base colours of the classic tiles ClassiCube's blocks use, by atlas index.
const tiles = new Map(Object.entries({
  0: [96, 160, 64], 1: [128, 128, 128], 2: [134, 96, 67], 3: [134, 96, 67], 4: [176, 140, 88],
  5: [168, 168, 168], 6: [190, 190, 190], 7: [150, 74, 58], 8: [200, 60, 50], 9: [210, 70, 60],
  10: [200, 60, 50], 14: [50, 90, 210], 15: [120, 160, 60], 16: [110, 110, 110], 17: [60, 60, 60],
  18: [218, 206, 150], 19: [136, 126, 126], 20: [102, 80, 50], 21: [160, 130, 82], 22: [60, 130, 40],
  23: [220, 220, 220], 24: [232, 200, 70], 25: [110, 220, 220], 30: [230, 100, 20], 32: [140, 130, 120],
  33: [150, 120, 90], 34: [120, 120, 130], 35: [100, 100, 100], 36: [80, 160, 60], 37: [130, 90, 70],
  48: [190, 230, 240], 49: [40, 30, 50], 64: [220, 60, 60], 65: [230, 140, 50], 66: [230, 230, 60],
  67: [140, 220, 50], 68: [60, 200, 60], 69: [60, 200, 130], 70: [60, 210, 210], 71: [90, 160, 230],
  72: [120, 110, 230], 73: [150, 80, 230], 74: [200, 80, 230], 75: [230, 70, 200], 76: [230, 80, 140],
  77: [70, 70, 70], 78: [150, 150, 150], 79: [240, 240, 240],
}).map(([index, colour]) => [Number(index), colour]));
const terrain = png(256, 256, (x, y) => {
  const index = (y >> 4) * 16 + (x >> 4), [r, g, b] = tiles.get(index) ?? [150, 150, 150];
  const shade = 0.75 + 0.5 * noise(x, y, index);
  // Grass sides keep a green top edge.
  const grass = index === 3 && (y & 15) < 4;
  const [cr, cg, cb] = grass ? [96, 160, 64] : [r, g, b];
  const clamp = value => Math.max(0, Math.min(255, Math.round(value * shade)));
  const glass = index === 49 || index === 48;
  return [clamp(cr), clamp(cg), clamp(cb), glass && (x & 15) > 0 && (x & 15) < 15 && (y & 15) > 0 && (y & 15) < 15 ? 0 : 255];
});
// gui.png: the hotbar (0,0 182x22) and its selection frame (0,22 24x24).
const gui = png(256, 256, (x, y) => {
  if (x < 182 && y < 22) return (x < 2 || x > 179 || y < 2 || y > 19 || (x - 1) % 20 < 2) ? [40, 40, 40, 255] : [90, 90, 90, 160];
  if (x < 24 && y >= 22 && y < 46) return (x < 2 || x > 21 || y < 24 || y > 43) ? [240, 240, 240, 255] : [0, 0, 0, 0];
  return [0, 0, 0, 0];
});
if (!process.argv[2]) throw new Error("usage: textures.mjs OUTPUT.zip");
await writeFile(process.argv[2], zip([["gui.png", gui], ["terrain.png", terrain]]));
