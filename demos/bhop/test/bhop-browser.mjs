// Airtime in the bhop image: the agent overlay against a scripted OpenRouter
// provider, then the game's own checks, mouse capture, jumps, sections, a
// played landing and recovery. Usage: node demos/bhop/test/bhop-browser.mjs
// DOLLY_BHOP_MODELS_FILE=models.json runs the agent against a live Codex relay instead.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { delay, demoTest, leaveGame, redirectFetch } from "../../browser.mjs";
import { relayProvider } from "../../rts/spectator/relay.mjs";
import { runBhopAgentProof } from "./fixtures/bhop-agent-browser.mjs";
import { bhopProvider } from "./fixtures/bhop-provider.mjs";

const projectDir = new URL("../../..", import.meta.url).pathname;
const modelsFile = process.env.DOLLY_BHOP_MODELS_FILE;
const relay = modelsFile && relayProvider(JSON.parse(await readFile(modelsFile, "utf8")));
const fixture = modelsFile ? null : bhopProvider();
const handle = async (request, response, path, headers) => {
  if (!fixture || !path.startsWith("/fixture/bhop/api/v1/")) return false;
  await fixture.handle(request, response, headers);
  return true;
};
const downloads = await mkdtemp(join(tmpdir(), "dolly-bhop-"));
try {
  await demoTest("bhop", { image: "bhop", timeout: 1_200_000, server: { handle } }, async ({ server, open }) => {
    const policy = { maxRequests: 1024, rules: [
      { origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] },
      ...fixture ? [
        { origin: "https://openrouter.ai", path: "/api/v1/models", methods: ["GET"], maxResponseBytes: 16 * 1024 * 1024 },
        { origin: "https://openrouter.ai", path: "/api/v1/key", methods: ["GET"], credentialHeaders: ["authorization"] },
        { origin: "https://openrouter.ai", path: "/api/v1/chat/completions", methods: ["POST"],
          credentialHeaders: ["authorization"], timeoutMilliseconds: 120000 },
      ] : [{ origin: new URL(relay.baseUrl).origin, path: "/codex/responses", methods: ["POST"],
        credentialHeaders: ["authorization"], maxRequestBytes: 8 * 1024 * 1024, timeoutMilliseconds: 120000 }],
    ] };
    const agent = await open({ policy, prompt: null, setup: redirectFetch("https://openrouter.ai", `${server.origin}/fixture/bhop`) });
    await runBhopAgentProof({ page: agent.page, projectDir, fixture, modelsFile, downloadDirectory: downloads });
    fixture?.verify();
    await agent.page.close();
    if (!fixture) return;

    const terminal = await open({ policy, prompt: null });
    const { page, run, start, text } = terminal;
    await leaveGame(terminal);
    await run("make -f /usr/src/dolly/bhop/bhop.mk check");
    for (const [args, status] of [["--frames 12", 0], ["--frames 0", 2], ["--frames -1", 2]]) await run(`bhop ${args}`, status);

    const box = await page.locator("#display").boundingBox();
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const capture = async () => {
      await page.waitForFunction(() => __dolly.transport.relativePointerRequested());
      await page.mouse.click(center.x, center.y);
      await page.waitForFunction(() => document.pointerLockElement?.id === "display");
      const frame = await page.evaluate(() => Number(document.documentElement.dataset.frameSequence));
      // The game consumes the capture before held movement keys.
      await page.waitForFunction(frame => Number(document.documentElement.dataset.frameSequence) >= frame + 2, frame);
    };
    const released = () => page.waitForFunction(() => document.pointerLockElement === null);
    let game = start("bhop");
    await page.waitForFunction(() => __dolly.graphicsActive);
    await delay(200);
    assert.equal(await page.evaluate(() => document.pointerLockElement), null, "a Wasm request must not capture input");
    await page.evaluate(() => document.querySelector("#display").dispatchEvent(new PointerEvent("pointerdown", { button: 0 })));
    assert.equal(await page.evaluate(() => document.pointerLockElement), null, "synthetic input must not grant capture");
    await capture();
    await page.evaluate(() => {
      const { transport } = __dolly, original = transport.pushPointerMotion;
      globalThis.bhopMotion = [];
      transport.pushPointerMotion = function (event) {
        bhopMotion.push([event.movementX, event.movementY, event.buttons]);
        return original.call(this, event);
      };
      globalThis.restoreMotion = () => { transport.pushPointerMotion = original; };
    });
    await page.mouse.move(center.x + 80, center.y + 35);
    await page.mouse.move(center.x, center.y);
    await page.waitForFunction(() => bhopMotion.length >= 2);
    const motion = await page.evaluate(() => { restoreMotion(); return bhopMotion; });
    assert.ok(motion.some(([x, y, buttons]) => (x || y) && buttons === 0), "relative motion without a held button");
    assert.ok(motion.some(([x]) => x < 0), "relative motion keeps negative deltas");
    await page.keyboard.down("Space");
    await delay(900);
    await page.keyboard.up("Space");
    for (const deltaY of [-100, 100]) {
      await page.mouse.wheel(0, deltaY);
      await delay(900);
    }
    const floor = await page.evaluate(() => {
      const canvas = document.querySelector("#display");
      const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;
      for (let y = Math.ceil(canvas.height * 0.55); y < canvas.height * 0.8; y++) for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        if (pixels[i] > 150 && pixels[i + 1] > 150 && pixels[i + 2] > 150) count++;
      }
      return count / (canvas.width * canvas.height);
    });
    assert.ok(floor > 0.08, `the starting platform disappeared after camera motion: ${floor}`);
    await page.keyboard.press("Escape");
    await released();
    assert.equal(game.status, null, "Escape pauses rather than ends the game");
    // Chrome imposes a short recapture cooldown after Escape.
    await delay(1300);
    assert.equal(await page.evaluate(() => document.pointerLockElement), null, "the game must not recapture without a click");
    await capture();
    await page.keyboard.press("q");
    assert.equal(await game.done, 0);
    await released();
    assert.match(await text(), /bhop: ticks=\d+ jumps=3 falls=0 pad=0/, "Space and each wheel direction jump once");

    await run("echo BHOP-SURVIVED > bhop-survived.txt");
    game = start("bhop");
    await page.waitForFunction(() => __dolly.graphicsActive);
    await capture();
    for (const section of [2, 3, 4]) { await page.keyboard.press(`Digit${section}`); await delay(400); }
    await page.keyboard.press("Control+c");
    assert.equal(await game.done, 130);
    await released();
    await run("grep -q BHOP-SURVIVED bhop-survived.txt");
    await run("test ! -f /workspace/bhop-foundry-record.txt");

    let landing;
    for (const launch of [1450, 1350, 1550]) {
      game = start("bhop");
      await page.waitForFunction(() => __dolly.graphicsActive);
      await capture();
      await page.keyboard.down("w");
      await delay(launch);
      await page.keyboard.press("Space");
      await delay(650);
      await page.keyboard.up("w");
      await delay(1000);
      await page.keyboard.press("q");
      assert.equal(await game.done, 0);
      landing = [...(await text()).matchAll(/bhop: ticks=(\d+) jumps=(\d+) falls=(\d+) pad=(\d+) peak=([\d.]+) speed=([\d.]+) collapses=(\d+)/g)].at(-1);
      if (landing && Number(landing[2]) >= 1 && Number(landing[4]) >= 1 && Number(landing[7]) >= 1) break;
    }
    assert.ok(landing && Number(landing[2]) >= 1 && Number(landing[4]) >= 1 && Number(landing[7]) >= 1,
      `real keyboard play must land on a small pad and collapse it: ${landing?.[0]}`);
  });
} finally {
  await rm(downloads, { recursive: true, force: true });
}
