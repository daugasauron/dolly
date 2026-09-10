// SPDX-License-Identifier: GPL-2.0-or-later
import { pick } from "../../rts/spectator/picker.mjs";
import { ask } from "../../rts/spectator/prompt.mjs";
import { checkKey, signIn, efforts, validateTask, openRouterJSON, visionModels } from "./auth.mjs";

export async function launcher() {
  const fs = globalThis.__janisBuiltin("fs"), { spawn } = globalThis.__janisBuiltin("child_process");
  console.log("\x1b[2J\x1b[H\x1b[36mCLASSICUBE / AGENT WORLD\x1b[0m\nGive an agent a task. Watch it explore and build in your world.\n");
  const { ModelRuntime } = await import(`${process.env.PI_PACKAGE_DIR}/dist/core/model-runtime.js`);
  const registry = await ModelRuntime.create({ allowModelNetwork: false });
  const authPath = `${process.env.PI_CODING_AGENT_DIR || `${process.env.HOME}/.pi/agent`}/auth.json`;
  let authenticated = false;
  while (true) {
    try {
      if (!authenticated) {
        const stored = fs.existsSync(authPath) ? JSON.parse(fs.readFileSync(authPath, "utf8")).openrouter : undefined;
        const choices = [
          ...(stored ? [{ value: "saved", label: "Continue with saved OpenRouter sign-in" }] : []),
          { value: "oauth", label: "Sign in with OpenRouter", description: "Open the sign-in link, then paste the authorization code" },
          { value: "key", label: "Use an OpenRouter API key", description: "Hidden input" },
          { value: "exit", label: "Exit to shell" },
        ];
        const choice = await pick("1 / Connect to OpenRouter", choices, "Model calls begin only when you start a task.");
        if (!choice || choice.value === "exit") return;
        let key = choice.value === "saved" ? stored.key ?? stored.access : choice.value === "oauth"
          ? await signIn(ask) : await ask("OpenRouter API key", { secret: true });
        console.log("Checking OpenRouter sign-in…");
        await checkKey(key);
        await registry.login("openrouter", "api_key", { prompt: async () => key, notify: () => {} });
        key = undefined; authenticated = true;
        console.log("Connected. Refreshing the model catalog…");
        try {
          const catalog = visionModels((await openRouterJSON("models")).data, registry.getModels("openrouter"));
          if (!catalog.length) throw Error("Empty vision catalog");
          const modelsPath = authPath.replace(/auth\.json$/, "models.json");
          const settings = fs.existsSync(modelsPath) ? JSON.parse(fs.readFileSync(modelsPath, "utf8")) : {};
          settings.providers = { ...settings.providers, openrouter: {
            api: "openai-completions", baseUrl: "https://openrouter.ai/api/v1", models: catalog,
          } };
          fs.writeFileSync(`${modelsPath}.tmp`, JSON.stringify(settings)); fs.renameSync(`${modelsPath}.tmp`, modelsPath);
          await registry.refresh({ providers: ["openrouter"], allowNetwork: false });
        } catch { console.log("Live catalog unavailable; using cached vision models."); }
      }
      const models = registry.getModels("openrouter").filter(model => model.input.includes("image"));
      const providers = [...new Set(models.map(model => model.id.split("/")[0]))].sort();
      const provider = await pick("2 / Model provider", providers.map(value => ({ value, label: value,
        description: `${models.filter(model => model.id.startsWith(value + "/")).length} vision models` })), "All models run through your OpenRouter account.");
      if (!provider) { authenticated = false; continue; }
      const chosen = await pick("3 / Vision model", models.filter(model => model.id.startsWith(provider.value + "/"))
        .sort((a, b) => a.id.localeCompare(b.id)).map(model => ({ value: model.id, label: model.id, model,
          search: `${model.id} ${model.name}`, description: model.reasoning ? "vision · reasoning" : "vision",
          detail: `$${model.cost.input} input / $${model.cost.output} output per million tokens` })));
      if (!chosen) continue;
      const effort = await pick("4 / Reasoning effort", efforts(chosen.model).map(value => ({ value, label: value })),
        chosen.model.reasoning ? "Reasoning is displayed when the selected model exposes it." : "This model does not support reasoning effort.");
      if (!effort) continue;
      console.log("\n5 / What should the agent do?\nYour world is saved when a run stops; the next task continues in it.");
      const config = validateTask({ model: chosen.value, effort: effort.value,
        prompt: await ask("Task"), seconds: Number(await ask("Time limit, seconds", { fallback: "600" })),
        budget: Number(await ask("Reported cost limit, USD", { fallback: "1" })) });
      const start = await pick("Ready to enter the world", [
        { value: "start", label: "Start agent", description: `${config.model} · ${config.effort} · ${config.seconds}s · $${config.budget}` },
        { value: "back", label: "Change task" },
      ], config.prompt);
      if (start?.value !== "start") continue;
      const temporary = fs.mkdtempSync("/tmp/classicube-task-");
      try {
        const filename = `${temporary}/task.json`; fs.writeFileSync(filename, JSON.stringify(config));
        await new Promise((resolve, reject) => {
          const child = spawn("classicube-agent", [filename], { stdio: "inherit" });
          child.once("error", reject); child.once("close", resolve);
        });
      } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
      const next = await pick("Run finished", [{ value: "new", label: "Give the agent another task" },
        { value: "logout", label: "Disconnect OpenRouter" }, { value: "exit", label: "Exit to shell" }]);
      if (!next || next.value === "exit") return;
      if (next.value === "logout") { await registry.logout("openrouter"); authenticated = false; }
    } catch (error) {
      console.log(`\n${String(error.message).replace(/sk-or-v1-[A-Za-z0-9_-]+/g, "[redacted]")}`);
      if (["Cancelled", "Input closed"].includes(error.message)) return;
      await ask("Press Enter to continue");
    }
  }
}
