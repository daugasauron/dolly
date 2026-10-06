// Interleaved boot timing of two recipes run.mjs wrote (out/A/Dollyfile):
//   [BROWSER=firefox] node timing.mjs A B [runs]
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../../package.json", import.meta.url));
const { chromium, firefox } = require("playwright-core");
const here = new URL(".", import.meta.url).pathname, origin = "http://localhost:9003";
const [a, b, runs = "10"] = process.argv.slice(2);
const browser = process.env.BROWSER === "firefox" ? await firefox.launch({ headless: true })
  : await chromium.launch({ channel: "chrome", headless: true, args: ["--no-sandbox", "--disable-gpu", "--enable-unsafe-webgpu"] });
const context = await browser.newContext();
const lines = [];
const say = text => { lines.push(text); console.log(text); };
async function build(variant) {
  const source = await readFile(`${here}out/${variant}/Dollyfile`, "utf8");
  const page = await context.newPage();
  await page.addInitScript(recipe => { if (location.pathname.endsWith("/custom/rebuild/")) sessionStorage.setItem("dolly-custom-source", recipe); }, source);
  await page.goto(`${origin}/custom/rebuild/`);
  await page.waitForFunction(() => ["ready", "failed", "exited"].includes(document.documentElement.dataset.dollyStatus), null, { timeout: 600000 });
  const record = await page.evaluate(async source => {
    const { describeImageArtifact, sha256 } = await import("/src/image-artifact.mjs");
    const artifact = await describeImageArtifact(__dolly.systemSnapshot, await sha256(new TextEncoder().encode(source)), __dolly.systemInputs);
    const { buildId, recipeSha256, sha256: digest, byteLength, inputs } = artifact;
    return { source, artifact: { buildId, recipeSha256, sha256: digest, byteLength, inputs }, policies: [null] };
  }, source);
  say(`${variant}: artifact ${record.artifact.byteLength} bytes (${(record.artifact.byteLength / 1048576).toFixed(2)} MiB)`);
  return { variant, page, record };
}
async function sample({ page: builder, record }) {
  const popup = context.waitForEvent("page");
  const started = Date.now();
  await builder.evaluate(async record => (await import("/src/custom-image.mjs")).openCustomImage(record), record);
  const page = await popup;
  await page.waitForURL("**/custom/run/", { waitUntil: "commit" });
  // The page stamps its own milestones: entry acknowledged, and PROBE-READY on screen.
  const result = await page.evaluate(async () => {
    const wait = () => new Promise(resolve => setTimeout(resolve, 2));
    const deadline = Date.now() + 60000;
    while (!["ready", "failed", "exited"].includes(document.documentElement.dataset.dollyStatus) && Date.now() < deadline) await wait();
    const ready = Date.now(), status = document.documentElement.dataset.dollyStatus;
    let probe = null, pid = null;
    while (status === "ready" && Date.now() < deadline) {
      let text = "";
      try { text = await __dolly.visibleTerminalText(); } catch {}
      if (/PROBE-READY/.test(text)) { probe = Date.now(); pid = Number(/PROBE-START pid=(\d+)/.exec(text)?.[1]); break; }
      await wait();
    }
    return { status, ready, probe, pid, navigationStart: performance.timeOrigin };
  });
  await page.close();
  await new Promise(resolve => setTimeout(resolve, 700));
  return { status: result.status, pid: result.pid, readyFromOpen: result.ready - started, probeFromOpen: result.probe && result.probe - started,
    readyFromNavigation: Math.round(result.ready - result.navigationStart), probeFromNavigation: result.probe && Math.round(result.probe - result.navigationStart) };
}
const builds = [await build(a), await build(b)];
const samples = { [a]: [], [b]: [] };
for (const warm of builds) await sample(warm);
for (let run = 0; run < Number(runs); run++) for (const built of run % 2 ? [...builds].reverse() : builds) samples[built.variant].push(await sample(built));
const stats = values => { const sorted = values.slice().sort((x, y) => x - y); return `median ${sorted[Math.floor(sorted.length / 2)]} min ${sorted[0]} max ${sorted.at(-1)}`; };
for (const variant of [a, b]) {
  const list = samples[variant];
  say(`${variant}: n=${list.length} pid=${list[0].pid} | navigation->entry-ready ms: ${stats(list.map(s => s.readyFromNavigation))} | navigation->PROBE-READY ms: ${stats(list.map(s => s.probeFromNavigation))} | entry-ready->PROBE-READY ms: ${stats(list.map(s => s.probeFromNavigation - s.readyFromNavigation))}`);
  say(`  raw ${JSON.stringify(list.map(s => [s.readyFromNavigation, s.probeFromNavigation]))}`);
}
await writeFile(`${here}out/timing-${a}-vs-${b}.txt`, lines.join("\n") + "\n");
await browser.close();
