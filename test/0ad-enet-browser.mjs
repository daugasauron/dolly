import assert from "node:assert/strict";
import {createServer} from "node:http";
import {chromium} from "playwright-core";
import {startBrowserServer} from "./browser-server.mjs";
import {createRelayRoom} from "../toolchain/0ad/relay.mjs";

const server = await startBrowserServer(new URL("..", import.meta.url).pathname,
  "default", 0, new Map(), {"enet.wasm": "build/0ad/enet-check.wasm"});
const room = createRelayRoom();
const relay = createServer((request, response) => void room.handle(request, response, server.origin));
relay.maxConnections = 32; relay.requestTimeout = 10000;
await new Promise(resolve => relay.listen(0, "127.0.0.1", resolve));
const relayOrigin = `http://127.0.0.1:${relay.address().port}`;
let browser, deadline;
const pages = [];
try {
  browser = await chromium.launch({channel: "chrome", headless: true, args: ["--no-sandbox", "--disable-gpu"]});
  deadline = setTimeout(() => void browser.close(), 90000);
  for (const endpoint of room.endpoints) {
    const page = await browser.newPage(); pages.push(page);
    page.on("pageerror", error => console.error(error.message));
    await page.addInitScript(({origin, relayOrigin, path}) => {
      globalThis.DOLLY_HTTP_POLICY = {maxRequests: 2000, rules: [
        {origin, pathPrefix: "/fixture/", methods: ["GET"]},
        {origin: relayOrigin, pathPrefix: path, methods: ["POST"]}
      ]};
    }, {origin: server.origin, relayOrigin, path: endpoint.path});
    await page.goto(`${server.origin}/default/`);
    await page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus));
    assert.equal(await page.evaluate(() => document.documentElement.dataset.dollyStatus), "ready");
    await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "shell"));
    assert.equal(await page.evaluate(url => __dolly.submit(`curl -fsS ${url}/fixture/enet.wasm -o /tmp/enet`), server.origin), 0);
  }
  const submit = (index, role, path = room.endpoints[index].path) => pages[index].evaluate(
    command => __dolly.submit(command), `DOLLY_ENET_RELAY=${relayOrigin}${path} /tmp/enet ${role}`);
  for (let run = 0; run < 2; ++run) {
    const host = submit(0, "host");
    const limit = Date.now() + 10000;
    while (!room.status().sockets && Date.now() < limit) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(room.status().sockets, 1, "Host did not bind its relay port");
    const results = await Promise.all([host, submit(1, "client")]);
    assert.deepEqual(results, [0, 0]);
    assert.equal(room.status().sockets, 0);
    console.log(`ENet browser pair ${run + 1} passed`);
  }
  const before = room.status().requests;
  assert.equal(await submit(1, "--deny", room.endpoints[0].path), 0);
  assert.equal(room.status().requests, before, "Denied endpoint reached the relay");
  for (const page of pages) assert.equal(await page.evaluate(() => __dolly.submit("echo ENET_SHELL_RECOVERY > /tmp/enet-result")), 0);
  for (const page of pages) console.log(await page.evaluate(() => __dolly.visibleTerminalText()));
  console.log(JSON.stringify({browser: browser.version(), reliableFragmentedEcho: 10000,
    freshPairs: 2, brokerDenial: true, relay: room.status()}));
} catch (error) {
  for (const page of pages) if (!page.isClosed()) console.error(await page.evaluate(() => __dolly.visibleTerminalText()).catch(() => ""));
  throw error;
} finally {
  clearTimeout(deadline); await browser?.close(); await server.close();
  await new Promise(resolve => relay.close(resolve));
}
