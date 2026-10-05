import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { startBrowserServer } from "../../../test/browser-server.mjs";
import { acceptDownload } from "../../browser.mjs";
import { engineFixture } from "./fixtures/image-file.mjs";

const output = new URL("../../../.cache/0ad/browser/", import.meta.url);
await mkdir(output, { recursive: true });
const server = await startBrowserServer(new URL("../../../", import.meta.url).pathname,
  "zero-ad-engine", { fixtures: {
    "pyrogenesis.wasm": await engineFixture(),
    "0ad-data.tar": "build/0ad/headless-data.tar",
  } });
let browser, deadline, page;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--enable-unsafe-webgpu"] });
  deadline = setTimeout(() => void browser.close(), 180000);
  page = await browser.newPage();
  page.on("pageerror", error => console.error(error.message));
  await page.addInitScript(origin => {
    globalThis.DOLLY_HTTP_POLICY = { maxRequests: 2,
      rules: [{ origin, pathPrefix: "/fixture/", methods: ["GET"] }] };
  }, server.origin);
  await page.goto(`${server.origin}/zero-ad-engine/`);
  await page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus));
  assert.equal(await page.evaluate(() => document.documentElement.dataset.dollyStatus), "ready",
    await page.locator("#bootstrap-log").textContent());
  await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "shell"));
  const submit = command => page.evaluate(text => __dolly.submit(text), command);
  const download = async (path, name) => {
    const running = submit(`download ${path}`);
    const event = acceptDownload(page, () => running);
    const file = await event;
    const destination = new URL(name, output);
    await file.saveAs(destination.pathname);
    assert.equal(await running, 0);
    return readFile(destination, "utf8");
  };
  assert.equal(await submit("mkdir -p /opt/0ad/system"), 0);
  assert.equal(await submit(`curl -fsS ${server.origin}/fixture/pyrogenesis.wasm -o /opt/0ad/system/pyrogenesis`), 0);
  assert.equal(await submit(`curl -fsS ${server.origin}/fixture/0ad-data.tar -o /tmp/0ad-data.tar && tar -xf /tmp/0ad-data.tar -C /opt/0ad && rm /tmp/0ad-data.tar`), 0);
  const engine = "ICU_DATA=/opt/0ad/data/icu /opt/0ad/system/pyrogenesis -quickstart -writableRoot";
  assert.equal(await submit(`${engine} -version`), 0);
  const started = performance.now();
  await page.evaluate(command => {
    globalThis.gameStatus = null;
    void __dolly.submit(command).then(status => { globalThis.gameStatus = status; });
  }, `${engine} -mod=public -autostart=scenarios/combat_demo -autostart-nonvisual -nosound`);
  let observed = "";
  for (let poll = 0; poll < 300; poll++) {
    observed = await page.evaluate(() => __dolly.visibleTerminalText());
    if (/Turn (?:[2-9][0-9]|[1-9][0-9]{2,}) /.test(observed)) break;
    if (await page.evaluate(() => globalThis.gameStatus !== null)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.match(observed, /Turn (?:[2-9][0-9]|[1-9][0-9]{2,}) /);
  console.log(`Combat demo reached 20 turns in ${Math.round(performance.now() - started)} ms`);
  await page.keyboard.press("Control+c");
  await page.waitForFunction(() => globalThis.gameStatus !== null, null, { timeout: 5000 });
  assert.equal(await page.evaluate(() => globalThis.gameStatus), 130);
  const warnings = await download("/opt/0ad/logs/interestinglog.html", "scenario.html");
  assert.doesNotMatch(warnings, /class="error"/);
  assert.equal(await submit("sed '/^turn 20 /,$d' \"$(find /opt/0ad/data/replays -name commands.txt | head -n1)\" > /tmp/replay-20.txt"), 0);
  const replay = await download("/tmp/replay-20.txt", "commands.txt");
  assert.match(replay, /^start /);
  assert.equal((replay.match(/^end$/gm) ?? []).length, 20);
  const hashes = [];
  for (let run = 0; run < 2; run++) {
    const time = performance.now();
    assert.equal(await submit(`${engine} -replay=/tmp/replay-20.txt ${run ? "" : "-serializationtest"} > /tmp/replay.log 2>&1`), 0);
    const log = await download("/tmp/replay.log", `replay-${run + 1}.log`);
    assert.doesNotMatch(log, /ERROR:|Mismatch|mismatch/);
    const hash = log.match(/# Final state: ([0-9a-f]+)/i)?.[1];
    assert.ok(hash, log);
    hashes.push(hash);
    console.log(`Replay ${run + 1}: ${Math.round(performance.now() - time)} ms, state ${hash}`);
  }
  assert.equal(hashes[0], hashes[1]);
  const quote = text => "'" + text.replaceAll("'", "'\\''") + "'";
  const control = async (requests, {pipes = false, map = "scenarios/combat_demo", options = "", label = pipes ? "pipes" : "files"} = {}) => {
    assert.equal(await submit("printf '%s\\n' " + requests.map(value => quote(JSON.stringify(value))).join(" ") + " > /tmp/control.jsonl"), 0);
    const command = `${engine} -mod=public -autostart=${map} ${options} -autostart-nonvisual -nosound -dolly-control`;
    assert.equal(await submit(pipes
      ? `cat /tmp/control.jsonl | ${command} 2> /tmp/control.log | cat > /tmp/control-output.jsonl`
      : `${command} < /tmp/control.jsonl > /tmp/control-output.jsonl 2> /tmp/control.log`), 0);
    assert.doesNotMatch(await download("/tmp/control.log", `control-${label}.log`), /ERROR:|Assertion failed/);
    const text = await download("/tmp/control-output.jsonl", `control-${label}.jsonl`);
    const replies = text.trim().split("\n").map(line => JSON.parse(line));
    assert.deepEqual(replies.map(reply => reply.id), requests.map(request => request.id));
    return replies;
  };
  const responses = await control([
    {id: 1, op: "observe"}, {id: 2, op: "hash"}, {id: 3, op: "save", name: "baseline"},
    {id: 4, op: "step", turns: 5}, {id: 5, op: "hash"}, {id: 6, op: "load", name: "baseline"},
    {id: 7, op: "hash"}, {id: 8, op: "invalid"}, {id: 9, op: "step", turns: 0},
    {id: 10, op: "observe"}, {id: 11, op: "quit"},
  ]);
  assert.deepEqual(responses.map(reply => reply.ok), [true, true, true, true, true, true, true, false, false, true, true]);
  assert.notEqual(responses[1].result, responses[4].result);
  assert.equal(responses[1].result, responses[6].result, "save/load restores the exact simulation state");
  const units = Object.values(responses[0].result.entities);
  const unit = units.find(entity => entity.owner === 1 && entity.unitAIState && entity.position);
  assert.ok(unit, "the scenario exposes a real player unit");
  const movement = await control([
    {id: 1, op: "load", name: "baseline"}, {id: 2, op: "hash"},
    {id: 3, op: "step", turns: 10, commands: [{player: 1, command: {
      type: "walk", entities: [unit.id], x: unit.position[0] - 20, z: unit.position[1], queued: false,
    }}]},
    {id: 4, op: "reset", attributes: JSON.parse(replay.split("\n")[0].slice(6))},
    {id: 5, op: "hash"},
  ], {pipes: true});
  assert.ok(movement.every(reply => reply.ok));
  assert.equal(movement[1].result, responses[1].result, "a fresh process loads the kernel-owned save");
  assert.equal(movement[3].result.timeElapsed, 0, "reset starts a new simulation");
  assert.equal(movement[4].result, responses[1].result, "reset restores the initial map state");
  const moved = movement[2].result.entities[unit.id];
  assert.ok(Math.hypot(moved.position[0] - unit.position[0], moved.position[1] - unit.position[1]) > 1,
    "a command received over a guest pipe moves the unit in the real simulation");
  console.log(`Control protocol: ${units.length} entities, save/load hash ${responses[1].result}, unit ${unit.id} moved`);
  const economyOptions = {map: "skirmishes/temperate_roadway_2p",
    options: "-autostart-civ=1:athen -autostart-civ=2:athen -autostart-ai=2:petra -autostart-aidiff=2:1",
    label: "economy"};
  const initial = await control([{id: 1, op: "hash"}, {id: 2, op: "observe"},
    {id: 3, op: "hash"}], economyOptions);
  assert.ok(initial.every(reply => reply.ok));
  assert.equal(initial[0].result, initial[2].result, "observation preserves simulation and AI state");
  const entities = Object.values(initial[1].result.entities);
  const center = entities.find(entity => entity.owner === 1 && entity.template === "structures/athen/civil_centre");
  const citizens = entities.filter(entity => entity.owner === 1 && entity.template.startsWith("units/athen/support_civilian"));
  const soldiers = entities.filter(entity => entity.owner === 1 && entity.template.startsWith("units/athen/infantry_spearman"));
  assert.ok(center && citizens.length && soldiers.length);
  const tree = entities.filter(entity => entity.template.startsWith("gaia/tree/")).sort((a, b) =>
    Math.hypot(a.position[0] - center.position[0], a.position[1] - center.position[1]) -
    Math.hypot(b.position[0] - center.position[0], b.position[1] - center.position[1]))[0];
  assert.ok(tree);
  const economyStarted = performance.now();
  const economy = await control([
    {id: 1, op: "step", turns: 300, commands: [
      {player: 1, command: {type: "construct", entities: citizens.map(entity => entity.id),
        template: "structures/athen/house", x: 580, z: 510, angle: 0, autorepair: true, autocontinue: false, queued: false}},
      {player: 1, command: {type: "train", entities: [center.id], template: "units/athen/support_civilian",
        count: 2, metadata: {}, pushFront: false}},
      {player: 1, command: {type: "gather", entities: soldiers.map(entity => entity.id), target: tree.id, queued: false}},
    ]},
    {id: 2, op: "hash"}, {id: 3, op: "observe"}, {id: 4, op: "hash"},
    {id: 5, op: "save", name: "economy"}, {id: 6, op: "step", turns: 61}, {id: 7, op: "hash"},
    {id: 8, op: "step", turns: 39}, {id: 9, op: "hash"},
    {id: 10, op: "load", name: "economy"}, {id: 11, op: "hash"},
    {id: 12, op: "step", turns: 61}, {id: 13, op: "hash"},
    {id: 14, op: "step", turns: 39}, {id: 15, op: "hash"},
  ], economyOptions);
  assert.ok(economy.every(reply => reply.ok));
  assert.equal(economy[1].result, economy[3].result, "observing active AI does not consume its pending events");
  assert.equal(economy[1].result, economy[10].result, "save/load restores the economy and serialized Petra state");
  const built = economy[0].result;
  assert.ok(Object.values(built.entities).some(entity => entity.owner === 1 && entity.template === "structures/athen/house"));
  assert.equal(built.players[1].popCount, initial[1].result.players[1].popCount + 2);
  assert.equal(built.players[1].popLimit, initial[1].result.players[1].popLimit + 10);
  assert.ok(built.players[1].resourceCounts.wood > 200, "soldiers gather wood after paying for the house");
  assert.ok(built.players[2].popCount > initial[1].result.players[2].popCount, "Petra trains its own units");
  assert.equal(economy[12].result, economy[6].result,
    "restored Petra retains foundation builders in pending construction events");
  assert.equal(economy[13].result.timeElapsed, 80000, "restored AI game resumes for 100 turns");
  assert.equal(economy[14].result, economy[8].result, "restored Petra follows the uninterrupted simulation for 100 turns");
  const restored = await control([{id: 1, op: "load", name: "economy"}, {id: 2, op: "hash"},
    {id: 3, op: "step", turns: 61}, {id: 4, op: "hash"},
    {id: 5, op: "step", turns: 39}, {id: 6, op: "hash"}], {...economyOptions, label: "economy-restored"});
  assert.ok(restored.every(reply => reply.ok));
  assert.equal(restored[1].result, economy[1].result, "a fresh engine loads the economy save");
  assert.equal(restored[3].result, economy[6].result, "a fresh engine preserves pending AI events");
  assert.equal(restored[5].result, economy[8].result, "a fresh engine follows the uninterrupted AI continuation");
  console.log(`Economy: house, training, gathering, Petra and fresh-process save/load passed in ${Math.round(performance.now() - economyStarted)} ms`);
  assert.equal(await submit("printf 'shell survived\\n' > /tmp/0ad-result && test -s /tmp/0ad-result"), 0);
  console.log("0 A.D. browser simulation, replay, control, save/load, pipes and interruption checks passed");
} catch (error) {
  if (page && !page.isClosed()) {
    console.error(await page.locator("#bootstrap-log").textContent().catch(() => ""));
    console.error(await page.evaluate(() => __dolly.visibleTerminalText()).catch(() => ""));
  }
  throw error;
} finally {
  clearTimeout(deadline);
  await browser?.close();
  await server.close();
}
