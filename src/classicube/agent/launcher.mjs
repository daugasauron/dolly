// SPDX-License-Identifier: GPL-2.0-or-later
import { pick } from "../../rts/spectator/picker.mjs";
import { ask } from "../../rts/spectator/prompt.mjs";
import { importRelay } from "../../rts/spectator/relay.mjs";
import { checkKey, signIn, efforts, validateTask, openRouterJSON, visionModels } from "./auth.mjs";

export async function launcher() {
  const fs = globalThis.__janisBuiltin("fs"), { spawn } = globalThis.__janisBuiltin("child_process");
  const run = (command, args) => new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", reject); child.once("close", resolve);
  });
  console.log("\x1b[2J\x1b[H\x1b[36mCLASSICUBE / AGENT WORLD\x1b[0m\nGive an agent a task. Watch it explore and build in your world.\n");
  const { ModelRuntime } = await import(`${process.env.PI_PACKAGE_DIR}/dist/core/model-runtime.js`);
  let registry = await ModelRuntime.create({ allowModelNetwork: false });
  const directory = process.env.PI_CODING_AGENT_DIR || `${process.env.HOME}/.pi/agent`;
  const authPath = `${directory}/auth.json`, modelsPath = `${directory}/models.json`;
  let connection;
  while (true) {
    try {
      if (!connection) {
        const stored = fs.existsSync(authPath) ? JSON.parse(fs.readFileSync(authPath, "utf8")).openrouter : undefined;
        const choices = [
          ...(stored ? [{ value: "saved", label: "Continue with saved OpenRouter sign-in" }] : []),
          ...(registry.hasConfiguredAuth("codex-local") ? [{ value: "relay-saved", label: "Continue with local Codex proxy" }] : []),
          { value: "oauth", label: "Sign in with OpenRouter", description: "Open the sign-in link, then paste the authorization code" },
          { value: "key", label: "Use an OpenRouter API key", description: "Hidden input" },
          { value: "relay", label: "Development: local Codex proxy", description: "Use your subscription through a loopback relay" },
          { value: "exit", label: "Exit to shell" },
        ];
        const choice = await pick("1 / Connect an agent", choices, "Model calls begin only when you start a task.");
        if (!choice || choice.value === "exit") return;
        if (choice.value.startsWith("relay")) {
          if (choice.value === "relay") {
            console.log("\nOn your computer, start the proxy with this page's exact origin, for example:\n" +
              "  node scripts/codex-relay.mjs 9092 http://127.0.0.1:9091\n" +
              "It uses your existing codex login. Keep it running and select the private models.json it prints.\n" +
              "Import that proxy configuration; keep native ~/.codex/auth.json on your computer.");
            if (!await importRelay(fs, run, directory)) continue;
            registry = await ModelRuntime.create({ allowModelNetwork: false });
          }
          connection = "codex-local";
        } else {
          let key = choice.value === "saved" ? stored.key ?? stored.access : choice.value === "oauth"
            ? await signIn(ask) : await ask("OpenRouter API key", { secret: true });
          console.log("Checking OpenRouter sign-in…");
          await checkKey(key);
          await registry.login("openrouter", "api_key", { prompt: async () => key, notify: () => {} });
          key = undefined; connection = "openrouter";
          console.log("Connected. Refreshing the model catalog…");
          try {
            const catalog = visionModels((await openRouterJSON("models")).data, registry.getModels("openrouter"));
            if (!catalog.length) throw Error("Empty vision catalog");
            const settings = fs.existsSync(modelsPath) ? JSON.parse(fs.readFileSync(modelsPath, "utf8")) : {};
            settings.providers = { ...settings.providers, openrouter: {
              api: "openai-completions", baseUrl: "https://openrouter.ai/api/v1", models: catalog,
            } };
            fs.writeFileSync(`${modelsPath}.tmp`, JSON.stringify(settings)); fs.renameSync(`${modelsPath}.tmp`, modelsPath);
            await registry.refresh({ providers: ["openrouter"], allowNetwork: false });
          } catch { console.log("Live catalog unavailable; using cached vision models."); }
        }
      }
      const subscription = connection === "codex-local";
      const models = registry.getModels(connection).filter(model => model.input.includes("image"));
      if (!models.length) { connection = undefined; throw Error("No vision models available. Reconnect the provider."); }
      const providers = subscription ? ["codex-local"] : [...new Set(models.map(model => model.id.split("/")[0]))].sort();
      const provider = await pick("2 / Model provider", providers.map(value => ({ value, label: subscription ? "Local Codex" : value,
        description: subscription ? "Subscription · local proxy" : `${models.filter(model => model.id.startsWith(value + "/")).length} vision models` })),
        subscription ? "Uses your Codex subscription allowance. The time limit still applies." : "All models run through your OpenRouter account.");
      if (!provider) { connection = undefined; continue; }
      const chosen = await pick("3 / Vision model", models.filter(model => subscription || model.id.startsWith(provider.value + "/"))
        .sort((a, b) => a.id.localeCompare(b.id)).map(model => ({ value: model.id, label: model.id, model,
          search: `${model.id} ${model.name}`, description: model.reasoning ? "vision · reasoning" : "vision",
          detail: subscription ? "Codex subscription" : `$${model.cost.input} input / $${model.cost.output} output per million tokens` })));
      if (!chosen) continue;
      const effort = await pick("4 / Reasoning effort", efforts(chosen.model).map(value => ({ value, label: value })),
        chosen.model.reasoning ? "Reasoning is displayed when the selected model exposes it." : "This model does not support reasoning effort.");
      if (!effort) continue;
      console.log("\n5 / What should the agent do?\nYour world is saved when a run stops; the next task continues in it.");
      const config = validateTask({ provider: connection, model: chosen.value, effort: effort.value,
        prompt: await ask("Task"), seconds: Number(await ask("Time limit, seconds", { fallback: "600" })),
        budget: subscription ? 0 : Number(await ask("Reported cost limit, USD", { fallback: "1" })) });
      const start = await pick("Ready to enter the world", [
        { value: "start", label: "Start agent", description: `${config.model} · ${config.effort} · ${config.seconds}s · ${subscription ? "subscription" : `$${config.budget}`}` },
        { value: "back", label: "Change task" },
      ], config.prompt);
      if (start?.value !== "start") continue;
      const temporary = fs.mkdtempSync("/tmp/classicube-task-");
      try {
        const filename = `${temporary}/task.json`; fs.writeFileSync(filename, JSON.stringify(config));
        await run("classicube-agent", [filename]);
      } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
      const next = await pick("Run finished", [{ value: "new", label: "Give the agent another task" },
        { value: "logout", label: subscription ? "Disconnect local proxy" : "Disconnect OpenRouter" }, { value: "exit", label: "Exit to shell" }]);
      if (!next || next.value === "exit") return;
      if (next.value === "logout") {
        if (subscription) {
          const settings = JSON.parse(fs.readFileSync(modelsPath, "utf8"));
          delete settings.providers["codex-local"];
          fs.writeFileSync(`${modelsPath}.tmp`, JSON.stringify(settings)); fs.renameSync(`${modelsPath}.tmp`, modelsPath);
          registry = await ModelRuntime.create({ allowModelNetwork: false });
        } else await registry.logout("openrouter");
        connection = undefined;
      }
    } catch (error) {
      console.log(`\n${String(error.message).replace(/sk-or-v1-[A-Za-z0-9_-]+/g, "[redacted]")}`);
      if (["Cancelled", "Input closed"].includes(error.message)) return;
      await ask("Press Enter to continue");
    }
  }
}
