// janis-install: installs packages from the npm registry, and the packages
// they depend on, into one node_modules directory, and writes a /usr/bin
// launcher (janis FILE "$@") for each command a named package declares.
// Tarballs are checked with sha512sum and decompressed with gzip.
import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

const registry = "https://registry.npmjs.org";
const usage = `usage: janis-install [--prefix DIR] [--integrity SRI] [--registry COPY] NAME[@VERSION]...
Installs each npm package and the packages it depends on into DIR, a
node_modules directory (default /usr/lib/node_modules), and writes
/usr/bin/COMMAND, which runs janis on the file, for each command a named
package declares. VERSION is a version, a range or a tag (default latest).
--integrity pins the tarball of the one NAME@VERSION given (sha512-...),
which is then fetched without the registry's metadata.
--registry COPY reads a copy of the registry's files instead of fetching:
COPY/NAME/metadata.json, the abbreviated metadata of the versions copied, and
the tarballs at COPY/NAME/-/FILE, where their URLs put them.
Lifecycle scripts are not run; packages that compile a native addon, and
git, file, URL and alias specs, are refused.`;

// A failure janis-install explains: printed without a stack; status 2 is a usage error.
class Refusal extends Error {}
const refuse = (message, status = 1) => { throw Object.assign(new Refusal(message), { status }); };

// Semantic versions and npm's ranges, as node-semver reads them.
const versionPattern = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
const partialPattern = /^v?(\d+|[xX*])(?:\.(\d+|[xX*])(?:\.(\d+|[xX*])(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?)?)?$/;
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
// A partial version's numbers up to its first wildcard or omission, or null.
function parsePartial(text) {
  const match = partialPattern.exec(text);
  if (!match) return null;
  const numbers = [];
  for (const part of match.slice(1, 4)) {
    if (part === undefined || /^[xX*]$/.test(part)) break;
    numbers.push(Number(part));
  }
  return { numbers, pre: numbers.length === 3 ? match[4]?.split(".") ?? [] : [] };
}
// One comparator of a range as [operator, version] bounds, or null.
function bounds(text) {
  const [, operator = "", rest] = /^(<=|>=|<|>|=|~>?|\^)?(.*)$/.exec(text);
  const partial = parsePartial(rest);
  if (!partial) return null;
  const { numbers, pre } = partial, count = numbers.length, low = at(numbers, pre);
  if (count === 0) return operator === "<" || operator === ">" ? [["<", at([0], ["0"])]] : [];
  if (operator === ">") return [count === 3 ? [">", low] : [">=", next(numbers)]];
  if (operator === ">=") return [[">=", low]];
  if (operator === "<") return [["<", count === 3 ? low : at(numbers, ["0"])]];
  if (operator === "<=") return [count === 3 ? ["<=", low] : ["<", before(numbers)]];
  if (operator.startsWith("~")) return [[">=", low], ["<", before(numbers.slice(0, Math.min(count, 2)))]];
  if (operator === "^") {
    const significant = numbers.findIndex(number => number !== 0);
    return [[">=", low], ["<", before(numbers.slice(0, significant === -1 ? count : significant + 1))]];
  }
  return count === 3 ? [["=", low]] : [[">=", low], ["<", before(numbers)]];
}
// A range as alternatives of bound lists, or null when it is not one (a tag).
function parseRange(text) {
  const alternatives = text.split("||").map(alternative => {
    const hyphen = /^\s*(\S+)\s+-\s+(\S+)\s*$/.exec(alternative);
    if (hyphen) {
      const [low, high] = [parsePartial(hyphen[1]), parsePartial(hyphen[2])];
      if (!low || !high) return null;
      return [...low.numbers.length ? [[">=", at(low.numbers, low.pre)]] : [],
        ...high.numbers.length === 3 ? [["<=", at(high.numbers, high.pre)]] : high.numbers.length ? [["<", before(high.numbers)]] : []];
    }
    const words = alternative.replace(/(<=|>=|<|>|=|~>?|\^)\s+/g, "$1").trim().split(/\s+/).filter(Boolean);
    const lists = words.map(bounds);
    return lists.includes(null) ? null : lists.flat();
  });
  return alternatives.includes(null) ? null : alternatives;
}
function satisfies(version, range) {
  const holds = ([operator, bound]) => {
    const order = compare(version, bound);
    return operator === "=" ? order === 0 : operator === "<" ? order < 0 : operator === "<=" ? order <= 0
      : operator === ">" ? order > 0 : order >= 0;
  };
  // A prerelease satisfies only a list that names a prerelease of its own release.
  const admitted = list => !version.pre.length ||
    list.some(([, bound]) => bound.pre.length && bound.tuple.every((number, index) => number === version.tuple[index]));
  return range.some(list => list.every(holds) && admitted(list));
}

// What npm installs from elsewhere than its registry, refused by name.
function refuseSource(name, wanted) {
  const kind = /^(git\+|git:|github:|gitlab:|bitbucket:|gist:)/.test(wanted) || /^[^@\s:/]+\/[^\s:]+$/.test(wanted) ? "a git repository"
    : /^(file:|link:|\.{0,2}\/|~\/)/.test(wanted) ? "a local path" : /^https?:/.test(wanted) ? "a URL"
      : wanted.startsWith("npm:") ? "an alias" : wanted.startsWith("workspace:") ? "a workspace" : null;
  if (kind) refuse(`${name ? `${name}@` : ""}${wanted} is ${kind}; janis-install installs only from the npm registry`);
}
const namePattern = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/;
function parseSpec(text) {
  refuseSource("", text);
  const separator = text.indexOf("@", 1);
  const [name, wanted] = separator === -1 ? [text, "latest"] : [text.slice(0, separator), text.slice(separator + 1)];
  refuseSource(name, wanted);
  if (!namePattern.test(name)) refuse(`${text}: not an npm package name`);
  return { name, wanted };
}

// npm's os and cpu fields: names to match, or names to exclude after "!".
function platformMismatch(manifest) {
  for (const [field, actual] of [["os", process.platform], ["cpu", process.arch]]) {
    const wanted = [manifest[field] ?? []].flat();
    const listed = wanted.filter(item => !item.startsWith("!"));
    if (wanted.includes(`!${actual}`) || listed.length && !listed.includes(actual)) return `its ${field} is ${wanted.join(", ")}, not ${actual}`;
  }
  return null;
}

// The registry's abbreviated metadata of each name, fetched once.
const packuments = new Map();
function packument(name) {
  if (!packuments.has(name)) packuments.set(name, (async () => {
    if (copy !== null) {
      const path = `${copy}/${name}/metadata.json`;
      return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : refuse(`${name}: not in ${copy}`);
    }
    // The registry also answers a scope's unencoded slash, which a policy's path prefix admits.
    const response = await fetch(`${registry}/${name}`, { headers: { accept: "application/vnd.npm.install-v1+json" } })
      .catch(error => refuse(`${name}: the registry could not be reached: ${error.message}`));
    if (!response.ok) refuse(`${name}: the registry answered ${response.status}`);
    return response.json();
  })());
  return packuments.get(name);
}
// npm's choice: a tag's version; for a range, the latest tag when it satisfies, else the highest that does.
function pick(name, wanted, metadata) {
  const tags = metadata["dist-tags"] ?? {};
  if (Object.hasOwn(tags, wanted)) return metadata.versions[tags[wanted]];
  const range = parseRange(wanted) ?? refuse(`${name}@${wanted}: not a version, range or tag of it`);
  if (tags.latest && metadata.versions[tags.latest] && satisfies(parseVersion(tags.latest), range)) return metadata.versions[tags.latest];
  const versions = Object.keys(metadata.versions).map(version => [version, parseVersion(version)])
    .filter(([, parsed]) => parsed && satisfies(parsed, range)).sort(([, left], [, right]) => compare(right, left));
  return versions.length ? metadata.versions[versions[0][0]] : refuse(`${name}@${wanted}: no published version satisfies it`);
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
// The tools that check an npm integrity string, strongest first.
const checkers = [["sha512", "sha512sum"], ["sha1", "sha1sum"]];
async function verify(file, integrity, label) {
  const hashes = new Map(integrity.split(/\s+/).map(entry => /^(sha\d+)-([A-Za-z0-9+/=]+)$/.exec(entry)).filter(Boolean)
    .map(([, algorithm, digest]) => [algorithm, digest]));
  const [algorithm, tool] = checkers.find(([candidate]) => hashes.has(candidate)) ?? refuse(`${label}: no sha512 or sha1 integrity to check`);
  const digest = (await run(tool, [file])).split(" ")[0];
  if (digest !== Buffer.from(hashes.get(algorithm), "base64").toString("hex")) refuse(`${label}: the tarball does not match ${integrity}`);
}
// Unpacks a tar as npm does (node-tar, as pacote calls it): without the first
// path component, files and directories only, with pax and GNU long names.
// Neither Dolly's tar (no pax, no "./" inside a path) nor sbase's (not
// node-tar's checksum field) reads every npm tarball.
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
    if (!(size >= 0)) refuse(`${label}: its tarball has a size field that is not octal`);
    const data = bytes.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;
    long = null;
    if (type === 0x78) long = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(data.toString())?.[1] ?? null;
    if (type === 0x4c) long = data.toString().replace(/\0.*$/s, "");
    if (type !== 0x30 && type !== 0x37 && type !== 0x35) continue;
    const parts = name.split("/").filter(part => part && part !== ".").slice(1);
    if (parts.includes("..")) refuse(`${label}: its tarball names ${name}, outside the package`);
    if (!parts.length) continue;
    const path = `${destination}/${parts.join("/")}`, parent = type === 0x35 ? path : dirname(path);
    if (!made.has(parent)) { mkdirSync(parent, { recursive: true }); made.add(parent); }
    if (type !== 0x35) writeFileSync(path, data);
  }
}
async function fetchTarball(url, label) {
  const response = await fetch(url).catch(error => refuse(`${label}: ${url} could not be fetched: ${error.message}`));
  if (!response.ok) refuse(`${label}: ${url} answered ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  fetched += bytes.length;
  return bytes;
}
// Fetches, checks and unpacks one tarball into the staging directory.
async function stage(node, staging) {
  const label = `${node.name}@${node.version}`, unpacked = `${staging}/${placed.indexOf(node)}`, archive = `${unpacked}.tgz`;
  const bytes = copy !== null ? readFileSync(`${copy}${new URL(node.tarball).pathname}`) : await fetchTarball(node.tarball, label);
  writeFileSync(archive, bytes);
  await verify(archive, node.integrity, label);
  const tar = `${unpacked}.tar`, descriptor = openSync(tar, "w");
  try { await run("gzip", ["-dc", archive], descriptor); } finally { closeSync(descriptor); }
  extract(tar, unpacked, label);
  rmSync(archive);
  rmSync(tar);
  node.staged = unpacked;
  node.manifest = JSON.parse(readFileSync(`${unpacked}/package.json`, "utf8"));
  if (node.manifest.gypfile || existsSync(`${unpacked}/binding.gyp`)) {
    if (!node.optional) refuse(`${label} compiles a native addon, which Janis cannot load`);
    node.refused = `skipped optional ${label}: it compiles a native addon, which Janis cannot load`;
  }
}

// The tree: the prefix holds the top-level packages, each package's node_modules its nested ones.
let prefix = "/usr/lib/node_modules", copy = null, fetched = 0;
const root = { children: new Map(), parent: null, depth: 0 };
const placed = [], notes = [];
const directory = node => node === root ? prefix : `${node.path}/node_modules`;
// Node's resolution from a package: its own node_modules, then each enclosing one.
function lookup(node, name) {
  for (let candidate = node; candidate; candidate = candidate.parent) if (candidate.children.has(name)) return candidate.children.get(name);
  return null;
}
function readInstalled() {
  const names = existsSync(prefix) ? readdirSync(prefix).flatMap(entry => entry.startsWith("@")
    ? readdirSync(`${prefix}/${entry}`).map(name => `${entry}/${name}`) : [entry]) : [];
  for (const name of names) {
    const manifest = `${prefix}/${name}/package.json`;
    if (existsSync(manifest)) root.children.set(name, { name, version: JSON.parse(readFileSync(manifest, "utf8")).version, installed: true });
  }
}
// Places a chosen version: at the top when nothing there conflicts, else beside the dependent's own files.
function place(dependent, item, version, conflict) {
  const parent = conflict ? dependent : root;
  const node = { ...item, version, parent, children: new Map(), depth: parent.depth + 1 };
  node.path = `${directory(parent)}/${item.name}`;
  parent.children.set(item.name, node);
  placed.push(node);
  return node;
}
function dependencies(node) {
  const { dependencies = {}, optionalDependencies = {}, peerDependencies = {}, peerDependenciesMeta = {} } = node.manifest;
  const peers = Object.entries(peerDependencies).filter(([name]) => !peerDependenciesMeta[name]?.optional);
  return [...Object.entries({ ...dependencies, ...Object.fromEntries(peers) }).filter(([name]) => !Object.hasOwn(optionalDependencies, name))
    .map(([name, wanted]) => ({ name, wanted, optional: node.optional })),
  ...Object.entries(optionalDependencies).map(([name, wanted]) => ({ name, wanted, optional: true }))]
    .map(item => ({ ...item, dependent: node }));
}
// Resolves the tree breadth first, so a package's nearer dependencies are placed before its farther ones.
async function resolveTree(requests, staging) {
  let level = requests.map(request => ({ ...request, dependent: root, named: true, optional: false }));
  while (level.length) {
    const wanted = level.filter(item => {
      if (!item.named) refuseSource(item.name, item.wanted);
      const found = lookup(item.dependent, item.name), range = parseRange(item.wanted);
      return item.named || !(found && range && satisfies(parseVersion(found.version), range));
    });
    const chosen = await Promise.all(wanted.map(async item => {
      if (item.integrity) return { item, manifest: null };
      try { return { item, manifest: pick(item.name, item.wanted, await packument(item.name)) }; }
      catch (error) { if (error instanceof Refusal && item.optional) return { item, error }; throw error; }
    }));
    level = [];
    for (const { item, manifest, error } of chosen) {
      const label = `${item.name}@${item.wanted}`, mismatch = manifest && platformMismatch(manifest);
      if (error || mismatch) {
        if (!item.optional) refuse(`${label}: ${mismatch}`);
        notes.push(`skipped optional ${label} (for ${item.dependent.name}): ${mismatch ?? error.message}`);
        continue;
      }
      const version = manifest?.version ?? item.wanted, found = lookup(item.dependent, item.name);
      if (found?.version === version || !item.named && found && satisfies(parseVersion(found.version), parseRange(item.wanted))) {
        if (item.named) notes.push(`${item.name}@${found.version} is installed`);
        continue;
      }
      const node = place(item.dependent, item, version, !item.named && found !== null);
      if (item.integrity) {
        node.tarball = `${registry}/${item.name}/-/${basename(item.name)}-${version}.tgz`;
        await stage(node, staging);
      } else {
        Object.assign(node, { manifest, tarball: manifest.dist.tarball,
          integrity: manifest.dist.integrity ?? `sha1-${Buffer.from(manifest.dist.shasum, "hex").toString("base64")}` });
      }
      level.push(...dependencies(node));
    }
  }
}
// Runs work on each item, a few at a time; the first failure stops new work and is thrown once all have settled.
async function each(items, limit, work) {
  let index = 0, failure = null;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (failure === null && index < items.length) {
      try { await work(items[index++]); } catch (error) { failure ??= error; }
    }
  }));
  if (failure) throw failure;
}
const launcherMark = "# Written by janis-install";
function launchers(node) {
  const { bin = {} } = node.manifest;
  const commands = typeof bin === "string" ? { [basename(node.name)]: bin } : bin;
  return Object.entries(commands).map(([command, file]) => {
    const target = resolve(node.path, file);
    if (!/^[A-Za-z0-9._-]+$/.test(command) || !target.startsWith(`${node.path}/`)) refuse(`${node.name}: command ${command} (${file}) is not a file of the package`);
    return { path: `/usr/bin/${command}`, text: `#!/bin/slop\n${launcherMark} for ${node.name}@${node.version}.\njanis '${target}' "$@"\n` };
  });
}

async function main(args) {
  const requests = [];
  let integrity = null;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--help") { console.log(usage); return 0; }
    if (arg === "--prefix" || arg === "--integrity" || arg === "--registry") {
      if (index + 1 === args.length) refuse(`${arg} needs a value`, 2);
      if (arg === "--prefix") prefix = resolve(args[++index]);
      else if (arg === "--registry") copy = resolve(args[++index]);
      else integrity = args[++index];
    } else if (arg.startsWith("-")) refuse(`unknown option ${arg}`, 2);
    else requests.push(parseSpec(arg));
  }
  if (!requests.length) refuse(`name a package to install\n${usage}`, 2);
  if (basename(prefix) !== "node_modules") refuse(`--prefix ${prefix}: name a node_modules directory, where Janis looks for packages`);
  if (integrity !== null) {
    if (requests.length !== 1 || !parseVersion(requests[0].wanted)) refuse("--integrity pins exactly one NAME@VERSION", 2);
    requests[0].integrity = integrity;
  }
  const started = performance.now(), staging = mkdtempSync("/tmp/janis-install-");
  try {
    readInstalled();
    await resolveTree(requests, staging);
    await each(placed.filter(node => !node.staged), 6, node => stage(node, staging));
    // An optional package refused after unpacking leaves with what was placed inside it.
    for (const refused of placed.filter(node => node.refused)) {
      notes.push(refused.refused);
      refused.parent.children.delete(refused.name);
      placed.splice(0, placed.length, ...placed.filter(node => node !== refused && !node.path.startsWith(`${refused.path}/`)));
    }
    const written = placed.filter(node => node.named).flatMap(launchers);
    for (const { path } of written) {
      if (existsSync(path) && !readFileSync(path, "utf8").includes(launcherMark)) refuse(`${path} exists and janis-install did not write it`);
    }
    for (const node of placed.sort((left, right) => left.depth - right.depth)) {
      rmSync(node.path, { recursive: true, force: true });
      mkdirSync(dirname(node.path), { recursive: true });
      renameSync(node.staged, node.path);
    }
    for (const { path, text } of written) writeFileSync(path, text);
    for (const node of placed) {
      const scripts = Object.entries(node.manifest.scripts ?? {}).filter(([name]) => /^(pre|post)?install$/.test(name));
      for (const [name, script] of scripts) notes.push(`not run: ${node.name}@${node.version} ${name}: ${script}`);
    }
    for (const note of notes) console.log(`janis-install: ${note}`);
    if (placed.length) {
      console.log(`janis-install: added ${placed.length} package${placed.length === 1 ? "" : "s"} (${fetched} bytes fetched) to ${prefix} in ` +
        `${((performance.now() - started) / 1000).toFixed(1)} s`);
    }
    for (const { path } of written) console.log(`janis-install: ${path}`);
    return 0;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

main(process.argv.slice(2)).then(status => { process.exitCode = status; }, error => {
  if (!(error instanceof Refusal)) throw error;
  console.error(`janis-install: ${error.message}`);
  process.exitCode = error.status ?? 1;
});
