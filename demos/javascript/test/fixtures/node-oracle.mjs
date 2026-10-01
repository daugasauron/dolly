// Node API cases whose observations must be identical in Node and Janis.
// The browser test runs observe() in Node and serves the result; Janis runs
// `janis -m node-oracle.mjs ROOT ORIGIN` and compares its own observations.
import { execSync } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { createRequire } from "node:module";
import stream from "node:stream";
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
