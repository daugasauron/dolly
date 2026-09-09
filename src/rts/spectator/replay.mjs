// SPDX-License-Identifier: GPL-2.0-or-later
import { encodeBatch } from "../player.js";
import { traceText } from "./trace.mjs";

export function replayInputs(log) {
  const actions = [], points = new Map();
  for (const line of log.trim().split("\n")) {
    const stamp = line.match(/\bframe=(\d+) ms=(\d+)/);
    if (!stamp) throw Error("Invalid recorded input timing");
    const [frame, milliseconds] = stamp.slice(1).map(Number);
    if (![frame, milliseconds].every(value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff))
      throw Error("Invalid recorded input timing");
    points.set(frame, milliseconds);
    if (!line.startsWith("action ")) continue;
    const fields = Object.fromEntries([...line.matchAll(/(\w+)=([^ ]*)/g)].map(match => [match[1], match[2]]));
    const type = [null, "move", "click", "key", "drag", "wait"][fields.kind];
    const action = { type, milliseconds: Number(fields.duration) };
    if (["move", "click", "drag"].includes(type)) Object.assign(action, { x: Number(fields.x), y: Number(fields.y) });
    if (["click", "drag"].includes(type)) action.button = [null, "left", "middle", "right"][fields.button];
    if (type === "drag") Object.assign(action, { end_x: Number(fields.end_x), end_y: Number(fields.end_y) });
    if (type === "key") Object.assign(action, { key: fields.key,
      modifiers: ["Shift", "Control", "Alt"].filter((_, index) => Number(fields.modifiers) & (1 << index)) });
    const record = Buffer.alloc(72);
    record.writeUInt32LE(frame, 0);
    record.writeUInt32LE(milliseconds, 4);
    record.set(encodeBatch([action], 1).subarray(16), 8);
    actions.push(record);
  }
  const timing = [...points].sort((a, b) => a[0] - b[0]);
  if (!timing.length || timing.some((point, index) => index && point[1] < timing[index - 1][1]))
    throw Error("Non-monotonic recorded input timing");
  const bytes = Buffer.alloc(timing.length * 8);
  timing.forEach(([frame, milliseconds], index) => {
    bytes.writeUInt32LE(frame, index * 8); bytes.writeUInt32LE(milliseconds, index * 8 + 4);
  });
  return { actions: Buffer.concat(actions), timing: bytes };
}

export function frameAt(points, time) {
  let index = 0;
  while (index + 1 < points.length && points[index + 1].time <= time) ++index;
  const a = points[index], b = points[index + 1];
  if (time < a.time) return 1;
  return Math.max(1, Math.floor(a.frame + (time - a.time) * (b ? (b.frame - a.frame) / (b.time - a.time) : 0.02)));
}

export function replayTimeline(manifest, players) {
  if (!Array.isArray(manifest.models) || manifest.models.length !== 2 ||
      !manifest.models.every(value => typeof value === "string") || !Number.isFinite(manifest.started))
    throw Error("Invalid match.json");
  let cost = 0;
  const events = players.flatMap((items, index) => items.map(event => ({ ...event, player: index + 1 })))
    .sort((a, b) => a.time - b.time);
  for (const event of events) {
    if (!Number.isFinite(event.time) || event.time < manifest.started) throw Error("Invalid replay event timestamp");
    if (event.type === "usage") {
      cost += event.usage?.cost?.total ?? 0;
      event.reportedUSD ??= cost;
      event.limitUSD ??= manifest.budgetUSD;
    }
  }
  const clocks = players.map(items => {
    const points = items.flatMap(event => {
      const view = event.type === "observation" ? event : event.type === "tool_result" ? event.details : null;
      return Number.isInteger(view?.frame) && view.frame > 0 ? [{ time: event.time, frame: view.frame }] : [];
    });
    if (!points.length || points.some((point, index) => index &&
        (point.time <= points[index - 1].time || point.frame < points[index - 1].frame)))
      throw Error("Replay needs monotonic player observation timestamps");
    return points;
  });
  return { events, clocks };
}

export async function replayMatch(args) {
  const fs = globalThis.__janisBuiltin("fs");
  const { spawn } = globalThis.__janisBuiltin("child_process");
  const [directory, rate = "1"] = args;
  let speed = Number(rate);
  if (!directory || args.length > 2 || !Number.isFinite(speed) || speed < 0.25 || speed > 64)
    throw Error("usage: rts-arena --replay MATCH_DIRECTORY [speed: 0.25..64, default 1]");
  if (!fs.statSync(directory).isDirectory())
    throw Error("Replay needs the extracted match folder, not a .RPL file or .tar.gz bundle");
  const match = fs.realpathSync(directory);
  const json = name => JSON.parse(fs.readFileSync(`${match}/${name}`, "utf8"));
  const manifest = json("match.json");
  const players = [1, 2].map(index => fs.readFileSync(`${match}/player${index}.events.jsonl`, "utf8")
    .trim().split("\n").map(JSON.parse));
  const { events, clocks } = replayTimeline(manifest, players);
  const inputs = [1, 2].map(index => {
    const path = `${match}/player${index}-game`;
    const header = Buffer.alloc(4), fd = fs.openSync(`${path}/NONAME.RPL`, "r");
    try {
      if (fs.readSync(fd, header, 0, 4, 0) !== 4 || header.toString() !== "7KRP")
        throw Error(`Player ${index}: expected a native 7KRP recording`);
    } finally { fs.closeSync(fd); }
    return replayInputs(fs.readFileSync(`${path}/inputs.log`, "utf8"));
  });
  const scratch = fs.mkdtempSync("/tmp/dolly-rts-replay-");
  const children = [], traces = ["", ""], targets = [1, 1], finished = [false, false];
  let stopped = false, failure, cursor = 0, elapsed = 0, paused = false, controlOffset = 0;
  const publish = (name, bytes) => {
    fs.writeFileSync(`${scratch}/${name}.tmp`, bytes);
    fs.renameSync(`${scratch}/${name}.tmp`, `${scratch}/${name}`);
  };
  const launch = (command, argv, options, index) => {
    const child = spawn(command, argv, options);
    const closed = new Promise(resolve => child.once("close", (code, signal) => {
      if (index === undefined) stopped = true;
      else { finished[index] = true; if (!stopped && code !== 0) failure = Error(`Player ${index + 1} replay exited (${signal ?? code})`); }
      resolve();
    }));
    child.on("error", error => { failure = error; stopped = true; });
    children.push({ child, closed });
    return child;
  };
  const frame = index => {
    const file = `${scratch}/player${index + 1}/view.rgba`;
    if (!fs.existsSync(file)) return 0;
    const fd = fs.openSync(file, "r"), bytes = Buffer.alloc(4);
    try { return fs.readSync(fd, bytes, 0, 4, 0) === 4 ? bytes.readUInt32LE(0) : 0; }
    finally { fs.closeSync(fd); }
  };
  try {
    console.log(`RTS replay: ${match}\nRecorded simulations and thinking; no model calls. Space pauses, +/- changes speed, Escape exits.`);
    for (const index of [0, 1]) {
      const player = `player${index + 1}`, work = `${scratch}/${player}`;
      fs.mkdirSync(work);
      publish(`${player}/timing`, inputs[index].timing);
      publish(`${player}/replay-inputs`, inputs[index].actions);
      publish(`${player}/clock`, Buffer.from([1, 0, 0, 0]));
      publish(`${player}.txt`, "");
      launch("seven-kingdoms", ["-noaudio", "-win", "-replay", `${match}/${player}-game/NONAME.RPL`],
        { env: { ...process.env, DOLLY_RTS_PLAYER: "", DOLLY_RTS_REPLAY_PLAYER: String(index + 1),
          DOLLY_RTS_PLAYER_DIR: work }, stdio: ["ignore", "inherit", "inherit"] }, index);
    }
    publish("replay-status", "Replay loading | Space: pause | +/-: speed | Escape: exit");
    launch("rts-viewer", [scratch, scratch, ...manifest.models], { stdio: ["ignore", "inherit", "inherit"] });
    let previous = Date.now(), lastProgress = previous, previousFrames = "", ended = false;
    while (!stopped && !failure) {
      await new Promise(resolve => setTimeout(resolve, 50));
      const now = Date.now(), delta = Math.min(100, now - previous);
      previous = now;
      const controlPath = `${scratch}/replay-control`;
      if (fs.existsSync(controlPath)) {
        const controls = fs.readFileSync(controlPath, "utf8"), end = controls.lastIndexOf("\n") + 1;
        for (const control of controls.slice(controlOffset, end).split("\n")) {
          if (control === "pause") paused = !paused;
          if (control === "faster") speed = Math.min(64, speed * 2);
          if (control === "slower") speed = Math.max(0.25, speed / 2);
        }
        controlOffset = end;
      }
      const frames = [0, 1].map(frame);
      if (frames.join() !== previousFrames || paused || ended) lastProgress = now;
      previousFrames = frames.join();
      if (now - lastProgress > 90000) throw Error("Replay stopped advancing");
      if (frames.every((value, index) => finished[index] || value >= targets[index])) {
        while (cursor < events.length && events[cursor].time <= manifest.started + elapsed) {
          const event = events[cursor++], index = event.player - 1;
          traces[index] = (traces[index] + traceText(event)).slice(-16000);
        }
        for (const index of [0, 1]) publish(`player${index + 1}.txt`, traces[index]);
        if (!paused && !ended) elapsed += delta * speed;
        for (const index of [0, 1]) {
          targets[index] = frameAt(clocks[index], manifest.started + elapsed);
          const bytes = Buffer.alloc(4); bytes.writeUInt32LE(targets[index], 0);
          publish(`player${index + 1}/clock`, bytes);
        }
      }
      if (finished.every(Boolean) && cursor === events.length && !ended) {
        ended = true;
        console.log("RTS split-screen replay complete; both native recordings reached EOF.");
      }
      const status = ended ? `Replay complete | ${fs.existsSync(`${match}/result.txt`) ? fs.readFileSync(`${match}/result.txt`, "utf8").trim() : "End of recordings"} | Escape: exit` :
        `REPLAY ${Math.floor(elapsed / 1000)}s | ${paused ? "Paused" : `${speed}x`} | Space: pause | +/-: speed | Escape: exit`;
      publish("replay-status", status);
    }
    if (failure) throw failure;
  } finally {
    stopped = true;
    for (const { child } of children) child.kill("SIGTERM");
    const force = setTimeout(() => { for (const { child } of children) child.kill("SIGKILL"); }, 2000);
    await Promise.all(children.map(item => item.closed));
    clearTimeout(force);
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}
