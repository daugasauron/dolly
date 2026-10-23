// The npm packages as a stranger uses them: packed from this checkout, installed
// into an empty app, served as they lie with cross-origin isolation, and the
// page of docs/embedding.md booting the default image. Served without the
// isolation headers, the same page says what it lacks.
// Usage: node test/npm-browser.mjs [chromium|firefox ...]
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { chromium, firefox } from "playwright-core";
import { isolationHeaders, mimeTypes } from "../scripts/serve.mjs";

const projectDir = resolve(import.meta.dirname, "..");
const names = process.argv.length > 2 ? process.argv.slice(2) : ["chromium", "firefox"];
// page.evaluate has no deadline of its own.
const within = (promise, seconds, what) => Promise.race([promise, new Promise((_, reject) =>
  setTimeout(() => reject(new Error(`${what} took over ${seconds} s`)), seconds * 1000))]);
const work = await mkdtemp(join(tmpdir(), "dolly-npm-"));
try {
  execFileSync("node", [resolve(projectDir, "scripts/package-npm.mjs"), join(work, "packs")], { stdio: "ignore" });
  const app = join(work, "app");
  await mkdir(app);
  execFileSync("npm", ["init", "--yes"], { cwd: app, stdio: "ignore" });
  const tarballs = (await readdir(join(work, "packs"))).filter(name => name.endsWith(".tgz")).map(name => join(work, "packs", name));
  execFileSync("npm", ["install", "--no-audit", "--no-fund", "--offline", ...tarballs], { cwd: app, stdio: "ignore" });
  // The page of docs/embedding.md, which also keeps the handle for the test.
  const guide = await readFile(resolve(projectDir, "docs/embedding.md"), "utf8");
  const page = guide.match(/```html\n([\s\S]*?)```/)[1]
    .replace("const dolly = await boot(", "const dolly = window.dolly = await boot(");
  await writeFile(join(app, "index.html"), page);

  const serve = isolated => new Promise(resolveServer => {
    const server = createServer(async (request, response) => {
      const path = join(app, decodeURIComponent(new URL(request.url, "http://x").pathname));
      try {
        const body = await readFile(path.endsWith("/") ? join(path, "index.html") : path);
        response.writeHead(200, { "content-type": mimeTypes.get(extname(path) || ".html") ?? "application/octet-stream",
          ...isolated ? isolationHeaders : {} });
        response.end(body);
      } catch { response.writeHead(404).end(); }
    });
    server.listen(0, "127.0.0.1", () => resolveServer(server));
  });
  const [isolated, plain] = await Promise.all([serve(true), serve(false)]);
  try {
    for (const name of names) {
      const started = performance.now();
      const browser = await (name === "chromium"
        ? chromium.launch({ channel: "chrome", headless: true, args: ["--no-sandbox", "--disable-gpu"] })
        : firefox.launch({ headless: true }));
      try {
        const tab = await browser.newPage();
        await tab.goto(`http://127.0.0.1:${isolated.address().port}/`);
        await tab.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus),
          null, { timeout: 180_000 });
        assert.equal(await tab.evaluate(() => document.documentElement.dataset.dollyStatus), "ready",
          await tab.locator("#bootstrap-log").textContent());
        await within(tab.evaluate(() => window.dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "the shell", 0)),
          60, "the shell's prompt");
        assert.equal(await within(tab.evaluate(() => window.dolly.submit("echo npm-$((6 * 7))")), 60, "a command"), 0);
        assert.match(await tab.evaluate(() => window.dolly.visibleTerminalText()), /npm-42/);
        assert.deepEqual((await tab.evaluate(() => window.dolly.hostModules)).sort(),
          ["display@0", "download@0", "dso@0", "http@0", "input@0", "nena@0", "packages@0", "runtime@0",
            "snapshot@0", "sockets@0", "threads@0", "upload@0"]);

        const bare = await browser.newPage();
        await bare.goto(`http://127.0.0.1:${plain.address().port}/`);
        await bare.waitForFunction(() => document.documentElement.dataset.dollyStatus === "failed", null, { timeout: 60_000 });
        assert.match(await bare.locator("#bootstrap-log").textContent(), /cross-origin isolation/);
        console.log(`npm packages: ${name} passed in ${((performance.now() - started) / 1000).toFixed(1)}s`);
      } finally { await browser.close(); }
    }
  } finally { isolated.close(); plain.close(); }
} finally { await rm(work, { recursive: true, force: true }); }
