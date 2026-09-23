import assert from "node:assert/strict";
import {createServer} from "node:http";
import {mkdir, readFile} from "node:fs/promises";
import {chromium} from "playwright-core";
import {startBrowserServer} from "./browser-server.mjs";
import {createRelayRoom} from "../toolchain/0ad/relay.mjs";

const output = new URL("../.cache/0ad/browser/", import.meta.url);
await mkdir(output, {recursive: true});
const server = await startBrowserServer(new URL("..", import.meta.url).pathname, "default", 0, new Map(), {
  "pyrogenesis.wasm": "build/0ad/pyrogenesis.wasm", "0ad-data.tar": "build/0ad/headless-data.tar"
});
const room = createRelayRoom();
const relay = createServer((request, response) => void room.handle(request, response, server.origin));
relay.maxConnections = 32; relay.requestTimeout = 10000;
await new Promise(resolve => relay.listen(0, "127.0.0.1", resolve));
const relayOrigin = `http://127.0.0.1:${relay.address().port}`, pages = [];
const replays = [], metadata = [];
let browser, deadline;
try {
  browser = await chromium.launch({channel: "chrome", headless: true, args: ["--no-sandbox", "--disable-gpu"]});
  deadline = setTimeout(() => void browser.close(), 240000);
  for (const endpoint of room.endpoints) {
    const page = await browser.newPage(); pages.push(page);
    page.on("pageerror", error => console.error(error.message));
    await page.addInitScript(({origin, relayOrigin, path}) => {
      globalThis.DOLLY_HTTP_POLICY = {maxRequests: 50000, rules: [
        {origin, pathPrefix: "/fixture/", methods: ["GET"]},
        {origin: relayOrigin, pathPrefix: path, methods: ["POST"]}
      ]};
    }, {origin: server.origin, relayOrigin, path: endpoint.path});
    await page.goto(`${server.origin}/default/`);
    await page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus));
    assert.equal(await page.evaluate(() => document.documentElement.dataset.dollyStatus), "ready");
    await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "shell"));
    for (const command of ["mkdir -p /opt/0ad/system",
      `curl -fsS ${server.origin}/fixture/pyrogenesis.wasm -o /opt/0ad/system/pyrogenesis`,
      `curl -fsS ${server.origin}/fixture/0ad-data.tar -o /tmp/0ad.tar && tar -xf /tmp/0ad.tar -C /opt/0ad && rm /tmp/0ad.tar`])
      assert.equal(await page.evaluate(command => __dolly.submit(command), command), 0);
  }
  const start = async (index, options) => pages[index].evaluate(command => {
    globalThis.gameStatus = null;
    void __dolly.submit(command).then(status => { gameStatus = status; });
  }, `DOLLY_ENET_RELAY=${relayOrigin}${room.endpoints[index].path} ICU_DATA=/opt/0ad/data/icu ` +
    `/opt/0ad/system/pyrogenesis -quickstart -writableRoot -mod=public -nosound -autostart-nonvisual ` +
    `-autostart-playername=Player${index + 1} ${options} > /tmp/network.log 2>&1`);
  const time = performance.now();
  await start(0, "-autostart=scenarios/combat_demo -autostart-host -autostart-host-players=2");
  const until = Date.now() + 10000;
  while (room.status().sockets < 1 && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(room.status().sockets >= 1, "The actual game server did not bind its relay port");
  await start(1, "-autostart-client=10.0.0.1");
  await Promise.all(pages.map(page => page.waitForFunction(() => gameStatus !== null, null, {timeout: 150000})));
  const statuses = await Promise.all(pages.map(page => page.evaluate(() => gameStatus)));
  const milliseconds = Math.round(performance.now() - time);
  for (const [index, page] of pages.entries()) {
    const submit = command => page.evaluate(command => __dolly.submit(command), command);
    const download = async (path, name) => {
      const event = page.waitForEvent("download"), running = submit(`download ${path}`);
      const file = await event; await file.saveAs(new URL(name, output).pathname);
      assert.equal(await running, 0); return readFile(new URL(name, output), "utf8");
    };
    const log = await download("/tmp/network.log", `multiplayer-${index + 1}.log`);
    assert.doesNotMatch(log, /ERROR:|Assertion failed|out.of.sync|mismatch/i);
    assert.match(log, /Turn [1-9][0-9]+ /);
    assert.doesNotMatch(await download("/opt/0ad/logs/interestinglog.html", `multiplayer-${index + 1}.html`), /class="error"|class="warning"/);
    assert.equal(await submit('replay=$(find /opt/0ad/data/replays -name commands.txt | head -n1); cat "$replay" > /tmp/network-replay.txt; cat "$(dirname "$replay")/metadata.json" > /tmp/network-metadata.json'), 0);
    replays.push(await download("/tmp/network-replay.txt", `multiplayer-${index + 1}-replay.txt`));
    metadata.push(JSON.parse(await download("/tmp/network-metadata.json", `multiplayer-${index + 1}-metadata.json`)));
    assert.equal(await submit("echo MULTIPLAYER_SHELL_RECOVERY > /tmp/network-result"), 0);
  }
  assert.deepEqual(statuses, [0, 0]);
  assert.equal(room.status().sockets, 0);
  assert.equal(replays[0], replays[1], "Both peers must record identical commands and every turn's state hash");
  const hashes = replays[0].match(/^hash(?:-quick)? .+$/gm);
  assert.ok(hashes.length >= 100);
  assert.deepEqual(metadata[0].playerStates, metadata[1].playerStates);
  assert.ok(metadata[0].playerStates.some(player => player.state === "won"));
  const cgroup = (await readFile("/proc/self/cgroup", "utf8")).match(/^0::(.*)$/m)?.[1];
  const processTreePeakBytes = cgroup ? Number(await readFile(`/sys/fs/cgroup${cgroup}/memory.peak`, "utf8")) : undefined;
  console.log(JSON.stringify({statuses, milliseconds, synchronizedTurns: hashes.length,
    finalHash: hashes.at(-1), processTreePeakBytes, relay: room.status()}));
} catch (error) {
  console.error("Relay:", room.status());
  for (const [index, page] of pages.entries()) if (!page.isClosed()) {
    if (await page.evaluate(() => globalThis.gameStatus === null).catch(() => false)) {
      await page.keyboard.press("Control+c");
      await page.waitForFunction(() => gameStatus !== null, null, {timeout: 5000}).catch(() => {});
    }
    await page.evaluate(() => __dolly.submit("tail -n 70 /tmp/network.log")).catch(() => {});
    console.error(`Player ${index + 1}:`, await page.evaluate(() => __dolly.visibleTerminalText()).catch(() => ""));
  }
  throw error;
} finally {
  clearTimeout(deadline); await browser?.close(); await server.close();
  await new Promise(resolve => relay.close(resolve));
}
