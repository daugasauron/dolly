// The deep-hedger image on a GPU: dh-gui loads a chain through the HTTP broker
// (the service's answer is a fixture here: lognormal prices with a band), fits
// it with dh-fit's kernels on WebGPU and draws the model's bids and asks; then
// dh-fit alone: its gradients against finite differences, and a fit that ends
// at the forward and the volatility the fixture was made with, with a hedger
// that hedges.
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
      // Pixels of one colour in the frame: the market's bars, the model's bid line.
      const coloured = ([r, g, b]) => waitForDisplay(page, ([r, g, b]) => {
        const pixels = displaySnapshot.getContext("2d").getImageData(0, 0, displaySnapshot.width, displaySnapshot.height).data;
        let count = 0;
        for (let index = 0; index < pixels.length; index += 4) count += pixels[index] === r && pixels[index + 1] === g && pixels[index + 2] === b;
        return count > 300;
      }, [r, g, b], { timeout: 240_000 });
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
      await click(989, 18);  // Fit
      await coloured([64, 156, 255]);
      await page.keyboard.press("Control+C");
      await page.evaluate(([source, flags]) => __dolly.waitForInteractiveTerminal(new RegExp(source, flags), "terminal prompt", 0), [shellPrompt.source, shellPrompt.flags]);
      const run = async command => {
        assert.equal(await page.evaluate(command => __dolly.submit(`clear; ${command}`), command), 0,
          `${name}: ${command}\n${await page.evaluate(() => __dolly.visibleTerminalText())}\n${await page.evaluate(() => __dolly.gpu.error ?? "")}`);
        return page.evaluate(() => __dolly.visibleTerminalText());
      };
      // dh-fit check: the kernels' bids and asks beside the host's own ledger on the same
      // paths, and each gradient beside its central difference, its section's largest
      // gradients to a few percent.
      const checked = await run("dh-fit check /tmp/dh/chain.txt 256");
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
      // A fit from equal kernel weights and a random hedger: the loss falls, the law's
      // forward and daily deviation become the fixture's, and the hedger hedges: what its
      // books are left with deviates clearly less than their payoffs do.
      const report = await run("dh-fit /tmp/dh/chain.txt 1024 3 600 > /tmp/dh/test.out && grep 'DH iteration' /tmp/dh/test.out | head -n 1" +
        " && grep 'DH iteration' /tmp/dh/test.out | tail -n 1 && grep 'DH forward' /tmp/dh/test.out | tail -n 4");
      const reports = [...report.matchAll(/^DH iteration \d+ loss (\S+) .* risk (\S+) unhedged (\S+)/gm)].map(match => match.slice(1).map(Number));
      const intervals = [...report.matchAll(/^DH forward \d+ (\S+) (\S+)/gm)].map(match => match.slice(1).map(Number));
      assert.equal(reports.length, 2, report);
      assert.equal(intervals.length, 4, report);
      const [[started], [ended, risk, unhedged]] = reports;
      assert.ok(ended < started / 20, `${name}: loss ${started} at the first report, ${ended} at the last`);
      assert.ok(risk < 0.7 * unhedged, `${name}: risk ${risk} hedged, ${unhedged} unhedged`);
      for (const [forward, deviation] of intervals) {
        assert.ok(Math.abs(forward - 1) < 0.004, `${name}: forward ${forward}`);
        assert.ok(Math.abs(deviation / (volatility / Math.sqrt(252)) - 1) < 0.12, `${name}: a day's deviation ${deviation}`);
      }
      console.log(`deep-hedger: ${name} ${browser.version()} passed on ${await page.evaluate(() => __dolly.gpu.adapter)}: loss ${started} to ${ended}, ` +
        `risk ${(100 * risk / unhedged).toFixed(0)}% of unhedged`);
    } finally {
      await browser.close();
    }
  }
} finally {
  await server.close();
}
