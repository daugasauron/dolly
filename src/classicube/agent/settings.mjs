// SPDX-License-Identifier: GPL-2.0-or-later
import { checkKey, signIn, efforts, openRouterJSON, visionModels, validateSelection } from "./auth.mjs";
import { importRelay } from "../../rts/spectator/relay.mjs";
export const settingsDirectory = "/home/dolly/.config/classicube";
export const defaultSelection = { provider: "openrouter", model: "", effort: "low" };
export const writeAtomic = (fs, path, data) => { fs.writeFileSync(`${path}.tmp`, data); fs.renameSync(`${path}.tmp`, path); };

export function loadSelection(fs, profile = settingsDirectory) {
  const path = `${profile}/agent.json`;
  if (!fs.existsSync(path)) return { ...defaultSelection };
  return validateSelection(JSON.parse(fs.readFileSync(path, "utf8")));
}

export function createSettings(fs, scratch, run, changed, profile = settingsDirectory) {
  const directory = process.env.PI_CODING_AGENT_DIR || `${process.env.HOME}/.pi/agent`;
  const modelsPath = `${directory}/models.json`;
  let selection = { ...defaultSelection }, registry, answer, revision = 0;
  const clean = value => String(value ?? "").replace(/[\t\r\n]/g, " ");
  const menu = (title, rows, message = "Changes save automatically.", mode = "list") =>
    writeAtomic(fs, `${scratch}/menu`, [++revision, mode, clean(title), clean(message),
      ...rows.map(row => row.map(clean).join("\t"))].join("\n"));
  const selected = () => {
    writeAtomic(fs, `${scratch}/selection.txt`, `${selection.provider}\n${selection.model}\n${selection.effort}`);
  };
  try { selection = loadSelection(fs, profile); } catch { menu("Settings", [], "Saved settings are invalid. Choose a provider and model again."); }
  selected();
  const models = async (reload = false) => {
    if (!registry || reload) {
      const { ModelRuntime } = await import(`${process.env.PI_PACKAGE_DIR}/dist/core/model-runtime.js`);
      registry = await ModelRuntime.create({ allowModelNetwork: false });
      if (registry.getError()) throw Error(registry.getError());
    }
    return registry;
  };
  const save = async next => {
    selection = validateSelection(next);
    writeAtomic(fs, `${profile}/agent.json`, JSON.stringify(selection) + "\n");
    selected(); await changed(selection);
  };
  const providerName = () => selection.provider === "codex-local" ? "Codex (local proxy)" : "OpenRouter";
  const home = message => menu("Agent settings", [
    ["provider", "Provider", providerName()], ["model", "Model", selection.model || "Select a model"],
    ["effort", "Reasoning effort", selection.effort], ["connection", "Connection", providerName()],
  ], message, "settings");
  const providers = () => menu("Provider", [
    ["provider:openrouter", "OpenRouter", "Use an OpenRouter account or API key"],
    ["provider:codex-local", "Codex (local proxy)", "Use your Codex subscription through a local proxy"],
  ]);
  const ask = (title, { secret = false, message } = {}) => new Promise((resolve, reject) => {
    menu(title, [], message || "Enter submits · Escape cancels", secret ? "secret" : "input");
    answer = { resolve, reject };
  });
  const refresh = async () => {
    const runtime = await models();
    const catalog = visionModels((await openRouterJSON("models")).data, runtime.getModels("openrouter"));
    if (!catalog.length) throw Error("No vision models returned");
    const config = fs.existsSync(modelsPath) ? JSON.parse(fs.readFileSync(modelsPath, "utf8")) : {};
    config.providers = { ...config.providers, openrouter: { api: "openai-completions", baseUrl: "https://openrouter.ai/api/v1", models: catalog } };
    fs.mkdirSync(directory, { recursive: true }); writeAtomic(fs, modelsPath, JSON.stringify(config));
    await models(true);
  };
  async function select(key) {
    if (key === "home") return home();
    if (key === "provider") return providers();
    const runtime = await models();
    if (key.startsWith("provider:")) {
      const provider = key.slice(9);
      if (!["openrouter", "codex-local"].includes(provider)) throw Error("Choose an available provider");
      if (provider !== selection.provider) await save({ provider, model: "", effort: "low" });
      return runtime.hasConfiguredAuth(provider) ? home() : select("connection");
    }
    if (key === "connection") {
      const connected = runtime.hasConfiguredAuth(selection.provider);
      return menu(providerName(), selection.provider === "codex-local" ? [
        ["relay", connected ? "Replace proxy configuration" : "Connect local proxy", "Choose the proxy's models.json file"],
        ...(connected ? [["disconnect", "Disconnect", "Remove this proxy from Dolly"]] : []),
      ] : [
        ["oauth", "Sign in with OpenRouter", "Open the sign-in link and paste the authorization code"],
        ["key", connected ? "Replace API key" : "Use an API key", "Paste a key with hidden input"],
        ...(connected ? [["refresh", "Refresh model list", "Fetch the current OpenRouter catalog"], ["disconnect", "Disconnect", "Remove OpenRouter sign-in"]] : []),
      ], connected ? "Connected" : "Connect this provider to start an agent.");
    }
    if (key === "model") {
      if (!runtime.hasConfiguredAuth(selection.provider)) return select("connection");
      return menu("Model", runtime.getModels(selection.provider).filter(model => model.input.includes("image"))
        .sort((a, b) => a.id.localeCompare(b.id)).map(model => [`model:${model.id}`, model.id,
          model.id === selection.model ? "Selected" : selection.provider === "codex-local" ? "Subscription" :
            `$${model.cost.input} input / $${model.cost.output} output per million tokens`]),
        "Search models · click a row to select", "models");
    }
    if (key.startsWith("model:")) {
      const model = runtime.getModels(selection.provider).find(model => model.id === key.slice(6) && model.input.includes("image"));
      if (!model) throw Error("Choose an available vision model");
      const levels = efforts(model);
      await save({ ...selection, model: model.id, effort: levels.includes(selection.effort) ? selection.effort : levels[0] });
      return home();
    }
    if (key === "effort" || key.startsWith("effort:")) {
      const model = runtime.getModels(selection.provider).find(model => model.id === selection.model);
      if (!model) return select("model");
      const levels = efforts(model);
      if (key === "effort") return menu("Reasoning effort", levels.map(level => [`effort:${level}`, level, level === selection.effort ? "Selected" : ""]));
      if (!levels.includes(key.slice(7))) throw Error("Unsupported reasoning effort");
      await save({ ...selection, effort: key.slice(7) }); return home();
    }
    if (key === "key" || key === "oauth") {
      if (selection.provider !== "openrouter") throw Error("Select OpenRouter first");
      const credential = key === "key" ? await ask("OpenRouter API key", { secret: true }) : await signIn(ask, async (_message, url) => {
        const path = `${scratch}/openrouter-sign-in.html`;
        fs.writeFileSync(path, `<!doctype html><meta charset="utf-8"><title>Connect Dolly</title><p><a href="${url}">Sign in with OpenRouter</a></p><p>Approve the connection, then paste the authorization code into Dolly.</p>`);
        menu("OpenRouter sign-in", [], "Open the downloaded sign-in page, authorize, then paste the code here.", "busy");
        await run("download", [path]);
      });
      menu("Connecting OpenRouter", [], "Checking sign-in and refreshing models…", "busy");
      await checkKey(credential);
      await runtime.login("openrouter", "api_key", { prompt: async () => credential, notify: () => {} });
      try { await refresh(); } catch { /* Pi's cached vision catalog remains available. */ }
      await save({ ...selection, provider: "openrouter", model: selection.provider === "openrouter" ? selection.model : "" });
      return select("model");
    }
    if (key === "relay") {
      if (selection.provider !== "codex-local") throw Error("Select Codex first");
      menu("Local Codex proxy", [], "Keep the proxy running on your computer. Choose the private models.json it prints; keep native auth.json on the host.", "busy");
      if (!await importRelay(fs, run, directory)) return home();
      await models(true); await save({ ...selection, provider: "codex-local", model: selection.provider === "codex-local" ? selection.model : "" });
      return select("model");
    }
    if (key === "refresh") { if (selection.provider !== "openrouter") throw Error("Select OpenRouter first"); menu("Refreshing models", [], "Contacting OpenRouter…", "busy"); await refresh(); return select("model"); }
    if (key === "disconnect") {
      if (selection.provider === "codex-local") {
        const config = fs.existsSync(modelsPath) ? JSON.parse(fs.readFileSync(modelsPath, "utf8")) : {};
        if (config.providers) delete config.providers["codex-local"];
        writeAtomic(fs, modelsPath, JSON.stringify(config)); await models(true);
      } else await runtime.logout("openrouter");
      await save({ ...selection, model: "" }); return home();
    }
    throw Error("Unknown settings selection");
  }
  return { get selection() { return selection; }, home,
    respond(value) { const pending = answer; answer = undefined; if (value === null) pending?.reject(Error("Cancelled")); else pending?.resolve(value); },
    async select(key) {
      if (!["home", "provider"].includes(key)) menu("Loading", [], "Loading provider settings…", "busy");
      try { await select(key); } catch (error) { home(String(error.message).replace(/sk-or-v1-[\w-]+/g, "[redacted]")); } },
    async ready() {
      const runtime = await models();
      if (!runtime.hasConfiguredAuth(selection.provider) || !runtime.getModels(selection.provider).some(model => model.id === selection.model && model.input.includes("image")))
        throw Error("Connect a provider and choose a vision model in settings.");
    },
  };
}
