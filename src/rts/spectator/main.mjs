// SPDX-License-Identifier: GPL-2.0-or-later
import { connectPlayer } from "../player.js";
const fs = globalThis.__janisBuiltin("fs");
const { spawn } = globalThis.__janisBuiltin("child_process");
const [first, second, duration = "600"] = process.argv.slice(2);
const seconds = Number(duration);
if (!first || !second || process.argv.length > 5 || !Number.isInteger(seconds) || seconds < 10 || seconds > 3600) {
  console.error("usage: rts-arena OPENROUTER_MODEL_1 OPENROUTER_MODEL_2 [seconds: 10..3600, default 600]");
  process.exit(64);
}

fs.mkdirSync("/workspace/rts-matches", { recursive: true });
const match = fs.mkdtempSync("/workspace/rts-matches/match-");
const scratch = fs.mkdtempSync("/tmp/dolly-rts-");
const children = [], requests = [], agents = [], engines = [];
const controller = new AbortController();
let stopped = false, reason, complete;
const done = new Promise(resolve => { complete = resolve; });
const stop = message => {
  if (stopped) return;
  stopped = true;
  reason = message;
  controller.abort();
  for (const pending of requests) {
    for (const request of pending.values()) request.reject(Error(message));
    pending.clear();
  }
  complete();
};
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const fail = error => { if (!stopped) { process.exitCode = 1; stop(`Error: ${error.message ?? error}`); } };

function launch(command, arguments_, options, label) {
  const child = spawn(command, arguments_, options);
  const closed = new Promise(resolve => child.once("close", (code, signal) => {
    if (!stopped && code !== 0) process.exitCode = 1;
    stop(`${label} exited (${signal ?? code})`);
    resolve();
  }));
  child.on("error", fail);
  child.stdin?.on("error", fail);
  children.push({ child, closed });
  return child;
}

function pipe(source, destination) {
  source.on("data", bytes => { if (!stopped && !destination.write(bytes)) source.pause(); });
  destination.on("drain", () => source.resume());
}

function gameReady(directory) {
  const file = `${directory}/view.rgba`;
  if (!fs.existsSync(file)) return false;
  const fd = fs.openSync(file, "r");
  try {
    const bytes = Buffer.alloc(16);
    return fs.readSync(fd, bytes, 0, bytes.length, 0) === 16 && bytes.readUInt32LE(0) >= 2;
  } finally { fs.closeSync(fd); }
}

function player(index, model) {
  const directory = `${scratch}/player${index}`;
  fs.mkdirSync(directory);
  const environment = { ...process.env, DOLLY_RTS_PLAYER: String(index), DOLLY_RTS_PLAYER_DIR: directory };
  const traceFile = `${match}/player${index}.txt`;
  const eventFile = `${match}/player${index}.events.jsonl`;
  let trace = `Player ${index}: ${model}\nWaiting for Pi. Thinking is shown only when the provider exposes it.\n`;
  const record = (type, data, text = "") => {
    fs.appendFileSync(eventFile, JSON.stringify({ time: Date.now(), type, ...data }) + "\n");
    if (text) {
      trace = (trace + text).slice(-16000);
      fs.writeFileSync(`${traceFile}.tmp`, trace);
      fs.renameSync(`${traceFile}.tmp`, traceFile);
    }
  };
  record("start", { model }, "\n");
  const log = fs.openSync(`${match}/player${index}.stderr.log`, "w");
  let pi;
  try {
    pi = launch("pi", ["--mode", "rpc", "--provider", "openrouter", "--model", model,
      "--session", `${match}/player${index}.jsonl`, "--no-extensions", "--extension", "/usr/src/dolly/rts/player.js",
      "--no-context-files", "--no-skills", "--no-prompt-templates", "--tools", "game_input",
      "--system-prompt", fs.readFileSync("/usr/src/dolly/rts/PLAYER.md", "utf8")],
    { env: environment, stdio: ["pipe", "pipe", log] }, `Player ${index} Pi`);
  } finally { fs.closeSync(log); }
  let serial = 0, buffer = "", prompting = false;
  const pending = new Map();
  const rpc = (type, fields = {}) => new Promise((resolve, reject) => {
    const id = `arena-${++serial}`;
    const timeout = setTimeout(() => { pending.delete(id); reject(Error(`Pi ${type} timed out`)); }, 30000);
    pending.set(id, {
      resolve: data => { clearTimeout(timeout); resolve(data); },
      reject: error => { clearTimeout(timeout); reject(error); },
    });
    pi.stdin.write(JSON.stringify({ id, type, ...fields }) + "\n");
  });
  requests.push(pending);
  const input = connectPlayer(fs, directory, 0x80000000);
  async function prompt() {
    if (stopped || prompting) return;
    prompting = true;
    try {
      const image = await input([], controller.signal);
      if (stopped) return;
      record("observation", { frame: image.frame, milliseconds: image.milliseconds },
        `\n[view: frame ${image.frame}, ${image.milliseconds} ms]\n`);
      await rpc("prompt", { message: `Play from your current view (frame ${image.frame}, ${image.milliseconds} ms). The game is running.`,
        images: [{ type: "image", mimeType: "image/png", data: Buffer.from(image.png).toString("base64") }] });
    } catch (error) { if (!stopped) fail(error); }
  }
  function event(message) {
    if (message.type === "response") {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.success) request?.resolve(message.data);
      else request?.reject(Error(`Player ${index}: ${message.error}`));
    } else if (message.type === "message_update") {
      const update = message.assistantMessageEvent;
      if (update?.type === "thinking_delta" || update?.type === "text_delta")
        record(update.type, { delta: update.delta }, update.delta);
      else if (update?.type === "thinking_start") record("thinking", {}, "\n[thinking]\n");
      else if (update?.type === "text_start") record("text", {}, "\n[assistant]\n");
    } else if (message.type === "tool_execution_start") {
      record("tool", { toolCallId: message.toolCallId, name: message.toolName, args: message.args },
        `\n[${message.toolName}] ${JSON.stringify(message.args)}\n`);
    } else if (message.type === "tool_execution_end") {
      record("tool_result", { toolCallId: message.toolCallId, isError: message.isError, details: message.result?.details },
        `\n[result] ${JSON.stringify(message.result?.details ?? message.result?.content?.filter(item => item.type === "text"))}\n`);
    } else if (message.type === "message_end" && message.message?.role === "assistant") {
      record("usage", { usage: message.message.usage, stopReason: message.message.stopReason });
      if (["error", "aborted"].includes(message.message.stopReason))
        fail(Error(`Player ${index}: ${message.message.errorMessage ?? message.message.stopReason}`));
    } else if (message.type === "agent_end") {
      prompting = false;
      void prompt(); // Independent continuation: no shared decision timer or turn barrier.
    }
  }
  pi.stdout.setEncoding("utf8");
  pi.stdout.on("data", text => {
    try {
      buffer += text;
      if (buffer.length > 64 * 1024 * 1024) throw Error("Oversized Pi RPC response");
      let newline;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (line.trim()) event(JSON.parse(line));
      }
    } catch (error) { fail(error); }
  });
  return { directory, environment, prompt, rpc, record };
}

let timer, resultTimer;
try {
  console.log(`RTS match: ${match}\n${seconds}s limit; Escape in the viewer stops the match. Histories are kept.`);
  fs.writeFileSync(`${match}/match.json`, JSON.stringify({ models: [first, second], seconds, seed: 12345, started: Date.now() }) + "\n");
  agents.push(player(1, first), player(2, second));
  await Promise.all(agents.map(async agent => {
    const state = await agent.rpc("get_state");
    if (state.model?.provider !== "openrouter") throw Error("Both players must use OpenRouter models");
    if (!state.model?.input?.includes("image")) throw Error("Both OpenRouter models must support image input");
    agent.record("configuration", { model: state.model.id, provider: state.model.provider, thinking: state.thinkingLevel },
      `\n[model: ${state.model.id}; thinking: ${state.thinkingLevel}]\n`);
  }));
  if (stopped) throw Error(reason);
  engines.push(...agents.map((agent, index) => {
    const log = fs.openSync(`${match}/player${index + 1}.engine.log`, "w");
    try { return launch("seven-kingdoms", ["-noaudio", "-win", "-rnd", "12345"],
      { env: agent.environment, stdio: ["pipe", "pipe", log] }, `Player ${index + 1} game`); }
    finally { fs.closeSync(log); }
  }));
  pipe(engines[0].stdout, engines[1].stdin);
  pipe(engines[1].stdout, engines[0].stdin);
  launch("rts-viewer", [scratch, match, first, second], { stdio: ["ignore", "inherit", "inherit"] }, "Viewer");
  const deadline = Date.now() + 90000;
  while (!stopped && !agents.every(agent => gameReady(agent.directory))) {
    if (Date.now() >= deadline) throw Error("Game startup timed out; inspect the saved engine logs");
    await wait(50);
  }
  if (!stopped) {
    timer = setTimeout(() => stop("Match time limit reached"), seconds * 1000);
    resultTimer = setInterval(() => {
      try {
        for (const [index, agent] of agents.entries()) {
          const result = `${agent.directory}/result.txt`;
          if (fs.existsSync(result)) stop(`Game result from player ${index + 1}: ${fs.readFileSync(result, "utf8").trim()}`);
        }
      } catch (error) { fail(error); }
    }, 100);
    for (const agent of agents) void agent.prompt();
  }
  await done;
} catch (error) { fail(error); }
finally {
  stop("Match finished");
  clearTimeout(timer);
  clearInterval(resultTimer);
  for (const agent of agents) fs.writeFileSync(`${agent.directory}/stop`, "\n");
  for (const { child } of children) {
    child.stdout?.resume();
    if (!engines.includes(child)) child.kill("SIGTERM");
  }
  const force = setTimeout(() => { for (const { child } of children) child.kill("SIGKILL"); }, 2000);
  await Promise.all(children.map(({ closed }) => closed));
  clearTimeout(force);
  try {
    for (const [index, agent] of agents.entries()) {
      const replay = `${match}/player${index + 1}-game`;
      fs.mkdirSync(replay);
      for (const name of fs.readdirSync(agent.directory)) {
        if (!/\.(RPL|rpl)$/.test(name) && name !== "result.txt" && name !== "inputs.log") continue;
        fs.copyFileSync(`${agent.directory}/${name}`, `${replay}/${name}`);
      }
    }
    fs.writeFileSync(`${match}/result.txt`, reason + "\n");
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
    for (const index of [1, 2]) {
      const temporary = `${match}/player${index}.txt.tmp`;
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
  }
  console.log(`${reason}\nHistories, thinking/tool events and engine logs: ${match}`);
}
