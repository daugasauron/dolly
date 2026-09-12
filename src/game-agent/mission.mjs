// Pi supervision and all application state stay inside Dolly. SPDX-License-Identifier: GPL-2.0-or-later
import { createSettings, writeAtomic } from "./settings.mjs";
import { traceText } from "../rts/spectator/trace.mjs";
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function runAgent({ fs, spawn, world, run, scratch, directory: settingsDirectory, args = [], env = {}, app }) {
  const atomic = (name, data) => writeAtomic(fs, `${scratch}/${name}`, data);
  const saved = name => fs.existsSync(`${settingsDirectory}/${name}`) ? fs.readFileSync(`${settingsDirectory}/${name}`, "utf8") : "";
  let usage = { reportedUSD: 0, tokens: 0 };
  try { usage = JSON.parse(saved("usage.json")) || usage; } catch {}
  usage = { reportedUSD: Number.isFinite(usage.reportedUSD) ? usage.reportedUSD : 0, tokens: Number.isFinite(usage.tokens) ? usage.tokens : 0 };
  let stopped = false, reason = "World closed", agent, starting, interrupting, closing;
  let busy = false, state = "Your controls", trace = saved("activity.txt"), lastPrompt = saved("last-prompt.txt");
  let failure = "", waitingSince = 0, waitingSecond = 0;
  const idlePrompt = saved("idle-prompt.txt").trim() || app.idlePrompt;
  writeAtomic(fs, `${settingsDirectory}/idle-prompt.txt`, idlePrompt);
  let idleAt = 0, pendingOperations = 0;
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
    atomic("status.txt", failure && !busy ? "Agent error · Retry task or open Settings" : owner === 1 ? "Your controls · Agent paused" : owner === 0 ? "Agent paused" : state);
    atomic("retry", failure && !busy && lastPrompt.trim() ? "1" : "");
    const subscription = settings.selection.provider === "codex-local";
    atomic("cost.txt", `$${Number(usage.reportedUSD).toFixed(4)} reported${subscription ? " · Codex subscription" : ""}`);
  };
  const record = (type, fields = {}) => {
    const event = JSON.parse(JSON.stringify({ time: Date.now(), type, ...fields }).replace(/sk-or-v1-[\w-]+/g, "[redacted]"));
    fs.appendFileSync(`${run}/agent.events.jsonl`, JSON.stringify(event) + "\n");
    const actions = event.args?.actions;
    const text = type === "tool" && app.toolText ? `\n[${event.name}] ${app.toolText(event.name, event.args)}\n` : type === "tool" && Array.isArray(actions) ? `\n[game_input] ${actions.length ? actions.map(a =>
      a.type === "look" ? `look (${a.dx || 0}, ${a.dy || 0})` : a.type === "key" ? `${a.key} ${a.milliseconds || 0} ms` :
      a.type === "click" ? `${a.button || "left"} click` : a.type === "text" ? `type ${JSON.stringify(a.text)}` : a.type).join("; ") : "observe"}\n` :
      type === "tool_result" && !event.isError ? "" : type === "prompt" ? `\n[${event.source === "idle" ? "idle" : "user"}] ${event.text}\n` : type === "configuration" ? `\n[model] ${event.provider} / ${event.model} / ${event.effort}\n` : type === "interrupt" ? "\n[interrupted]\n" : type === "retry_end" ? `\n[${event.success ? "Provider reconnected" : event.cancelled ? "Retry cancelled" : "Automatic retries stopped · Retry task to continue"}]\n` : type === "usage" ? "" : traceText(event);
    if (text) {
      trace = (trace + text).slice(-64000); atomic("activity.txt", trace);
      writeAtomic(fs, `${settingsDirectory}/activity.txt`, trace);
    }
  };
  const stop = message => { if (!stopped) { stopped = true; reason = message; observation?.abort(); settings.respond(null); } };
  const fault = error => { failure = error.message; waitingSince = idleAt = 0; record("provider_error", { message: failure }); status("Provider error"); };
  const runCommand = (command, args) => new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "inherit", "inherit"] });
    child.once("error", reject); child.once("close", resolve);
  });
  const settings = createSettings(fs, scratch, runCommand, async () => { await closeAgent(); failure = ""; status("Settings saved · Enter to give an instruction"); }, settingsDirectory);
  function launch(command, args, options) {
    const child = spawn(command, args, options);
    const closed = new Promise(resolve => child.once("close", code => { stop(`${command} exited (${code})`); resolve(); }));
    child.on("error", error => { fault(error); stop(error.message); }); processes.push({ child, closed }); return child;
  }
  function event(message) {
    if (message.type === "turn_start") {
      waitingSince = Date.now(); waitingSecond = 0; status("Waiting for provider · 0 s");
    } else if (message.type === "message_update") {
      const update = message.assistantMessageEvent;
      if (["thinking_delta", "text_delta", "toolcall_delta"].includes(update?.type)) waitingSince = 0;
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
      waitingSince = 0;
      if (message.message?.stopReason === "error" || message.errorMessage) {
        if (!interrupting) fault(Error(message.message?.errorMessage ?? message.errorMessage));
      }
      else if (message.message?.stopReason !== "aborted") failure = "";
    } else if (message.type === "agent_settled") {
      busy = false; waitingSince = 0; record("settled");
      idleAt = !failure && !interrupting && !closing && !stopped && control().owner === 2 ? Date.now() + 5000 : 0;
      status(idleAt ? `${app.idleStatus || "Exploring again shortly"} · Enter to steer` : "Interrupted · Enter to give another instruction");
    } else if (message.type === "auto_retry_start") {
      busy = true; record("retry", { attempt: message.attempt, maxAttempts: message.maxAttempts, delayMs: message.delayMs, message: message.errorMessage });
      status(`Retrying ${message.attempt}/${message.maxAttempts} in ${Math.ceil(message.delayMs / 1000)} s`);
    } else if (message.type === "auto_retry_end") {
      const cancelled = Boolean(interrupting && message.finalError === "Retry cancelled");
      record("retry_end", { success: message.success, cancelled, attempt: message.attempt, message: message.finalError });
      if (message.success || cancelled) failure = "";
      else if (message.finalError && failure !== message.finalError) fault(Error(message.finalError));
    }
  }
  async function terminate(current) {
    if (!current) return;
    if (agent === current) agent = undefined;
    current.child.kill("SIGTERM");
    const force = setTimeout(() => current.child.kill("SIGKILL"), 2000);
    await current.closed; clearTimeout(force);
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
        app.extension, "--no-context-files", "--no-skills", "--no-prompt-templates",
        "--tools", app.tools.join(","), "--system-prompt", fs.readFileSync(app.instructions, "utf8")],
      { env: { ...process.env, ...app.agentEnvironment(scratch, run) }, stdio: ["pipe", "pipe", stderr] });
      fs.closeSync(stderr);
      let buffer = "";
      const current = { child, rpc(type, fields = {}, timeoutMs = 30000) {
        return new Promise((resolve, reject) => {
          const id = `game-${++serial}`;
          const timer = setTimeout(() => {
            pending.delete(id); void terminate(current).then(() => reject(Error(`Pi ${type} timed out`)), reject);
          }, timeoutMs);
          pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
          child.stdin.write(JSON.stringify({ id, type, ...fields }) + "\n");
        });
      } };
      current.closed = new Promise(resolve => child.once("close", code => {
        for (const request of pending.values()) request.reject(Error("Agent stopped")); pending.clear();
        if (agent === current) { agent = undefined; busy = false; if (!closing && !stopped) fault(Error(`Agent exited (${code})`)); }
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
            } else if (agent === current) event(message);
          }
        } catch (error) { fault(error); }
      });
      // The first reply includes cold-loading Pi; concurrent players can take
      // longer than an RPC to an already running agent. Cancellation still kills it.
      const selected = await current.rpc("get_state", {}, 120000);
      if (selected.model?.provider !== config.provider || selected.model.id !== config.model || selected.thinkingLevel !== config.effort)
        throw Error("The selected provider, model or effort is unavailable. Open settings with Ctrl+,.");
      record("configuration", { ...config, thinking: selected.thinkingLevel });
      return current;
    })();
    try { return await starting; }
    catch (error) { await terminate(agent); throw error; }
    finally { starting = undefined; }
  }
  function interrupt() {
    observation?.abort(); waitingSince = idleAt = 0;
    if (interrupting) return interrupting;
    if (!agent) { busy = false; return Promise.resolve(); }
    record("interrupt"); status("Interrupted · Enter to give another instruction");
    interrupting = (async () => {
      try { await agent.rpc("clear_queue", {}, 3000); await agent?.rpc("abort", {}, 3000); }
      catch (error) { if (!closing && !stopped) fault(error); }
      busy = false; status();
    })().finally(() => { interrupting = undefined; });
    return interrupting;
  }
  async function closeAgent() {
    if (closing) return closing;
    closing = (async () => {
      await interrupt();
      if (starting) await starting.catch(() => {});
      await terminate(agent);
    })().finally(() => { closing = undefined; });
    return closing;
  }
  const input = app.connect(fs, scratch, 0x80000000);
  async function prompt(text, replace = false, resume = false, automatic = false) {
    if (!text.trim() || text.length > 65536 || stopped) return;
    if (replace) await interrupt(); else if (interrupting) await interrupting;
    idleAt = 0; failure = ""; status();
    if (!resume || !lastPrompt.trim()) { lastPrompt = text; writeAtomic(fs, `${settingsDirectory}/last-prompt.txt`, text); }
    record("prompt", { text, source: automatic ? "idle" : "user" });
    const generation = control().generation;
    const current = await ensureAgent();
    if (stopped || control().owner !== 2 || control().generation !== generation) return;
    if (busy) { await current.rpc("steer", { message: text }); status("Instruction queued for the agent"); return; }
    busy = true; status("Observing"); observation = new AbortController();
    try {
      const image = await input([], observation.signal);
      if (stopped || control().owner !== 2 || control().generation !== generation) return;
      record("observation", { frame: image.frame, milliseconds: image.milliseconds });
      waitingSince = Date.now(); waitingSecond = 0; status("Waiting for provider · 0 s");
      await current.rpc("prompt", { message: `${text}\n\n${app.describe(image)}`,
        images: [{ type: "image", mimeType: "image/png", data: Buffer.from(image.png).toString("base64") }] });
    } finally { observation = undefined; }
  }
  const enqueue = task => {
    ++pendingOperations;
    operation = operation.then(task).catch(error => { busy = false; if (!stopped) fault(error); }).finally(() => { --pendingOperations; });
  };
  atomic("activity.txt", trace); status();
  record("world_start");
  const gameLog = fs.openSync(`${run}/game.log`, "w");
  const game = launch(app.command, args,
    { cwd: world, env: { ...process.env, ...app.gameEnvironment(scratch, run), ...env }, stdio: ["ignore", gameLog, gameLog] });
  fs.closeSync(gameLog);
  try {
    while (!stopped) {
      if (fs.existsSync(`${scratch}/stop`)) { stop("Player stopped"); break; }
      const gate = control();
      if (waitingSince && state.startsWith("Waiting for provider") && Math.floor((Date.now() - waitingSince) / 1000) !== waitingSecond) {
        waitingSecond = Math.floor((Date.now() - waitingSince) / 1000); status(`Waiting for provider · ${waitingSecond} s`);
      }
      if (gate.generation !== observedGeneration) {
        observedGeneration = gate.generation;
        if (gate.owner !== 2) idleAt = 0;
        if (gate.owner !== 2 && busy) void interrupt();
        status();
      }
      for (let n = 0; n < 32; ++n) {
        const path = `${scratch}/command.${commandSerial + 1}`;
        if (!fs.existsSync(path)) break;
        const message = fs.readFileSync(path, "utf8"); fs.unlinkSync(path); ++commandSerial;
        const newline = message.indexOf("\n"), command = newline < 0 ? message : message.slice(0, newline), body = newline < 0 ? "" : message.slice(newline + 1);
        if (command === "review" && app.review) enqueue(async () => { await interrupt(); await app.review(fs, run, scratch, runCommand); });
        else if (command === "answer") settings.respond(body);
        else if (command === "cancel") settings.respond(null);
        else if (command === "interrupt") void interrupt();
        else if (command === "settings") { settings.home(); }
        else if (command === "select") enqueue(() => settings.select(body));
        else if (command === "prompt" || command === "replace") enqueue(() => prompt(body, command === "replace"));
        else if (command === "retry" && failure && !busy && lastPrompt.trim()) {
          failure = ""; status("Reconnecting provider");
          enqueue(async () => {
            await closeAgent();
            await prompt(`Continue the current task: ${lastPrompt}\nThe provider connection failed. Inspect the current screenshot and conversation before continuing; completed actions may already have changed the world.`, false, true);
          });
        }
        else if (command === "resume") {
          if (!settings.selection.model) atomic("show-settings", "1");
          else if (!lastPrompt.trim()) enqueue(() => prompt(idlePrompt, false, false, true));
          else enqueue(() => prompt(`Continue the current task: ${lastPrompt}\nI used manual controls; inspect the current screenshot before acting.`, false, true));
        }
      }
      if (idleAt && Date.now() >= idleAt && gate.owner === 2 && !busy && !failure && !pendingOperations && !starting && !interrupting && !closing) {
        idleAt = 0;
        enqueue(() => control().owner === 2 && control().generation === gate.generation && !stopped ? prompt(idlePrompt, false, true, true) : undefined);
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
    for (const name of ["agent.json", "conversation.jsonl", "usage.json", "last-prompt.txt", "idle-prompt.txt", "draft.txt", "ui.conf"]) {
      if (fs.existsSync(`${settingsDirectory}/${name}`)) fs.copyFileSync(`${settingsDirectory}/${name}`, `${run}/${name}`);
    }
    fs.writeFileSync(`${run}/result.txt`, reason + "\n");
    atomic("ended", reason);
    return reason;
  }
}
