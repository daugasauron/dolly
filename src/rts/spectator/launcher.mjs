// SPDX-License-Identifier: GPL-2.0-or-later
import { pick } from "./picker.mjs";
export const demoMatch = "/usr/share/dolly/rts/rts-high-vs-xhigh";

export function modelLabel(model) {
  const price = model.provider === "codex-local" ? "subscription" :
    `$${model.cost.input}/$${model.cost.output} per M input/output tokens`;
  return `${model.id} [${model.input.includes("image") ? "vision" : "text only"}]${model.reasoning ? " [reasoning]" : ""} — ${price}`;
}

export { relayProvider } from "./relay.mjs";
import { importRelay } from "./relay.mjs";

export { ask } from "./prompt.mjs";
import { ask } from "./prompt.mjs";

export async function launcher() {
  const fs = globalThis.__janisBuiltin("fs");
  const { spawn } = globalThis.__janisBuiltin("child_process");
  const directory = process.env.PI_CODING_AGENT_DIR || `${process.env.HOME}/.pi/agent`;
  const run = (command, args) => new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject); child.on("close", code => resolve(code));
  });
  let runtime;
  const models = async () => {
    if (!runtime) {
      console.log("Loading Pi model catalog…");
      const { ModelRuntime } = await import(`${process.env.PI_PACKAGE_DIR}/dist/core/model-runtime.js`);
      runtime = await ModelRuntime.create({ allowModelNetwork: false });
      if (runtime.getError()) throw Error(runtime.getError());
    }
    return runtime;
  };
  const refresh = async provider => {
    console.log(`Refreshing ${provider} catalog…`);
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const result = await (await models()).refresh({ providers: [provider], allowNetwork: true, force: true, signal: controller.signal });
      if (result.aborted || result.errors.size) throw Error("refresh failed");
      console.log("Catalog refreshed. Credentials are checked by the provider when a match starts.");
    } catch { console.log("Catalog refresh unavailable; showing Pi's cached catalog. Check connectivity before starting a paid match."); }
    finally { clearTimeout(timeout); }
  };
  const choose = async player => {
    const registry = await models();
    const providers = ["openrouter", "codex-local"].filter(id => registry.hasConfiguredAuth(id));
    if (!providers.length) throw Error("Set up OpenRouter or import a local Codex relay first (menu 3 or 4).");
    for (;;) {
      const chosenProvider = await pick(`Player ${player} provider`, providers.map(id => ({ value: id,
        label: id === "openrouter" ? "OpenRouter" : "Local Codex",
        description: id === "openrouter" ? "API key · pay per token" : "Loopback relay · subscription" })));
      if (!chosenProvider) return;
      const provider = chosenProvider.value;
      const all = registry.getModels(provider);
      const playable = all.filter(model => model.input.includes("image")).sort((a, b) => a.id.localeCompare(b.id));
      const chosenModel = await pick(`Player ${player} model · ${provider}`, playable.map(model => ({
        value: model.id, label: model.id, search: `${model.id} ${model.name}`, model,
        description: `vision${model.reasoning ? " · reasoning" : ""}`, detail: modelLabel(model),
      })), `${playable.length} vision models · ${all.length - playable.length} text-only models hidden`);
      if (!chosenModel) continue;
      const model = chosenModel.model;
      let suffix = "";
      if (model.reasoning) {
        const levels = ["off", "minimal", "low", "medium", "high", "xhigh", "max"]
          .filter(level => model.thinkingLevelMap ? model.thinkingLevelMap[level] != null : ["off", "minimal", "low", "medium", "high"].includes(level));
        if (levels.length) {
          const effort = await ask(`Thinking (${levels.join("/")})`, { fallback: levels.includes("medium") ? "medium" : levels[0] });
          if (!levels.includes(effort)) throw Error("Select a listed thinking level");
          suffix = `:${effort}`;
        }
      }
      console.log(`Player ${player}: ${provider}::${model.id}${suffix}`);
      return `${provider}::${model.id}${suffix}`;
    }
  };
  console.log("\x1b[33mDOLLY / RTS ARENA\x1b[0m\nTwo Pi agents, separate views, continuous game animation and recorded thinking/tool traces.");
  for (;;) {
    console.log("\n1  Watch included replay — Astra high vs xhigh (offline, no account needed)\n2  New match\n3  OpenRouter API key / refresh catalog\n4  Import local Codex relay\n5  Shell");
    try {
      const option = await ask("Choose", { fallback: "1" });
      if (option === "5") return;
      if (option === "1") { await run("rts-arena", ["--replay", demoMatch]); continue; }
      if (option === "3") {
        console.log("Create a key at https://openrouter.ai/settings/keys. Input is hidden; it stays in Pi's in-sandbox auth.json.");
        const registry = await models();
        const key = await ask("API key (empty keeps existing key)", { secret: true });
        if (key) {
          await registry.login("openrouter", "api_key", { prompt: async () => key, notify: () => {} });
          console.log("Saved in Pi's credential store. Save your Dolly session to retain it across reloads.");
        }
        await refresh("openrouter");
      } else if (option === "4") {
        console.log("Local testing only. On your PC, in the Dolly repo:\n  codex login\n  node scripts/codex-relay.mjs 9002 http://localhost:9001\nKeep the relay running. Choose the private models.json path it prints.\nDo NOT upload ~/.codex/auth.json. The relay capability will live in this sandbox.");
        if (await ask("Open file picker? y/n", { fallback: "y" }) !== "y") continue;
        if (await importRelay(fs, run, directory)) {
          runtime = undefined;
          await models();
          console.log("Local Codex models imported. A stopped relay or expired native login must be restarted/refreshed on your PC.");
        }
      } else if (option === "2") {
        const first = await choose(1);
        if (!first) continue;
        const second = await choose(2);
        if (!second) continue;
        const seconds = await ask("Match seconds (10..3600)", { fallback: "600" });
        const dollars = await ask("Reported USD limit", { fallback: "1" });
        if (!Number.isInteger(Number(seconds)) || Number(seconds) < 10 || Number(seconds) > 3600 ||
            !Number.isFinite(Number(dollars)) || Number(dollars) <= 0) throw Error("Invalid duration or cost limit");
        console.log(`\n${first}\nvs ${second}\n${seconds}s / $${dollars} reported-cost limit. In-flight calls can exceed it; subscriptions report $0.\nGame animation continues during model responses. Escape stops the match. Histories stay in /workspace/rts-matches.`);
        if (await ask("Start model calls? y/n", { fallback: "n" }) === "y")
          await run("rts-arena", [first, second, seconds, dollars]);
      }
    } catch (error) { console.log(`rts-arena: ${error.message}`); if (["Cancelled", "Input closed"].includes(error.message)) return; }
  }
}
