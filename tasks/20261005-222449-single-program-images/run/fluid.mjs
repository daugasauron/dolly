// gpu-fluid as a root image, ENTRY direct vs through the shell: node fluid.mjs [runs]
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../../package.json", import.meta.url));
const { chromium } = require("playwright-core");
const here = new URL(".", import.meta.url).pathname, origin = "http://localhost:9003";
const runs = Number(process.argv[2] ?? 6);
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--no-sandbox", "--disable-gpu", "--enable-unsafe-webgpu"] });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const lines = [];
const say = text => { lines.push(text); console.log(text); };
async function build(variant) {
  const source = await readFile(`${here}out/${variant}/Dollyfile`, "utf8");
  const page = await context.newPage();
  page.on("pageerror", error => say(`[${variant} build pageerror] ${error.message.slice(0, 200)}`));
  await page.addInitScript(recipe => { if (location.pathname.endsWith("/custom/rebuild/")) sessionStorage.setItem("dolly-custom-source", recipe); }, source);
  const started = Date.now();
  await page.goto(`${origin}/custom/rebuild/`);
  await page.waitForFunction(() => ["ready", "failed", "exited"].includes(document.documentElement.dataset.dollyStatus), null, { timeout: 600000 });
  const status = await page.evaluate(() => document.documentElement.dataset.dollyStatus);
  await writeFile(`${here}out/${variant}/build-log.txt`, await page.locator("#bootstrap-log").textContent());
  if (status !== "ready") { say(`${variant}: build ${status}: ${(await page.locator("#bootstrap-log").textContent()).slice(-700)}`); return null; }
  const record = await page.evaluate(async source => {
    const { describeImageArtifact, sha256 } = await import("/src/image-artifact.mjs");
    const artifact = await describeImageArtifact(__dolly.systemSnapshot, await sha256(new TextEncoder().encode(source)), __dolly.systemInputs);
    const { buildId, recipeSha256, sha256: digest, byteLength, inputs } = artifact;
    return { source, artifact: { buildId, recipeSha256, sha256: digest, byteLength, inputs }, policies: [null] };
  }, source);
  say(`${variant}: built in ${((Date.now() - started) / 1000).toFixed(1)}s, artifact ${record.artifact.byteLength} bytes (${(record.artifact.byteLength / 1048576).toFixed(2)} MiB)`);
  console.error(`${variant}: built`);
  await page.waitForTimeout(3000);
  say(`${variant}: build page gpu=${JSON.stringify(await page.evaluate(() => ({ error: __dolly.gpu?.error, frames: __dolly.gpu?.stats?.frames, active: __dolly.gpu?.active, graphics: __dolly.graphicsActive, foregroundPid: __dolly.foregroundPid, interruptible: __dolly.terminal.foregroundInterruptible() })))}`);
  await page.screenshot({ path: `${here}out/${variant}/build-page.png` });
  return { variant, page, record };
}
async function open({ page: builder, record }) {
  const popup = context.waitForEvent("page");
  await builder.evaluate(async record => (await import("/src/custom-image.mjs")).openCustomImage(record), record);
  const page = await popup;
  await page.waitForURL("**/custom/run/", { waitUntil: "commit" });
  const result = await page.evaluate(async () => {
    const wait = () => new Promise(resolve => setTimeout(resolve, 2));
    const deadline = Date.now() + 60000;
    while (!["ready", "failed", "exited"].includes(document.documentElement.dataset.dollyStatus) && Date.now() < deadline) await wait();
    const ready = Date.now(), status = document.documentElement.dataset.dollyStatus;
    let frame = null;
    while (Date.now() < deadline) {
      if (globalThis.__dolly?.gpu?.stats?.frames > 0) { frame = Date.now(); break; }
      if (document.documentElement.dataset.dollyStatus !== "ready" && Date.now() - ready > 3000) break;
      await wait();
    }
    return { status, ready: Math.round(ready - performance.timeOrigin), frame: frame && Math.round(frame - performance.timeOrigin) };
  });
  return { page, result };
}
const snapshot = page => page.evaluate(() => ({ status: document.documentElement.dataset.dollyStatus,
  bootstrapHidden: document.querySelector("#bootstrap-log").hidden,
  gpu: globalThis.__dolly?.gpu ? { error: __dolly.gpu.error, frames: __dolly.gpu.stats?.frames, active: __dolly.gpu.active } : null,
  graphics: (() => { try { return __dolly.graphicsActive; } catch (error) { return String(error.message); } })(),
  foregroundPid: (() => { try { return __dolly.foregroundPid; } catch (error) { return String(error.message); } })(),
  interruptible: (() => { try { return __dolly.terminal.foregroundInterruptible(); } catch (error) { return String(error.message); } })() }));
const builds = [];
for (const variant of ["fluiddirect", "fluidwrapped"]) { const built = await build(variant); if (built) builds.push(built); }
const samples = {};
for (const built of builds) await (await open(built)).page.close();
for (let run = 0; run < runs; run++) for (const built of run % 2 ? [...builds].reverse() : builds) {
  const { page, result } = await open(built);
  console.error(`${built.variant} ${JSON.stringify(result)}`);
  (samples[built.variant] ??= []).push(result);
  await page.close();
  await new Promise(resolve => setTimeout(resolve, 700));
}
const stats = values => { const sorted = values.slice().sort((x, y) => x - y); return `median ${sorted[Math.floor(sorted.length / 2)]} min ${sorted[0]} max ${sorted.at(-1)}`; };
for (const [variant, list] of Object.entries(samples)) {
  say(`${variant}: n=${list.length} | navigation->entry-ready ms: ${stats(list.map(s => s.ready))} | navigation->first GPU frame ms: ${stats(list.map(s => s.frame))} | entry-ready->first frame ms: ${stats(list.map(s => s.frame - s.ready))}`);
  say(`  raw ${JSON.stringify(list)}`);
}
// The software adapter ends fluid after its first frame: what does each page show then?
for (const built of builds) {
  const { page } = await open(built);
  await page.waitForTimeout(4000);
  say(`${built.variant} after fluid ended: ${JSON.stringify(await snapshot(page))}`);
  say(`${built.variant} terminal: ${JSON.stringify(await page.evaluate(async () => { try { return await __dolly.visibleTerminalText(); } catch (error) { return `<<${error.message}>>`; } }).catch(error => `<<${error.message}>>`))}`);
  await page.screenshot({ path: `${here}out/${built.variant}/after-end.png` });
  await page.close();
}
await writeFile(`${here}out/fluid.txt`, lines.join("\n") + "\n");
await browser.close();
