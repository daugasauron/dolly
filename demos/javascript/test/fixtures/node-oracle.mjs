// Node API cases whose observations must be identical in Node and Janis.
// The browser test runs observe() in Node and serves the result; Janis runs
// `janis -m node-oracle.mjs ROOT ORIGIN` and compares its own observations.
import { execSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { createRequire } from "node:module";
import { BlockList } from "node:net";
import stream from "node:stream";
import { text } from "node:stream/consumers";
import streamPromises from "node:stream/promises";
import util from "node:util";

const outcome = async operation => {
  try { return { value: await operation() ?? null }; } catch (error) { return { name: error.name, code: error.code }; }
};
const sink = chunks => new stream.Writable({ write(chunk, _encoding, callback) { chunks.push(String(chunk)); callback(); } });

export async function observe(root) {
  fs.mkdirSync(`${root}/directory/child`, { recursive: true });
  const file = `${root}/file`, missing = `${root}/missing`;
  fs.writeFileSync(file, "0123456789");
  const readRange = options => new Promise((resolve, reject) => {
    let text = "";
    fs.createReadStream(file, options).on("data", chunk => { text += chunk; }).on("end", () => resolve(text)).on("error", reject);
  });
  const cases = {};
  cases.rmdir = [
    await outcome(() => fs.rmdirSync(file)), await outcome(() => fsp.rmdir(file)),
    await outcome(() => new Promise((resolve, reject) => fs.rmdir(file, error => error ? reject(error) : resolve()))),
    await outcome(() => fs.rmdirSync(`${root}/directory`)), fs.readFileSync(file, "utf8"),
  ];

  const piped = [];
  cases.pipeline = [
    await outcome(() => new Promise(resolve => stream.pipeline(stream.Readable.from(["a", "b"]),
      new stream.Transform({ transform(chunk, _encoding, callback) { callback(null, String(chunk).toUpperCase()); },
        flush(callback) { callback(null, "!"); } }),
      sink(piped), error => resolve([error?.code ?? null, piped.join("")])))),
    await outcome(() => streamPromises.pipeline(stream.Readable.from(["a"]), new stream.Writable({
      write(_chunk, _encoding, callback) { callback(Object.assign(new Error("sink failed"), { code: "E_SINK" })); } }))),
    await outcome(() => {
      const source = new stream.PassThrough();
      const pending = streamPromises.pipeline(source, sink([]));
      source.destroy(Object.assign(new Error("source failed"), { code: "E_SOURCE" }));
      return pending;
    }),
  ];
  const ended = sink([]);
  await new Promise(resolve => ended.end("x", resolve));
  const destroyed = new stream.Readable({ read() {} });
  const early = streamPromises.finished(destroyed);
  destroyed.destroy();
  cases.finished = [await outcome(() => streamPromises.finished(ended)), await outcome(() => early)];

  fs.mkdirSync(`${root}/require/helper`, { recursive: true });
  fs.writeFileSync(`${root}/require/helper.js`, "module.exports = 'file';");
  const conditions = `${root}/node_modules/condition-order`;
  fs.mkdirSync(conditions, { recursive: true });
  for (const name of ["node", "default"]) fs.writeFileSync(`${conditions}/${name}.cjs`, `module.exports = ${JSON.stringify(name)};`);
  fs.writeFileSync(`${conditions}/package.json`, JSON.stringify({ exports: {
    ".": { node: "./node.cjs", default: "./default.cjs" }, "./default-first": { default: "./default.cjs", node: "./node.cjs" } } }));
  const require = createRequire(`${root}/require/entry.cjs`);
  cases.require = [require("./helper"), require("condition-order"), require("condition-order/default-first")];

  const elapsed = process.hrtime(process.hrtime());
  cases.clocks = [performance.now() >= 0 && performance.now() < 3600e3, elapsed[0] === 0 && elapsed[1] >= 0];

  const graph = { date: new Date(5), map: new Map([[1, new Set([2])]]), bytes: Uint8Array.of(1, 2), missing: undefined };
  graph.self = graph;
  const copy = structuredClone(graph);
  cases.structuredClone = [
    copy !== graph && copy.self === copy && copy.date.getTime() === 5 && copy.map.get(1).has(2) && copy.bytes[1] === 2 && "missing" in copy,
    await outcome(() => structuredClone({ run() {} })), await outcome(() => structuredClone(Symbol("value"))),
  ];

  fs.writeFileSync(`${root}/binary`, Uint8Array.of(0, 255, 0xe3, 0x81, 10));
  cases.execSync = [[...execSync(`cat ${root}/binary`)], execSync(`cat ${root}/binary`, { encoding: "hex" })];

  fs.writeFileSync(`${root}/kept`, "kept");
  cases.copyFile = [
    await outcome(() => fs.copyFileSync(missing, `${root}/copy`)),
    await outcome(() => fs.copyFileSync(`${root}/directory`, `${root}/copy`)),
    await outcome(() => fs.copyFileSync(file, `${root}/kept`, fs.constants.COPYFILE_EXCL)),
    await outcome(() => fs.copyFileSync(file, `${root}/copy`, 8)),
    await outcome(() => fsp.copyFile(file, `${root}/copy`, fs.constants.COPYFILE_EXCL)),
    fs.readFileSync(`${root}/kept`, "utf8"), fs.readFileSync(`${root}/copy`, "utf8"),
  ];
  cases.access = [
    await outcome(() => fs.accessSync(file, fs.constants.R_OK | fs.constants.W_OK)),
    await outcome(() => fs.accessSync(file, 8)), await outcome(() => fs.accessSync(missing)),
  ];
  cases.chmod = [
    await outcome(() => fs.chmodSync(file, "644")), await outcome(() => fs.chmodSync(file, "xyz")),
    await outcome(() => fs.chmodSync(missing, 0o644)),
  ];
  const temporary = [fs.mkdtempSync(`${root}/temp-`), await fsp.mkdtemp(`${root}/temp-`)];
  cases.mkdtemp = [
    temporary[0] !== temporary[1] && temporary.every(path => /^temp-[A-Za-z0-9]{6}$/.test(path.slice(root.length + 1)) && fs.statSync(path).isDirectory()),
    await outcome(() => fs.mkdtempSync(`${missing}/temp-`)),
  ];
  cases.readStream = [
    await readRange({ start: 2, end: 4, encoding: "utf8" }), await readRange({ start: 8 }), await readRange("utf8"),
    await outcome(() => fs.createReadStream(file, { start: 5, end: 2 })), await outcome(() => fs.createReadStream(file, { start: -1 })),
  ];
  cases.writeStream = [
    await new Promise(resolve => fs.createWriteStream(`${root}/kept`, { flags: "wx" }).on("error", error => resolve(error.code)).end("lost")),
    await new Promise(resolve => fs.createWriteStream(`${root}/kept`, { flags: "a" }).on("finish", resolve).end("+")),
    fs.readFileSync(`${root}/kept`, "utf8"),
  ];
  cases.inspect = [function named() {}, () => {}, async function load() {}, function* walk() {}, class Point {}, class {}]
    .map(value => util.inspect(value));

  // The entry's format: CommonJS by default, ESM by extension, package type or syntax.
  const scripts = `${root}/scripts`;
  fs.mkdirSync(`${scripts}/typed`, { recursive: true });
  fs.writeFileSync(`${scripts}/common.js`, "console.log(typeof require, __filename === require('node:path').resolve('common.js'), " +
    "process.argv.slice(2).join(), require.main === module, this === module.exports, process.exitCode)");
  fs.writeFileSync(`${scripts}/syntax.js`, "import path from 'node:path'; console.log(path.sep, typeof require)");
  fs.writeFileSync(`${scripts}/typed/package.json`, JSON.stringify({ type: "module" }));
  fs.writeFileSync(`${scripts}/typed/main.js`, "console.log(typeof require, import.meta.url.endsWith('/typed/main.js'))");
  fs.writeFileSync(`${scripts}/thrower.cjs`, "'use strict';\nfunction fail() {\n  throw new Error('boom');\n}\nmodule.exports = fail;\n");
  const node = (args, input = "") => {
    const { status, stdout } = spawnSync(process.execPath, args, { cwd: scripts, input, encoding: "utf8" });
    return [status, stdout];
  };
  cases.entry = [
    node(["-e", "console.log(typeof require, typeof module, __filename, require('node:path').sep)"]),
    node(["-e", "import path from 'node:path'; console.log(path.sep, typeof require)"]),
    node(["-e", "console.log((await import('node:path')).sep)"]),
    node(["common.js", "a", "b"]), node(["syntax.js"]), node(["typed/main.js"]),
    node(["-"], "console.log(typeof require)"), node(["-"], "import path from 'node:path'; console.log(path.sep)"),
  ];
  cases.stdin = [
    node(["-e", "process.stdin.setEncoding('utf8'); process.stdin.on('readable', () => { let chunk; " +
      "while ((chunk = process.stdin.read()) !== null) console.log('read', JSON.stringify(chunk)); }); process.stdin.on('end', () => console.log('end'))"], "typed\n"),
    node(["-e", "process.stdin.unref(); process.stdin.on('data', () => console.log('data')); console.log('unreferenced')"], ""),
  ];
  const watched = `${root}/watched`;
  fs.mkdirSync(watched);
  const watchEvents = [], fileChanges = [];
  const watcher = fs.watch(watched, (type, name) => watchEvents.push(`${type}:${name}`));
  fs.writeFileSync(`${watched}/file`, "x");
  fs.watchFile(`${watched}/file`, { interval: 100 }, (current, previous) => fileChanges.push([current.size, previous.size]));
  const settle = () => new Promise(resolve => setTimeout(resolve, 1300));
  await settle();
  fs.writeFileSync(`${watched}/file`, "longer");
  await settle();
  fs.unlinkSync(`${watched}/file`);
  await settle();
  watcher.close();
  fs.unwatchFile(`${watched}/file`);
  cases.watch = [[...new Set(watchEvents)].sort(), fileChanges, await outcome(() => fs.watch(missing))];
  cases.exit = [
    node(["-e", "try { process.exit(3); } catch { console.log('caught'); }"]),
    node(["-e", "process.on('exit', code => { console.log('exit', code); process.exitCode = 9; }); setTimeout(() => process.exit(5), 5)"]),
    node(["-e", "process.on('exit', code => console.log('exit', code, process.exitCode)); process.exitCode = 4"]),
  ];
  cases.uncaught = [
    node(["-e", "Promise.reject(new Error('lost')); setTimeout(() => console.log('not reached'), 10)"]),
    node(["-e", "process.on('unhandledRejection', reason => console.log('rejected', reason.message)); Promise.reject(new Error('lost'))"]),
    node(["-e", "process.on('uncaughtException', (error, origin) => console.log(error.message, origin)); " +
      "setTimeout(() => { throw new Error('timer'); }, 1); setTimeout(() => console.log('after'), 20)"]),
  ];

  // Messages name the operation and path; stacks start with the message and
  // CommonJS frames name their own file and line.
  const thrown = operation => { try { operation(); } catch (error) { return error; } };
  const relative = value => String(value).replaceAll(root, "ROOT");
  const failure = thrown(() => require(`${scripts}/thrower.cjs`)());
  cases.errors = [
    ...[() => fs.readFileSync(missing), () => fs.renameSync(missing, `${root}/other`), () => fs.mkdirSync(root)]
      .map(thrown).map(error => [relative(error.message), relative(error.stack.split("\n")[0]), error.code, error.syscall]),
    failure.stack.split("\n")[0], /\/scripts\/thrower\.cjs:3:\d+\)$/.test(failure.stack.split("\n")[1]),
  ];

  fs.symlinkSync("file", `${root}/symbolic`);
  fs.writeFileSync(`${root}/long`, "0123456789");
  fs.truncateSync(`${root}/long`, 4);
  const handle = await fsp.open(`${root}/long`, "r+");
  await handle.truncate(2);
  await handle.sync();
  await handle.close();
  cases.links = [fs.readlinkSync(`${root}/symbolic`), await fsp.readlink(`${root}/symbolic`), fs.readFileSync(`${root}/long`, "utf8"),
    await outcome(() => fs.symlinkSync("file", `${root}/symbolic`)), await outcome(() => fs.readlinkSync(file))];

  const blocked = new BlockList();
  blocked.addSubnet("127.0.0.0", 8, "ipv4");
  blocked.addAddress("::1", "ipv6");
  blocked.addRange("10.0.0.1", "10.0.0.9");
  blocked.addSubnet("fe80::", 10, "ipv6");
  cases.blockList = [[["127.1.2.3", "ipv4"], ["128.0.0.1", "ipv4"], ["::1", "ipv6"], ["::ffff:127.0.0.1", "ipv6"],
    ["10.0.0.9", "ipv4"], ["10.0.0.10", "ipv4"], ["febf::1", "ipv6"], ["fec0::1", "ipv6"]].map(([address, type]) => blocked.check(address, type)),
  blocked.rules, await outcome(() => blocked.addAddress("10.0.0.256"))];

  const deep = { list: [1, { a: new Date(5) }], map: new Map([[{ k: 1 }, new Set([1, 2])]]), bytes: Uint8Array.of(1) };
  const same = { list: [1, { a: new Date(5) }], map: new Map([[{ k: 1 }, new Set([2, 1])]]), bytes: Uint8Array.of(1) };
  cases.deepEqual = [util.isDeepStrictEqual(deep, same), util.isDeepStrictEqual([1], ["1"]), util.isDeepStrictEqual({ a: 1 }, { a: 1, b: undefined }),
    util.isDeepStrictEqual(NaN, NaN), util.isDeepStrictEqual(0, -0), util.isDeepStrictEqual(new Set([{}]), new Set([{ x: 1 }])),
    await text(stream.Readable.from(["con", "sumed"]))];
  cases.sha1 = [crypto.createHash("sha1").update("abc").digest("hex"), crypto.createHmac("sha1", "key").update("text").digest("base64")];

  // en-US in UTC, which Janis formats without ICU.
  const instants = [Date.UTC(2026, 9, 5, 14, 5, 9), Date.UTC(2001, 0, 1), Date.UTC(1999, 11, 31, 23, 59, 59)];
  const dateOptions = [{}, { hour: "numeric", minute: "2-digit" }, { weekday: "long", hour: "numeric", minute: "2-digit" },
    { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }, { month: "short", day: "numeric", hour: "numeric", hour12: true },
    { weekday: "short", year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" },
    { year: "numeric", month: "2-digit", day: "2-digit" }, { month: "long", year: "numeric" }, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false },
    { dateStyle: "full" }, { dateStyle: "medium", timeStyle: "short" }, { dateStyle: "short" }, { timeStyle: "medium" }];
  cases.intl = [
    ...instants.flatMap(instant => dateOptions.map(options => new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(instant))),
    ...instants.map(instant => new Date(instant).toLocaleString("en-US", { timeZone: "UTC" })),
    ...[undefined, { notation: "compact" }, { notation: "compact", maximumFractionDigits: 1, minimumFractionDigits: 1 }, { style: "percent" }]
      .flatMap(options => [0, 999, 1234, 99999, 999999, 1250000, -1234.5678, 0.000123, 1.005].map(number => Intl.NumberFormat("en-US", options).format(number))),
    ...["long", "short", "narrow"].flatMap(style => ["always", "auto"].flatMap(numeric => [[-1, "day"], [0, "second"], [5, "hour"], [-1, "month"], [2, "week"]]
      .map(([value, unit]) => new Intl.RelativeTimeFormat("en", { style, numeric }).format(value, unit)))),
    (12345.678).toLocaleString("en-US"), String(new Intl.Locale("en-US")),
  ];
  return JSON.parse(JSON.stringify(cases));
}

if (process.argv[1]?.endsWith("node-oracle.mjs")) {
  const [root, origin] = process.argv.slice(2);
  const expected = await (await fetch(`${origin}/fixture/node-oracle`)).json();
  const actual = await observe(root);
  const mismatches = Object.keys(expected).filter(name => JSON.stringify(actual[name]) !== JSON.stringify(expected[name]));
  for (const name of mismatches)
    console.error(`NODE-ORACLE MISMATCH ${name}: Node ${JSON.stringify(expected[name])}, Janis ${JSON.stringify(actual[name])}`);
  if (mismatches.length) process.exit(1);
  console.log(`NODE-ORACLE-OK ${Object.keys(expected).length} cases`);
}
