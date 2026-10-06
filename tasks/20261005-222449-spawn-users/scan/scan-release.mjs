// node scan-release.mjs RELEASE_DIST OUT_DIR [image ...]
// Reads every snapshot pack of the sealed release once, finds Wasm files and
// records which process operations each one can reach.
import { fork } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { scan } from "./wasm-ops.mjs";

const INTERESTING = ["posix_spawn", "posix_spawnp", "system", "popen", "pclose", "dolly_spawn", "dolly_spawn_foreground",
  "dolly_spawn_timeout", "dolly_spawn_env_timeout", "dolly_spawn_env_cwd", "dolly_spawn_mapped", "spawn_mapped", "spawn",
  "dolly_wait", "dolly_waitpid", "wait_process", "waitpid", "wait", "wait4", "__syscall_wait4", "kill", "dolly_kill",
  "dolly_dlopen", "dlopen", "dolly_dlsym", "dlsym", "ffi_call", "ffi_prep_closure_loc", "ffi_closure_alloc",
  "execv", "execve", "execvp", "fork", "vfork", "wordexp", "main", "__main_argc_argv", "raise", "abort"];
const decoder = new TextDecoder();

function records(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (decoder.decode(bytes.subarray(0, 8)) !== "DOLLYSNP") throw new Error("not a snapshot pack");
  const count = view.getUint32(12, true), result = [];
  let offset = 16;
  for (let index = 0; index < count; index += 1) {
    const kind = view.getUint32(offset, true), pathLength = view.getUint32(offset + 4, true);
    const size = Number(view.getBigUint64(offset + 8, true));
    offset += 16;
    const path = decoder.decode(bytes.subarray(offset, offset + pathLength));
    offset += pathLength;
    result.push({ kind, path, data: bytes.subarray(offset, offset + size) });
    offset += size;
  }
  return result;
}

if (process.argv[2] === "--worker") {
  const [, , , dist, out, shard, ...packs] = process.argv;
  const packFiles = {}, wasm = {};
  for (const pack of packs) {
    const bytes = gunzipSync(readFileSync(`${dist}/packs/${pack}.snapshot.gz`), { maxOutputLength: 2 ** 31 });
    const files = [];
    for (const { kind, path, data } of records(bytes)) {
      if (kind === 3) { files.push([path, "link", decoder.decode(data)]); continue; }
      if (kind !== 2) continue;
      if (data.length >= 8 && data[0] === 0 && data[1] === 0x61 && data[2] === 0x73 && data[3] === 0x6d) {
        const sha = createHash("sha256").update(data).digest("hex");
        if (!wasm[sha]) {
          try {
            const result = scan(data);
            result.have = result.names ? INTERESTING.filter(name => [...result.names.values()].includes(name)) : null;
            result.named = result.names ? result.names.size : 0;
            delete result.names;
            wasm[sha] = result;
          } catch (error) { wasm[sha] = { error: String(error.message), size: data.length }; }
        }
        files.push([path, "wasm", sha]);
      } else if (data[0] === 0x23 && data[1] === 0x21) {
        const line = decoder.decode(data.subarray(0, Math.min(data.length, 120))).split("\n")[0];
        files.push([path, "script", line]);
      }
    }
    packFiles[pack] = files;
  }
  writeFileSync(`${out}/shard-${shard}.json`, JSON.stringify({ packs: packFiles, wasm }));
  process.exit(0);
}

const [dist, out, ...only] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const images = {};
for (const file of readdirSync(dist)) {
  const match = /^dolly-(.+)-system-snapshot\.mjs$/.exec(file);
  if (!match || (only.length && !only.includes(match[1]))) continue;
  const { DOLLY_SYSTEM_SNAPSHOT: meta } = await import(`${dist}/${file}`);
  images[meta.image] = { entry: meta.entry ?? null, host: meta.hostRequirements, byteLength: meta.byteLength,
    packs: meta.packs.map(pack => pack.sha256), packBytes: Object.fromEntries(meta.packs.map(pack => [pack.sha256, [pack.byteLength, pack.encodedByteLength]])) };
}
writeFileSync(`${out}/images.json`, JSON.stringify(images));
const sizes = new Map();
for (const image of Object.values(images)) for (const [sha, [bytes]] of Object.entries(image.packBytes)) sizes.set(sha, bytes);
const todo = [...sizes].sort((a, b) => b[1] - a[1]);
const jobs = Number(process.env.JOBS ?? 5), shards = Array.from({ length: jobs }, () => ({ bytes: 0, packs: [] }));
for (const [sha, bytes] of todo) {
  const shard = shards.reduce((least, current) => current.bytes < least.bytes ? current : least);
  shard.bytes += bytes; shard.packs.push(sha);
}
console.log(`${Object.keys(images).length} images, ${todo.length} packs, ${(todo.reduce((sum, [, bytes]) => sum + bytes, 0) / 2 ** 30).toFixed(1)} GiB decoded`);
await Promise.all(shards.map((shard, index) => new Promise((resolve, reject) => {
  const child = fork(fileURLToPath(import.meta.url), ["--worker", dist, out, String(index), ...shard.packs]);
  child.on("exit", code => code === 0 ? resolve() : reject(new Error(`shard ${index} failed (${code})`)));
})));
console.log("done");
