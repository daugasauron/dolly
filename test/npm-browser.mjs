// The npm packages as a stranger uses them: packed from this checkout, served by
// a registry of their own, installed into an empty app with the command and the
// page of docs/embedding.md, and served as they lie with cross-origin isolation.
// - The guide's page boots default, which enables exactly its host modules.
// - A page that adds every other device module loads them all, enables gpu@0,
//   and holds the http@0 policy it gives boot().
// - A page that lacks a module the image requires, or isolation, says so.
// Usage: node test/npm-browser.mjs [chromium|firefox ...]
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { chromium, firefox } from "playwright-core";
import { isolationHeaders, mimeTypes } from "../scripts/serve.mjs";

const projectDir = resolve(import.meta.dirname, "..");
const names = process.argv.length > 2 ? process.argv.slice(2) : ["chromium", "firefox"];
// page.evaluate has no deadline of its own.
const within = (promise, seconds, what) => Promise.race([promise, new Promise((_, reject) =>
  setTimeout(() => reject(new Error(`${what} took over ${seconds} s`)), seconds * 1000))]);
const listen = server => new Promise(resolveServer => server.listen(0, "127.0.0.1", () => resolveServer(server)));
const origin = server => `http://127.0.0.1:${server.address().port}`;
const work = await mkdtemp(join(tmpdir(), "dolly-npm-"));
const servers = [];
try {
  const packs = join(work, "packs");
  execFileSync("node", [resolve(projectDir, "scripts/package-npm.mjs"), packs], { stdio: "ignore" });

  // A registry that holds these packages alone, as npmjs would serve them.
  const published = new Map();
  for (const file of (await readdir(packs)).filter(name => name.endsWith(".tgz"))) {
    const bytes = await readFile(join(packs, file));
    const manifest = JSON.parse(execFileSync("tar", ["-xzOf", join(packs, file), "package/package.json"], { encoding: "utf8" }));
    published.set(manifest.name, { manifest, file, bytes });
  }
  const registry = await listen(createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, "http://x").pathname).slice(1);
    const tarball = [...published.values()].find(({ file }) => path === `-/${file}`);
    if (tarball) return response.writeHead(200, { "content-type": "application/octet-stream" }).end(tarball.bytes);
    const entry = published.get(path);
    if (!entry) return response.writeHead(404).end();
    const { manifest, file, bytes } = entry;
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
      name: manifest.name, "dist-tags": { latest: manifest.version },
      versions: { [manifest.version]: { ...manifest, dist: { tarball: `${origin(registry)}/-/${file}`,
        shasum: createHash("sha1").update(bytes).digest("hex"),
        integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}` } } },
    }));
  }));
  servers.push(registry);
  const guide = await readFile(resolve(projectDir, "docs/embedding.md"), "utf8");
  const blocks = language => [...guide.matchAll(new RegExp("```" + language + "\\n([\\s\\S]*?)```", "g"))].map(([, text]) => text);
  // npm as a stranger has it: an empty cache, and only this registry, which
  // answers from this process (so npm runs beside it, not blocking it).
  const npm = (app, command) => promisify(execFile)("sh", ["-c", command.replace(/\\\n/g, " ")], { cwd: app,
    env: { ...process.env, npm_config_registry: `${origin(registry)}/`, npm_config_cache: join(work, "npm-cache"),
      npm_config_audit: "false", npm_config_fund: "false", npm_config_update_notifier: "false" } });
  const app = join(work, "app");
  await mkdir(app);
  await npm(app, "npm init --yes");
  const [install, more] = blocks("sh");
  await npm(app, install);
  await npm(app, more);

  // The guide's page, which also keeps the handle for the test; the same page
  // with every other device module and a policy; and one that lacks touch@0.
  const page = blocks("html")[0].replace("const dolly = await boot(", "const dolly = window.dolly = await boot(");
  await writeFile(join(app, "index.html"), page);
  const options = 'document.querySelector("#dolly"), { images, image, modules }';
  assert.ok(page.includes(options), "the guide's page calls boot() as the test expects");
  const extended = page.replace(options, `document.querySelector("#dolly"), { images, image, modules: [...modules,
    ...["gpu", "microphone", "pty"].map(name => new URL(\`./node_modules/@daugasauron/dolly-host-\${name}/module.json\`, location.href).href)],
    http: { policy: { rules: [{ origin: location.origin, pathPrefix: "/allowed/", methods: ["GET"] }] } } }`);
  await writeFile(join(app, "devices.html"), extended);
  await writeFile(join(app, "lacking.html"), page.replace(options,
    'document.querySelector("#dolly"), { images, image, modules: modules.filter(url => !url.includes("/dolly-host-touch/")) }'));
  await mkdir(join(app, "allowed"));
  await writeFile(join(app, "allowed/note.txt"), "fetched through the policy\n");
  await mkdir(join(app, "refused"));
  await writeFile(join(app, "refused/note.txt"), "a program never sees this\n");

  const serve = isolated => listen(createServer(async (request, response) => {
    const path = join(app, decodeURIComponent(new URL(request.url, "http://x").pathname));
    try {
      const body = await readFile(path.endsWith("/") ? join(path, "index.html") : path);
      response.writeHead(200, { "content-type": mimeTypes.get(extname(path) || ".html") ?? "application/octet-stream",
        ...isolated ? isolationHeaders : {} });
      response.end(body);
    } catch { response.writeHead(404).end(); }
  }));
  const [isolated, plain] = await Promise.all([serve(true), serve(false)]);
  servers.push(isolated, plain);
  const booted = async (tab, path) => {
    const errors = [];
    tab.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    tab.on("pageerror", error => errors.push(error.message));
    await tab.goto(`${origin(isolated)}/${path}`);
    await tab.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus),
      null, { timeout: 180_000 }).catch(async error => {
      const log = await tab.locator("#bootstrap-log").textContent({ timeout: 1000 }).catch(() => "no boot log");
      throw new Error(`${path || "index.html"} did not boot: ${log}\n${errors.join("\n")}`,
        { cause: error });
    });
    assert.equal(await tab.evaluate(() => document.documentElement.dataset.dollyStatus), "ready",
      await tab.locator("#bootstrap-log").textContent());
    await within(tab.evaluate(() => window.dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "the shell", 0)),
      60, "the shell's prompt");
    return command => within(tab.evaluate(command => window.dolly.submit(command), command), 60, command);
  };
  for (const name of names) {
    const started = performance.now();
    const browser = await (name === "chromium"
      ? chromium.launch({ channel: "chrome", headless: true, args: ["--no-sandbox", "--disable-gpu"] })
      : firefox.launch({ headless: true }));
    try {
      const tab = await browser.newPage(), submit = await booted(tab, "");
      assert.equal(await submit("echo npm-$((6 * 7))"), 0);
      assert.match(await tab.evaluate(() => window.dolly.visibleTerminalText()), /npm-42/);
      // An explicit check of the capability set: what default declares, no more.
      assert.deepEqual((await tab.evaluate(() => window.dolly.hostModules)).sort(),
        ["audio@0", "display@0", "download@0", "dso@0", "http@0", "input@0", "nena@0", "packages@0", "runtime@0",
          "snapshot@0", "sockets@0", "threads@0", "touch@0", "upload@0"]);

      const devices = await browser.newPage(), run = await booted(devices, "devices.html");
      for (const module of ["gpu@0", "microphone@0", "pty@0"]) {
        assert.equal(await run(`nena | grep -q '^${module}  *available '`), 0, `nena lists ${module}`);
      }
      // gpu@0 starts its part in the runtime Worker; without an adapter its OPEN fails.
      assert.equal(await run("nena enable gpu"), 0);
      assert.ok((await devices.evaluate(() => window.dolly.hostModules)).includes("gpu@0"));
      assert.equal(await run("nena disable gpu"), 0);
      assert.equal(await run(`curl -fsS ${origin(isolated)}/allowed/note.txt > /tmp/note && grep -q 'through the policy' /tmp/note`), 0);
      assert.notEqual(await run(`curl -fsS ${origin(isolated)}/refused/note.txt > /dev/null`), 0);

      const lacking = await browser.newPage();
      await lacking.goto(`${origin(isolated)}/lacking.html`);
      await lacking.waitForFunction(() => document.documentElement.dataset.dollyStatus === "failed", null, { timeout: 60_000 });
      assert.match(await lacking.locator("#bootstrap-log").textContent(), /touch@0 is unavailable/);
      const bare = await browser.newPage();
      await bare.goto(`${origin(plain)}/`);
      await bare.waitForFunction(() => document.documentElement.dataset.dollyStatus === "failed", null, { timeout: 60_000 });
      assert.match(await bare.locator("#bootstrap-log").textContent(), /cross-origin isolation/);
      console.log(`npm packages: ${name} passed in ${((performance.now() - started) / 1000).toFixed(1)}s`);
    } finally { await browser.close(); }
  }
} finally {
  for (const server of servers) server.close();
  await rm(work, { recursive: true, force: true });
}
