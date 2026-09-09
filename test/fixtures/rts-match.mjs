// Runs under Janis in the browser, using the real source-built game engines.
import { connectPlayer } from "/usr/src/dolly/rts/player.js";
const fs = globalThis.__janisBuiltin("fs");
const { spawn, spawnSync } = globalThis.__janisBuiltin("child_process");
function assert(value, message = "RTS assertion failed") { if (!value) throw Error(message); }
function equal(actual, expected, message) { assert(actual === expected, `${message ?? "Values differ"}: ${actual} !== ${expected}`); }
const scratch = fs.mkdtempSync("/tmp/dolly-rts-match-test-");
const replayRoot = process.argv[2];
const engines = [], closed = [];
let viewer, viewerClosed;
let failed, completed = false, replayCommands;
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const view = directory => {
  const path = `${directory}/view.rgba`;
  if (!fs.existsSync(path)) return { frame: 0 };
  const fd = fs.openSync(path, "r");
  try {
    const bytes = Buffer.alloc(16);
    equal(fs.readSync(fd, bytes, 0, 16, 0), 16);
    equal(bytes.readUInt32LE(8), 800);
    equal(bytes.readUInt32LE(12), 600);
    return { frame: bytes.readUInt32LE(0), milliseconds: bytes.readUInt32LE(4) };
  } finally { fs.closeSync(fd); }
};
async function until(test, description, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (!test()) {
    if (failed) throw failed;
    if (Date.now() >= deadline) throw Error(`RTS test timed out: ${description}`);
    await wait(50);
  }
}
try {
  assert(replayRoot === "/tmp/rts-replay-test", "test requires its owned replay output directory");
  fs.writeFileSync(`${scratch}/layout.cpp`, `#include <OGF_REC.h>
    #include <OREMOTE.h>
    #include <cstdio>
    int main() { printf("%zu %u %u %u %u\\n", sizeof(ConfigGF), MSG_QUEUE_HEADER, MSG_QUEUE_TRAILER, MSG_TOWN_RECRUIT, MSG_COMPARE_CRC); }`);
  const compilation = spawnSync("c++", ["-std=c++11", "-I/usr/src/dolly/rts", "-I/usr/src/7kaa/include",
    "-I/usr/include/SDL2", "-include", "/usr/src/dolly/rts/config.h", `${scratch}/layout.cpp`, "-o", `${scratch}/layout`],
    { encoding: "utf8" });
  equal(compilation.status, 0, compilation.stderr);
  const layout = spawnSync(`${scratch}/layout`, [], { encoding: "utf8" });
  equal(layout.status, 0, layout.stderr);
  const [configSize, queueHeader, queueTrailer, recruitId, crcId] = layout.stdout.trim().split(" ").map(Number);
  replayCommands = bytes => {
    equal(bytes.subarray(0, 4).toString(), "7KRP");
    equal(bytes.readUInt32LE(4), 1, "replay format version");
    let offset = 36 + configSize;
    equal(bytes.readUInt16LE(offset), 2, "replay player count");
    offset += 2 + 2 * (6 + 21);
    const commands = [], checksums = [];
    while (offset < bytes.length) {
      const end = offset + 2 + bytes.readUInt16LE(offset);
      offset += 2;
      assert(end <= bytes.length, "truncated replay queue");
      let frame, nation;
      while (offset < end) {
        const length = bytes.readUInt16LE(offset), id = bytes.readUInt32LE(offset + 2);
        assert(length >= 4 && offset + 2 + length <= end, "invalid replay message");
        if (id === queueHeader) { frame = bytes.readUInt32LE(offset + 6); nation = bytes.readUInt16LE(offset + 10); }
        else if (id === queueTrailer) nation = undefined;
        else if (id === recruitId) commands.push({ frame, nation, town: bytes.readUInt16LE(offset + 6) });
        else if (id === crcId) checksums.push(offset + 6);
        offset += 2 + length;
      }
    }
    return { commands, checksums };
  };
  for (const index of [1, 2]) {
    const directory = `${scratch}/player${index}`;
    fs.mkdirSync(directory);
    const engine = spawn("seven-kingdoms", ["-noaudio", "-win", "-rnd", "12345"], {
      env: { ...process.env, DOLLY_RTS_PLAYER: String(index), DOLLY_RTS_PLAYER_DIR: directory },
      stdio: ["pipe", "pipe", "pipe"],
    });
    engine.on("error", error => { failed = error; });
    engine.stdin.on("error", error => { failed = error; });
    engine.stderr.setEncoding("utf8");
    engine.stderr.on("data", text => {
      process.stderr.write(`player${index}: ${text}`);
      if (/out of sync|random seed.*mismatch|RTS: local multiplayer connection failed/i.test(text)) failed = Error(text);
    });
    closed.push(new Promise(resolve => engine.once("close", (status, signal) => {
      engine.result = { status, signal };
      if (!engine.stopping) failed = Error(`Player ${index} exited: ${status}/${signal}`);
      resolve();
    })));
    engine.directory = directory;
    engines.push(engine);
  }
  for (const [source, target] of [[engines[0], engines[1]], [engines[1], engines[0]]]) {
    source.stdout.on("data", bytes => { if (!source.stopping && !target.stdin.write(bytes)) source.stdout.pause(); });
    target.stdin.on("drain", () => source.stdout.resume());
  }
  await until(() => engines.every(engine => view(engine.directory).frame >= 5), "two live synchronized players");
  const inputs = engines.map(engine => connectPlayer(fs, engine.directory));
  const [first, second] = await Promise.all(inputs.map(input => input([])));
  assert(Buffer.from(first.png).toString("base64") !== Buffer.from(second.png).toString("base64"),
    "Players must have different own-fog UI views");
  // Move between two static panel regions: the rendered cursor must leave its
  // old position, appear at the new one, and return without a click.
  const cursorRegions = [];
  for (const x of [650, 750, 650]) {
    const screenshot = await inputs[0]([{ type: "move", x, y: 560, milliseconds: 100 }]);
    equal(screenshot.pointer.x, x, "screenshot reports the actual pointer x");
    equal(screenshot.pointer.y, 560, "screenshot reports the actual pointer y");
    const pixels = fs.readFileSync(`${engines[0].directory}/view.rgba`);
    cursorRegions.push([650, 750].map(center => Buffer.concat(Array.from({ length: 48 }, (_, row) => {
      const start = 16 + ((536 + row) * 800 + center - 24) * 4;
      return pixels.subarray(start, start + 48 * 4);
    })).toString("base64")));
  }
  for (const region of [0, 1]) {
    assert(cursorRegions[0][region] !== cursorRegions[1][region], "move-only input must relocate the visible cursor");
    equal(cursorRegions[0][region], cursorRegions[2][region], "returning the cursor must restore the same panel pixels");
  }
  // Exercise the real menu/shortcut paths, not an input-broker blacklist.
  // The quit buttons would enter a blocking confirmation in the unguarded game.
  const lifecycleInputs = [
    ["mouse menu/quit", [{ type: "click", x: 755, y: 25, button: "left" },
      { type: "click", x: 285, y: 407, button: "left" }]],
    ["keyboard menu/quit", [{ type: "key", key: "F10" },
      { type: "click", x: 285, y: 441, button: "left" }]],
    ...["O", "S", "L", "F11", "Space", "0", "1", "9", "P"].map(key =>
      [key, [{ type: "key", key }]]),
  ];
  for (const [label, actions] of lifecycleInputs) {
    await inputs[0](actions);
    const before = engines.map(engine => view(engine.directory));
    await inputs[0]([{ type: "wait", milliseconds: 1000 }]);
    await until(() => engines.every((engine, index) => view(engine.directory).frame >= before[index].frame + 10),
      `${label} must not stall either player`, 5000).catch(error => {
        throw Error(`${error.message}; views: ${JSON.stringify({ before, after: engines.map(engine => view(engine.directory)) })}`);
      });
    for (const [index, engine] of engines.entries()) {
      const after = view(engine.directory);
      const frames = after.frame - before[index].frame, elapsed = after.milliseconds - before[index].milliseconds;
      assert(frames >= Math.floor(elapsed * 0.010) - 2 && frames <= Math.ceil(elapsed * 0.025) + 2,
        `${label} must preserve simulation speed: ${frames} frames in ${elapsed} ms`);
    }
  }
  await inputs[0]([{ type: "key", key: "P" }, { type: "key", key: "Escape" }]);
  assert(engines.every(engine => !fs.readdirSync(engine.directory).some(name => /\.(SVM|SAV|BMP)$/i.test(name))),
    "Player shortcuts must not create saves or screenshots");
  console.log("RTS-LIFECYCLE-OK: menu, options, saves, screenshots and pause/speed keys cannot interrupt the match");
  await inputs[0]([{ type: "click", x: 330, y: 350, button: "left" }, { type: "key", key: "R" }]);
  // Compare the same dialog opened by keyboard and by click-then-move. Moving
  // before the button consumes its release used to cancel the click entirely.
  const panel = () => {
    const pixels = fs.readFileSync(`${engines[0].directory}/view.rgba`);
    return Buffer.concat(Array.from({ length: 120 }, (_, row) => {
      const start = 16 + ((320 + row) * 800 + 590) * 4;
      return pixels.subarray(start, start + 140 * 4);
    })).toString("base64");
  };
  const moveAway = { type: "move", x: 750, y: 560, milliseconds: 100 };
  const closeTraining = { type: "click", x: 550, y: 560, button: "right" };
  for (let attempt = 1; attempt <= 20; attempt++) {
    const trainingView = await inputs[0]([{ type: "key", key: "B" }, moveAway]);
    const trainingPanel = panel();
    await inputs[0]([closeTraining]);
    assert(panel() !== trainingPanel, "training dialog must close on right-click");
    const clickedView = await inputs[0]([{ type: "click", x: 658, y: 490, button: "left" }, moveAway]);
    if (panel() !== trainingPanel) {
      fs.writeFileSync(`${replayRoot}/training-key.png`, trainingView.png);
      fs.writeFileSync(`${replayRoot}/training-click.png`, clickedView.png);
      throw Error(`click-then-move mismatch on attempt ${attempt}; key frame=${trainingView.frame} ms=${trainingView.milliseconds}, click frame=${clickedView.frame} ms=${clickedView.milliseconds}; live=${JSON.stringify(view(engines[0].directory))}`);
    }
    await inputs[0]([closeTraining]);
  }
  console.log("RTS-RELEASE-ORDER-OK: click release is consumed before the next pointer move and screenshot");
  for (const index of [1, 2]) fs.writeFileSync(`${scratch}/player${index}.txt`,
    "Browser integration test: real game engines; no model or provider is running.\nPlayer 1: select the town and recruit with R. Player 2: no input.\n");
  viewer = spawn("rts-viewer", [scratch, scratch, "fixture 1", "fixture 2"], { stdio: ["ignore", "inherit", "inherit"] });
  viewer.on("error", error => { failed = error; });
  viewerClosed = new Promise(resolve => viewer.once("close", resolve));
  const before = engines.map(engine => view(engine.directory).frame);
  const moved = await inputs[0]([{ type: "key", key: "Right", milliseconds: 300 },
    { type: "key", key: "Down", milliseconds: 300 }]);
  assert(moved.frame > first.frame);
  await until(() => engines.every((engine, index) => view(engine.directory).frame >= before[index] + 20),
    "simulation progresses while the second player makes no decisions");
  const actions = fs.readFileSync(`${engines[0].directory}/inputs.log`, "utf8");
  assert(/index=0 .*key=Right/.test(actions));
  assert(/index=1 .*key=Down/.test(actions));
  assert(!fs.readFileSync(`${engines[1].directory}/inputs.log`, "utf8").includes("action "),
    "Player one's input must not operate player two's interface");
  await wait(2000);
  if (failed) throw failed;
  completed = true;
  console.log(`RTS-MATCH-OK: independent views; frames ${before} -> ${engines.map(engine => view(engine.directory).frame)}; ordered inputs; idle opponent does not pause play`);
} finally {
  viewer?.kill("SIGTERM");
  for (const engine of engines) {
    engine.stopping = true;
    engine.stdout.resume();
    fs.writeFileSync(`${engine.directory}/stop`, "\n");
  }
  const force = setTimeout(() => { for (const engine of engines) engine.kill("SIGKILL"); }, 2000);
  await Promise.all(closed);
  if (viewerClosed) await viewerClosed;
  clearTimeout(force);
  try {
    if (completed) {
      const records = engines.map(engine => replayCommands(fs.readFileSync(`${engine.directory}/NONAME.RPL`)));
      assert(records.every(({ commands }) => commands.length === 1 && commands[0].nation === 1 && commands[0].town > 0),
        `Ordinary recruit input must reach both engines: ${JSON.stringify(records.map(record => record.commands))}`);
      equal(JSON.stringify(records[0].commands), JSON.stringify(records[1].commands), "both engines must process the same command frame");
      assert(records.every(record => record.checksums.length > 4), "upstream game-state checksums must be present");
      const corrupt = fs.readFileSync(`${engines[0].directory}/NONAME.RPL`);
      corrupt[records[0].checksums[0]] ^= 1;
      fs.mkdirSync(`${replayRoot}/corrupt`, { recursive: true });
      fs.writeFileSync(`${replayRoot}/corrupt/NONAME.RPL`, corrupt);
      console.log(`RTS-ORDERS-OK: ${JSON.stringify(records[0].commands[0])} recorded by both engines`);
    }
    if (completed) for (const engine of engines) {
      equal(engine.result.status, 0, "Engine must exit normally and close its replay");
      assert(fs.statSync(`${engine.directory}/NONAME.RPL`).size > 0, "Game replay must be retained");
      const output = `${replayRoot}/player${engines.indexOf(engine) + 1}`;
      fs.mkdirSync(output, { recursive: true });
      fs.copyFileSync(`${engine.directory}/NONAME.RPL`, `${output}/NONAME.RPL`);
    }
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
}
console.log("RTS-CLEANUP-OK");
