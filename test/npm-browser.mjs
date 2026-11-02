// The npm packages as a stranger uses them: packed from this checkout, served by
// a registry of their own, installed into an empty app with the command and the
// page of docs/embedding.md, and served as they lie with cross-origin isolation.
// - Every package but the runtime depends on the runtime alone.
// - The guide's page boots default, which enables exactly its host modules.
// - A page that adds every other device module loads them all, enables gpu@0,
//   and holds the http@0 policy it gives boot().
// - A page that lacks a module the image requires, or isolation, says so.
// - The README's "Pi with npm", as written: its packages and the project
//   dolly-build init writes, whose image dolly-build builds in the browser under
//   test, start Pi with the extension, the skill, the instructions, the tool and
//   the package the recipe declares, the workspace the page writes, and a policy
//   that refuses another origin.
// Usage: node test/npm-browser.mjs [chromium|firefox ...]
import assert from "node:assert/strict";
import { execFile, execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { chromium, firefox } from "playwright-core";
import { isolationHeaders, mimeTypes } from "../scripts/serve.mjs";

const projectDir = resolve(import.meta.dirname, "..");
// What an image's recipe declares, which its page enables and nothing more.
const { DOLLY_IMAGES } = await import("../dist/dolly-images.mjs");
const declared = image => DOLLY_IMAGES.find(definition => definition.image === image).hostRequirements.toSorted();
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
  // dolly-build starts its browser with playwright-core, which the registry holds too.
  execFileSync("npm", ["pack", "--silent", "--pack-destination", packs], { cwd: resolve(projectDir, "node_modules/playwright-core") });

  // A registry that holds these packages alone, as npmjs would serve them.
  const published = new Map();
  for (const file of (await readdir(packs)).filter(name => name.endsWith(".tgz"))) {
    const bytes = await readFile(join(packs, file));
    const manifest = JSON.parse(execFileSync("tar", ["-xzOf", join(packs, file), "package/package.json"], { encoding: "utf8" }));
    published.set(manifest.name, { manifest, file, bytes });
  }
  // The packages' own rule: the runtime depends on nothing, every other package on the runtime
  // alone, at its version, and dolly-build also on the playwright-core it starts browsers with.
  for (const { manifest } of published.values()) {
    if (manifest.name === "playwright-core") continue;
    assert.equal(manifest.peerDependencies, undefined, manifest.name);
    assert.deepEqual(manifest.dependencies, manifest.name === "@daugasauron/dolly" ? undefined
      : { "@daugasauron/dolly": manifest.version, ...manifest.name === "@daugasauron/dolly-build"
        ? { "playwright-core": published.get("playwright-core").manifest.version } : {} }, manifest.name);
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

  // The README's "Pi with npm": its one block of commands, the last of which serves.
  const readme = await readFile(resolve(projectDir, "README.md"), "utf8");
  const piSection = readme.slice(readme.indexOf("\n## Pi with npm\n"), readme.indexOf("\n## ", readme.indexOf("\n## Pi with npm\n") + 1));
  const [piCommands] = [...piSection.matchAll(/```sh\n([\s\S]*?)```/g)].map(([, text]) => text);
  const [piInit, piInstall, scaffold, buildCommand, serveCommand] = piCommands.replace(/\\\n/g, " ").trim().split("\n");
  assert.equal(serveCommand, "node serve.mjs");
  const piApp = join(work, "pi-app");
  await mkdir(piApp);
  await npm(piApp, piInit);
  await npm(piApp, piInstall);
  await npm(piApp, scaffold);
  // The project as written, with the page's handle kept for the test and a file of its own in the workspace.
  const piPageSource = await readFile(join(piApp, "index.html"), "utf8");
  assert.ok(piPageSource.includes("await boot("));
  await writeFile(join(piApp, "index.html"), piPageSource.replace("await boot(", "window.dolly = await boot("));
  await mkdir(join(piApp, "workspace/notes"));
  await writeFile(join(piApp, "workspace/notes/deep sea.txt"), "the deepest trench\n");
  const recipe = await readFile(join(piApp, "Dollyfile-my-pi"), "utf8");
  const declaredByRecipe = [...recipe.matchAll(/^REQUIRES HOST (\S+)/gm)].map(([, name]) => name).toSorted();
  const piServer = spawn(process.execPath, ["serve.mjs"], { cwd: piApp, env: { ...process.env, PORT: "0" } });
  servers.push({ close: () => piServer.kill() });
  const piPage = await new Promise((resolveAddress, reject) => {
    piServer.stdout.once("data", data => resolveAddress(String(data).trim()));
    piServer.once("exit", status => reject(new Error(`the project's serve.mjs exited with ${status}`)));
  });

  // The guide's page, which also keeps the handle for the test; the same page
  // with every other device module, a policy and files; and one that lacks touch@0.
  const page = blocks("html")[0].replace("const dolly = await boot(", "const dolly = window.dolly = await boot(");
  await writeFile(join(app, "index.html"), page);
  const options = 'document.querySelector("#dolly"), { images, image, modules }';
  assert.ok(page.includes(options), "the guide's page calls boot() as the test expects");
  const extended = page.replace(options, `document.querySelector("#dolly"), { images, image, modules: [...modules,
    ...["gpu", "microphone", "pty"].map(name => new URL(\`./node_modules/@daugasauron/dolly-host-\${name}/module.json\`, location.href).href)],
    http: { policy: { rules: [{ origin: location.origin, pathPrefix: "/allowed/", methods: ["GET"] }] } },
    files: { "/home/dolly/.pi/agent/AGENTS.md": "Answer in French.\\n", "/etc/bytes": new Uint8Array([104, 105, 10]) } }`);
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
  const booted = async (tab, url, started = /dolly:[^\n]*\$\s*$/) => {
    const errors = [];
    tab.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
    tab.on("pageerror", error => errors.push(error.message));
    await tab.goto(url);
    await tab.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus),
      null, { timeout: 180_000 }).catch(async error => {
      const log = await tab.locator("#bootstrap-log").textContent({ timeout: 1000 }).catch(() => "no boot log");
      throw new Error(`${url} did not boot: ${log}\n${errors.join("\n")}`,
        { cause: error });
    });
    assert.equal(await tab.evaluate(() => document.documentElement.dataset.dollyStatus), "ready",
      await tab.locator("#bootstrap-log").textContent());
    await within(tab.evaluate(started => window.dolly.waitForInteractiveTerminal(new RegExp(started), "the program", 0),
      started.source), 120, `${started}`);
    return command => within(tab.evaluate(command => window.dolly.submit(command), command), 60, command);
  };
  const shows = (tab, pattern, what) => within(tab.evaluate(([source, what]) =>
    window.dolly.waitForInteractiveTerminal(new RegExp(source), what, 0), [pattern.source, what]), 120, what);
  for (const name of names) {
    const started = performance.now();
    const browser = await (name === "chromium"
      ? chromium.launch({ channel: "chrome", headless: true, args: ["--no-sandbox", "--disable-gpu"] })
      : firefox.launch({ headless: true }));
    try {
      const tab = await browser.newPage(), submit = await booted(tab, `${origin(isolated)}/`);
      assert.equal(await submit("echo npm-$((6 * 7))"), 0);
      assert.match(await tab.evaluate(() => window.dolly.visibleTerminalText()), /npm-42/);
      // An explicit check of the capability set: what default declares, no more.
      assert.deepEqual((await tab.evaluate(() => window.dolly.hostModules)).sort(), declared("default"));

      const devices = await browser.newPage(), run = await booted(devices, `${origin(isolated)}/devices.html`);
      for (const module of ["gpu@0", "microphone@0", "pty@0"]) {
        assert.equal(await run(`nena | grep -q '^${module}  *available '`), 0, `nena lists ${module}`);
      }
      // gpu@0 starts its part in the runtime Worker; without an adapter its OPEN fails.
      assert.equal(await run("nena enable gpu"), 0);
      assert.ok((await devices.evaluate(() => window.dolly.hostModules)).includes("gpu@0"));
      assert.equal(await run("nena disable gpu"), 0);
      assert.equal(await run("grep -qx 'Answer in French.' ~/.pi/agent/AGENTS.md && grep -qx hi /etc/bytes"), 0);
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

      // The project's image, built in this browser (after the first, over the last one's). Its
      // start script asks for the key; Pi then lists the skill and the extension and runs its command.
      await npm(piApp, `${buildCommand} --browser ${name === "chromium" ? "chrome" : name}`);
      const pi = await browser.newPage();
      await booted(pi, piPage, /not shown\):/);
      await pi.keyboard.type("sk-or-test");
      await pi.keyboard.press("Enter");
      await shows(pi, /Bash is not installed/, "Pi");
      assert.match(await pi.evaluate(() => window.dolly.visibleTerminalText()), /changelog[\s\S]*hello\.js|hello\.js[\s\S]*changelog/);
      // Enter takes the command menu's choice, so it waits for the menu to offer this one.
      await pi.keyboard.type("/hello");
      await shows(pi, /Say hello/, "the menu");
      await pi.keyboard.press("Enter");
      await shows(pi, /Hello, world, from my-pi!/, "/hello");
      assert.deepEqual((await pi.evaluate(() => window.dolly.hostModules)).sort(), declaredByRecipe);
      // Ctrl+D leaves Pi for the shell: the instructions, the tool, Git and the workspace are
      // there, and the policy refuses what it does not name.
      await pi.keyboard.press("Control+d");
      const shell = await (async () => {
        await shows(pi, /Pi exited; this is a Slop shell\.[\s\S]*\ndolly:[^\n]*\$\s*$/, "the shell");
        return command => within(pi.evaluate(command => window.dolly.submit(command), command), 60, command);
      })();
      assert.equal(await shell("grep -q 'coding agent' ~/.pi/agent/AGENTS.md && command -v todo > /dev/null"), 0);
      assert.equal(await shell("git --version > /dev/null"), 0);
      assert.equal(await shell("grep -q 'deepest trench' '/workspace/notes/deep sea.txt' && test -f /workspace/README.md"), 0);
      assert.notEqual(await shell("curl -fsS https://example.com > /dev/null"), 0);
      console.log(`npm packages: ${name} passed in ${((performance.now() - started) / 1000).toFixed(1)}s`);
    } finally { await browser.close(); }
  }
} finally {
  for (const server of servers) server.close();
  await rm(work, { recursive: true, force: true });
}
