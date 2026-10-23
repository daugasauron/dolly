// node raise-tengu.mjs DESIGNS.lua NAME...: lifts the bearing, mast and arm of each named Tengu one block
// on a 3x3 spacer over its base, and its loading pedestal one block on a support box.
import fs from 'node:fs';
const [file, ...names] = process.argv.slice(2);
const lines = fs.readFileSync(file, 'utf8').split('\n');
const parse = text => [...text.matchAll(/\["([a-z]+)"\]=(-?[0-9.]+)/g)].map(m => [m[1], Number(m[2])]);
const write = fields => '{' + fields.map(([k, v]) => `["${k}"]=${v}`).join(',') + '}';
const get = (fields, key) => fields.find(([k]) => k === key)?.[1];
const set = (fields, key, value) => fields.map(([k, v]) => [k, k === key ? value : v]);
for (const name of names) {
  const i = lines.findIndex(l => l.includes(`["name"]="${name}"`));
  if (i < 0) throw new Error(name);
  const line = lines[i];
  const start = line.indexOf('["blueprint"]=array{') + '["blueprint"]=array{'.length;
  let depth = 1, end = start;
  for (; end < line.length; end++) { if (line[end] === '{') depth++; else if (line[end] === '}' && --depth === 0) break; }
  const blocks = line.slice(start + 1, end - 1).split('},{').map(parse);
  const base = blocks.slice(0, 13);
  if (base.some(b => get(b, 'y') !== 0) || get(blocks[13], 'joint') !== 2 || get(blocks[14], 'joint') !== 7) throw new Error(`${name}: unexpected layout`);
  const at = (x, z) => base.findIndex(b => get(b, 'x') === x && get(b, 'z') === z);
  const out = [...base];
  out.push(set(base[12], 'x', get(blocks[13], 'x')).map(([k, v]) => [k, k === 'parent' ? 12 : v]));        // 13: pedestal support
  out.push(set(set(blocks[13], 'y', 1), 'parent', 13));                                                     // 14: pedestal
  const spacers = [[0, 0], [-1, 0], [0, -1], [0, 1], [1, 0], [-1, -1], [-1, 1], [1, -1], [1, 1]];
  for (const [x, z] of spacers) out.push(set(set(base[at(x, z)], 'y', 1), 'parent', at(x, z)));               // 15..23
  const spacer = (x, z) => 15 + spacers.findIndex(([a, b]) => a === x && b === z);
  for (const b of blocks.slice(14)) {
    let parent = get(b, 'parent');
    if (parent <= 12) { parent = spacer(get(blocks[parent], 'x'), get(blocks[parent], 'z')); if (parent < 15) throw new Error(`${name}: no spacer under a raised block`); }
    else if (parent === 13) parent = 14;
    else parent += 10;
    out.push(set(set(b, 'y', get(b, 'y') + 1), 'parent', parent));
  }
  lines[i] = line.slice(0, start + 1) + out.map(write).join(',').slice(1, -1) + line.slice(end - 1);
}
fs.writeFileSync(file, lines.join('\n'));
