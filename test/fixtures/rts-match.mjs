// Runs under Janis in the browser, using the real source-built game engines.
import { connectPlayer } from "/usr/src/dolly/rts/player.js";
const fs = globalThis.__janisBuiltin("fs");
const { spawn } = globalThis.__janisBuiltin("child_process");
function assert(value, message = "RTS assertion failed") { if (!value) throw Error(message); }
function equal(actual, expected, message) { assert(actual === expected, `${message ?? "Values differ"}: ${actual} !== ${expected}`); }
const scratch = fs.mkdtempSync("/tmp/dolly-rts-match-test-");
const engines = [], closed = [];
let viewer, viewerClosed;
let failed, completed = false;
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
async function until(test, description) {
  const deadline = Date.now() + 90000;
  while (!test()) {
    if (failed) throw failed;
    if (Date.now() >= deadline) throw Error(`RTS test timed out: ${description}`);
    await wait(50);
  }
}
try {
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
  for (const index of [1, 2]) fs.writeFileSync(`${scratch}/player${index}.txt`,
    "Browser integration test: real game engines; no model or provider is running.\n");
  viewer = spawn("rts-viewer", [scratch, scratch, "fixture 1", "fixture 2"], { stdio: ["ignore", "inherit", "inherit"] });
  viewer.on("error", error => { failed = error; });
  viewerClosed = new Promise(resolve => viewer.once("close", resolve));
  const inputs = engines.map(engine => connectPlayer(fs, engine.directory));
  const [first, second] = await Promise.all(inputs.map(input => input([])));
  assert(Buffer.from(first.png).toString("base64") !== Buffer.from(second.png).toString("base64"),
    "Players must have different own-fog UI views");
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
    if (completed) for (const engine of engines) {
      equal(engine.result.status, 0, "Engine must exit normally and close its replay");
      assert(fs.statSync(`${engine.directory}/NONAME.RPL`).size > 0, "Game replay must be retained");
    }
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
}
console.log("RTS-CLEANUP-OK");
