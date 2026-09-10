// Pi RPC supervision stays inside Dolly. SPDX-License-Identifier: GPL-2.0-or-later
import { connect, describe } from "./player.js";
import { validateTask } from "./auth.mjs";
import { traceText } from "../../rts/spectator/trace.mjs";
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function runTask(configuration) {
  const config = validateTask(configuration);
  const fs = globalThis.__janisBuiltin("fs"), { spawn } = globalThis.__janisBuiltin("child_process");
  fs.mkdirSync("/workspace/classicube-runs", { recursive: true });
  const run = fs.mkdtempSync("/workspace/classicube-runs/run-");
  const scratch = fs.mkdtempSync("/tmp/classicube-agent-");
  const world = "/home/dolly/classicube";
  fs.mkdirSync(`${world}/maps`, { recursive: true });
  fs.writeFileSync(`${run}/task.json`, JSON.stringify({ ...config, started: Date.now() }) + "\n");
  fs.writeFileSync(`${run}/prompt.txt`, config.prompt);
  const controller = new AbortController(), pending = new Map(), children = [];
  let stopped = false, reason, complete, spent = 0, trace = "", state = "Loading the world", buffer = "", serial = 0;
  let pi, game, prompting = false, responseError, timer, controls;
  const done = new Promise(resolve => { complete = resolve; });
  const atomic = (name, text) => {
    fs.writeFileSync(`${run}/${name}.tmp`, text); fs.renameSync(`${run}/${name}.tmp`, `${run}/${name}`);
  };
  const status = text => { state = text; atomic("status.txt", `${text}\nReported cost $${spent.toFixed(4)} / $${config.budget}`); };
  const record = (type, fields = {}) => {
    const event = JSON.parse(JSON.stringify({ time: Date.now(), type, ...fields }).replace(/sk-or-v1-[A-Za-z0-9_-]+/g, "[redacted]"));
    fs.appendFileSync(`${run}/agent.events.jsonl`, JSON.stringify(event) + "\n");
    const text = traceText(event) || (type === "prompt" ? `\n[user] ${event.text}\n` : "");
    if (text) { trace = (trace + text).slice(-32000); atomic("agent.txt", trace); }
  };
  const stop = message => {
    if (stopped) return;
    stopped = true; reason = message; controller.abort();
    for (const request of pending.values()) request.reject(Error(message));
    pending.clear(); complete();
  };
  const fail = error => { if (!stopped) { process.exitCode = 1; record("provider_error", { message: error.message }); stop(error.message); } };
  function launch(command, args, options, label) {
    const child = spawn(command, args, options);
    const closed = new Promise(resolve => child.once("close", (code, signal) => {
      if (!stopped && code !== 0) process.exitCode = 1;
      stop(`${label} exited (${signal ?? code})`); resolve();
    }));
    child.on("error", fail); child.stdin?.on("error", fail); children.push({ child, closed }); return child;
  }
  const rpc = (type, fields = {}) => new Promise((resolve, reject) => {
    const id = `classicube-${++serial}`;
    const timeout = setTimeout(() => { pending.delete(id); reject(Error(`Pi ${type} timed out`)); }, 30000);
    pending.set(id, { resolve: value => { clearTimeout(timeout); resolve(value); }, reject: error => { clearTimeout(timeout); reject(error); } });
    pi.stdin.write(JSON.stringify({ id, type, ...fields }) + "\n");
  });
  const input = connect(fs, scratch, 0x80000000);
  const prompt = async text => {
    if (stopped) return;
    record("prompt", { text });
    if (prompting) { await rpc("steer", { message: text }); return; }
    prompting = true; responseError = undefined; status("Observing");
    const image = await input([], controller.signal);
    record("observation", { frame: image.frame, milliseconds: image.milliseconds });
    await rpc("prompt", { message: `${text}\n\n${describe(image)}`,
      images: [{ type: "image", mimeType: "image/png", data: Buffer.from(image.png).toString("base64") }] });
    status("Agent working");
  };
  function usage(value, source, stopReason) {
    spent += value?.cost?.total ?? 0;
    record("usage", { usage: value, source, stopReason, reportedUSD: spent, limitUSD: config.budget });
    atomic("usage.json", JSON.stringify({ reportedUSD: spent, limitUSD: config.budget }) + "\n"); status(state);
    if (spent >= config.budget) stop("Reported model cost limit reached");
  }
  function event(message) {
    if (message.type === "response") {
      const request = pending.get(message.id); pending.delete(message.id);
      if (message.success) request?.resolve(message.data); else request?.reject(Error(message.error));
    } else if (message.type === "message_update") {
      const update = message.assistantMessageEvent;
      if (update?.type === "thinking_delta" || update?.type === "text_delta") record(update.type, { delta: update.delta });
      if (update?.type === "thinking_start") { record("thinking"); status("Thinking"); }
      if (update?.type === "text_start") { record("text"); status("Agent working"); }
    } else if (message.type === "tool_execution_start") {
      status("Acting in the world"); record("tool", { toolCallId: message.toolCallId, name: message.toolName, args: message.args });
    } else if (message.type === "tool_execution_end") {
      record("tool_result", { toolCallId: message.toolCallId, isError: message.isError, details: message.result?.details,
        feedback: message.result?.content?.filter(item => item.type === "text") });
    } else if (message.type === "message_end" && message.message?.role === "assistant") {
      usage(message.message.usage, "assistant", message.message.stopReason);
      responseError = ["error", "aborted"].includes(message.message.stopReason) ? message.message.errorMessage ?? message.message.stopReason : undefined;
    } else if (message.type === "auto_retry_start") {
      record("retry", { attempt: message.attempt, delayMs: message.delayMs }); status("Retrying provider request");
    } else if (message.type === "compaction_start") { record("compaction_start"); status("Summarizing history");
    } else if (message.type === "compaction_end") {
      if (message.result?.usage) usage(message.result.usage, "compaction");
      if (message.errorMessage) fail(Error(message.errorMessage));
    } else if (message.type === "agent_settled") {
      prompting = false;
      if (responseError) fail(Error(responseError));
      else { record("settled"); status("Agent finished · Enter to give another instruction"); }
    }
  }
  try {
    record("start", { model: config.model, player: 1 }); status(state);
    const log = fs.openSync(`${run}/agent.stderr.log`, "w");
    try {
      pi = launch("pi", ["--mode", "rpc", "--provider", "openrouter", "--model", config.model,
        "--thinking", config.effort, "--session", `${run}/agent.jsonl`, "--no-extensions", "--extension",
        "/usr/src/dolly/classicube/agent/player.js", "--no-context-files", "--no-skills", "--no-prompt-templates",
        "--tools", "game_input", "--system-prompt", fs.readFileSync("/usr/src/dolly/classicube/agent/PLAYER.md", "utf8")],
      { env: { ...process.env, DOLLY_CLASSICUBE_DIR: scratch }, stdio: ["pipe", "pipe", log] }, "Agent");
    } finally { fs.closeSync(log); }
    pi.stdout.setEncoding("utf8");
    pi.stdout.on("data", text => {
      try {
        buffer += text;
        if (buffer.length > 64 * 1024 * 1024) throw Error("Oversized Pi response");
        let newline;
        while ((newline = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
          if (line.trim()) event(JSON.parse(line));
        }
      } catch (error) { fail(error); }
    });
    const selected = await rpc("get_state");
    if (selected.model?.provider !== "openrouter" || !selected.model.input?.includes("image"))
      throw Error("Select an OpenRouter model with image input.");
    if (selected.thinkingLevel !== config.effort) throw Error("The selected model did not accept that effort level.");
    record("configuration", { model: selected.model.id, provider: selected.model.provider, thinking: selected.thinkingLevel });
    const engineLog = fs.openSync(`${run}/game.log`, "w");
    try {
      game = launch("classicube", [fs.existsSync(`${world}/maps/agent-world.cw`) ? "maps/agent-world.cw" : "--singleplayer"],
        { cwd: world, env: { ...process.env, SDL_VIDEODRIVER: "dummy", DOLLY_CLASSICUBE_DIR: scratch },
          stdio: ["ignore", engineLog, engineLog] }, "Game");
    } finally { fs.closeSync(engineLog); }
    launch("classicube-viewer", [scratch, run, `${config.model} / ${config.effort}`], { stdio: ["ignore", "inherit", "inherit"] }, "Viewer");
    const deadline = Date.now() + 90000;
    while (!stopped && !fs.existsSync(`${scratch}/ready`)) {
      if (Date.now() >= deadline) throw Error("World startup timed out. See the saved game log.");
      await wait(50);
    }
    if (!stopped) {
      timer = setTimeout(() => stop("Run time limit reached"), config.seconds * 1000);
      controls = setInterval(() => {
        if (!fs.existsSync(`${scratch}/prompt`)) return;
        try {
          const text = fs.readFileSync(`${scratch}/prompt`, "utf8").trim(); fs.unlinkSync(`${scratch}/prompt`);
          if (text && text.length <= 4096) void prompt(text).catch(fail);
        } catch (error) { fail(error); }
      }, 100);
      void prompt(config.prompt).catch(fail);
    }
    await done;
  } catch (error) { fail(error); }
  finally {
    stop("Run finished"); clearTimeout(timer); clearInterval(controls);
    fs.writeFileSync(`${scratch}/stop`, "\n");
    for (const { child } of children) { child.stdout?.resume(); if (child !== game) child.kill("SIGTERM"); }
    const force = setTimeout(() => { for (const { child } of children) child.kill("SIGKILL"); }, 5000);
    await Promise.all(children.map(({ closed }) => closed)); clearTimeout(force);
    if (fs.existsSync(`${scratch}/inputs.log`)) fs.renameSync(`${scratch}/inputs.log`, `${run}/inputs.log`);
    if (fs.existsSync(`${scratch}/view.rgba`)) fs.renameSync(`${scratch}/view.rgba`, `${run}/final.rgba`);
    atomic("result.txt", reason + "\n");
    fs.rmSync(scratch, { recursive: true, force: true });
    console.log(`${reason}\nWorld: ${world}/maps/agent-world.cw\nPrompts, traces and history: ${run}`);
  }
}
