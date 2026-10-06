// Dynamic spawn measurement: boots each runnable image of the sealed release
// (proxied read-only from http://localhost:9003) in headless Chrome with a
// process Worker whose dolly_process_0.call wrapper reports, by synchronous
// XHR to this proxy, each process start, its argv, each SPAWN (path, argv,
// child pid) and counts of the tracked operations.
//
//   node measure.mjs OUT.json image [image ...]
import http from "node:http";
import { writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../../package.json", import.meta.url));
const { chromium } = require("playwright-core");

const upstream = { host: "127.0.0.1", port: 9003 };
const [out, ...images] = process.argv.slice(2);
const bootTimeout = Number(process.env.BOOT_TIMEOUT ?? 150_000);
const settleQuiet = Number(process.env.SETTLE_QUIET ?? 5_000);
const settleCap = Number(process.env.SETTLE_CAP ?? 60_000);

const patch = `
const __dyn = { counts: {}, dirty: false, last: 0, started: false, argv: false };
const __TRACK = new Set([64, 65, 67, 68, 112, 113, 114, 120, 121, 122, 123]);
const __BLOCK = new Set([5, 16, 50, 53, 54, 65]);
function __dynSend(kind, extra) {
  try {
    const request = new XMLHttpRequest();
    request.open("POST", self.origin + "/__dyn", false);
    request.send(JSON.stringify({ kind, pid: configuration.pid, tid: configuration.tid, counts: __dyn.counts, ...extra }));
  } catch (error) {}
  __dyn.dirty = false;
  __dyn.last = performance.now();
}
function __dynStrings(address, size) {
  const bytes = new Uint8Array(configuration.memory.buffer, Number(address), Number(size)).slice();
  const text = new TextDecoder().decode(bytes);
  return text.split("\\0").slice(0, -1);
}
function call(operation, requestAddress, requestSize, responseAddress, responseCapacity) {
  const op = operation >>> 0;
  if (!__dyn.started) { __dyn.started = true; __dynSend("start", { threaded: !!configuration.threaded }); }
  if (__TRACK.has(op)) { __dyn.counts[op] = (__dyn.counts[op] ?? 0) + 1; __dyn.dirty = true; }
  let spawn;
  if (op === 64) {
    try {
      const base = Number(requestAddress), view = new DataView(configuration.memory.buffer, base, 56);
      const pathSize = view.getUint32(28, true), argumentBytes = Number(view.getBigUint64(32, true));
      spawn = { flags: view.getUint32(0, true), path: new TextDecoder().decode(new Uint8Array(configuration.memory.buffer, base + 56, pathSize).slice()),
        argv: __dynStrings(base + 56 + pathSize, argumentBytes).map(value => value.slice(0, 200)).slice(0, 24) };
    } catch (error) { spawn = { error: String(error) }; }
  }
  if (__dyn.dirty && (__BLOCK.has(op) || op === 68 || performance.now() - __dyn.last > 250)) __dynSend("counts", { op });
  const result = __dynCall(operation, requestAddress, requestSize, responseAddress, responseCapacity);
  if (spawn) {
    let child = 0;
    try { if (result >= 4n) child = new DataView(configuration.memory.buffer, Number(responseAddress), 4).getUint32(0, true); } catch (error) {}
    __dynSend("spawn", { ...spawn, child, result: Number(result) });
  }
  if (op === 2 && !__dyn.argv && result > 0n) {
    __dyn.argv = true;
    try { __dynSend("argv", { argv: __dynStrings(responseAddress, result).map(value => value.slice(0, 200)).slice(0, 24) }); } catch (error) {}
  }
  return result;
}
`;

let events = [];
let patched = 0;
const server = http.createServer((request, response) => {
  if (request.url === "/__dyn") {
    const chunks = [];
    request.on("data", chunk => chunks.push(chunk));
    request.on("end", () => {
      try { events.push({ t: Date.now(), ...JSON.parse(Buffer.concat(chunks).toString("utf8")) }); } catch {}
      response.writeHead(204, { "cross-origin-resource-policy": "same-origin" });
      response.end();
    });
    return;
  }
  const forward = http.request({ ...upstream, path: request.url, method: request.method,
    headers: { ...request.headers, host: `localhost:${upstream.port}` } }, reply => {
    if (request.url.split("?")[0].endsWith("/dist/dolly-process-worker.mjs") && reply.statusCode === 200) {
      const chunks = [];
      reply.on("data", chunk => chunks.push(chunk));
      reply.on("end", () => {
        const source = Buffer.concat(chunks).toString("utf8");
        const marker = "function call(operation, requestAddressValue,";
        if (source.split(marker).length !== 2) {
          response.writeHead(500); response.end("patch marker missing"); return;
        }
        // Before the original function, so its state exists when the module's
        // top-level await later runs _start.
        const body = Buffer.from(source.replace(marker, patch + "function __dynCall(operation, requestAddressValue,"));
        patched += 1;
        const headers = { ...reply.headers, "content-length": String(body.length) };
        delete headers["content-encoding"]; delete headers.etag;
        response.writeHead(200, headers);
        response.end(body);
      });
      return;
    }
    response.writeHead(reply.statusCode, reply.headers);
    reply.pipe(response);
  });
  forward.on("error", error => { response.writeHead(502); response.end(String(error)); });
  request.pipe(forward);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://localhost:${server.address().port}`;

const names = { 64: "SPAWN", 65: "WAIT", 67: "INFO", 68: "SIGNAL", 112: "DSO_OPEN", 113: "DSO_SYMBOL", 114: "DSO_CLOSE",
  120: "FFI_CALL", 121: "FFI_CLOSURE_ALLOC", 122: "FFI_CLOSURE_FREE", 123: "FFI_CLOSURE_PREP" };

function summarize(list) {
  const processes = new Map();
  const get = pid => {
    if (!processes.has(pid)) processes.set(pid, { pid, parent: null, path: null, argv: null, threads: 0, counts: {}, spawned: [] });
    return processes.get(pid);
  };
  for (const event of list) {
    const record = get(event.pid);
    if (event.kind === "start" && event.tid !== event.pid && event.tid !== 0 && event.tid !== undefined && event.threaded && event.tid > 1) record.threads += 0;
    if (event.kind === "argv" && !record.argv) record.argv = event.argv;
    if (event.kind === "spawn") {
      record.spawned.push({ child: event.child, path: event.path, argv: event.argv, result: event.result, flags: event.flags });
      if (event.child) { const child = get(event.child); child.parent = event.pid; child.path = event.path; child.spawnArgv = event.argv; }
    }
    // Counts are cumulative per Worker (pid, tid): keep the latest per tid.
    record.byTid ??= {};
    record.byTid[event.tid] = event.counts;
  }
  for (const record of processes.values()) {
    for (const counts of Object.values(record.byTid ?? {})) {
      for (const [op, count] of Object.entries(counts)) record.counts[names[op]] = (record.counts[names[op]] ?? 0) + count;
    }
    record.threads = Math.max(0, Object.keys(record.byTid ?? {}).length - 1);
    delete record.byTid;
  }
  return [...processes.values()].sort((left, right) => left.pid - right.pid);
}

const results = [];
mkdirSync(new URL("./shots/", import.meta.url), { recursive: true });
for (const image of images) {
  events = [];
  const started = Date.now();
  const record = { image, status: null, readyMs: null, settledMs: null, note: "" };
  const browser = await chromium.launch({ channel: "chrome", headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--enable-unsafe-webgpu"] });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: "block" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(String(error).slice(0, 300)));
    await page.goto(`${origin}/${image}/`);
    await page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus),
      null, { timeout: bootTimeout });
    record.status = await page.evaluate(() => document.documentElement.dataset.dollyStatus);
    record.readyMs = Date.now() - started;
    if (record.status !== "ready") {
      record.note = (await page.locator("#bootstrap-log").textContent().catch(() => "")).slice(-400);
    } else {
      const readyAt = Date.now();
      // Settled: no report for settleQuiet ms (and at least that long after ready), capped.
      for (;;) {
        // Count reports alone (a WAIT poll loop) do not keep an image unsettled.
        const last = events.findLast(event => event.kind !== "counts")?.t ?? readyAt;
        const now = Date.now();
        if (now - Math.max(last, readyAt) >= settleQuiet) break;
        if (now - readyAt >= settleCap) { record.note = "settle cap reached; still starting processes"; break; }
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      record.settledMs = Date.now() - started;
      record.status = await page.evaluate(() => document.documentElement.dataset.dollyStatus);
      if (record.status !== "ready") record.note += (await page.locator("#bootstrap-log").textContent().catch(() => "")).slice(0, 600);
      record.entry = await page.evaluate(() => globalThis.__dolly?.entry ?? null).catch(() => null);
      record.hostModules = await page.evaluate(() => [...(globalThis.__dolly?.hostModules ?? [])].sort()).catch(() => null);
      record.terminal = (await page.evaluate(() => globalThis.__dolly?.visibleTerminalText?.()).catch(error => String(error)) ?? "")
        .split("\n").map(line => line.trimEnd()).filter(Boolean).slice(-12).join("\n");
      record.foreground = await page.evaluate(() => {
        const terminal = globalThis.__dolly?.terminal;
        const read = name => { try { return typeof terminal?.[name] === "function" ? terminal[name]() : undefined; } catch (error) { return String(error); } };
        return { interruptible: read("foregroundInterruptible"), pid: read("foregroundPid"), result: read("currentResultSequence") };
      }).catch(() => null);
      record.graphics = await page.evaluate(() => ({ graphicsActive: globalThis.__dolly?.graphicsActive ?? null,
        gpuActive: globalThis.__dolly?.gpu?.active ?? null, gpuError: globalThis.__dolly?.gpu?.error ?? null,
        gpuFrames: globalThis.__dolly?.gpu?.stats?.frames ?? null })).catch(() => null);
      // COMMANDS='["cmd", ...]': after the boot measurement, submit each to the
      // shell prompt and report the processes it started.
      record.bootProcesses = summarize(events);
      record.commands = [];
      for (const command of JSON.parse(process.env.COMMANDS ?? "[]")) {
        const before = events.length;
        const status = await Promise.race([
          page.evaluate(command => __dolly.submit(command), command).catch(error => String(error).slice(0, 200)),
          new Promise(resolve => setTimeout(() => resolve("timeout"), Number(process.env.COMMAND_TIMEOUT ?? 90_000))),
        ]);
        const during = events.slice(before);
        const pids = new Set(during.filter(event => event.kind === "start").map(event => event.pid));
        record.commands.push({ command, status,
          processes: summarize(during).filter(process => pids.has(process.pid) || process.spawned.length) });
      }
      // KEYS='["text", ...]': type each line (then Enter) into the foreground
      // program, wait 4 s, and record every process's cumulative counts.
      record.keys = [];
      for (const text of JSON.parse(process.env.KEYS ?? "[]")) {
        await page.locator("#keyboard").focus();
        await page.keyboard.type(text);
        await page.keyboard.press("Enter");
        await new Promise(resolve => setTimeout(resolve, 4000));
        record.keys.push({ text, processes: summarize(events).map(({ pid, argv, counts }) => ({ pid, argv, counts })),
          terminal: (await page.evaluate(() => globalThis.__dolly?.visibleTerminalText?.()).catch(error => String(error)) ?? "")
            .split("\n").map(line => line.trimEnd()).filter(Boolean).slice(0, 6).join("\n") });
      }
      await page.screenshot({ path: new URL(`./shots/${image}.png`, import.meta.url).pathname }).catch(() => {});
    }
    record.errors = errors.slice(0, 5);
    await context.close();
  } catch (error) {
    record.status ??= "error";
    record.note = String(error.message ?? error).slice(0, 400);
  } finally {
    await browser.close().catch(() => {});
  }
  record.processes = summarize(events);
  record.events = events.length;
  record.totalSpawns = record.processes.reduce((sum, process) => sum + (process.counts.SPAWN ?? 0), 0);
  results.push(record);
  writeFileSync(out, JSON.stringify(results, null, 1));
  const callers = record.processes.filter(process => process.counts.SPAWN).map(process =>
    `${process.pid}:${(process.argv ?? [process.path]).slice(0, 3).join(" ")} x${process.counts.SPAWN}`).join("; ");
  console.log(`${image}: ${record.status} ready ${record.readyMs}ms settled ${record.settledMs}ms pids ${record.processes.length} spawns ${record.totalSpawns} [${callers}] ${record.note.slice(0, 120)}`);
}
console.log(`patched worker served ${patched} times`);
server.close();
