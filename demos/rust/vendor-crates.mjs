// vendor-crates: writes the crates.io crates a Cargo project depends on to
// vendor/, each checked against its checksum, and .cargo/config.toml, which
// points Cargo at them, so that cargo build --offline builds. Cargo cannot
// resolve over crates.io's index in a browser (see usage).
import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const index = "https://raw.githubusercontent.com/rust-lang/crates.io-index/master";
const downloads = "https://static.crates.io/crates";
const cratesIo = "registry+https://github.com/rust-lang/crates.io-index";
const usage = `usage: vendor-crates
In a Cargo project, writes each crates.io crate it depends on to vendor/,
checked against its checksum, and .cargo/config.toml, which points Cargo at
vendor/, so that cargo build --offline builds. With a Cargo.lock it vendors
the locked versions; without one, the newest version each requirement admits,
for every target and every feature of the project's own packages.
crates.io's index (index.crates.io) sends no CORS headers for the files its
cache holds, so a browser page cannot read it and Cargo cannot resolve there.
vendor-crates reads the index's GitHub mirror and fetches crates from
static.crates.io instead, plain GETs through the page's HTTP broker.`;

// A failure vendor-crates explains: printed without a stack; status 2 is a usage error.
class Refusal extends Error {}
const refuse = (message, status = 1) => { throw Object.assign(new Refusal(message), { status }); };

// Semantic versions and Cargo's requirements: comma-separated comparators, a bare version a caret.
const versionPattern = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
const at = (numbers, pre = []) => ({ tuple: [0, 1, 2].map(index => numbers[index] ?? 0), pre });
// The first release after every version that starts with these numbers (1.2: 1.3.0), and its first prerelease.
const next = numbers => at([...numbers.slice(0, -1), numbers.at(-1) + 1]);
const before = numbers => ({ ...next(numbers), pre: ["0"] });
function parseVersion(text) {
  const match = versionPattern.exec(text);
  return match && { tuple: match.slice(1, 4).map(Number), pre: match[4]?.split(".") ?? [] };
}
function compareIdentifiers(left, right) {
  const [leftNumber, rightNumber] = [left, right].map(identifier => /^\d+$/.test(identifier));
  if (leftNumber && rightNumber) return Number(left) - Number(right);
  if (leftNumber !== rightNumber) return leftNumber ? -1 : 1;
  return left < right ? -1 : left > right ? 1 : 0;
}
function compare(left, right) {
  for (let index = 0; index < 3; index++) if (left.tuple[index] !== right.tuple[index]) return left.tuple[index] - right.tuple[index];
  if (!left.pre.length || !right.pre.length) return right.pre.length - left.pre.length;
  for (let index = 0; index < Math.max(left.pre.length, right.pre.length); index++) {
    if (left.pre[index] === undefined) return -1;
    if (right.pre[index] === undefined) return 1;
    const order = compareIdentifiers(left.pre[index], right.pre[index]);
    if (order) return order;
  }
  return 0;
}
// One comparator as [operator, version] bounds; a wildcard (1.2.*) bounds as = does.
function bounds(text) {
  const match = /^(<=|>=|<|>|=|~|\^)?\s*(\d+|\*)(?:\.(\d+|\*))?(?:\.(\d+|\*))?(?:-([0-9A-Za-z.-]+))?(?:\+\S*)?$/.exec(text.trim());
  if (!match) return null;
  const numbers = [];
  for (const part of match.slice(2, 5)) {
    if (part === undefined || part === "*") break;
    numbers.push(Number(part));
  }
  const operator = match[1] ?? (match.slice(2, 5).includes("*") ? "=" : "^"), count = numbers.length;
  const low = at(numbers, count === 3 ? match[5]?.split(".") ?? [] : []);
  if (count === 0) return [];
  if (operator === ">") return [count === 3 ? [">", low] : [">=", next(numbers)]];
  if (operator === ">=") return [[">=", low]];
  if (operator === "<") return [["<", count === 3 ? low : at(numbers, ["0"])]];
  if (operator === "<=") return [count === 3 ? ["<=", low] : ["<", before(numbers)]];
  if (operator === "~") return [[">=", low], ["<", before(numbers.slice(0, Math.min(count, 2)))]];
  if (operator === "^") {
    const significant = numbers.findIndex(number => number !== 0);
    return [[">=", low], ["<", before(numbers.slice(0, significant === -1 ? count : significant + 1))]];
  }
  return count === 3 ? [["=", low]] : [[">=", low], ["<", before(numbers)]];
}
function parseRequirement(text) {
  const lists = text.split(",").map(bounds);
  return lists.includes(null) ? null : lists.flat();
}
function satisfies(version, requirement) {
  const holds = ([operator, bound]) => {
    const order = compare(version, bound);
    return operator === "=" ? order === 0 : operator === "<" ? order < 0 : operator === "<=" ? order <= 0
      : operator === ">" ? order > 0 : order >= 0;
  };
  // A prerelease satisfies only a requirement that names a prerelease of its own release.
  return requirement.every(holds) && (!version.pre.length ||
    requirement.some(([, bound]) => bound.pre.length && bound.tuple.every((number, index) => number === version.tuple[index])));
}

// Runs a program to its end and resolves with its standard output.
function run(program, args, stdout = "pipe") {
  return new Promise((resolveRun, reject) => {
    const child = spawn(program, args, { stdio: ["ignore", stdout, "pipe"] });
    const output = [], errors = [];
    child.stdout?.on("data", chunk => output.push(chunk));
    child.stderr.on("data", chunk => errors.push(chunk));
    child.on("error", error => reject(new Refusal(`${program}: ${error.message}`)));
    child.on("close", status => status === 0 ? resolveRun(Buffer.concat(output).toString())
      : reject(new Refusal(`${program} ${args.join(" ")} ended with ${status}: ${Buffer.concat(errors).toString().trim()}`)));
  });
}
async function get(url, label) {
  const response = await fetch(url).catch(error => refuse(`${label}: ${url} could not be fetched: ${error.message}`));
  if (!response.ok) refuse(`${label}: ${url} answered ${response.status}`);
  return response;
}

// The index's records of a crate, one per published version, fetched once.
const records = new Map();
function versionsOf(name) {
  const key = name.toLowerCase();
  const path = key.length <= 2 ? `${key.length}/${key}` : key.length === 3 ? `3/${key[0]}/${key}` : `${key.slice(0, 2)}/${key.slice(2, 4)}/${key}`;
  if (!records.has(key)) records.set(key, get(`${index}/${path}`, name).then(async response =>
    (await response.text()).split("\n").filter(Boolean).map(line => JSON.parse(line))));
  return records.get(key);
}

// The crates chosen: each version once, with every feature asked of it.
const chosen = new Map();
let changed = [];
async function request(name, wanted, features, defaults, dependent) {
  const requirement = parseRequirement(wanted) ?? refuse(`${dependent}: ${name} = "${wanted}" is not a version requirement`);
  const admitted = (await versionsOf(name)).filter(record => !record.yanked && parseVersion(record.vers) &&
    satisfies(parseVersion(record.vers), requirement));
  if (!admitted.length) refuse(`${dependent}: no version of ${name} admits "${wanted}"`);
  const record = admitted.reduce((best, candidate) => compare(parseVersion(candidate.vers), parseVersion(best.vers)) > 0 ? candidate : best);
  const key = `${record.name}@${record.vers}`;
  if (!chosen.has(key)) chosen.set(key, { record, features: new Set(), done: -1 });
  const crate = chosen.get(key);
  for (const feature of [...features, ...defaults ? ["default"] : []]) crate.features.add(feature);
  if (crate.done !== crate.features.size) changed.push(crate);
}
// Which optional dependencies a crate's features enable, and the features each feature asks of a dependency.
function activate({ record, features }) {
  const table = { ...record.features, ...record.features2 };
  const optional = new Set(record.deps.filter(dependency => dependency.optional).map(dependency => dependency.name));
  const named = new Set(Object.values(table).flat().filter(item => item.startsWith("dep:")).map(item => item.slice(4)));
  const enabled = new Set(), asked = new Map(), seen = new Set();
  const visit = item => {
    if (seen.has(item)) return;
    seen.add(item);
    const [head, feature] = item.split("/");
    const dependency = head.replace(/^dep:|\?$/g, "");
    if (feature !== undefined) asked.set(dependency, [...asked.get(dependency) ?? [], feature]);
    if (head.startsWith("dep:") || feature !== undefined && !head.endsWith("?") && optional.has(dependency)) enabled.add(dependency);
    else if (feature === undefined && Object.hasOwn(table, item)) table[item].forEach(visit);
    else if (feature === undefined && optional.has(item) && !named.has(item)) enabled.add(item);
  };
  features.forEach(visit);
  return { enabled, asked };
}
async function resolveCrates(packages) {
  for (const { name, dependencies, features } of packages) {
    // The project's own packages: every dependency, for any feature and target it may be built with.
    const asked = Object.values(features).flat().map(item => item.split("/")).filter(parts => parts.length === 2);
    for (const dependency of dependencies.filter(dependency => dependency.source === cratesIo)) {
      const key = dependency.rename ?? dependency.name;
      const more = asked.filter(([head]) => head.replace(/^dep:|\?$/g, "") === key).map(([, feature]) => feature);
      await request(dependency.name, dependency.req, [...dependency.features, ...more], dependency.uses_default_features, name);
    }
  }
  while (changed.length) {
    const crates = [...new Set(changed)];
    changed = [];
    for (const crate of crates) {
      crate.done = crate.features.size;
      const { enabled, asked } = activate(crate), label = `${crate.record.name}@${crate.record.vers}`;
      // Not a dependency's own dev-dependencies, which are not built; every target's
      // dependencies, which Cargo locks whatever it builds for. Their records are fetched together.
      const dependencies = crate.record.deps.filter(dependency => dependency.kind !== "dev" && !dependency.registry &&
        (!dependency.optional || enabled.has(dependency.name)));
      await Promise.all(dependencies.map(dependency => versionsOf(dependency.package ?? dependency.name)));
      for (const dependency of dependencies) {
        await request(dependency.package ?? dependency.name, dependency.req,
          [...dependency.features, ...asked.get(dependency.name) ?? []], dependency.default_features, label);
      }
    }
  }
  return [...chosen.values()].map(({ record }) => ({ name: record.name, version: record.vers, checksum: record.cksum }));
}
// The registry packages a Cargo.lock holds, with their checksums.
function lockedCrates(lock) {
  return readFileSync(lock, "utf8").split(/^\[\[package\]\]$/m).slice(1)
    .map(block => Object.fromEntries([...block.matchAll(/^(name|version|source|checksum) = "([^"]*)"$/gm)].map(([, key, value]) => [key, value])))
    .filter(entry => entry.source === cratesIo)
    .map(({ name, version, checksum }) => ({ name, version, checksum: checksum ?? refuse(`${lock}: ${name} ${version} has no checksum`) }));
}

// Unpacks a .crate (a tar Cargo wrote) without its first path component:
// files and directories, with pax and GNU long names.
function extract(tar, destination, label) {
  const bytes = readFileSync(tar), made = new Set();
  const text = (start, length) => {
    const end = bytes.indexOf(0, start);
    return bytes.toString("utf8", start, end === -1 || end > start + length ? start + length : end);
  };
  let long = null;
  for (let offset = 0; offset + 512 <= bytes.length && bytes[offset] !== 0;) {
    const size = parseInt(text(offset + 124, 12).trim() || "0", 8), type = bytes[offset + 156] || 48;
    const name = long ?? (bytes[offset + 345] ? `${text(offset + 345, 155)}/` : "") + text(offset, 100);
    if (!(size >= 0)) refuse(`${label}: its archive has a size field that is not octal`);
    const data = bytes.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;
    long = null;
    if (type === 0x78) long = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(data.toString())?.[1] ?? null;
    if (type === 0x4c) long = data.toString().replace(/\0.*$/s, "");
    if (type !== 0x30 && type !== 0x37 && type !== 0x35) continue;
    const parts = name.split("/").filter(part => part && part !== ".").slice(1);
    if (parts.includes("..")) refuse(`${label}: its archive names ${name}, outside the crate`);
    if (!parts.length) continue;
    const path = `${destination}/${parts.join("/")}`, parent = type === 0x35 ? path : dirname(path);
    if (!made.has(parent)) { mkdirSync(parent, { recursive: true }); made.add(parent); }
    if (type !== 0x35) writeFileSync(path, data);
  }
}
// Fetches, checks and unpacks one crate into the staging directory, with the
// checksum file a directory source needs (no file list: Cargo checks only the package).
let fetched = 0;
async function stage(crate, staging) {
  const label = `${crate.name}@${crate.version}`, unpacked = `${staging}/${crate.name}-${crate.version}`;
  const bytes = new Uint8Array(await (await get(`${downloads}/${crate.name}/${crate.name}-${crate.version}.crate`, label)).arrayBuffer());
  writeFileSync(`${unpacked}.crate`, bytes);
  fetched += bytes.length;
  if ((await run("sha256sum", [`${unpacked}.crate`])).split(" ")[0] !== crate.checksum) refuse(`${label}: the crate does not match its checksum ${crate.checksum}`);
  const descriptor = openSync(`${unpacked}.tar`, "w");
  try { await run("gzip", ["-dc", `${unpacked}.crate`], descriptor); } finally { closeSync(descriptor); }
  extract(`${unpacked}.tar`, unpacked, label);
  rmSync(`${unpacked}.crate`);
  rmSync(`${unpacked}.tar`);
  writeFileSync(`${unpacked}/.cargo-checksum.json`, JSON.stringify({ files: {}, package: crate.checksum }));
}
// Runs work on each item, a few at a time; the first failure stops new work and is thrown once all have settled.
async function each(items, limit, work) {
  let taken = 0, failure = null;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (failure === null && taken < items.length) {
      try { await work(items[taken++]); } catch (error) { failure ??= error; }
    }
  }));
  if (failure) throw failure;
}

// Cargo takes crates.io's crates from vendor/; crates.io's libc has wasm32
// layouts for this target, so a project that uses it builds the SDK's copy.
function configure(root, crates) {
  const path = `${root}/.cargo/config.toml`, existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  if (existing.includes('replace-with = "vendored-sources"')) return null;
  if (/^\[source\.crates-io\]$/m.test(existing)) refuse(`${path} already replaces crates.io; point it at vendor/ (vendored-sources)`);
  const libc = crates.some(crate => crate.name === "libc") && !/^libc = /m.test(existing)
    ? '\n[patch.crates-io]\nlibc = { path = "/opt/rust-sdk/src/libc" }\n' : "";
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${existing}${existing && !existing.endsWith("\n") ? "\n" : ""}[source.crates-io]\nreplace-with = "vendored-sources"\n\n` +
    `[source.vendored-sources]\ndirectory = "vendor"\n${libc}`);
  return path;
}

async function main(args) {
  if (args.includes("--help")) { console.log(usage); return 0; }
  if (args.length) refuse(usage, 2);
  const started = performance.now();
  const metadata = JSON.parse(await run("cargo", ["metadata", "--no-deps", "--offline", "--format-version", "1"]));
  for (const { name, dependencies } of metadata.packages) {
    const elsewhere = dependencies.find(dependency => dependency.source && dependency.source !== cratesIo);
    if (elsewhere) refuse(`${name}: ${elsewhere.name} comes from ${elsewhere.source}; vendor-crates vendors only crates.io's crates`);
  }
  const root = metadata.workspace_root, lock = `${root}/Cargo.lock`;
  const crates = existsSync(lock) ? lockedCrates(lock) : await resolveCrates(metadata.packages);
  const staging = mkdtempSync(`${root}/.vendor-crates-`);
  try {
    await each(crates, 6, crate => stage(crate, staging));
    mkdirSync(`${root}/vendor`, { recursive: true });
    for (const { name, version } of crates) {
      rmSync(`${root}/vendor/${name}-${version}`, { recursive: true, force: true });
      renameSync(`${staging}/${name}-${version}`, `${root}/vendor/${name}-${version}`);
    }
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  const written = configure(root, crates);
  console.log(`vendor-crates: vendored ${crates.length} crate${crates.length === 1 ? "" : "s"} (${fetched} bytes fetched) into ` +
    `${root}/vendor in ${((performance.now() - started) / 1000).toFixed(1)} s`);
  if (written) console.log(`vendor-crates: wrote ${written}`);
  return 0;
}

main(process.argv.slice(2)).then(status => { process.exitCode = status; }, error => {
  if (!(error instanceof Refusal)) throw error;
  console.error(`vendor-crates: ${error.message}`);
  process.exitCode = error.status ?? 1;
});
