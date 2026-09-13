// SPDX-License-Identifier: GPL-2.0-or-later
import { pick } from "./picker.mjs";
import { ask } from "./prompt.mjs";
import { importRelay } from "./relay.mjs";
export { ask } from "./prompt.mjs";
export { relayProvider } from "./relay.mjs";
export const demoMatch = "/usr/share/dolly/rts/rts-high-vs-xhigh";

export function modelLabel(model) {
  const price = model.provider === "codex-local" ? "subscription" :
    `$${model.cost.input}/$${model.cost.output} per M input/output tokens`;
  return `${model.id} [${model.input.includes("image") ? "vision" : "text only"}]${model.reasoning ? " [reasoning]" : ""} — ${price}`;
}

const providerName = provider => provider === "openrouter" ? "OpenRouter" : "Local Codex";
const playerLabel = player => player ? `${providerName(player.provider)} · ${player.model} · ${player.effort}` : "Choose provider, model and effort";
const selector = player => `${player.provider}::${player.model}:${player.effort}`;

export async function launcher() {
  const fs = globalThis.__janisBuiltin("fs");
  const { spawn } = globalThis.__janisBuiltin("child_process");
  const directory = process.env.PI_CODING_AGENT_DIR || `${process.env.HOME}/.pi/agent`;
  const run = (command, args) => new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject); child.on("close", code => resolve(code));
  });
  let runtime, notice = "Two agents, separate views, continuous game animation and recorded reasoning traces.";
  const match = { players: [undefined, undefined], seconds: "600", dollars: "1" };
  const models = async () => {
    if (!runtime) {
      console.log("Loading model catalog…");
      const { ModelRuntime } = await import(`${process.env.PI_PACKAGE_DIR}/dist/core/model-runtime.js`);
      runtime = await ModelRuntime.create({ allowModelNetwork: false });
      if (runtime.getError()) throw Error(runtime.getError());
    }
    return runtime;
  };
  const refresh = async () => {
    console.log("Refreshing OpenRouter models…");
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const result = await (await models()).refresh({ providers: ["openrouter"], allowNetwork: true, force: true, signal: controller.signal });
      if (result.aborted || result.errors.size) throw Error("refresh failed");
      return "Model catalog refreshed.";
    } catch { return "Using the cached model catalog; refresh was unavailable."; }
    finally { clearTimeout(timeout); }
  };
  const connect = async provider => {
    if (provider === "openrouter") {
      const registry = await models();
      const key = await ask("OpenRouter API key", { secret: true,
        note: "Create a key at https://openrouter.ai/settings/keys.\n" +
          (registry.hasConfiguredAuth(provider) ? "Enter keeps your saved key. " : "") + "Characters are masked as you type or paste.",
        validate: value => !value && registry.hasConfiguredAuth(provider) ? "" :
          /^sk-or-v1-[A-Za-z0-9_-]{1,512}$/.test(value) ? "" : "Paste an OpenRouter key beginning sk-or-v1-, or press Esc to go back.",
      });
      if (key === undefined) return false;
      if (key) await registry.login(provider, "api_key", { prompt: async () => key, notify: () => {} });
      notice = `OpenRouter key saved. ${await refresh()}\nSave your Dolly session to retain credentials across reloads.`;
    } else {
      const action = await pick("Connect local Codex", [
        { value: "upload", label: "Choose models.json", description: "Import the file printed by your running Codex proxy" },
        { value: "back", label: "Back" },
      ], "On your computer: codex login, then start scripts/codex-relay.mjs.\n" +
        "Pass your Dolly page's origin (the address before /rts-arena/) to the proxy.\n" +
        "Keep the proxy running. Choose its models.json; keep native auth.json on your computer.");
      if (action?.value !== "upload" || !await importRelay(fs, run, directory)) return false;
      runtime = undefined; await models();
      notice = "Local Codex configuration imported. Keep the proxy running while agents play.";
    }
    return true;
  };
  const choose = async (player, previous) => {
    let selectedProvider = previous?.provider, selectedModel = previous?.model;
    for (;;) {
      const registry = await models();
      const chosenProvider = await pick(`Player ${player} provider`, ["openrouter", "codex-local"].map(id => ({
        value: id, label: providerName(id),
        description: registry.hasConfiguredAuth(id) ? "Configured" : "Set up this provider next",
      })), "Choose an account for this player. You can connect it here.", selectedProvider);
      if (!chosenProvider) return;
      selectedProvider = chosenProvider.value;
      if (!registry.hasConfiguredAuth(selectedProvider) && !await connect(selectedProvider)) continue;
      const all = (await models()).getModels(selectedProvider);
      const playable = all.filter(model => model.input.includes("image")).sort((a, b) => a.id.localeCompare(b.id));
      for (;;) {
        const chosenModel = await pick(`Player ${player} model · ${providerName(selectedProvider)}`, playable.map(model => ({
          value: model.id, label: model.id, search: `${model.id} ${model.name}`, model,
          description: `vision${model.reasoning ? " · reasoning" : ""}`, detail: modelLabel(model),
        })), `${playable.length} vision models · ${all.length - playable.length} text-only models hidden`, selectedModel);
        if (!chosenModel) break;
        selectedModel = chosenModel.value;
        const { getSupportedThinkingLevels } = await import("/usr/lib/node_modules/@earendil-works/pi-ai/dist/models.js");
        const levels = getSupportedThinkingLevels(chosenModel.model);
        const descriptions = { off: "No reasoning", minimal: "Least reasoning", low: "Less reasoning", medium: "Balanced", high: "More reasoning", xhigh: "Extra reasoning", max: "Maximum reasoning" };
        const initial = levels.includes(previous?.effort) ? previous.effort : levels.includes("medium") ? "medium" : levels[0];
        const effort = levels.length === 1 ? { value: levels[0] } : await pick(`Player ${player} reasoning effort`,
          levels.map(value => ({ value, label: value, description: descriptions[value] })),
          `${selectedModel}\nOnly supported levels are shown. More reasoning can make turns slower and cost more.`, initial);
        if (!effort) continue;
        return { provider: selectedProvider, model: selectedModel, effort: effort.value };
      }
    }
  };
  const setup = async () => {
    let selected = "player1", message = "Edit either player or the match limits. Model calls begin only when you select Start match.";
    for (;;) {
      const action = await pick("New match", [
        { value: "player1", label: "Player 1", description: playerLabel(match.players[0]), detail: playerLabel(match.players[0]) },
        { value: "player2", label: "Player 2", description: playerLabel(match.players[1]), detail: playerLabel(match.players[1]) },
        { value: "seconds", label: "Duration", description: `${match.seconds} seconds` },
        { value: "dollars", label: "Spending limit", description: `$${match.dollars} reported usage; subscriptions report $0` },
        { value: "start", label: "Start match", description: match.players.every(Boolean) ? "Begin agent calls with these settings" : "Choose both players first" },
        { value: "back", label: "Back", description: "Keep these choices and return to the menu" },
      ], message, selected);
      if (!action || action.value === "back") return;
      selected = action.value;
      if (selected === "player1" || selected === "player2") {
        const index = selected === "player1" ? 0 : 1;
        const player = await choose(index + 1, match.players[index]);
        if (player) {
          match.players[index] = player;
          selected = match.players.every(Boolean) ? "start" : index === 0 ? "player2" : "player1";
        }
      } else if (selected === "seconds" || selected === "dollars") {
        const duration = selected === "seconds";
        const value = await ask(duration ? "Match duration" : "Spending limit", { fallback: match[selected],
          note: duration ? "Seconds, from 10 to 3600. Escape also stops a running match." :
            "USD, based on reported model usage. In-flight calls can exceed the limit; subscriptions report $0.",
          validate: value => (duration ? Number.isInteger(Number(value)) && Number(value) >= 10 && Number(value) <= 3600 :
            Number.isFinite(Number(value)) && Number(value) > 0) ? "" : duration ? "Enter a whole number from 10 to 3600." : "Enter an amount greater than zero.",
        });
        if (value !== undefined) match[selected] = value;
      } else if (selected === "start") {
        if (!match.players.every(Boolean)) { message = "Choose a provider and model for both players before starting."; continue; }
        await run("rts-arena", [...match.players.map(selector), match.seconds, match.dollars]);
        notice = "Match ended. Recordings are in /workspace/rts-matches. Your setup choices are ready for another match.";
        return;
      }
    }
  };
  for (;;) {
    try {
      const option = await pick("DOLLY / RTS ARENA", [
        { value: "replay", label: "Watch included replay", description: "Astra high vs xhigh · offline, no account needed" },
        { value: "match", label: "New match", description: "Choose two agents and review their settings" },
        { value: "openrouter", label: "OpenRouter", description: runtime?.hasConfiguredAuth("openrouter") ? "Key saved · replace key or refresh models" : "Connect with an API key" },
        { value: "codex-local", label: "Local Codex", description: runtime?.hasConfiguredAuth("codex-local") ? "Configuration imported · replace proxy settings" : "Use your subscription through a local proxy" },
        { value: "shell", label: "Shell", description: "Return to Dolly's command line" },
      ], notice);
      if (!option || option.value === "shell") return;
      if (option.value === "replay") await run("rts-arena", ["--replay", demoMatch]);
      else if (option.value === "match") await setup();
      else await connect(option.value);
    } catch (error) {
      if (error.message === "Input closed") return;
      notice = `Setup error: ${error.message.replace(/sk-or-v1-[\w-]+/g, "[redacted]")}`;
    }
  }
}
