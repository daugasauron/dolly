import assert from "node:assert/strict";
import {createServer} from "node:http";
import {mkdir, readFile} from "node:fs/promises";
import {chromium} from "playwright-core";
import {startBrowserServer} from "../../../test/browser-server.mjs";
import {acceptDownload} from "../../browser.mjs";
import {createRelayRoom} from "../toolchain/relay.mjs";
import {hasGameHud} from "./fixtures/0ad-hud.mjs";

const output = new URL("../../../.cache/0ad/browser/", import.meta.url);
const mode=process.argv[2]??"headless", backend=process.argv[3]??"hardware";
assert.ok(process.argv.length<=4 && ["headless","visual","visual-client"].includes(mode) &&
  ["hardware","software"].includes(backend),
  "usage: node demos/zero-ad/test/0ad-multiplayer-browser.mjs [headless|visual|visual-client] [hardware|software]");
const visualIndex=mode==="visual"?0:mode==="visual-client"?1:-1;
const visual = visualIndex!==-1, image=visual?"zero-ad":"default";
const provider = await readFile(new URL("../../../src/gpu-worker.mjs", import.meta.url), "utf8");
await mkdir(output, {recursive: true});
const server = await startBrowserServer(new URL("../../../", import.meta.url).pathname, image, { sourceOverrides: new Map(visual && backend==="software" ? [
  ["/src/gpu-worker.mjs", provider.replace('powerPreference: "high-performance"', 'forceFallbackAdapter: true')]
] : []), fixtures: {
  "pyrogenesis.wasm": "build/0ad/pyrogenesis.wasm", "0ad-data.tar": "build/0ad/headless-data.tar"
} });
const room = createRelayRoom();
const relay = createServer((request, response) => void room.handle(request, response, server.origin));
relay.maxConnections = 32; relay.requestTimeout = 10000;
await new Promise(resolve => relay.listen(0, "127.0.0.1", resolve));
const relayOrigin = `http://127.0.0.1:${relay.address().port}`, pages = [];
const replays = [], metadata = [], logs = [];
let browser, deadline;
try {
  browser = await chromium.launch({channel: "chrome", headless: !visual, args: visual ? [
    "--no-sandbox", "--mute-audio", "--enable-unsafe-webgpu", "--use-angle=vulkan", ...(backend==="hardware"
      ? ["--ozone-platform=x11", "--enable-features=Vulkan,VulkanFromANGLE"]
      : ["--use-vulkan=swiftshader", "--use-webgpu-adapter=swiftshader", "--enable-features=Vulkan", "--disable-vulkan-surface"])
  ] : ["--no-sandbox", "--disable-gpu"]});
  deadline = setTimeout(() => void browser.close(), visual?420000:240000);
  for (const endpoint of room.endpoints) {
    const page = await browser.newPage({viewport:{width:1024,height:768}}); pages.push(page);
    page.on("pageerror", error => console.error(error.message));
    await page.addInitScript(({origin, relayOrigin, path}) => {
      globalThis.DOLLY_HTTP_POLICY = {maxRequests: 50000, rules: [
        {origin, pathPrefix: "/fixture/", methods: ["GET"]},
        {origin: relayOrigin, pathPrefix: path, methods: ["POST"]}
      ]};
    }, {origin: server.origin, relayOrigin, path: endpoint.path});
    await page.goto(`${server.origin}/${image}/`);
    await page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus),null,{timeout:90000});
    assert.equal(await page.evaluate(() => document.documentElement.dataset.dollyStatus), "ready");
    if(visual) {
      await page.waitForFunction(()=>__dolly.gpu.stats?.frames>=90,null,{timeout:60000});
      await page.keyboard.press("Control+F10");
      await page.waitForFunction(()=>!__dolly.graphicsActive);
    }
    await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "shell"));
    if (!visual) for (const command of ["mkdir -p /opt/0ad/system",
      `curl -fsS ${server.origin}/fixture/pyrogenesis.wasm -o /opt/0ad/system/pyrogenesis`,
      `curl -fsS ${server.origin}/fixture/0ad-data.tar -o /tmp/0ad.tar && tar -xf /tmp/0ad.tar -C /opt/0ad && rm /tmp/0ad.tar`])
      assert.equal(await page.evaluate(command => __dolly.submit(command), command), 0);
  }
  const start = async (index, options) => pages[index].evaluate(command => {
    globalThis.gameStatus = null;
    void __dolly.submit(command).then(status => { gameStatus = status; });
  }, `DOLLY_ENET_RELAY=${relayOrigin}${room.endpoints[index].path} ICU_DATA=/opt/0ad/data/icu ` +
    `/opt/0ad/system/pyrogenesis -quickstart -writableRoot -mod=public -nosound -conf=hotkey.exit:Ctrl+F10 ${index!==visualIndex?"-autostart-nonvisual":""} ` +
    `-autostart-playername=Player${index + 1} ${options} > /tmp/network.log 2>&1`);
  const time = performance.now();
  await start(0, "-autostart=scenarios/combat_demo -autostart-host -autostart-host-players=2");
  const until = Date.now() + 10000;
  while (room.status().sockets < 1 && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(room.status().sockets >= 1, "The actual game server did not bind its relay port");
  await start(1, "-autostart-client=10.0.0.1");
  if (visual) {
    const gamePage=pages[visualIndex];
    await gamePage.bringToFront();
    const advance=async count=>{
      await gamePage.waitForFunction(()=>gameStatus!==null || __dolly.transport.inputIdle());
      const frame=await gamePage.evaluate(()=>__dolly.gpu.stats?.frames??0);
      await gamePage.waitForFunction(target=>gameStatus!==null || __dolly.gpu.stats?.frames>=target,frame+count,{timeout:60000});
      assert.equal(await gamePage.evaluate(()=>gameStatus),null);
    };
    await advance(22);
    const readyDeadline=Date.now()+60000;
    while(!await hasGameHud(gamePage)) {
      assert.ok(Date.now()<readyDeadline,"The multiplayer HUD never appeared");
      await advance(2);
    }
    const gpu=await gamePage.evaluate(()=>__dolly.gpu);
    if(backend==="software") assert.match(gpu.adapter,/swiftshader/i);
    else assert.equal(gpu.isFallbackAdapter,false);
    await gamePage.mouse.move(480,240); await gamePage.mouse.down();
    await gamePage.mouse.move(720,550,{steps:5}); await gamePage.mouse.up();
    await advance(3);
    await gamePage.mouse.click(224,742); // Upstream's violent-stance button.
    await advance(3);
    await gamePage.screenshot({path:new URL(`multiplayer-${mode}.png`,output).pathname});
    await pages[1-visualIndex].waitForFunction(()=>gameStatus!==null,null,{timeout:300000});
    await advance(4);
    await gamePage.screenshot({path:new URL(`multiplayer-${mode}-finished.png`,output).pathname});
    await gamePage.keyboard.press("Control+F10");
  }
  await Promise.all(pages.map(page => page.waitForFunction(() => gameStatus !== null, null, {timeout: 210000})));
  const statuses = await Promise.all(pages.map(page => page.evaluate(() => gameStatus)));
  const milliseconds = Math.round(performance.now() - time);
  for (const [index, page] of pages.entries()) {
    const submit = command => page.evaluate(command => __dolly.submit(command), command);
    const download = async (path, name) => {
      const running = submit(`download ${path}`), event = acceptDownload(page, () => running);
      const file = await event; await file.saveAs(new URL(name, output).pathname);
      assert.equal(await running, 0); return readFile(new URL(name, output), "utf8");
    };
    const log = await download("/tmp/network.log", `multiplayer-${index + 1}.log`);
    logs.push({log,html:await download("/opt/0ad/logs/interestinglog.html", `multiplayer-${index + 1}.html`)});
    assert.equal(await submit('replay=$(find /opt/0ad/data/replays -name commands.txt | head -n1); cat "$replay" > /tmp/network-replay.txt; cat "$(dirname "$replay")/metadata.json" > /tmp/network-metadata.json'), 0);
    replays.push(await download("/tmp/network-replay.txt", `multiplayer-${index + 1}-replay.txt`));
    metadata.push(JSON.parse(await download("/tmp/network-metadata.json", `multiplayer-${index + 1}-metadata.json`)));
    assert.equal(await submit("echo MULTIPLAYER_SHELL_RECOVERY > /tmp/network-result"), 0);
  }
  for (const [index,{log,html}] of logs.entries()) {
    assert.doesNotMatch(log, /ERROR:|Assertion failed|out.of.sync|mismatch/i);
    if (index!==visualIndex) assert.match(log, /Turn [1-9][0-9]+ /);
    assert.doesNotMatch(html, /class="error"|class="warning"/);
  }
  assert.deepEqual(statuses, [0, 0]);
  assert.equal(room.status().sockets, 0);
  const parsed=replays.map(replay=>{
    const start=JSON.parse(replay.slice(6,replay.indexOf("\n"))); delete start.timestamp;
    return {start,turns:replay.slice(replay.indexOf("\n")+1).trimEnd().split(/\n(?=turn )/)};
  });
  assert.deepEqual(parsed[0].start,parsed[1].start);
  const sharedTurns=Math.min(parsed[0].turns.length,parsed[1].turns.length);
  assert.deepEqual(parsed[0].turns.slice(0,sharedTurns),parsed[1].turns.slice(0,sharedTurns),
    "Both peers must record identical commands and state hashes for every shared turn");
  if (!visual) assert.equal(parsed[0].turns.length,parsed[1].turns.length);
  const hashes = parsed[0].turns.slice(0,sharedTurns).join("\n").match(/^hash(?:-quick)? .+$/gm);
  assert.ok(hashes.length >= 100);
  if (visual) {
    const orders=replays[0].split("\n").filter(line=>/^cmd [12] /.test(line)).map(line=>JSON.parse(line.slice(6)));
    assert.ok(orders.some(order=>order.type==="stance" && order.name==="violent" && order.entities.length>0),
      "The graphical peer's order to selected units must reach both synchronized replays");
  }
  if (!visual) assert.deepEqual(metadata[0].playerStates, metadata[1].playerStates);
  assert.deepEqual(metadata[0].playerStates.map(player=>[player.name,player.state]),
    metadata[1].playerStates.map(player=>[player.name,player.state]));
  assert.ok(metadata[0].playerStates.some(player => player.state === "won"));
  const cgroup = (await readFile("/proc/self/cgroup", "utf8")).match(/^0::(.*)$/m)?.[1];
  const processTreePeakBytes = cgroup ? Number(await readFile(`/sys/fs/cgroup${cgroup}/memory.peak`, "utf8")) : undefined;
  console.log(JSON.stringify({mode, backend:visual?backend:undefined, visualInput:visual, statuses, milliseconds, synchronizedTurns: hashes.length,
    peerTurns:parsed.map(peer=>peer.turns.length), finalSharedHash: hashes.at(-1), processTreePeakBytes, relay: room.status()}));
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
