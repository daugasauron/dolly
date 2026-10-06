// Direct-ENTRY experiment against the sealed release at http://localhost:9003.
// usage: node run.mjs VARIANT [scenario ...]   VARIANT: direct | wrapped | root
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../../package.json", import.meta.url));
const { chromium } = require("playwright-core");

const here = new URL(".", import.meta.url).pathname;
const origin = process.env.ORIGIN ?? "http://localhost:9003";
const [variant = "direct", ...scenarios] = process.argv.slice(2);
const out = `${here}out/${variant}`;
await mkdir(out, { recursive: true });
const log = [];
const say = (...parts) => { const line = parts.join(" "); log.push(line); console.log(line); };

const probe = (await readFile(`${here}probe.c`, "utf8")).split("\n").map(line => line ? `    ${line}` : "").join("\n");
const system = "https://daugasauron.com/Dollyfile-system 041c6f482c61b6afba4741e202fdbffb09adb3c6f25fa0be64af02a7f06fafa4";
const display = "https://daugasauron.com/Dollyfile-display c7ba6df08c159e5d4fc3364f2b8811ed91c794efce16039deee5f45829fb07bd";
const systemHosts = ["display", "download", "http", "snapshot", "upload"].map(name => `REQUIRES HOST ${name}@0`).join("\n");
const recipes = {
  direct: `DOLLY 6
APPLICATION direct-entry
${systemHosts}

FROM ${system}

FILE /tmp/probe.c
${probe}
SLOP cc -O1 /tmp/probe.c -o /usr/bin/probe
EXPORTS TOOL probe
ENTRY /usr/bin/probe
`,
  wrapped: `DOLLY 6
APPLICATION wrapped-entry
${systemHosts}

FROM ${system}

FILE /tmp/probe.c
${probe}
SLOP cc -O1 /tmp/probe.c -o /usr/bin/probe
EXPORTS TOOL probe
FILE /etc/dolly/probe.slop
    /bin/foreground /usr/bin/probe
    /bin/foreground -i /bin/slop
ENTRY /bin/foreground -i /bin/slop /etc/dolly/probe.slop
`,
  // No FROM: the image keeps only what it installs and declares.
  root: `DOLLY 6
APPLICATION root-entry
REQUIRES HOST display@0

INSTALL ${display}

FILE /tmp/probe.c
${probe}
RUN /usr/libexec/dolly/process-bin/compiler --dolly-toolchain-mode=c -O1 /tmp/probe.c -o /bin/probe
EXPORTS FILE probe /bin/probe
ENTRY /bin/probe
`,
};
recipes.rootsession = recipes.root.replace("REQUIRES HOST display@0\n", "REQUIRES HOST display@0\nREQUIRES HOST http@0\nREQUIRES HOST snapshot@0\n");
// The same root image with the shell in front: core adds Slop and foreground.
recipes.rootwrapped = recipes.root.replace("APPLICATION root-entry", "APPLICATION root-wrapped")
  .replace(`INSTALL ${display}\n`, `INSTALL https://daugasauron.com/Dollyfile-core 9935068c58daa51f4029053454ac63e5938eaaffda07263bd9c6478bfc794c98\nINSTALL ${display}\n`)
  .replace("ENTRY /bin/probe\n", "FILE /etc/dolly/probe.slop\n    /bin/foreground /bin/probe\n    /bin/foreground -i /bin/slop\nENTRY /bin/foreground -i /bin/slop /etc/dolly/probe.slop\n");
const source = process.env.RECIPE ? await readFile(process.env.RECIPE, "utf8") : recipes[variant];
await writeFile(`${out}/Dollyfile`, source);

const browser = await chromium.launch({ channel: "chrome", headless: true,
  args: ["--no-sandbox", "--disable-gpu", "--enable-unsafe-webgpu"] });
const context = await browser.newContext();
const state = page => page.evaluate(() => ({
  status: document.documentElement.dataset.dollyStatus,
  dataset: { ...document.documentElement.dataset },
  bootstrapHidden: document.querySelector("#bootstrap-log")?.hidden,
  bootstrapTail: document.querySelector("#bootstrap-log")?.textContent.slice(-600),
  canvasHidden: document.querySelector("canvas")?.hidden,
  visibleStatus: [...document.querySelectorAll("[id*=status],[role=status],[role=alert]")]
    .filter(node => !node.hidden && node.textContent.trim()).map(node => `${node.id}: ${node.textContent.trim().slice(0, 200)}`),
  foregroundPid: globalThis.__dolly?.terminal ? (() => { try { return __dolly.terminal.foregroundPid(); } catch (error) { return String(error); } })() : null,
  interruptible: globalThis.__dolly?.terminal ? (() => { try { return __dolly.terminal.foregroundInterruptible(); } catch (error) { return String(error); } })() : null,
}));
const text = page => page.evaluate(async () => {
  try { return await __dolly.visibleTerminalText(); } catch (error) { return `<<no terminal text: ${error.message}>>`; }
});
async function waitText(page, pattern, timeout = 60000) {
  const deadline = Date.now() + timeout;
  let seen = "";
  while (Date.now() < deadline) {
    const status = await page.evaluate(() => document.documentElement.dataset.dollyStatus).catch(() => "gone");
    if (status === "ready" || status === "exited") {
      seen = await text(page).catch(error => `<<${error.message}>>`);
      if (pattern.test(seen)) return { at: Date.now(), seen };
    }
    if (status === "failed") return { at: null, seen: `FAILED: ${(await state(page)).bootstrapTail}` };
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  return { at: null, seen };
}
const settle = ms => new Promise(resolve => setTimeout(resolve, ms));
function watch(page, label) {
  page.on("console", message => { if (["error", "warning"].includes(message.type())) say(`[${label} console.${message.type()}] ${message.text().slice(0, 300)}`); });
  page.on("pageerror", error => say(`[${label} pageerror] ${error.message.slice(0, 300)}`));
  page.on("dialog", dialog => { say(`[${label} dialog ${dialog.type()}] ${dialog.message().slice(0, 200)}`); void dialog.dismiss().catch(() => {}); });
}

try {
  // 1. Build the recipe in the page, as /custom/ does.
  const builder = await context.newPage();
  builder.setDefaultTimeout(600000);
  watch(builder, "build");
  await builder.addInitScript(recipe => {
    if (location.pathname.endsWith("/custom/rebuild/")) sessionStorage.setItem("dolly-custom-source", recipe);
  }, source);
  const buildStarted = Date.now();
  await builder.goto(`${origin}/custom/rebuild/`);
  await builder.waitForFunction(() => ["ready", "failed", "exited", "built"].includes(document.documentElement.dataset.dollyStatus), null, { timeout: 600000 });
  const built = await state(builder);
  say(`BUILD ${variant}: status=${built.status} after ${((Date.now() - buildStarted) / 1000).toFixed(1)}s snapshotBytes=${built.dataset.snapshotBytes}`);
  await writeFile(`${out}/build-log.txt`, await builder.locator("#bootstrap-log").textContent());
  if (built.status === "failed") { say(built.bootstrapTail); throw new Error("build failed"); }
  const first = await waitText(builder, /PROBE-READY/, 30000);
  say(`BUILD-PAGE terminal:\n${first.seen}`);
  await writeFile(`${out}/first-terminal.txt`, first.seen);
  say("BUILD-PAGE state:", JSON.stringify(await state(builder)));
  const record = await builder.evaluate(async source => {
    const { describeImageArtifact, sha256 } = await import("/src/image-artifact.mjs");
    const artifact = await describeImageArtifact(__dolly.systemSnapshot, await sha256(new TextEncoder().encode(source)), __dolly.systemInputs);
    const { buildId, recipeSha256, sha256: digest, byteLength, inputs } = artifact;
    return { source, artifact: { buildId, recipeSha256, sha256: digest, byteLength, inputs }, policies: [null] };
  }, source);
  say(`ARTIFACT byteLength=${record.artifact.byteLength} (${(record.artifact.byteLength / 1048576).toFixed(2)} MiB)`);

  // 2. Open the completed image in a result tab (snapshot boot), once per scenario.
  async function open(label) {
    const popup = context.waitForEvent("page");
    const started = Date.now();
    await builder.evaluate(async record => (await import("/src/custom-image.mjs")).openCustomImage(record), record);
    const page = await popup;
    page.setDefaultTimeout(60000);
    watch(page, label);
    await page.waitForFunction(() => ["ready", "failed", "exited"].includes(document.documentElement.dataset.dollyStatus), null, { timeout: 120000 }).catch(() => {});
    const readyAt = Date.now();
    const probeReady = await waitText(page, /PROBE-READY/, 30000);
    return { page, started, readyAt, probeAt: probeReady.at, seen: probeReady.seen };
  }
  const type = async (page, keys) => { await page.locator("#keyboard").focus(); await page.keyboard.type(keys); };
  const report = async (page, label) => {
    const terminal = await text(page).catch(error => `<<${error.message}>>`);
    say(`--- ${label} state: ${JSON.stringify(await state(page))}`);
    say(`--- ${label} terminal:\n${terminal.split("\n").filter(line => !/^PROBE env |^\s*$/.test(line)).slice(-14).join("\n")}`);
    await writeFile(`${out}/${label.replace(/[^a-z0-9-]+/gi, "_")}.txt`, terminal);
    await page.screenshot({ path: `${out}/${label.replace(/[^a-z0-9-]+/gi, "_")}.png` }).catch(error => say(`screenshot: ${error.message}`));
  };
  const all = {
    async timing() {
      const samples = [];
      for (let run = 0; run < Number(process.env.RUNS ?? 5); run++) {
        const { page, started, readyAt, probeAt, seen } = await open(`timing${run}`);
        samples.push({ ready: readyAt - started, probe: probeAt ? probeAt - started : null });
        if (run === 0) { say(`TIMING first terminal:\n${seen.split("\n").filter(line => !/^PROBE env /.test(line)).join("\n")}`); await writeFile(`${out}/run-terminal.txt`, seen); }
        await page.close();
      }
      const median = values => values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];
      say(`TIMING ${variant}: samples=${JSON.stringify(samples)} median ready=${median(samples.map(s => s.ready))}ms probe=${median(samples.map(s => s.probe))}ms`);
    },
    async input() {
      const { page } = await open("input");
      await page.evaluate(() => __dolly.input("z"));
      await waitText(page, /PROBE got 0x7a/, 5000);
      await type(page, "y");
      const typed = await waitText(page, /PROBE got 0x79/, 5000);
      say(`INPUT: mailbox z and keyboard y ${typed.at ? "reached the program" : "did NOT reach the program"}`);
      await report(page, "input");
      await page.close();
    },
    async exit0() {
      const { page } = await open("exit0");
      await type(page, "q");
      await settle(2500);
      await report(page, "exit0");
      await type(page, "zz").catch(error => say(`exit0 typing afterwards: ${error.message}`));
      await settle(500);
      await report(page, "exit0-after-typing");
      const reloaded = Date.now();
      await page.reload();
      await page.waitForFunction(() => ["ready", "failed", "exited"].includes(document.documentElement.dataset.dollyStatus), null, { timeout: 120000 }).catch(() => {});
      const again = await waitText(page, /PROBE-READY/, 30000);
      say(`RELOAD after exit: ${again.at ? `restarted, PROBE-READY after ${again.at - reloaded}ms` : "did NOT restart"}`);
      await report(page, "exit0-reloaded");
      await page.close();
    },
    async exit3() {
      const { page } = await open("exit3");
      await type(page, "x");
      await settle(2500);
      await report(page, "exit3");
      await page.close();
    },
    async abort() {
      const { page } = await open("abort");
      await type(page, "a");
      await settle(3000);
      await report(page, "abort");
      await page.close();
    },
    async trap() {
      const { page } = await open("trap");
      await type(page, "t");
      await settle(3000);
      await report(page, "trap");
      await page.close();
    },
    async ctrlc() {
      const { page } = await open("ctrlc");
      say("CTRLC before:", JSON.stringify(await state(page)));
      await page.locator("#keyboard").focus();
      await page.keyboard.press("Control+c");
      await settle(2500);
      await report(page, "ctrlc-default");
      await page.close();
    },
    async ctrlcHandler() {
      const { page } = await open("ctrlc-handler");
      await type(page, "h");
      await waitText(page, /handler installed/, 5000);
      await page.keyboard.press("Control+c");
      await settle(1500);
      await type(page, "i");
      await settle(1000);
      await report(page, "ctrlc-handler");
      await page.close();
    },
    async ctrlcCpu() {
      const { page } = await open("ctrlc-cpu");
      await type(page, "c");
      await waitText(page, /cpu-loop/, 5000);
      const pressed = Date.now();
      await page.keyboard.press("Control+c");
      await page.waitForFunction(() => document.documentElement.dataset.dollyStatus !== "ready", null, { timeout: 10000 }).catch(() => {});
      say(`CTRLC-CPU: status changed ${Date.now() - pressed}ms after Ctrl+C`);
      await report(page, "ctrlc-cpu");
      await page.close();
    },
    // The same exits without a selection on screen: what a person sees.
    async shots() {
      for (const key of ["q", "x", "a"]) {
        const { page } = await open(`shot-${key}`);
        await page.evaluate(async () => {
          const geometry = __dolly.transport.geometry();
          const x = geometry.paddingX + Math.floor(geometry.cellWidth / 2), y = geometry.paddingY + Math.floor(geometry.cellHeight / 2);
          __dolly.transport.pushPointer(x, y, 1, {});
          __dolly.transport.pushPointer(x, y, 0, {});
        });
        await settle(500);
        await page.screenshot({ path: `${out}/shot-${key}-before.png` });
        await type(page, key);
        await settle(2500);
        await page.screenshot({ path: `${out}/shot-${key}-after.png` });
        const after = await state(page);
        say(`SHOT ${key}: status=${after.status} bootstrapHidden=${after.bootstrapHidden} foregroundPid=${after.foregroundPid} visibleStatus=${JSON.stringify(after.visibleStatus)}`);
        if (after.status === "ready") say(`SHOT ${key} terminal:\n${(await text(page)).split("\n").filter(line => !/^PROBE env |^\s*$/.test(line)).slice(-8).join("\n")}`);
        await page.close();
      }
    },
    async session() {
      const { page } = await open("session");
      await type(page, "z");
      await waitText(page, /PROBE got 0x7a/, 5000);
      const name = `probe-${variant}-${Date.now()}`;
      const saved = await page.evaluate(name => __dolly.saveSession(name).then(value => ({ value }), error => ({ error: error.message })), name);
      say(`SESSION save: ${JSON.stringify(saved)} url=${page.url()} sessionStatus=${await page.evaluate(() => document.documentElement.dataset.sessionStatus)}`);
      await report(page, "session-saved");
      const restore = await context.newPage();
      watch(restore, "restore");
      const started = Date.now();
      await restore.goto(`${origin}/session/?name=${name}`);
      await restore.waitForFunction(() => ["ready", "failed", "exited"].includes(document.documentElement.dataset.dollyStatus), null, { timeout: 120000 }).catch(() => {});
      const again = await waitText(restore, /PROBE-READY/, 30000);
      say(`SESSION restore: ${again.at ? `PROBE-READY after ${again.at - started}ms` : "no PROBE-READY"}`);
      await report(restore, "session-restored");
      await restore.close();
      await page.close();
    },
  };
  for (const name of scenarios.length ? scenarios : Object.keys(all)) {
    say(`\n===== ${variant} / ${name} =====`);
    try { await all[name](); } catch (error) { say(`SCENARIO ${name} threw: ${error.message}`); }
  }
} catch (error) {
  say(`FATAL ${error.stack}`);
} finally {
  await writeFile(`${out}/log-${scenarios.join("_") || "all"}.txt`, log.join("\n") + "\n");
  await browser.close();
}
