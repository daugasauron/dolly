// Seven Kingdoms and the RTS arena in the rts-arena image: the launcher, the
// real game and replays, two Pi players against a scripted provider, the
// included split replay, and offscreen player input.
// Usage: node demos/rts/test/rts-browser.mjs
// DOLLY_RTS_LIVE=1 instead plays a live match between DOLLY_RTS_MODELS (two
// comma-separated OpenRouter models, key piped on stdin) or through the Codex
// relay configuration in DOLLY_RTS_MODELS_FILE, for DOLLY_RTS_SECONDS up to
// DOLLY_RTS_USD in reported cost, and exports it to build/rts-live-*.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acceptDownload, delay, demoTest, shellPrompt, shellQuote } from "../../browser.mjs";
import { rtsProvider } from "./fixtures/rts-provider.mjs";

const provider = rtsProvider();
const fixtures = Object.fromEntries(["rts-match.mjs", "rts-history.mjs", "rts-split-replay.mjs", "rts-input-probe.cpp", "rts-live.mjs"]
  .map(name => [name, `demos/rts/test/fixtures/${name}`]));
const live = process.env.DOLLY_RTS_LIVE === "1";
const relay = live && process.env.DOLLY_RTS_MODELS_FILE ? JSON.parse(await readFile(process.env.DOLLY_RTS_MODELS_FILE, "utf8")) : null;
const secret = live && !relay ? readFileSync(0, "utf8").trim() : "";
const models = (process.env.DOLLY_RTS_MODELS ?? "openai/gpt-5.6-luna:low,google/gemini-2.5-flash:low").split(",");
const seconds = Number(process.env.DOLLY_RTS_SECONDS ?? 1200), dollars = Number(process.env.DOLLY_RTS_USD ?? 0.5);
if (live && (models.length !== 2 || models.some(model => !/^[\w./:-]+$/.test(model)) || !Number.isInteger(seconds) ||
    seconds < 10 || seconds > 3600 || !(dollars > 0 && dollars <= 2) || (!relay && !/^sk-or-v1-[\w-]+$/.test(secret)))) {
  throw new Error("A live match needs two models, 10..3600 seconds, a USD limit up to 2 and a relay file or piped OpenRouter key");
}
const handle = async (request, response, path, headers) => {
  if (path !== "/fixture/rts/v1/chat/completions") return false;
  await provider.handle(request, response, headers);
  return true;
};
const scratch = await mkdtemp(join(tmpdir(), "dolly-rts-"));
try {
  await demoTest("rts", { image: "rts-arena", timeout: live ? (seconds + 600) * 1000 : 1_800_000,
    server: { fixtures, handle, port: Number(process.env.DOLLY_BROWSER_PORT ?? 0) } }, async ({ server, open }) => {
    if (live) return liveMatch(await open({ prompt: /Type to search/, policy: { maxRequests: 1024, rules: [
      { origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] },
      ...relay ? Object.values(relay.providers).map(({ baseUrl }) => ({ origin: new URL(baseUrl).origin, path: "/codex/responses",
        methods: ["POST"], credentialHeaders: ["authorization"], maxRequestBytes: 8 * 1024 * 1024, timeoutMilliseconds: 120000 })) : [
        { origin: "https://openrouter.ai", path: "/api/v1/chat/completions", methods: ["POST"], credentialHeaders: ["authorization"],
          maxRequestBytes: 2 * 1024 * 1024, maxResponseBytes: 16 * 1024 * 1024, timeoutMilliseconds: 120000 },
        { origin: "https://openrouter.ai", path: "/api/v1/models", methods: ["GET"], maxResponseBytes: 16 * 1024 * 1024 },
        { origin: "https://openrouter.ai", path: "/api/v1/key", methods: ["GET"], credentialHeaders: ["authorization"] },
      ],
    ] } }), server.origin);
    const terminal = await open({ prompt: /Type to search/, policy: { maxRequests: 256, rules: [
      { origin: server.origin, path: "/fixture/rts/v1/chat/completions", methods: ["POST"],
        credentialHeaders: ["authorization"], maxRequestBytes: 16 * 1024 * 1024 },
      { origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] },
    ] } });
    const { page, submit, run, start, prompt, text, input } = terminal;
    const requests = () => page.evaluate(() => __dolly.httpRequestCount);
    const graphics = active => page.waitForFunction(active => __dolly.graphicsActive === active, active, { timeout: 240_000 });
    const until = async (condition, label) => {
      for (const deadline = Date.now() + 60_000; !await condition(); await delay(100)) {
        assert.ok(Date.now() < deadline, label);
      }
    };

    // The launcher: menus with fuzzy search, masked key paste, model and effort
    // choices, validation, cancellation, and an imported Codex relay.
    const screen = pattern => prompt(new RegExp(pattern, "m"));
    const title = heading => screen(`^${heading}\\s*$`);
    const enter = () => page.keyboard.press("Enter");
    const escape = () => page.keyboard.press("Escape");
    const clear = () => page.keyboard.press("Control+u");
    const choose = async (heading, filter) => { await title(heading); if (filter) await input(filter); await enter(); };
    const home = () => title("DOLLY / RTS ARENA");
    await home();
    const offline = await requests();
    await enter();
    await graphics(true);
    await delay(2000);
    await escape();
    await home();
    assert.equal(await requests(), offline, "the included replay is offline");
    await choose("DOLLY / RTS ARENA", "newmatch");
    await choose("New match", "player1");
    await choose("Player 1 provider", "opnrtr");
    await title("OpenRouter API key");
    const pasted = "sk-or-v1-" + "0123456789abcdef".repeat(4);
    await page.evaluate(text => navigator.clipboard.writeText(text), `${pasted}\n`);
    await page.keyboard.press("Control+Shift+V");
    await screen("\\*{20}");
    await title("OpenRouter API key");
    assert.doesNotMatch(await text(), /sk-or-v1-|0123456789abcdef/);
    assert.equal(await requests(), offline, "paste neither submits nor calls the network");
    await enter();
    await title("Player 1 model · OpenRouter");
    await input("gem fla");
    await screen("> gem fla");
    const selected = async () => (await text()).match(/^→ .+$/m)?.[0];
    await until(selected, "no model is selected");
    const first = await selected();
    await page.keyboard.press("ArrowDown");
    await until(async () => ![undefined, first].includes(await selected()), "ArrowDown did not move the selection");
    await page.keyboard.press("ArrowUp");
    await until(async () => await selected() === first, "ArrowUp did not restore the selection");
    for (const heading of ["Player 1 provider", "New match", "DOLLY / RTS ARENA"]) { await escape(); await title(heading); }
    await choose("DOLLY / RTS ARENA", "localcodex");
    await choose("Connect local Codex");
    const models = join(scratch, "models.json");
    await writeFile(models, JSON.stringify({ providers: { "codex-local": {
      api: "openai-codex-responses", baseUrl: "http://127.0.0.1:9002", apiKey: "fixture-relay-capability",
      models: [{ id: "rts-vision-fixture", name: "Vision fixture", reasoning: true, input: ["text", "image"],
        thinkingLevelMap: { high: "high", xhigh: "xhigh", low: null }, contextWindow: 65536, maxTokens: 4096,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
    } } }));
    await page.locator("#file-upload input").setInputFiles(models);
    await home();
    await screen("Local Codex configuration imported");
    const configured = await requests();
    await choose("DOLLY / RTS ARENA", "newmatch");
    for (const player of [1, 2]) {
      await choose("New match", `player${player}`);
      await choose(`Player ${player} provider`, "cdxl");
      await title(`Player ${player} model · Local Codex`);
      if (player === 1) {
        await input("nonexistent"); await screen("No matches"); await enter(); await screen("No matches");
        await clear(); await input("rtsvsfx"); await screen("1 / 1 matches");
      }
      await enter();
      await title(`Player ${player} reasoning effort`);
      if (player === 1) {
        await input("low"); await screen("No matches"); await enter(); await screen("No matches");
        await escape(); await title("Player 1 model · Local Codex"); await enter(); await title("Player 1 reasoning effort");
      }
      await input("high");
      await screen("2 / 5 matches");
      if (player === 2) await page.keyboard.press("ArrowDown");
      await enter();
      await title("New match");
    }
    await choose("New match", "duration");
    await title("Match duration");
    await input("9"); await enter();
    await screen("Enter a whole number from 10 to 3600");
    await escape(); await title("New match");
    assert.match(await text(), /600 seconds/);
    await choose("New match", "duration");
    await title("Match duration");
    await input("10"); await enter(); await title("New match");
    await choose("New match", "spending");
    await title("Spending limit");
    await input("0"); await enter();
    await screen("Enter an amount greater than zero");
    await clear(); await input("0.25"); await enter(); await title("New match");
    const review = await text();
    for (const expected of [/rts-vision-fixture · high/, /rts-vision-fixture · xhigh/, /10 seconds/, /\$0\.25/]) assert.match(review, expected);
    await escape(); await home();
    await choose("DOLLY / RTS ARENA", "newmatch");
    await title("New match");
    assert.match(await text(), /rts-vision-fixture · xhigh/);
    await escape(); await home();
    assert.equal(await requests(), configured, "review, editing and cancellation make no model calls");
    await choose("DOLLY / RTS ARENA", "opnrtr");
    await title("OpenRouter API key");
    await input("not-a-key"); await enter();
    await screen("Paste an OpenRouter key beginning");
    await escape(); await home();
    assert.doesNotMatch(await text(), /0123456789abcdef|fixture-relay-capability/);
    await choose("DOLLY / RTS ARENA", "shell");
    await screen("(?:^|\\n)dolly:[^\\n]*\\$\\s*$");
    await run(`janis -e ${shellQuote(`const fs=__janisBuiltin('fs');` +
      `const auth=JSON.parse(fs.readFileSync(process.env.HOME+'/.pi/agent/auth.json','utf8'));` +
      `if(auth.openrouter?.key!==${JSON.stringify(pasted)})throw Error('credential mismatch');` +
      `if(fs.readdirSync('/tmp').some(name=>name.startsWith('codex-relay-import-')||name.startsWith('dolly-rts-replay-')))throw Error('scratch leak');`)}`);

    // The real game, then a two-player match recorded by both engines whose
    // upstream replays play back to EOF.
    const test = "/tmp/rts-replay-test";
    await run(`mkdir ${test} && cd /tmp && for name in ${Object.keys(fixtures).join(" ")}; do curl -fsS ${server.origin}/fixture/$name -o $name || exit 1; done`);
    await run("rts-arena --help", 64);
    let game = start("seven-kingdoms -demo -noaudio -win -rnd 12345");
    await graphics(true);
    await delay(3000);
    assert.equal(game.status, null, "the game must remain live before interruption");
    await page.keyboard.press("Control+c");
    assert.ok([0, 130].includes(await game.done), "SDL may handle interrupted event polling as a clean quit");
    const match = start(`janis -m /tmp/rts-match.mjs ${test}`);
    await graphics(true);
    await page.waitForFunction(() => { const canvas = document.querySelector("canvas"); return canvas.width === 1600 && canvas.height === 972; });
    assert.equal(await match.done, 0);
    const replayMarker = () => page.evaluate(() => {
      const pixels = document.querySelector("canvas").getContext("2d").getImageData(5, 5, 100, 50).data;
      let hash = 2166136261;
      for (const byte of pixels) hash = Math.imul(hash ^ byte, 16777619);
      return hash >>> 0;
    });
    for (const player of [1, 2]) {
      game = start(`SKCONFIG=${test}/player${player} seven-kingdoms -noaudio -win`);
      await graphics(true);
      await delay(500);
      const menu = await replayMarker();
      await page.keyboard.press("r");
      await until(async () => await replayMarker() !== menu, "the recorded match did not start");
      for (const deadline = Date.now() + 240_000; await replayMarker() !== menu; await delay(100)) {
        assert.ok(Date.now() < deadline, "the replay did not reach EOF and return to the menu");
      }
      assert.equal(game.status, null, "a finished replay returns to the game menu");
      await page.keyboard.press("Control+c");
      assert.ok([0, 130].includes(await game.done));
    }
    await run("seven-kingdoms -noaudio -win -replay", 64);
    await run("seven-kingdoms -noaudio -win -replay /tmp/absent-replay.rpl", 65);
    await run(`printf invalid > ${test}/invalid.rpl; seven-kingdoms -noaudio -win -replay ${test}/invalid.rpl`, 65);
    await run(`seven-kingdoms -noaudio -win -speed 99 -replay ${test}/player1/NONAME.RPL`);
    assert.match(await text(), /RTS replay reached EOF at game frame [1-9]\d*/);
    // A damaged replay checksum fails explicitly instead of playing divergent state.
    game = start(`SKCONFIG=${test}/corrupt seven-kingdoms -noaudio -win`);
    await graphics(true);
    await delay(500);
    await page.keyboard.press("r");
    assert.equal(await game.done, 74);
    assert.equal(await page.evaluate(() => __dolly.graphicsActive), false);
    await run(`seven-kingdoms -noaudio -win -speed 99 -replay ${test}/corrupt/NONAME.RPL`, 74);

    // Two actual Pi sessions play against the scripted provider, then Escape
    // stops both players and engines.
    const config = { providers: { openrouter: { baseUrl: `${server.origin}/fixture/rts/v1`, api: "openai-completions",
      apiKey: "rts-fixture-only", models: ["rts-test-fast", "rts-test-slow"].map(id => ({ id, name: id,
        reasoning: true, input: ["text", "image"], contextWindow: 128000, maxTokens: 4096,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } })) } } };
    await run(`mkdir /tmp/rts-pi-agent && printf %s ${shellQuote(JSON.stringify(config))} > /tmp/rts-pi-agent/models.json`);
    const players = "PI_CODING_AGENT_DIR=/tmp/rts-pi-agent rts-arena rts-test-fast rts-test-slow 25";
    game = start(players);
    await graphics(true);
    assert.equal(await game.done, 0);
    provider.verify();
    await run("janis -m /tmp/rts-history.mjs");
    game = start(players);
    await graphics(true);
    await delay(8000);
    assert.equal(game.status, null);
    await page.keyboard.press("Escape");
    assert.equal(await game.done, 0);
    assert.equal(await page.evaluate(() => __dolly.graphicsActive), false);
    await run("janis -m /tmp/rts-history.mjs 'Viewer exited (0)'");

    // The included match replays split-screen with pause, speed and EOF, offline.
    const offlineReplay = await requests();
    const replay = start("janis -m /tmp/rts-split-replay.mjs /usr/share/dolly/rts/rts-high-vs-xhigh");
    const phase = name => page.waitForFunction(name => document.documentElement.dataset.downloadName === `replay-${name}`,
      name, { timeout: 240_000 });
    await phase("ready");
    await page.keyboard.press(" ");
    await phase("paused");
    await page.keyboard.press(" ");
    for (let step = 0; step < 6; step++) { await page.keyboard.press("="); await delay(200); }
    await phase("eof");
    await escape();
    assert.equal(await replay.done, 0);
    assert.equal(await requests(), offlineReplay, "replay makes no network requests");
    game = start("rts-arena --replay /usr/share/dolly/rts/rts-high-vs-xhigh");
    await graphics(true);
    await delay(1500);
    await page.keyboard.press("Control+c");
    assert.equal(await game.done, 130);
    assert.equal(await page.evaluate(() => __dolly.graphicsActive), false);

    // Offscreen player input is ordered and never acquires the browser display.
    await run("mkdir -p /tmp/dolly-sdl2/player && c++ -O0 -I/usr/include/SDL2 -I/usr/src/dolly/rts /usr/src/dolly/rts/input.cpp /tmp/rts-input-probe.cpp -o /tmp/rts-input-probe -lSDL2 -lz -lm && /tmp/rts-input-probe");
    assert.equal(await page.evaluate(() => __dolly.graphicsActive), false);
    await run(`rm -rf ${test} /tmp/rts-pi-agent /tmp/dolly-sdl2 /tmp/rts-input-probe ${Object.keys(fixtures).map(name => `/tmp/${name}`).join(" ")}`);
  });
} finally {
  await rm(scratch, { recursive: true, force: true });
}

// A live match: both models must act and keep histories; the export is
// reassembled from bounded downloads and must not contain the credential.
async function liveMatch({ page, run, start, text, submit, prompt }, origin) {
  await page.keyboard.press("Escape");
  await prompt(shellPrompt);
  await run(`mkdir /tmp/rts-live-agent && curl -fsS ${origin}/fixture/rts-live.mjs -o /tmp/rts-live.mjs`);
  assert.equal(await submit(`printf %s ${shellQuote(JSON.stringify(relay ? {} : { openrouter: { type: "api_key", key: secret } }))} > /tmp/rts-live-agent/auth.json`), 0);
  if (relay) await run(`printf %s ${shellQuote(JSON.stringify(relay))} > /tmp/rts-live-agent/models.json && printf %s '{"transport":"sse"}' > /tmp/rts-live-agent/settings.json`);
  else await run(`janis -m /tmp/rts-live.mjs prepare ${models.map(model => shellQuote(model.replace(/:[a-z]+$/, ""))).join(" ")}`);
  await run("clear");
  const match = start(`PI_CODING_AGENT_DIR=/tmp/rts-live-agent rts-arena ${models.map(shellQuote).join(" ")} ${seconds} ${dollars}`);
  for (let elapsed = 0; match.status === null && elapsed < seconds + 90; elapsed += 10) {
    await delay(10_000);
    console.log(`rts: live match ${elapsed + 10}s, ${await page.evaluate(() => __dolly.httpRequestCount)} HTTP requests`);
  }
  assert.notEqual(match.status, null, "the live match must stop at its time limit");
  const inspected = await submit("janis -m /tmp/rts-live.mjs inspect");
  const secrets = relay ? Object.values(relay.providers).map(provider => provider.apiKey) : [secret];
  const report = await text();
  assert.ok(secrets.every(value => value && !report.includes(value)), "the credential reached the terminal");
  console.log(report);
  const download = async name =>
    readFile(await (await acceptDownload(page, () => run(`download /tmp/rts-live-export/${name}`))).path());
  const archive = Buffer.concat(await JSON.parse(await download("parts.json")).reduce(async (chunks, name) =>
    [...await chunks, await download(name)], []));
  assert.ok(secrets.every(value => !archive.includes(Buffer.from(value))), "the credential reached the match archive");
  await writeFile("build/rts-live-match.json", archive);
  // Reassembly must preserve UTF-8 across chunk boundaries.
  const { files } = JSON.parse(archive);
  const matches = new Set(Object.keys(files).map(name => name.split("/")[0]));
  assert.equal(matches.size, 1, "the archive must contain exactly one match");
  for (const player of [1, 2]) {
    const replay = await download(`player${player}.rpl`);
    assert.equal(replay.subarray(0, 4).toString(), "7KRP");
    assert.deepEqual(replay, Buffer.from(files[`${[...matches][0]}/player${player}-game/NONAME.RPL`], "base64"));
    await writeFile(`build/rts-live-player${player}.rpl`, replay);
  }
  assert.equal(inspected, 0, "both live models must act and retain histories");
  assert.equal(match.status, 0, "the live arena must exit cleanly");
}
