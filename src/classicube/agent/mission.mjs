// Pi supervision and all application state stay inside Dolly. SPDX-License-Identifier: GPL-2.0-or-later
import { connect, describe } from "./player.js";
import { createSettings, settingsDirectory, writeAtomic } from "./settings.mjs";
import { traceText } from "../../rts/spectator/trace.mjs";
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function runWorld() {
  const fs = globalThis.__janisBuiltin("fs"), { spawn } = globalThis.__janisBuiltin("child_process");
  const world = "/home/dolly/classicube";
  for (const path of [settingsDirectory, `${world}/maps`, "/workspace/classicube-runs"]) fs.mkdirSync(path, { recursive: true });
  // Session files retain IPC files, but restart their processes from the image entry.
  for (const name of fs.readdirSync("/tmp")) if (name.startsWith("classicube-agent-")) fs.rmSync(`/tmp/${name}`, { recursive: true, force: true });
  const run = fs.mkdtempSync("/workspace/classicube-runs/run-"), scratch = fs.mkdtempSync("/tmp/classicube-agent-");
  const atomic = (name, data) => writeAtomic(fs, `${scratch}/${name}`, data);
  const saved = name => fs.existsSync(`${settingsDirectory}/${name}`) ? fs.readFileSync(`${settingsDirectory}/${name}`, "utf8") : "";
  let usage = { reportedUSD: 0, tokens: 0 };
  try { usage = JSON.parse(saved("usage.json")) || usage; } catch {}
  usage = { reportedUSD: Number.isFinite(usage.reportedUSD) ? usage.reportedUSD : 0, tokens: Number.isFinite(usage.tokens) ? usage.tokens : 0 };
  let stopped = false, reason = "World closed", agent, starting, interrupting, closing;
  let busy = false, state = "Your controls", trace = saved("activity.txt"), lastPrompt = saved("last-prompt.txt");
  let serial = 0, commandSerial = 0, observedGeneration = 0, operation = Promise.resolve(), observation;
  const processes = [];
  const control = () => {
    if (!fs.existsSync(`${scratch}/control`)) return { generation: 0, owner: 1 };
    const bytes = fs.readFileSync(`${scratch}/control`);
    return bytes.length === 8 ? { generation: bytes.readUInt32LE(0), owner: bytes.readUInt32LE(4) } : { generation: 0, owner: 0 };
  };
  const status = text => {
    if (text) state = text;
    const owner = control().owner;
    atomic("status.txt", owner === 1 ? "Your controls · Agent paused" : owner === 0 ? "Agent paused" : state);
    const subscription = settings.selection.provider === "codex-local";
    atomic("cost.txt", `$${Number(usage.reportedUSD).toFixed(4)} reported${subscription ? " · Codex subscription" : ""}`);
  };
  const record = (type, fields = {}) => {
    const event = JSON.parse(JSON.stringify({ time: Date.now(), type, ...fields }).replace(/sk-or-v1-[\w-]+/g, "[redacted]"));
    fs.appendFileSync(`${run}/agent.events.jsonl`, JSON.stringify(event) + "\n");
    const text = type === "prompt" ? `\n[user] ${event.text}\n` : type === "configuration" ? `\n[model] ${event.provider} / ${event.model} / ${event.effort}\n` : type === "interrupt" ? "\n[interrupted]\n" : type === "usage" ? "" : traceText(event);
    if (text) {
      trace = (trace + text).slice(-64000); atomic("activity.txt", trace);
      writeAtomic(fs, `${settingsDirectory}/activity.txt`, trace);
    }
  };
  const stop = message => { if (!stopped) { stopped = true; reason = message; observation?.abort(); settings.respond(null); } };
  const fault = error => { record("provider_error", { message: error.message }); status("Agent error · Enter to retry or Ctrl+, to configure"); };
  const runCommand = (command, args) => new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "inherit", "inherit"] });
    child.once("error", reject); child.once("close", resolve);
  });
  const settings = createSettings(fs, scratch, runCommand, async () => { await closeAgent(); status("Settings saved · Enter to give an instruction"); });
  function launch(command, args, options) {
    const child = spawn(command, args, options);
    const closed = new Promise(resolve => child.once("close", code => { stop(`${command} exited (${code})`); resolve(); }));
    child.on("error", error => { fault(error); stop(error.message); }); processes.push({ child, closed }); return child;
  }
  function event(message) {
    if (message.type === "message_update") {
      const update = message.assistantMessageEvent;
      if (["thinking_delta", "text_delta"].includes(update?.type)) record(update.type, { delta: update.delta });
      if (update?.type === "thinking_start") { record("thinking"); status("Thinking"); }
      if (update?.type === "text_start") { record("text"); status("Agent working"); }
    } else if (message.type === "tool_execution_start") {
      record("tool", { toolCallId: message.toolCallId, name: message.toolName, args: message.args }); status("Acting in the world");
    } else if (message.type === "tool_execution_end") {
      record("tool_result", { toolCallId: message.toolCallId, isError: message.isError, details: message.result?.details,
        feedback: message.result?.content?.filter(item => item.type === "text") });
    } else if ((message.type === "message_end" && message.message?.role === "assistant") || message.type === "compaction_end") {
      const value = message.message?.usage ?? message.result?.usage;
      if (value) {
        usage.reportedUSD += value.cost?.total ?? 0; usage.tokens += value.totalTokens ?? 0;
        record("usage", { usage: value, reportedUSD: usage.reportedUSD });
        writeAtomic(fs, `${settingsDirectory}/usage.json`, JSON.stringify(usage)); status();
      }
      if (message.message?.stopReason === "error" || message.errorMessage) fault(Error(message.message?.errorMessage ?? message.errorMessage));
    } else if (message.type === "agent_settled") { busy = false; record("settled"); status("Ready · Enter to give another instruction"); }
    else if (message.type === "auto_retry_start") { record("retry", { attempt: message.attempt }); status("Retrying provider request"); }
  }
  async function ensureAgent() {
    if (agent) return agent;
    if (starting) return starting;
    starting = (async () => {
      await settings.ready();
      const config = { ...settings.selection }, pending = new Map();
      const stderr = fs.openSync(`${run}/agent.stderr.log`, "a");
      const child = spawn("pi", ["--mode", "rpc", "--provider", config.provider, "--model", config.model,
        "--thinking", config.effort, "--session", `${settingsDirectory}/conversation.jsonl`, "--no-extensions", "--extension",
        "/usr/src/dolly/classicube/agent/player.js", "--no-context-files", "--no-skills", "--no-prompt-templates",
        "--tools", "game_input", "--system-prompt", fs.readFileSync("/usr/src/dolly/classicube/agent/PLAYER.md", "utf8")],
      { env: { ...process.env, DOLLY_CLASSICUBE_DIR: scratch }, stdio: ["pipe", "pipe", stderr] });
      fs.closeSync(stderr);
      let buffer = "";
      const current = { child, rpc(type, fields = {}) {
        return new Promise((resolve, reject) => {
          const id = `classicube-${++serial}`;
          const timer = setTimeout(() => { pending.delete(id); reject(Error(`Pi ${type} timed out`)); }, 30000);
          pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
          child.stdin.write(JSON.stringify({ id, type, ...fields }) + "\n");
        });
      } };
      current.closed = new Promise(resolve => child.once("close", code => {
        for (const request of pending.values()) request.reject(Error("Agent stopped")); pending.clear();
        if (agent === current) { agent = undefined; busy = false; if (!closing && !stopped) status(`Agent exited (${code}) · Enter to restart`); }
        resolve();
      }));
      agent = current;
      child.on("error", fault); child.stdin.on("error", error => { if (!closing && !stopped) fault(error); });
      child.stdout.setEncoding("utf8"); child.stdout.on("data", text => {
        try {
          buffer += text;
          if (buffer.length > 64 * 1024 * 1024) throw Error("Oversized Pi response");
          let newline;
          while ((newline = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
            if (!line.trim()) continue;
            const message = JSON.parse(line);
            if (message.type === "response") {
              const request = pending.get(message.id); pending.delete(message.id);
              if (message.success) request?.resolve(message.data); else request?.reject(Error(message.error));
            } else event(message);
          }
        } catch (error) { fault(error); }
      });
      const selected = await current.rpc("get_state");
      if (selected.model?.provider !== config.provider || selected.model.id !== config.model || selected.thinkingLevel !== config.effort)
        throw Error("The selected provider, model or effort is unavailable. Open settings with Ctrl+,.");
      record("configuration", { ...config, thinking: selected.thinkingLevel });
      return current;
    })();
    try { return await starting; }
    catch (error) { const current = agent; agent = undefined; current?.child.kill("SIGTERM"); throw error; }
    finally { starting = undefined; }
  }
  function interrupt() {
    observation?.abort();
    if (interrupting) return interrupting;
    if (!agent) { busy = false; return Promise.resolve(); }
    record("interrupt"); status("Interrupted · Enter to give another instruction");
    interrupting = (async () => {
      try { await agent.rpc("abort"); await agent?.rpc("clear_queue"); }
      catch (error) { if (!closing && !stopped) fault(error); }
      busy = false;
    })().finally(() => { interrupting = undefined; });
    return interrupting;
  }
  async function closeAgent() {
    if (closing) return closing;
    closing = (async () => {
      await interrupt();
      if (starting) await starting.catch(() => {});
      if (!agent) return;
      const current = agent; current.child.kill("SIGTERM");
      const force = setTimeout(() => current.child.kill("SIGKILL"), 2000);
      await current.closed; clearTimeout(force);
    })().finally(() => { closing = undefined; });
    return closing;
  }
  const input = connect(fs, scratch, 0x80000000);
  async function prompt(text, replace = false, resume = false) {
    if (!text.trim() || text.length > 65536 || stopped) return;
    if (replace) await interrupt(); else if (interrupting) await interrupting;
    if (!resume) { lastPrompt = text; writeAtomic(fs, `${settingsDirectory}/last-prompt.txt`, text); }
    record("prompt", { text });
    const generation = control().generation;
    const current = await ensureAgent();
    if (stopped || control().owner !== 2 || control().generation !== generation) return;
    if (busy) { await current.rpc("steer", { message: text }); status("Instruction queued for the agent"); return; }
    busy = true; status("Observing"); observation = new AbortController();
    try {
      const image = await input([], observation.signal);
      if (stopped || control().owner !== 2 || control().generation !== generation) return;
      record("observation", { frame: image.frame, milliseconds: image.milliseconds });
      await current.rpc("prompt", { message: `${text}\n\n${describe(image)}`,
        images: [{ type: "image", mimeType: "image/png", data: Buffer.from(image.png).toString("base64") }] });
      status("Agent working");
    } finally { observation = undefined; }
  }
  const enqueue = task => { operation = operation.then(task).catch(error => { busy = false; if (!stopped) fault(error); }); };
  atomic("activity.txt", trace); status();
  record("world_start");
  const gameLog = fs.openSync(`${run}/game.log`, "w");
  const game = launch("classicube", [fs.existsSync(`${world}/maps/agent-world.cw`) ? "maps/agent-world.cw" : "--singleplayer"],
    { cwd: world, env: { ...process.env, SDL_VIDEODRIVER: "dummy", DOLLY_CLASSICUBE_DIR: scratch }, stdio: ["ignore", gameLog, gameLog] });
  fs.closeSync(gameLog);
  launch("classicube-viewer", [scratch, settingsDirectory], { stdio: ["ignore", "inherit", "inherit"] });
  try {
    while (!stopped) {
      const gate = control();
      if (gate.generation !== observedGeneration) {
        observedGeneration = gate.generation;
        if (gate.owner !== 2 && busy) void interrupt();
        status();
      }
      for (let n = 0; n < 32; ++n) {
        const path = `${scratch}/command.${commandSerial + 1}`;
        if (!fs.existsSync(path)) break;
        const message = fs.readFileSync(path, "utf8"); fs.unlinkSync(path); ++commandSerial;
        const newline = message.indexOf("\n"), command = newline < 0 ? message : message.slice(0, newline), body = newline < 0 ? "" : message.slice(newline + 1);
        if (command === "answer") settings.respond(body);
        else if (command === "cancel") settings.respond(null);
        else if (command === "interrupt") void interrupt();
        else if (command === "settings") { settings.home(); }
        else if (command === "select") enqueue(() => settings.select(body));
        else if (command === "prompt" || command === "replace") enqueue(() => prompt(body, command === "replace"));
        else if (command === "resume") {
          if (!settings.selection.model) atomic("show-settings", "1");
          else if (!lastPrompt.trim()) atomic("show-prompt", "1");
          else enqueue(() => prompt(`Continue the current task: ${lastPrompt}\nI used manual controls; inspect the current screenshot before acting.`, false, true));
        }
      }
      await wait(33);
    }
  } finally {
    stop("World closed"); await closeAgent();
    fs.writeFileSync(`${scratch}/stop`, "1");
    for (const { child } of processes) if (child !== game) child.kill("SIGTERM");
    const force = setTimeout(() => { for (const { child } of processes) child.kill("SIGKILL"); }, 5000);
    await Promise.all(processes.map(({ closed }) => closed)); clearTimeout(force);
    for (const name of ["inputs.log", "view.rgba"]) if (fs.existsSync(`${scratch}/${name}`)) fs.renameSync(`${scratch}/${name}`, `${run}/${name}`);
    for (const name of ["agent.json", "conversation.jsonl", "usage.json", "last-prompt.txt", "draft.txt", "ui.conf"]) {
      if (fs.existsSync(`${settingsDirectory}/${name}`)) fs.copyFileSync(`${settingsDirectory}/${name}`, `${run}/${name}`);
    }
    fs.writeFileSync(`${run}/result.txt`, reason + "\n");
    fs.rmSync(scratch, { recursive: true, force: true });
    console.log(`${reason}\nWorld and agent settings saved. History: ${run}`);
  }
}
