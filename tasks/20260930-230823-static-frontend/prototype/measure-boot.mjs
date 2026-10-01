// Prototype for tasks/20260930-230823-static-frontend: not part of the build.
// usage: node measure-boot.mjs ROOT PAGE_PATH [cacheControl] [chromium|firefox ...]
// Serves ROOT with static-serve.mjs, boots PAGE_PATH, and reports requests, bytes,
// boot time, spawn latency and offline spawn behaviour per browser.
import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { chromium, firefox } from "playwright-core";

const [root, pagePath, cacheControl = "no-store", ...names] = process.argv.slice(2);
if (!names.length) names.push("chromium", "firefox");
const server = spawn(process.execPath, [new URL("./static-serve.mjs", import.meta.url).pathname, root, "0", cacheControl]);
const hits = [];
let origin;
server.stdout.on("data", chunk => {
  for (const line of chunk.toString().split("\n")) {
    if (line.startsWith("http://")) origin = line.trim().replace(/\/$/, "");
    else if (line.startsWith("hit ")) hits.push(line.slice(4));
  }
});
await new Promise(resolve => { const poll = () => origin ? resolve() : setTimeout(poll, 20); poll(); });
const mark = async label => { await fetch(`${origin}/__mark/${label}`); await new Promise(r => setTimeout(r, 50)); };
async function section(from, to) {
  const start = hits.indexOf(`/__mark/${from}`), end = hits.indexOf(`/__mark/${to}`);
  const paths = hits.slice(start + 1, end).filter(path => !path.startsWith("/__mark/"));
  let bytes = 0;
  for (const path of paths) bytes += await stat(join(root, path)).then(s => s.isDirectory() ? 0 : s.size, () => 0);
  return { count: paths.length, bytes, paths };
}
const median = values => values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];

for (const name of names) {
  const browser = await (name === "chromium"
    ? chromium.launch({ channel: "chrome", headless: true, args: ["--no-sandbox", "--disable-gpu", "--enable-unsafe-webgpu"] })
    : firefox.launch({ headless: true, firefoxUserPrefs: { "dom.events.testing.asyncClipboard": true, "dom.webgpu.enabled": true } }));
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  const pageRequests = [];
  page.on("request", request => pageRequests.push(request.url()));
  await mark(`${name}-boot-start`);
  const started = performance.now();
  await page.goto(origin + pagePath);
  await page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus));
  const readyMs = performance.now() - started;
  const status = await page.evaluate(() => document.documentElement.dataset.dollyStatus);
  if (status !== "ready") {
    console.log(`${name}: FAILED\n${await page.locator("#bootstrap-log").textContent()}`);
    await browser.close();
    continue;
  }
  await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "shell"));
  const promptMs = performance.now() - started;
  await mark(`${name}-boot-end`);
  const boot = await section(`${name}-boot-start`, `${name}-boot-end`);
  const bootPageRequests = pageRequests.length;
  // Spawn cost: 30 single commands, then 100 processes through xargs.
  const single = [];
  for (let i = 0; i < 30; i++) {
    const t = performance.now();
    if (await page.evaluate(() => __dolly.submit("true")) !== 0) throw new Error("true failed");
    single.push(performance.now() - t);
  }
  const t = performance.now();
  if (await page.evaluate(() => __dolly.submit("seq 1 100 | xargs -n1 true")) !== 0) throw new Error("xargs failed");
  const xargsMs = performance.now() - t;
  await mark(`${name}-spawn-end`);
  const spawnHits = await section(`${name}-boot-end`, `${name}-spawn-end`);
  const spawnPageRequests = pageRequests.length - bootPageRequests;
  // Offline: every request aborted (Playwright routing also bypasses the HTTP cache).
  await page.context().route("**/*", route => route.abort());
  const offlineStatus = await page.evaluate(() => Promise.race([__dolly.submit("true"),
    new Promise(resolve => setTimeout(() => resolve("timeout"), 15000))]));
  await page.context().unroute("**/*");
  console.log(JSON.stringify({ browser: name, page: pagePath, cacheControl,
    boot: { readyMs: Math.round(readyMs), promptMs: Math.round(promptMs), serverHits: boot.count,
      serverBytes: boot.bytes, pageRequests: bootPageRequests },
    spawn: { singleMedianMs: Math.round(median(single)), singleMeanMs: Math.round(single.reduce((a, b) => a + b) / single.length),
      xargs100Ms: Math.round(xargsMs), serverHits: spawnHits.count, serverPaths: [...new Set(spawnHits.paths)],
      pageRequests: spawnPageRequests, offlineTrueStatus: offlineStatus },
  }));
  if (process.env.SHOW_BOOT_PATHS) console.log(boot.paths.join("\n"));
  await browser.close();
}
server.kill();
