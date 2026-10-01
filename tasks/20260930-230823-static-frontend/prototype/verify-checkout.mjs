// Prototype for tasks/20260930-230823-static-frontend: not part of the build.
// Serves a checkout with static-serve.mjs (only COOP/COEP/CORP, no rewrites) and
// drives the menu, /default/, a named session, /sessions/, the javascript demo
// image, a source link from its recipe view and /system/rebuild/.
// usage: node verify-checkout.mjs CHECKOUT javascript [chromium|firefox ...]
import { spawn } from "node:child_process";
import { chromium, firefox } from "playwright-core";

const [root, demo, ...names] = process.argv.slice(2);
if (!names.length) names.push("chromium", "firefox");
const serverScript = `${root}/tasks/20260930-230823-static-frontend/prototype/static-serve.mjs`;
const server = spawn(process.execPath, [serverScript, root, "0", "no-store"]);
const hits = [];
let origin;
server.stdout.on("data", chunk => {
  for (const line of chunk.toString().split("\n")) {
    if (line.startsWith("http://")) origin = line.trim().replace(/\/$/, "");
    else if (line.startsWith("hit ")) hits.push(line.slice(4));
  }
});
await new Promise(resolve => { const poll = () => origin ? resolve() : setTimeout(poll, 20); poll(); });
const prompt = /dolly:[^\n]*\$\s*$/.source;
const log = (...args) => console.log(...args);

async function boot(page, path, timeout = 120000) {
  const started = performance.now();
  await page.goto(origin + path);
  await page.waitForFunction(() => ["ready", "failed", "built"].includes(document.documentElement.dataset.dollyStatus), null, { timeout });
  const status = await page.evaluate(() => document.documentElement.dataset.dollyStatus);
  if (status !== "ready") throw new Error(`${path}: ${status}\n${await page.locator("#bootstrap-log").textContent()}`);
  await page.evaluate(source => __dolly.waitForInteractiveTerminal(new RegExp(source), "shell"), prompt);
  return Math.round(performance.now() - started);
}
const submit = (page, command) => page.evaluate(command => __dolly.submit(command), command);

let failed = false;
for (const name of names) {
  const browser = await (name === "chromium"
    ? chromium.launch({ channel: "chrome", headless: true, args: ["--no-sandbox", "--disable-gpu"] })
    : firefox.launch({ headless: true }));
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  const notFound = [];
  page.on("response", response => { if (response.status() === 404) notFound.push(new URL(response.url()).pathname); });
  try {
    await page.goto(origin + "/");
    const rows = await page.locator("tr.image").count();
    log(`${name}: menu / lists ${rows} images, ${await page.locator("script").count()} scripts`);

    log(`${name}: /default/ ready+prompt in ${await boot(page, "/default/")} ms`);
    if (await submit(page, "echo PLAIN-STATIC > /workspace/plain.txt") !== 0) throw new Error("write failed");
    await page.evaluate(() => __dolly.saveSession("plain-static"));
    log(`${name}: saved session, URL now ${page.url().slice(origin.length)}`);

    log(`${name}: /session?name=plain-static ready+prompt in ${await boot(page, "/session?name=plain-static")} ms`);
    if (await submit(page, "grep -q PLAIN-STATIC /workspace/plain.txt") !== 0) throw new Error("session lost its file");
    log(`${name}: restored session ${await page.evaluate(() => document.documentElement.dataset.session)} keeps /workspace/plain.txt`);

    await page.goto(origin + "/sessions/");
    await page.waitForFunction(() => document.documentElement.dataset.sessionsStatus === "ready");
    const link = await page.locator("#sessions li a").first().getAttribute("href");
    log(`${name}: /sessions/ lists ${await page.locator("#sessions li").count()} save(s), link ${link}`);

    log(`${name}: /${demo}/ ready+prompt in ${await boot(page, `/${demo}/`)} ms`);
    const recipe = `/demos/${demo}/Dollyfile-${demo}`;
    const recipeHits = hits.filter(path => path.startsWith("/demos/"));
    log(`${name}: ${demo} fetched demo recipes ${[...new Set(recipeHits)].join(" ")}`);

    await page.goto(origin + `/view/${demo}/modules/quickjs/`);
    const source = await page.locator("a.source").first().getAttribute("href");
    const response = await page.request.get(new URL(source, page.url()).href);
    log(`${name}: /view/${demo}/modules/quickjs/ source link ${source} -> HTTP ${response.status()}, ${(await response.body()).length} bytes`);
    log(`${name}: /system/rebuild/ ready+prompt in ${await boot(page, "/system/rebuild/", 900000)} ms`);
    const sourceHits = [...new Set(hits.filter(path => path.startsWith("/dist/static/") || path.startsWith("/host/") && path.endsWith(".h")))];
    log(`${name}: rebuild fetched ${sourceHits.join(" ")}`);
    log(`${name}: 404s ${JSON.stringify([...new Set(notFound)])}`);
  } catch (error) {
    failed = true;
    console.error(`${name}: FAILED ${error.stack}`);
  }
  await browser.close();
  hits.length = 0;
}
server.kill();
process.exit(failed ? 1 : 0);
