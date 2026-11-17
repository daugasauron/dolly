// The npm packages as a stranger uses them: packed from this checkout, served by
// a registry of their own, installed into an empty app with the command and the
// page of docs/embedding.md, and served as they lie with cross-origin isolation.
// Everything after the packing runs offline: in a network namespace of its own,
// whose only network is loopback. Every other address is this process's recorder,
// which notes each name asked of DNS and each connection, and the test ends
// asserting that it noted nothing: no request of npm install from the test's
// registry, dolly-build, its browser, the static server, the pages or the images
// left the machine.
// - Every image and host module depends on the runtime alone, a package also on the
//   packages it installs.
// - The guide's page boots default, which enables exactly its host modules.
// - A page that adds every other device module loads them all, enables gpu@0,
//   and holds the http@0 policy it gives boot().
// - A page that lacks a module the image requires, or isolation, says so.
// - docs/npm.md's Pi agent, as written: dolly-build alone is installed, and its init
//   installs what the project it writes needs (Git, Python, Neovim); add puts jq,
//   SQLite, NumPy and Matplotlib into the recipe. dolly-build builds the image in the
//   browser under test (the first time in the one it finds itself) into a site that a
//   plain static server without isolation headers serves: every file the page asks for
//   is there, and the page isolates itself. Pi starts with the extension, the skills
//   (the template's and one of the project's own with a script), the instructions, the
//   tools (the template's, the packages' and a C program the recipe compiles), the
//   workspace and the user's theme, and a policy that refuses another origin; Neovim
//   edits a file; Python draws a figure with NumPy and Matplotlib; Save keeps a session
//   the page opens again from its address. A change to the page alone is built again
//   without building the image.
// - The project as CI builds it: committed, cloned, and the workflow's own npm ci and
//   build lines run in the clone write the same site.
// - A project of an older version: after dolly-build is installed at the new one, add
//   installs the project's packages at it and writes the recipe's pins again, with the
//   host modules its packages declare since, declared and installed.
// - dolly-build says its usage, and the packages there are, in one line each.
// - python-data as its package's README has it: installed as the README says, its
//   page runs NumPy, pandas and Matplotlib, and a recipe of the project's own on the
//   README's FROM row, whose build runs Python with them and pip installs a wheel
//   from an index that sends no CORS headers and redirects once, boots with its
//   result and the package; built again with HTTP_PROXY set, the build reaches the
//   index through that proxy.
// Usage: node test/npm-browser.mjs [chromium|firefox ...]
// With DOLLY_NPM_PACKS naming a directory of this version's tarballs (the release checklist's,
// which it publishes), it tests those in place of packing the checkout's.
import assert from "node:assert/strict";
import { execFile, execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createSocket } from "node:dgram";
import { createServer } from "node:http";
import { connect, createServer as createTcpServer } from "node:net";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { chromium, firefox } from "playwright-core";
import { isolationHeaders, mimeTypes } from "../scripts/serve.mjs";
import { DOLLY_VERSION as checkoutVersion } from "../page/version.mjs";

const projectDir = resolve(import.meta.dirname, "..");
const names = process.argv.length > 2 ? process.argv.slice(2) : ["chromium", "firefox"];
const work = await mkdtemp(join(tmpdir(), "dolly-npm-"));
const packs = join(work, "packs");
if (!process.env.DOLLY_NPM_OFFLINE) {
  try {
    const tested = process.env.DOLLY_NPM_PACKS;
    if (tested) {
      await mkdir(packs);
      for (const name of (await readdir(tested)).filter(name => name.endsWith(".tgz"))) await copyFile(resolve(tested, name), join(packs, name));
    } else execFileSync("node", [resolve(projectDir, "scripts/package-npm.mjs"), packs], { stdio: "ignore" });
    // An older version of every package, for the update.
    execFileSync("node", [resolve(projectDir, "scripts/package-npm.mjs"), packs, `${checkoutVersion}-rc.0`], { stdio: "ignore" });
    // dolly-build starts its browser with playwright-core, which the registry holds too.
    execFileSync("npm", ["pack", "--silent", "--pack-destination", packs], { cwd: resolve(projectDir, "node_modules/playwright-core") });
    // The namespace: loopback up, every other address local, and each TCP and UDP
    // packet to one routed to port 9; then this file again as the user who ran it.
    const route = ["ip link set lo up", "ip route add local 0.0.0.0/0 dev lo", "ip -6 route add local ::/0 dev lo",
      "sysctl -qw net.ipv4.ip_unprivileged_port_start=0",
      ...[["iptables", "127.0.0.0/8"], ["ip6tables", "::1"]].flatMap(([table, loopback]) => ["tcp", "udp"]
        .map(protocol => `${table} -t nat -A OUTPUT -p ${protocol} ! -d ${loopback} -j REDIRECT --to-ports 9`))].join(" && ");
    const { status } = spawnSync("unshare", ["-rn", "sh", "-c", `${route} && uid=$0 gid=$1 && shift && ` +
      'exec unshare --user --map-user="$uid" --map-group="$gid" -- "$@"', String(process.getuid()), String(process.getgid()),
      process.execPath, import.meta.filename, ...names], { stdio: "inherit", env: { ...process.env, DOLLY_NPM_OFFLINE: packs } });
    process.exitCode = status ?? 1;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
  process.exit();
}

// The recorder: DNS at the resolver's address answers every name NXDOMAIN, and port 9
// takes every other connection and datagram, each noted with what names its host.
const attempts = [];
function serverName(bytes) {
  const host = /^[A-Z]+ \S+ HTTP\/1\.[01]\r\n(?:[^\r\n]*\r\n)*?host: *([^\r\n]+)/i.exec(bytes.toString("latin1"));
  if (host) return `http ${host[1]}`;
  // A TLS ClientHello's server_name extension.
  if (bytes[0] === 0x16 && bytes[5] === 1) {
    let at = 43;
    at += 1 + bytes[at];
    at += 2 + bytes.readUInt16BE(at);
    at += 1 + bytes[at];
    for (const end = at + 2 + bytes.readUInt16BE(at), start = at += 2; at + 4 <= end && start;) {
      const [type, length] = [bytes.readUInt16BE(at), bytes.readUInt16BE(at + 2)];
      if (type === 0) return `tls ${bytes.subarray(at + 9, at + 4 + length).toString("latin1")}`;
      at += 4 + length;
    }
  }
  return `${bytes.length} bytes`;
}
const dns = createSocket("udp4").on("message", (query, peer) => {
  const labels = [];
  let at = 12;
  for (; query[at]; at += query[at] + 1) labels.push(query.subarray(at + 1, at + 1 + query[at]).toString("latin1"));
  attempts.push(`dns ${labels.join(".")}`);
  const answer = Buffer.from(query.subarray(0, at + 5));
  answer.writeUInt16BE(0x8183, 2);
  answer.fill(0, 6, 12);
  dns.send(answer, peer.port, peer.address);
});
await new Promise(bound => dns.bind(53, "127.0.0.53", bound));
const sink = createTcpServer(socket => {
  const attempt = attempts.push(`tcp ${socket.localAddress}`) - 1;
  socket.on("error", () => {}).once("data", bytes => {
    attempts[attempt] = `tcp ${serverName(bytes)}`;
    socket.destroy();
  });
});
await new Promise(listening => sink.listen(9, listening));
const datagrams = createSocket("udp6").on("message", bytes => attempts.push(`udp ${bytes.length} bytes`));
await new Promise(bound => datagrams.bind(9, bound));
// The recorder notes what leaves, by name and by address.
await fetch("https://example.com/").catch(() => {});
await fetch("https://192.0.2.1/", { signal: AbortSignal.timeout(5000) }).catch(() => {});
assert.ok(attempts.includes("dns example.com") && attempts.some(attempt => attempt.startsWith("tcp ")), attempts.join(", "));
attempts.length = 0;

// What an image's recipe declares, which its page enables and nothing more.
const { default: catalog } = await import("../dist/dolly-images.json", { with: { type: "json" } });
const declared = image => catalog.images.find(definition => definition.image === image).hostRequirements.toSorted();
// page.evaluate has no deadline of its own.
const within = (promise, seconds, what) => Promise.race([promise, new Promise((_, reject) =>
  setTimeout(() => reject(new Error(`${what} took over ${seconds} s`)), seconds * 1000))]);
const listen = server => new Promise(resolveServer => server.listen(0, "127.0.0.1", () => resolveServer(server)));
const origin = server => `http://127.0.0.1:${server.address().port}`;
const servers = [];
// The proxy the browsers' own requests go to: it refuses each and notes its host.
const vendors = new Set();
const refusal = await listen(createServer((request, response) => {
  vendors.add(new URL(request.url).host);
  response.writeHead(403).end();
}).on("connect", (request, socket) => {
  vendors.add(request.url);
  socket.destroy();
}));
servers.push(refusal);
try {
  // A registry that holds these packages alone, as npmjs would serve them: each at this
  // checkout's version, the latest, and at a prerelease of it.
  const published = new Map(), tarballs = [];
  for (const file of (await readdir(process.env.DOLLY_NPM_OFFLINE)).filter(name => name.endsWith(".tgz"))) {
    const bytes = await readFile(join(process.env.DOLLY_NPM_OFFLINE, file));
    const manifest = JSON.parse(execFileSync("tar", ["-xzOf", join(process.env.DOLLY_NPM_OFFLINE, file), "package/package.json"],
      { encoding: "utf8" }));
    tarballs.push({ manifest, file, bytes });
    if (!manifest.version.includes("-rc.")) published.set(manifest.name, { manifest, file, bytes });
  }
  // The packages' own rule: the runtime depends on nothing, every other package on the runtime,
  // at its version; a Dolly package also on the packages it installs, and dolly-build on the
  // playwright-core it starts browsers with and the packages its init's recipe installs.
  for (const { manifest } of published.values()) {
    if (manifest.name === "playwright-core") continue;
    assert.equal(manifest.peerDependencies, undefined, manifest.name);
    if (manifest.name === "@daugasauron/dolly") { assert.equal(manifest.dependencies, undefined); continue; }
    const { "@daugasauron/dolly": runtime, ...others } = manifest.dependencies;
    assert.equal(runtime, manifest.version, manifest.name);
    for (const [name, version] of Object.entries(others)) {
      if (manifest.name === "@daugasauron/dolly-build" && name === "playwright-core") continue;
      assert.ok((manifest.name.startsWith("@daugasauron/dolly-package-") || manifest.name === "@daugasauron/dolly-build") &&
        name.startsWith("@daugasauron/dolly-package-") &&
        published.has(name) && version === manifest.version, `${manifest.name} depends on ${name}@${version}`);
    }
  }
  const registry = await listen(createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, "http://x").pathname).slice(1);
    const tarball = tarballs.find(({ file }) => path === `-/${file}`);
    if (tarball) return response.writeHead(200, { "content-type": "application/octet-stream" }).end(tarball.bytes);
    if (!published.has(path)) return response.writeHead(404).end();
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
      name: path, "dist-tags": { latest: published.get(path).manifest.version },
      versions: Object.fromEntries(tarballs.filter(({ manifest }) => manifest.name === path).map(({ manifest, file, bytes }) =>
        [manifest.version, { ...manifest, dist: { tarball: `${origin(registry)}/-/${file}`,
          shasum: createHash("sha1").update(bytes).digest("hex"),
          integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}` } }])),
    }));
  }));
  servers.push(registry);
  const guide = await readFile(resolve(projectDir, "docs/embedding.md"), "utf8");
  const blocks = language => [...guide.matchAll(new RegExp("```" + language + "\\n([\\s\\S]*?)```", "g"))].map(([, text]) => text);
  // npm as a stranger has it: an empty cache, and only this registry, which
  // answers from this process (so npm runs beside it, not blocking it).
  const environment = { ...process.env, npm_config_registry: `${origin(registry)}/`, npm_config_cache: join(work, "npm-cache"),
    npm_config_audit: "false", npm_config_fund: "false", npm_config_update_notifier: "false" };
  const npm = (app, command) => promisify(execFile)("sh", ["-c", command.replace(/\\\n/g, " ")], { cwd: app, env: environment });
  const app = join(work, "app");
  await mkdir(app);
  await npm(app, "npm init --yes");
  const [install, more] = blocks("sh");
  await npm(app, install);
  await npm(app, more);

  // docs/npm.md's Pi agent: its first block of commands, the last of which serves the
  // site, and its Tools block, which adds packages; the test adds two more for a figure.
  const npmGuide = await readFile(resolve(projectDir, "docs/npm.md"), "utf8");
  const guideBlocks = [...npmGuide.matchAll(/```sh\n([\s\S]*?)```/g)].map(([, text]) => text.replace(/\\\n/g, " ").trim().split("\n"));
  const [[piInit, piInstall, scaffold, buildCommand, serveCommand], [addCommand]] = guideBlocks;
  assert.match(serveCommand, /^python3 -m http\.server -d my-pi /);
  assert.match(addCommand, /^npx dolly-build add my-pi jq sqlite$/);
  const piApp = join(work, "pi-app");
  await mkdir(piApp);
  await npm(piApp, piInit);
  await npm(piApp, piInstall);
  // The command says how it is used and what packages there are, each in a message of its own.
  const refused = command => npm(piApp, command).then(() => assert.fail(`${command} succeeded`), error => error.stderr);
  assert.match(await refused("npx dolly-build --help"), /^dolly-build: usage: [^\n]*\n[^\n]*\n[^\n]*\n$/);
  assert.match(await refused("npx dolly-build init my-pi git emacs"), /^dolly-build: emacs: no such package\. The packages: .*\bnvim\b.*\n$/);
  // init installs what it names and lacks: nothing but dolly-build was installed.
  await npm(piApp, scaffold);
  await npm(piApp, addCommand);
  await npm(piApp, "npx dolly-build add my-pi numpy matplotlib");
  const dependencies = JSON.parse(await readFile(join(piApp, "package.json"), "utf8")).dependencies;
  for (const name of ["git", "python", "nvim", "jq", "sqlite", "numpy", "matplotlib"]) {
    assert.equal(dependencies[`@daugasauron/dolly-package-${name}`], checkoutVersion, name);
  }
  // A skill of the project's own, with a script beside it.
  await mkdir(join(piApp, "public/skills/line-count"));
  await writeFile(join(piApp, "public/skills/line-count/SKILL.md"),
    "---\nname: line-count\ndescription: Counts the lines of a file. Use when asked how long a file is.\n---\nRun `slop ~/.pi/agent/skills/line-count/count.slop FILE`.\n");
  await writeFile(join(piApp, "public/skills/line-count/count.slop"), 'wc -l < "$1"\n');
  // The project as written, with the page's handle kept for the test and a file of its own in the workspace.
  const piMain = await readFile(join(piApp, "public/main.mjs"), "utf8");
  assert.ok(piMain.includes("await boot("));
  await writeFile(join(piApp, "public/main.mjs"), piMain.replace("await boot(", "window.dolly = await boot("));
  await mkdir(join(piApp, "public/workspace/notes"));
  await writeFile(join(piApp, "public/workspace/notes/deep sea.txt"), "the deepest trench\n");
  // The user's own colours, Pi's and the terminal's, and a C tool of their own as the
  // recipe's comment describes it.
  const theme = await readFile(join(piApp, "public/theme.json"), "utf8");
  assert.ok(theme.includes('"#f2d45c"') && theme.includes('"#262626"'));
  await writeFile(join(piApp, "public/theme.json"), theme.replace('"#f2d45c"', '"#0fa9e6"').replace('"#262626"', '"#102030"'));
  const recipe = (await readFile(join(piApp, "Dollyfile-my-pi"), "utf8")).replace("\nENTRY ",
    "\nFILE /tmp/count-lines.c\n    #include <stdio.h>\n    int main(void) { int c, n = 0; while ((c = getchar()) != EOF) n += c == '\\n'; printf(\"%d lines\\n\", n); }\n" +
    "SLOP cc /tmp/count-lines.c -o /usr/bin/count-lines\nEXPORTS TOOL count-lines\n\nENTRY ");
  await writeFile(join(piApp, "Dollyfile-my-pi"), recipe);
  const declaredByRecipe = [...recipe.matchAll(/^REQUIRES HOST (\S+)/gm)].map(([, name]) => name).toSorted();
  assert.ok(declaredByRecipe.includes("upload@0"), "init's recipe declares the module of Pi's upload tool");
  // The README's server, a plain one: no isolation headers, and a log line per request.
  const requested = [];
  const startSite = () => new Promise((resolveAddress, reject) => {
    const site = spawn("sh", ["-c", `exec ${serveCommand}`], { cwd: piApp, env: { ...process.env, PYTHONUNBUFFERED: "1" } });
    servers.push({ close: () => site.kill() });
    site.stdout.on("data", data => /(http:\/\/127\.0\.0\.1:\d+\/)/.test(data) && resolveAddress(/(http:\/\/127\.0\.0\.1:\d+\/)/.exec(data)[1]));
    site.stderr.on("data", data => requested.push(...String(data).split("\n").filter(Boolean)));
    site.once("exit", status => reject(new Error(`${serveCommand} exited with ${status}`)));
  });
  let piPage;
  // The steps the project's workflow runs, as init wrote them.
  const workflowRuns = [...(await readFile(join(piApp, ".github/workflows/my-pi.yml"), "utf8")).matchAll(/^ {6}- run: (.*)$/gm)].map(([, run]) => run);
  assert.deepEqual(workflowRuns.map(run => run.split(" ").slice(0, 2).join(" ")), ["npm ci", "npx playwright-core", "npx dolly-build"]);
  assert.ok(workflowRuns[2].endsWith(" --browser chromium"));
  const siteFiles = async site => (await readdir(site, { recursive: true, withFileTypes: true })).filter(entry => entry.isFile())
    .map(entry => join(entry.parentPath, entry.name).slice(site.length)).filter(path => !path.startsWith("/image/dist/packs/")).sort();

  // A project made at an older version: dolly-build at the new one, then add, which installs
  // the project's packages at it and writes the pin a row lost. As in a project of 0.1.5, whose
  // pi-dolly had no upload tool, the recipe and the project lack upload@0: add brings both back.
  const oldApp = join(work, "old-app");
  await mkdir(oldApp);
  await npm(oldApp, "npm init --yes");
  await npm(oldApp, `npm install --save-exact @daugasauron/dolly-build@${checkoutVersion}-rc.0`);
  await npm(oldApp, "npx dolly-build init my-pi git");
  const pinned = await readFile(join(oldApp, "Dollyfile-my-pi"), "utf8");
  await writeFile(join(oldApp, "Dollyfile-my-pi"), pinned.replace(/(Dollyfile-git) [0-9a-f]{64}/, `$1 ${"0".repeat(64)}`)
    .replace("REQUIRES HOST upload@0\n", ""));
  await npm(oldApp, "npm uninstall @daugasauron/dolly-host-upload");
  await npm(oldApp, `npm install --save-exact @daugasauron/dolly-build@${checkoutVersion}`);
  await npm(oldApp, "npx dolly-build add my-pi");
  assert.equal(await readFile(join(oldApp, "Dollyfile-my-pi"), "utf8"), pinned);
  const upgraded = JSON.parse(await readFile(join(oldApp, "package.json"), "utf8")).dependencies;
  assert.ok(upgraded["@daugasauron/dolly-host-upload"], "add installs the host module a package declares since");
  for (const [name, version] of [["@daugasauron/dolly", checkoutVersion], ...Object.entries(upgraded)]) {
    assert.equal(version, checkoutVersion, name);
    assert.equal(JSON.parse(await readFile(join(oldApp, "node_modules", name, "package.json"), "utf8")).version, checkoutVersion, name);
  }
  // The guide's page, which also keeps the handle for the test; the same page
  // with every other device module, a policy and files; and one that lacks upload@0.
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
    'document.querySelector("#dolly"), { images, image, modules: modules.filter(url => !url.includes("/dolly-host-upload/")) }'));
  // Two image directories' indexes, of one row each.
  for (const [directory, words] of [["allowed", "fetched through the policy"], ["refused", "a program never sees this"]]) {
    await mkdir(join(app, directory));
    await writeFile(join(app, directory, "amy-index.txt"), `note /v${checkoutVersion}/Dollyfile-note ${"0".repeat(64)} ${words}\n`);
  }

  // python-data's project: the install line and the FROM row of the package's README,
  // its page, and a site of the project's own image, built on it below, whose page is
  // the guide's importing the site's runtime and image.
  const dataReadme = execFileSync("tar", ["-xzOf", join(process.env.DOLLY_NPM_OFFLINE,
    published.get("@daugasauron/dolly-image-python-data").file), "package/README.md"], { encoding: "utf8" });
  // A package index of the test's own: no CORS headers, a project page one redirect
  // away, and the wheel it names, built here; and a proxy before it, as a CI runner's.
  const wheel = join(work, "dolly_sample-1.0-py3-none-any.whl");
  execFileSync("python3", ["-I", "-c", `import sys, zipfile
info = "dolly_sample-1.0.dist-info/"
with zipfile.ZipFile(sys.argv[1], "w") as wheel:
    wheel.writestr("dolly_sample/__init__.py", "VALUE = 'DOLLY-SAMPLE'\\n")
    wheel.writestr(info + "METADATA", "Metadata-Version: 2.1\\nName: dolly-sample\\nVersion: 1.0\\n")
    wheel.writestr(info + "WHEEL", "Wheel-Version: 1.0\\nGenerator: dolly\\nRoot-Is-Purelib: true\\nTag: py3-none-any\\n")
    wheel.writestr(info + "RECORD", "".join(name + ",,\\n" for name in ["dolly_sample/__init__.py", info + "METADATA", info + "WHEEL", info + "RECORD"]))`, wheel]);
  const wheelBytes = await readFile(wheel), indexed = [], proxied = [];
  const index = await listen(createServer((request, response) => {
    indexed.push(request.url);
    if (request.url === "/simple/dolly-sample/") return response.writeHead(302, { location: "/project/dolly-sample/" }).end();
    if (request.url === "/project/dolly-sample/") return response.writeHead(200, { "content-type": "text/html" }).end(
      `<a href="/files/dolly_sample-1.0-py3-none-any.whl#sha256=${createHash("sha256").update(wheelBytes).digest("hex")}">wheel</a>`);
    if (request.url === "/files/dolly_sample-1.0-py3-none-any.whl") return response.writeHead(200).end(wheelBytes);
    response.writeHead(404).end();
  }));
  const indexProxy = await listen(createServer().on("connect", (request, socket) => {
    proxied.push(request.url);
    const [host, port] = request.url.split(":"), upstream = connect(Number(port), host, () => {
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      upstream.pipe(socket).on("error", () => {});
      socket.pipe(upstream);
    });
    for (const end of [upstream, socket]) end.on("error", () => { upstream.destroy(); socket.destroy(); });
  }));
  servers.push(index, indexProxy);
  const dataApp = join(work, "data-app");
  await mkdir(join(dataApp, "public"), { recursive: true });
  await npm(dataApp, "npm init --yes");
  await npm(dataApp, `${/```sh\n([\s\S]*?)```/.exec(dataReadme)[1].trim()} @daugasauron/dolly-build`);
  await writeFile(join(dataApp, "Dollyfile-my-data"), ["DOLLY 8", "APPLICATION my-data",
    ...declared("python-data").map(host => `REQUIRES HOST ${host}`), /^FROM .*$/m.exec(dataReadme)[0],
    "FILE /home/dolly/mean.py", "    import numpy, pandas", "    print('MEAN', pandas.Series(numpy.arange(10)).mean())",
    "SLOP python /home/dolly/mean.py > /home/dolly/mean.txt", "FILE /home/dolly/mean.txt",
    `SLOP pip install --disable-pip-version-check --no-cache-dir --index-url ${origin(index)}/simple/ --trusted-host 127.0.0.1 dolly-sample`,
    "FOLDER /usr/lib/python3.14/site-packages",
    "SLOP python -c 'import dolly_sample; print(dolly_sample.VALUE)' > /home/dolly/sample.txt", "FILE /home/dolly/sample.txt",
    "ENTRY /bin/foreground -i /bin/slop /etc/dolly/init.slop", ""].join("\n"));
  // A recipe that starts FROM an image and lacks a module the image declares, as one written
  // for an older version of the image: add declares it and installs its package.
  const dataRecipe = await readFile(join(dataApp, "Dollyfile-my-data"), "utf8");
  assert.ok(dataRecipe.includes("REQUIRES HOST upload@0\n"));
  await writeFile(join(dataApp, "Dollyfile-my-data"), dataRecipe.replace("REQUIRES HOST upload@0\n", ""));
  await npm(dataApp, "npm uninstall @daugasauron/dolly-host-upload");
  await npm(dataApp, "npx dolly-build add my-data");
  assert.match(await readFile(join(dataApp, "Dollyfile-my-data"), "utf8"), /^REQUIRES HOST upload@0$/m);
  assert.ok(existsSync(join(dataApp, "node_modules/@daugasauron/dolly-host-upload/module.json")));
  await writeFile(join(dataApp, "index.html"), page.replace("./node_modules/@daugasauron/dolly-image-default/index.mjs",
    "./node_modules/@daugasauron/dolly-image-python-data/index.mjs"));
  await writeFile(join(dataApp, "public/index.html"), page.replace("./node_modules/@daugasauron/dolly/page/browser.mjs", "./dolly/page/browser.mjs")
    .replace("./node_modules/@daugasauron/dolly-image-default/index.mjs", "./image/index.mjs"));

  const serve = (isolated, root = app) => listen(createServer(async (request, response) => {
    const path = join(root, decodeURIComponent(new URL(request.url, "http://x").pathname));
    try {
      const body = await readFile(path.endsWith("/") ? join(path, "index.html") : path);
      response.writeHead(200, { "content-type": mimeTypes.get(extname(path) || ".html") ?? "application/octet-stream",
        ...isolated ? isolationHeaders : {} });
      response.end(body);
    } catch { response.writeHead(404).end(); }
  }));
  const [isolated, plain, dataServer, dataSite] = await Promise.all([serve(true), serve(false), serve(true, dataApp),
    serve(true, join(dataApp, "my-data"))]);
  servers.push(isolated, plain, dataServer, dataSite);
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
  const dollyBuild = (project, command, name) => npm(project, `${command} --browser ${name === "chromium" ? "chrome" : name}`);
  const git = (directory, ...words) => execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", ...words], { cwd: directory, stdio: "ignore" });
  for (const name of names) {
    const started = performance.now();
    // The browsers stand for the user's, whose own requests are their vendor's, not the
    // flow's: a proxy refuses them as dolly-build's does, and notes them apart.
    const proxy = { server: origin(refusal), bypass: "127.0.0.1" };
    const browser = await (name === "chromium"
      ? chromium.launch({ channel: "chrome", headless: true, args: ["--no-sandbox", "--disable-gpu"], proxy })
      : firefox.launch({ headless: true, firefoxUserPrefs: { "extensions.systemAddon.update.enabled": false }, proxy }));
    // What a page, its workers or its service worker ask for beyond the machine.
    const newPage = async () => {
      const opened = await browser.newPage();
      opened.context().on("request", request => {
        const url = new URL(request.url());
        if (/^https?:$/.test(url.protocol) && url.hostname !== "127.0.0.1") attempts.push(`page ${url.href}`);
      });
      return opened;
    };
    try {
      const tab = await newPage(), submit = await booted(tab, `${origin(isolated)}/`);
      assert.equal(await submit("echo npm-$((6 * 7))"), 0);
      assert.match(await tab.evaluate(() => window.dolly.visibleTerminalText()), /npm-42/);
      // An explicit check of the capability set: what default declares, no more.
      assert.deepEqual((await tab.evaluate(() => window.dolly.hostModules)).sort(), declared("default"));
      // amy reads the image directory's index of what the image holds.
      assert.equal(await submit("amy list | grep -q '^ps  *installed '"), 0);

      const devices = await newPage(), run = await booted(devices, `${origin(isolated)}/devices.html`);
      for (const module of ["gpu@0", "microphone@0", "pty@0"]) {
        assert.equal(await run(`nena | grep -q '^${module}  *available '`), 0, `nena lists ${module}`);
      }
      // gpu@0 starts its part in the runtime Worker; without an adapter its OPEN fails.
      assert.equal(await run("nena enable gpu"), 0);
      assert.ok((await devices.evaluate(() => window.dolly.hostModules)).includes("gpu@0"));
      assert.equal(await run("nena disable gpu"), 0);
      assert.equal(await run("grep -qx 'Answer in French.' ~/.pi/agent/AGENTS.md && grep -qx hi /etc/bytes"), 0);
      // What leaves the page for the guest passes the embedding's policy: amy reads
      // another directory's index only where a rule admits it.
      assert.equal(await run(`amy server ${origin(isolated)}/allowed/ && amy list | grep -q 'through the policy'`), 0);
      assert.equal(await run(`amy server ${origin(isolated)}/refused/ && ! amy list 2> /tmp/refused && ` +
        "grep -q 'policy does not admit' /tmp/refused && rm /etc/dolly/packages-server"), 0);

      const lacking = await newPage();
      await lacking.goto(`${origin(isolated)}/lacking.html`);
      await lacking.waitForFunction(() => document.documentElement.dataset.dollyStatus === "failed", null, { timeout: 60_000 });
      assert.match(await lacking.locator("#bootstrap-log").textContent(), /upload@0 is unavailable/);
      const bare = await newPage();
      await bare.goto(`${origin(plain)}/`);
      await bare.waitForFunction(() => document.documentElement.dataset.dollyStatus === "failed", null, { timeout: 60_000 });
      assert.match(await bare.locator("#bootstrap-log").textContent(), /cross-origin isolation/);
      // Each session holds its memory until its page closes: the builds below need it.
      for (const done of [tab, devices, lacking, bare]) await done.close();

      // The project's site, built in this browser (after the first, from nothing again). Its
      // start script asks for the key; Pi then lists the skill and the extension and runs its command.
      // The guide's command finds a browser itself: this machine's Chrome.
      await rm(join(piApp, "my-pi"), { recursive: true, force: true });
      await (name === "chromium" ? npm(piApp, buildCommand) : dollyBuild(piApp, buildCommand, name));
      // As CI builds it: the project committed, cloned, and the workflow's npm ci and build
      // lines run in the clone (the browser is the one under test, which is installed).
      const clone = join(work, `ci-${name}`);
      await rm(join(piApp, ".git"), { recursive: true, force: true });
      git(piApp, "init", "-q");
      git(piApp, "add", "-A");
      git(piApp, "commit", "-q", "-m", "the project");
      git(work, "clone", "-q", piApp, clone);
      assert.ok(!existsSync(join(clone, "node_modules")) && !existsSync(join(clone, "my-pi")) && existsSync(join(clone, "package-lock.json")));
      await npm(clone, workflowRuns[0]);
      await dollyBuild(clone, workflowRuns[2].replace(" --browser chromium", ""), name);
      assert.deepEqual(await siteFiles(join(clone, "my-pi")), await siteFiles(join(piApp, "my-pi")));
      await rm(clone, { recursive: true, force: true });
      piPage ??= await startSite();
      const pi = await newPage();
      await booted(pi, piPage, /not shown\):/);
      assert.equal(await pi.evaluate(() => crossOriginIsolated), true);
      await pi.keyboard.type("sk-or-test");
      await pi.keyboard.press("Enter");
      await shows(pi, /Bash is not installed/, "Pi");
      assert.match(await pi.evaluate(() => window.dolly.visibleTerminalText()), /changelog[^\n]*line-count[\s\S]*hello\.js/);
      // Enter takes the command menu's choice, so it waits for the menu to offer this one.
      await pi.keyboard.type("/hello");
      await shows(pi, /Say hello/, "the menu");
      await pi.keyboard.press("Enter");
      await shows(pi, /Hello, world, from my-pi!/, "/hello");
      assert.deepEqual((await pi.evaluate(() => window.dolly.hostModules)).sort(), declaredByRecipe);
      // Ctrl+D leaves Pi for the shell: the instructions, the tools, Git, Python with NumPy and
      // Matplotlib and the workspace are there, and the policy refuses what it does not name.
      await pi.keyboard.press("Control+d");
      await shows(pi, /Pi exited; this is a Slop shell\.[\s\S]*\ndolly:[^\n]*\$\s*$/, "the shell");
      const shell = command => within(pi.evaluate(command => window.dolly.submit(command), command), 120, command);
      assert.equal(await shell("grep -q 'coding agent' ~/.pi/agent/AGENTS.md && command -v todo > /dev/null"), 0);
      // The command of Pi's upload tool shows the site's dialog, which Escape cancels.
      const uploading = shell("upload /tmp/chosen");
      await pi.locator("#file-upload[open]").waitFor({ timeout: 60_000 });
      await pi.keyboard.press("Escape");
      assert.equal(await uploading, 1);
      assert.equal(await shell("grep -q '#0fa9e6' ~/.pi/agent/themes/dolly.json && grep -q '\"theme\": \"dolly\"' ~/.pi/agent/settings.json"), 0);
      assert.deepEqual(await pi.evaluate(async () => [...(await window.dolly.frame()).data.subarray(0, 3)]), [0x10, 0x20, 0x30],
        "the terminal's background is theme.json's");
      assert.equal(await shell("test \"$(printf 'a\\nb\\n' | count-lines)\" = '2 lines'"), 0);
      assert.equal(await shell("git --version > /dev/null"), 0);
      assert.equal(await shell("test \"$(echo '[1,2]' | jq -c 'map(. * 2)')\" = '[2,4]' && test \"$(sqlite3 :memory: 'select 6 * 7')\" = 42"), 0);
      assert.equal(await shell("test \"$(slop ~/.pi/agent/skills/line-count/count.slop /workspace/README.md)\" -gt 0"), 0);
      // Neovim on the terminal: a line typed into a new file and written.
      await pi.keyboard.type("nvim /tmp/note.txt\n");
      await shows(pi, /note\.txt/, "Neovim");
      await pi.keyboard.type("iwritten in neovim");
      await pi.keyboard.press("Escape");
      await pi.keyboard.type(":wq\n");
      await shows(pi, /\ndolly:[^\n]*\$\s*$/, "the shell after Neovim");
      assert.equal(await shell("grep -qx 'written in neovim' /tmp/note.txt"), 0);
      assert.equal(await shell(String.raw`python -c 'import numpy, matplotlib.pyplot as plot; plot.plot(numpy.arange(4) ** 2); ` +
        String.raw`plot.savefig("/tmp/squares.png"); assert open("/tmp/squares.png", "rb").read(4) == b"\x89PNG"'`), 0);
      assert.equal(await shell("grep -q 'deepest trench' '/workspace/notes/deep sea.txt' && test -f /workspace/README.md"), 0);
      assert.notEqual(await shell("curl -fsS https://example.com > /dev/null"), 0);
      // Save names the session in the address; a reload there opens it as it was, the
      // workspace edit kept rather than the page's files written over it.
      assert.equal(await shell("echo 'kept by the save' >> /workspace/README.md"), 0);
      assert.equal(await within(pi.evaluate(() => window.dolly.saveSession("kept")), 60, "the save"), "kept");
      const savedAt = new URL(pi.url());
      assert.equal(savedAt.searchParams.get("session"), "kept");
      await booted(pi, savedAt.href, /not shown\):/);
      await pi.keyboard.type("sk-or-test");
      await pi.keyboard.press("Enter");
      await shows(pi, /Bash is not installed/, "Pi, restored");
      await pi.keyboard.press("Control+d");
      await shows(pi, /Pi exited; this is a Slop shell\.[\s\S]*\ndolly:[^\n]*\$\s*$/, "the restored shell");
      assert.equal(await shell("grep -q 'kept by the save' /workspace/README.md"), 0);
      // A change to the workspace alone: the build keeps the image and writes the page's files.
      const snapshot = join(piApp, "my-pi/image/dist/dolly-my-pi-system-snapshot.json"), before = (await stat(snapshot)).ino;
      await writeFile(join(piApp, "public/workspace/later.txt"), "added after the build\n");
      await dollyBuild(piApp, buildCommand, name);
      assert.equal((await stat(snapshot)).ino, before);
      assert.ok(JSON.parse(await readFile(join(piApp, "my-pi/workspace.json"), "utf8")).includes("later.txt"));
      await rm(join(piApp, "public/workspace/later.txt"));
      // The site holds every file its page asked for.
      assert.deepEqual(requested.filter(line => / 404 /.test(line)), []);
      await pi.close();

      const data = await newPage(), python = await booted(data, `${origin(dataServer)}/`);
      assert.equal(await python("python -c 'import numpy, pandas, matplotlib.pyplot; " +
        "assert int(pandas.DataFrame({\"v\": numpy.arange(4)})[\"v\"].sum()) == 6'"), 0);
      await data.close();
      await dollyBuild(dataApp, "npx dolly-build Dollyfile-my-data my-data", name);
      const mine = await newPage(), own = await booted(mine, `${origin(dataSite)}/`);
      assert.equal(await own("grep -qx 'MEAN 4.5' /home/dolly/mean.txt && python /home/dolly/mean.py | grep -qx 'MEAN 4.5'"), 0);
      assert.equal(await own("grep -qx DOLLY-SAMPLE /home/dolly/sample.txt && python -c 'import dolly_sample'"), 0);
      assert.ok(["/simple/dolly-sample/", "/project/dolly-sample/", "/files/dolly_sample-1.0-py3-none-any.whl"]
        .every(path => indexed.includes(path)), `the index served ${indexed}`);
      // Built again into a site of its own, through the proxy HTTP_PROXY names.
      proxied.length = 0;
      await promisify(execFile)("sh", ["-c", `npx dolly-build Dollyfile-my-data my-data-proxied-${name} --browser ${name === "chromium" ? "chrome" : name}`],
        { cwd: dataApp, env: { ...environment, HTTP_PROXY: origin(indexProxy) } });
      assert.ok(proxied.includes(`127.0.0.1:${index.address().port}`), `the build's proxy saw ${proxied}`);
      console.log(`npm packages: ${name} passed in ${((performance.now() - started) / 1000).toFixed(1)}s`);
    } finally { await browser.close(); }
  }
  // Nothing of it left the machine.
  assert.deepEqual(attempts, [], "requests beyond the machine");
  console.log(`npm packages: requests beyond the machine: none; the browsers' own, refused: ${[...vendors].sort().join(", ") || "none"}`);
} finally {
  for (const server of servers) server.close();
  for (const socket of [dns, sink, datagrams]) socket.close();
  await rm(work, { recursive: true, force: true });
}
