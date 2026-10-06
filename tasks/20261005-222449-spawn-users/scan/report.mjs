// node report.mjs OUT_DIR > report.json ; prints tables to stderr
import { readFileSync, readdirSync } from "node:fs";
const out = process.argv[2];
const images = JSON.parse(readFileSync(`${out}/images.json`));
const packs = {}, wasm = {};
for (const file of readdirSync(out)) {
  if (!file.startsWith("shard-")) continue;
  const shard = JSON.parse(readFileSync(`${out}/${file}`));
  Object.assign(packs, shard.packs); Object.assign(wasm, shard.wasm);
}
const SPAWN = 64, WAIT = 65, SIGNAL = 68, DSO = [112, 113, 114], FFI = [120, 121, 122, 123];
const has = (entry, ...numbers) => numbers.some(number => entry.ops?.includes(number));
// -rdynamic executables export every symbol, the process call included.
const rdynamic = entry => entry.indirect?.some(label => label.endsWith(":export")) ?? false;
function kind(entry) {
  if (entry.error) return "error";
  if (entry.processCall >= 0 && entry.start) return "executable";
  if (entry.customs.includes("dolly.process.dso")) return "dso";
  if (entry.customs.includes("dolly.abi")) return "kernel-plugin";
  if (entry.customs.includes("dylink.0")) return "dylink";
  return "other";
}
const unique = new Map(); // sha -> {paths:Set, images:Set}
const rows = [];
for (const [name, image] of Object.entries(images).sort()) {
  const files = image.packs.flatMap(pack => packs[pack] ?? []);
  const row = { image: name, entry: image.entry, host: image.host, executables: 0, spawn: 0, waitOnly: 0, signal: 0, dsoClient: 0,
    ffiClient: 0, rdynamic: 0, dsoOpen: 0, dsoFiles: 0, plugins: 0, otherWasm: 0, scripts: 0, unresolved: 0, noCall: 0,
    spawnPaths: [], dsoPaths: [], ffiPaths: [], signalPaths: [] };
  for (const [path, type, value] of files) {
    if (type === "script") { if (/\/(s?bin|libexec)\//.test(path)) row.scripts += 1; continue; }
    if (type !== "wasm") continue;
    const entry = wasm[value], what = kind(entry);
    if (!unique.has(value)) unique.set(value, { paths: new Set(), images: new Set() });
    unique.get(value).paths.add(path); unique.get(value).images.add(name);
    if (what === "dso" || what === "dylink") { row.dsoFiles += 1; continue; }
    if (what === "kernel-plugin") { row.plugins += 1; continue; }
    if (what !== "executable") { row.otherWasm += 1; continue; }
    row.executables += 1;
    if (entry.unresolved) row.unresolved += 1;
    if (has(entry, SPAWN)) { row.spawn += 1; row.spawnPaths.push(path); }
    else if (has(entry, WAIT)) row.waitOnly += 1;
    if (has(entry, SIGNAL)) { row.signal += 1; row.signalPaths.push(path); }
    if (has(entry, ...DSO)) { row.dsoClient += 1; row.dsoPaths.push(path); }
    if (has(entry, ...FFI)) { row.ffiClient += 1; row.ffiPaths.push(path); }
    if (rdynamic(entry)) row.rdynamic += 1;
    if (has(entry, 112)) row.dsoOpen += 1;
  }
  rows.push(row);
}
const table = rows.map(row => [row.image, row.entry ? "yes" : "-", row.executables, row.spawn, row.executables - row.spawn, row.signal,
  row.dsoClient, row.rdynamic, row.ffiClient, row.dsoFiles, row.plugins, row.unresolved]);
console.error(["image", "ENTRY", "exe", "spawn", "no-spawn", "signal", "dso-client", "rdynamic", "ffi", "dso-files", "plugins", "unresolved"].join("\t"));
for (const line of table) console.error(line.join("\t"));

// Unique executables across the catalog.
const totals = { wasm: unique.size, executable: 0, spawn: 0, waitOnly: 0, signal: 0, signalOnly: 0, dso: 0, ffi: 0, unresolved: 0, kinds: {},
  spawnVia: {}, noName: 0, rdynamic: 0, dsoOpen: 0 };
const spawners = [], dsoUsers = [], oddities = [];
for (const [sha, where] of unique) {
  const entry = wasm[sha], what = kind(entry);
  totals.kinds[what] = (totals.kinds[what] ?? 0) + 1;
  if (what !== "executable") continue;
  totals.executable += 1;
  const paths = [...where.paths].sort();
  if (entry.unresolved) { totals.unresolved += 1; oddities.push([paths[0], entry.unresolved, entry.candidates.join(",")]); }
  if (!entry.have) totals.noName += 1;
  if (rdynamic(entry)) totals.rdynamic += 1;
  if (has(entry, 112)) totals.dsoOpen += 1;
  if (has(entry, SPAWN)) {
    totals.spawn += 1;
    const have = entry.have ?? [];
    const via = rdynamic(entry) ? "-rdynamic (everything retained)"
      : !entry.have ? "no name section"
      : [have.includes("posix_spawn") || have.includes("posix_spawnp") || have.includes("spawn") ? "posix_spawn" : null,
         have.includes("system") ? "system" : null, have.includes("popen") ? "popen" : null,
         have.some(name => name.startsWith("dolly_spawn")) ? "dolly_spawn*" : null].filter(Boolean).join("+") || "other";
    totals.spawnVia[via] = (totals.spawnVia[via] ?? 0) + 1;
    spawners.push({ path: paths[0], others: paths.length - 1, images: where.images.size, via, size: entry.size, sites: entry.sites?.[64] });
  } else if (has(entry, WAIT)) totals.waitOnly += 1;
  if (has(entry, SIGNAL)) { totals.signal += 1; if (!has(entry, SPAWN)) totals.signalOnly += 1; }
  if (has(entry, ...DSO)) { totals.dso += 1; dsoUsers.push({ path: paths[0], images: [...where.images].sort(), open: has(entry, 112), rdynamic: rdynamic(entry), ffi: has(entry, ...FFI), threads: entry.host.includes("threads@0") }); }
  if (has(entry, ...FFI)) totals.ffi += 1;
}
console.error(JSON.stringify(totals, null, 1));
console.log(JSON.stringify({ rows, totals, spawners, dsoUsers, oddities }, null, 1));
