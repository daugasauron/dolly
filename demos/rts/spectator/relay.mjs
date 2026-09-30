// SPDX-License-Identifier: GPL-2.0-or-later
// Providers written by demos/game-agent/{codex,claude}-relay.mjs and the one API each serves.
const relayApis = { "codex-local": "openai-codex-responses", "claude-local": "anthropic-messages" };
const invalid = "Choose the models.json printed by demos/game-agent/codex-relay.mjs or claude-relay.mjs, not native credentials";

export function relayProviders(config) {
  const names = Object.keys(config?.providers ?? {}).filter(name => Object.hasOwn(relayApis, name));
  const provider = config?.providers?.[names[0]];
  const url = new URL(provider?.baseUrl ?? "invalid:");
  if (names.length !== 1 || url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname) ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
      provider.api !== relayApis[names[0]] || typeof provider.apiKey !== "string" ||
      !provider.apiKey || provider.apiKey.startsWith("!") || !Array.isArray(provider.models) ||
      !provider.models.length || provider.models.some(model => typeof model.id !== "string" ||
        !model.id || !model.input?.includes("image")))
    throw Error(invalid);
  // Do not import arbitrary provider/auth commands from an uploaded configuration.
  return { [names[0]]: { api: provider.api, baseUrl: provider.baseUrl, apiKey: provider.apiKey,
    models: provider.models.map(({ id, name, reasoning, input, cost, contextWindow, maxTokens, thinkingLevelMap, compat }) =>
      ({ id, name, reasoning, input, cost, contextWindow, maxTokens, thinkingLevelMap, compat })) } };
}

// Returns the imported provider name, or false when the upload is cancelled.
export async function importRelay(fs, run, directory) {
  const temporary = fs.mkdtempSync("/tmp/relay-import-");
  try {
    const path = `${temporary}/models.json`;
    if (await run("upload", [path]) !== 0) return false;
    let providers;
    try { providers = relayProviders(JSON.parse(fs.readFileSync(path, "utf8"))); }
    catch { throw Error(invalid); }
    fs.mkdirSync(directory, { recursive: true });
    const configPath = `${directory}/models.json`;
    const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, "utf8")) : {};
    config.providers = { ...config.providers, ...providers };
    const merged = `${temporary}/merged.json`;
    fs.writeFileSync(merged, JSON.stringify(config) + "\n");
    fs.renameSync(merged, configPath);
    return Object.keys(providers)[0];
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}
