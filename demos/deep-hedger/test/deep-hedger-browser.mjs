// The deep-hedger image on a GPU: dh-gui loads a chain through the HTTP broker
// (the service's answer is a fixture here: lognormal prices with a band), fits
// it with dh-fit's kernels on WebGPU and draws the model's bids and asks. That
// fit puts its quotes in the fixture's bands at the forward and the volatility
// the fixture was made with, with a hedger that hedges. Then dh-fit alone: its
// gradients against finite differences.
// Usage: DISPLAY=:N node demos/deep-hedger/test/deep-hedger-browser.mjs
// (a GPU window, Chrome and the installed Firefox).
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium, firefox } from "playwright-core";
import { startBrowserServer } from "../../../test/browser-server.mjs";
import { delay, framePoint, redirectFetch, shellPrompt, waitForDisplay } from "../../browser.mjs";

if (!process.env.DISPLAY) {
  console.log("skipped: needs DISPLAY: a GPU window on a hardware adapter");
  process.exit(77);
}
const root = new URL("../../../", import.meta.url);
// The installed Firefox is a snap with a private /tmp: its profile must live under $HOME.
process.env.TMPDIR = new URL("build/deep-hedger-test/", root).pathname;
await mkdir(process.env.TMPDIR, { recursive: true });

const volatility = 0.3, spot = 200, day = 86400;
const cdf = x => { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return x > 0 ? 1 - p : p; };
// A chain as api.marketdata.app answers: columns, one entry a contract. Zero
// carry, Black prices on business time, a band of 2% and at least 4 cents.
function chain() {
  const quoted = Math.floor(Date.UTC(2026, 10, 13, 21) / 1000), columns = { optionSymbol: [], strike: [], side: [], expiration: [], bid: [], ask: [], updated: [], underlyingPrice: [] };
  for (const [calendar, business] of [[7, 5], [14, 10], [28, 20], [56, 40]]) {
    const deviation = volatility * Math.sqrt(business / 252);
    for (let strike = 150; strike <= 250; strike += 5) {
      const d1 = Math.log(spot / strike) / deviation + deviation / 2, call = spot * cdf(d1) - strike * cdf(d1 - deviation);
      for (const [side, price] of [["call", call], ["put", call - spot + strike]]) {
        const half = Math.max(0.02 * price, 0.04);
        columns.optionSymbol.push(`TEST${calendar}${side}${strike}`), columns.strike.push(strike), columns.side.push(side);
        columns.expiration.push(quoted + calendar * day), columns.bid.push(Math.max(price - half, 0).toFixed(2)), columns.ask.push((price + half).toFixed(2));
        columns.updated.push(quoted), columns.underlyingPrice.push(spot);
      }
    }
  }
  const text = value => typeof value === "string" && Number.isNaN(Number(value)) ? JSON.stringify(value) : value;
  return `{"s":"ok",${Object.entries(columns).map(([name, values]) => `"${name}":[${values.map(text).join(",")}]`).join(",")}}`;
}

const launches = {
  chromium: () => chromium.launch({ channel: "chrome", headless: false,
    args: ["--no-sandbox", "--ozone-platform=x11", "--enable-unsafe-webgpu", "--use-angle=vulkan", "--enable-features=Vulkan,VulkanFromANGLE"] }),
  firefox: () => firefox.launch({ channel: "moz-firefox", headless: false, firefoxUserPrefs: { "dom.webgpu.enabled": true } }),
};
const requested = [];
const server = await startBrowserServer(root.pathname, "deep-hedger", { handle(request, response, path, headers) {
  if (!path.startsWith("/fixture/marketdata/")) return false;
  requested.push(path);
  response.writeHead(200, { ...headers, "content-type": "application/json" });
  response.end(chain());
  return true;
} });
try {
  for (const [name, launch] of Object.entries(launches)) {
    const browser = await launch();
    try {
      const page = await (await browser.newContext({ viewport: { width: 1700, height: 1000 } })).newPage();
      page.setDefaultTimeout(120_000);
      await redirectFetch("https://api.marketdata.app", `${server.origin}/fixture/marketdata`)(page);
      await page.goto(`${server.origin}/deep-hedger/`);
      await page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus), null, { timeout: 180_000 });
      assert.equal(await page.evaluate(() => document.documentElement.dataset.dollyStatus), "ready", await page.locator("#bootstrap-log").textContent());
      await page.waitForFunction(() => __dolly.transport.graphicsActive());
      // Pixels of one colour in the frame, there or gone: the market's bars, the model's bid line.
      const coloured = ([r, g, b], there = true) => waitForDisplay(page, ([r, g, b, there]) => {
        const pixels = displaySnapshot.getContext("2d").getImageData(0, 0, displaySnapshot.width, displaySnapshot.height).data;
        let count = 0;
        for (let index = 0; index < pixels.length; index += 4) count += pixels[index] === r && pixels[index + 1] === g && pixels[index + 2] === b;
        return (count > 300) === there;
      }, [r, g, b, there], { timeout: 240_000 });
      // A press and a release some frames apart, as a hand does: ImGui did not take Playwright's click on a tab.
      const click = async (x, y) => {
        await page.mouse.move(...await framePoint(page, x, y));
        await delay(120);
        await page.mouse.down();
        await delay(120);
        await page.mouse.up();
      };
      await coloured([255, 255, 255]);  // dh-gui has drawn its labels
      await click(476, 18);  // Load quotes
      await coloured([205, 205, 205]);
      assert.deepEqual(requested.splice(0).map(path => path.replace(/\/$/, "")), ["/fixture/marketdata/v1/options/chain/AAPL"]);
      await click(844, 18);  // Fit
      await coloured([64, 156, 255]);
      // Stop, and Fit again: the first fit's lines go, the second's come.
      await click(844, 18);
      await delay(1000);
      await click(844, 18);
      await coloured([64, 156, 255], false);
      await coloured([64, 156, 255]);
      // A row of the Quotes tab clicked: the fit's next reports hedge that contract.
      await click(322, 57);
      await click(400, 150);
      await delay(200_000);
      // Ctrl+C, the fit running: dh-gui and its dh-fit end, and the shell is in front.
      await page.keyboard.press("Control+C");
      await page.waitForFunction(() => !__dolly.transport.graphicsActive(), null, { timeout: 30_000 });
      await page.evaluate(([source, flags]) => __dolly.waitForInteractiveTerminal(new RegExp(source, flags), "terminal prompt", 0), [shellPrompt.source, shellPrompt.flags]);
      const run = async command => {
        assert.equal(await page.evaluate(command => __dolly.submit(`clear; ${command}`), command), 0,
          `${name}: ${command}\n${await page.evaluate(() => __dolly.visibleTerminalText())}\n${await page.evaluate(() => __dolly.gpu.error ?? "")}`);
        return page.evaluate(() => __dolly.visibleTerminalText());
      };
      // What dh-gui's fit wrote in those 200 s, from a normal law and a random hedger: the
      // loss fell, most quotes came to lie in the fixture's bands, the law's forward and the
      // deviation of the batch's days are the fixture's, and the hedger hedges: what its
      // books are left with deviates clearly less than their payoffs do.
      const report = await run("awk '/^DH iteration/ { if (!first) first = $0; last = $0 } /^DH forward/ { forward[n++ % 4] = $0 } " +
        "END { print first; print last; for (i = 0; i < 4; i++) print forward[(n + i) % 4] }' /tmp/dh/fit.out");
      const reports = [...report.matchAll(/^DH iteration (\d+) loss (\S+) .* inside (\S+) .* risk (\S+) unhedged (\S+)/gm)].map(match => match.slice(1).map(Number));
      const intervals = [...report.matchAll(/^DH forward \d+ (\S+) \S+ (\S+)/gm)].map(match => match.slice(1).map(Number));
      assert.equal(reports.length, 2, report);
      assert.equal(intervals.length, 4, report);
      const [[, started], [iterations, ended, inside, risk, unhedged]] = reports;
      assert.ok(iterations >= 300, `${name}: ${iterations} iterations in 200 s`);
      assert.ok(ended < started / 5, `${name}: loss ${started} at the first report, ${ended} at the last`);
      assert.ok(inside > 0.6, `${name}: ${inside} of the quotes in the bands`);
      assert.ok(risk < 0.7 * unhedged, `${name}: risk ${risk} hedged, ${unhedged} unhedged`);
      for (const [forward, deviation] of intervals) {
        assert.ok(Math.abs(forward - 1) < 0.004, `${name}: forward ${forward}`);
        assert.ok(Math.abs(deviation / (volatility / Math.sqrt(252)) - 1) < 0.12, `${name}: a day's deviation ${deviation}`);
      }
      const shown = (await run("cat /tmp/dh/chain.txt.shown; echo; awk '/^DH residual/ { before = last; last = $3 } END { print before; print last }' /tmp/dh/fit.out"))
        .split("\n").map(line => line.trim()).filter(line => /^\d+$/.test(line));
      assert.ok(shown.length === 3 && shown[1] === shown[0] && shown[2] === shown[0], `${name}: the row clicked and the contracts hedged: ${shown}`);
      // What the Network tab draws: the hedger's 417 numbers, the law's 49 for each of the
      // fixture's four intervals and the state's three, each with Adam's two moments.
      const net = await run("awk '/^DH net/ { sizes[$3 $4] = NF - 4 } END { for (key in sizes) print \"net\", key, sizes[key] }' /tmp/dh/fit.out");
      assert.deepEqual(Object.fromEntries([...net.matchAll(/^net (\d\d) (\d+)$/gm)].map(match => [match[1], Number(match[2])])),
        { "00": 417, "01": 417, "02": 417, 10: 196, 11: 196, 12: 196, 20: 3, 21: 3, 22: 3 }, net);
      // The Picks tab's table of the backtest is a file of the image.
      const table = await run("awk 'END { print \"table rows\", NR }' /usr/share/deep-hedger/backtest.tsv");
      assert.ok(Number(/^table rows (\d+)$/m.exec(table)?.[1]) > 5, table);
      // dh-fit check: the kernels' bids and asks beside the host's own ledger on the same
      // paths, and each gradient beside its central difference, its section's largest
      // gradients to a few percent; the same for the state's three numbers.
      const checked = await run("dh-fit check /tmp/dh/chain.txt 256");
      const named = [...checked.matchAll(/^DH check state \d (\S+) (\S+)$/gm)].map(match => [Number(match[1]), Number(match[2])]);
      assert.equal(named.length, 3, checked);
      for (const [gradient, difference] of named) {
        // The state's loss has kinks a difference steps over: a twentieth of the largest besides.
        assert.ok(Math.abs(gradient - difference) <= 0.05 * Math.abs(difference) + 0.05 * Math.max(...named.map(pair => Math.abs(pair[1]))),
          `${name}: gradient ${gradient}, difference ${difference}`);
      }
      const [hedger, generator] = checked.split("DH check generator").map(section =>
        [...section.matchAll(/^DH check \d+ (\S+) (\S+)$/gm)].map(match => [Number(match[1]), Number(match[2])]));
      assert.deepEqual([hedger.length, generator.length], [7, 7], checked);
      for (const pairs of [hedger, generator]) {
        const largest = Math.max(...pairs.map(pair => Math.abs(pair[1])));
        for (const [gradient, difference] of pairs) {
          assert.ok(Math.abs(gradient - difference) <= 0.05 * Math.abs(difference) + 0.01 * largest, `${name}: gradient ${gradient}, difference ${difference}`);
        }
      }
      const ledger = [...checked.matchAll(/^DH check \d+ (\S+) (\S+) (\S+) (\S+)$/gm)].map(match => match.slice(1).map(Number));
      assert.equal(ledger.length, 3, checked);
      for (const [bid, ask, hostBid, hostAsk] of ledger) {
        assert.ok(Math.abs(bid - hostBid) < 2e-5 && Math.abs(ask - hostAsk) < 2e-5, `${name}: the kernels' ${bid} and ${ask}, the host's ${hostBid} and ${hostAsk}`);
      }
      console.log(`deep-hedger: ${name} ${browser.version()} passed on ${await page.evaluate(() => __dolly.gpu.adapter)}: ${iterations} iterations, loss ${started} to ${ended}, ` +
        `risk ${(100 * risk / unhedged).toFixed(0)}% of unhedged`);
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}
