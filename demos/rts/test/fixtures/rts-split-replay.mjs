const fs = globalThis.__janisBuiltin("fs");
const { spawn } = globalThis.__janisBuiltin("child_process");
const match = process.argv[2] ?? "/workspace/rts-high-vs-xhigh";
const originals = [1, 2].map(index => fs.readFileSync(`${match}/player${index}-game/NONAME.RPL`));
const before = fs.readdirSync("/tmp").filter(name => name.startsWith("dolly-rts-replay-"));
const assert = (value, message) => { if (!value) throw Error(message); };
const wait = async (predicate, label, seconds = 120) => {
  const deadline = Date.now() + seconds * 1000;
  while (!predicate()) {
    if (closed) throw Error(`Replay exited early (${status}): ${label}`);
    if (Date.now() > deadline) throw Error(`Timed out: ${label}`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
};
const child = spawn("rts-arena", ["--replay", match], { stdio: ["ignore", "inherit", "inherit"] });
const proof = fs.mkdtempSync("/tmp/rts-split-proof-");
const phase = async name => {
  const path = `${proof}/replay-${name}`;
  fs.writeFileSync(path, name);
  await new Promise((resolve, reject) => {
    const download = spawn("download", [path], { stdio: ["ignore", "inherit", "inherit"] });
    download.on("error", reject);
    download.on("close", code => code === 0 ? resolve() : reject(Error("Could not export proof marker")));
  });
};
let closed = false, status;
const done = new Promise(resolve => child.on("close", code => { closed = true; status = code; resolve(); }));
try {
  let scratch;
  await wait(() => {
    const name = fs.readdirSync("/tmp").find(name => name.startsWith("dolly-rts-replay-") && !before.includes(name));
    if (name) scratch = `/tmp/${name}`;
    return scratch;
  }, "replay scratch");
  const frames = () => [1, 2].map(index => {
    const file = `${scratch}/player${index}/view.rgba`;
    return fs.existsSync(file) ? fs.readFileSync(file).readUInt32LE(0) : 0;
  });
  const label = () => fs.existsSync(`${scratch}/replay-status`) ? fs.readFileSync(`${scratch}/replay-status`, "utf8") : "";
  await wait(() => frames().every(frame => frame > 10), "both animated player views");
  const first = frames();
  await new Promise(resolve => setTimeout(resolve, 1500));
  assert(frames().every((frame, index) => frame > first[index] + 10), "native animation must advance between observations");
  await phase("ready");
  await wait(() => label().includes("Paused"), "Space pauses");
  await new Promise(resolve => setTimeout(resolve, 500));
  const pausedFrames = frames(), pausedText = [1, 2].map(index => fs.readFileSync(`${scratch}/player${index}.txt`, "utf8"));
  await new Promise(resolve => setTimeout(resolve, 700));
  assert(JSON.stringify(frames()) === JSON.stringify(pausedFrames), "both native simulations pause");
  assert([1, 2].every((index, offset) => fs.readFileSync(`${scratch}/player${index}.txt`, "utf8") === pausedText[offset]), "thinking pauses with animation");
  await phase("paused");
  await wait(() => label().includes("64x"), "speed controls");
  await wait(() => label().includes("Replay complete"), "both full native replays", 600);
  assert(!closed, "viewer remains open at EOF for review");
  assert(frames().every(frame => frame === 27741), `both panes display the final native frame: ${frames()}`);
  for (const index of [1, 2]) {
    const trace = fs.readFileSync(`${scratch}/player${index}.txt`, "utf8");
    assert(trace === fs.readFileSync(`${match}/player${index}.txt`, "utf8"), `player ${index} final trace matches recording`);
    assert(fs.readFileSync(`${match}/player${index}-game/NONAME.RPL`).equals(originals[index - 1]), "source replay is unchanged");
  }
  console.log(`replay-proof: EOF verified frames=${frames().join(",")}; traces match`);
  await phase("eof");
  await wait(() => closed, "Escape closes replay viewer");
  assert(status === 0, "replay exits successfully");
  assert(!fs.existsSync(scratch), "replay owns and removes scratch");
  console.log("replay-proof: passed");
} finally {
  if (!closed) child.kill("SIGKILL");
  await done;
  fs.rmSync(proof, { recursive: true, force: true });
}
