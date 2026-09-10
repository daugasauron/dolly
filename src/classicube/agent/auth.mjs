// SPDX-License-Identifier: MIT
export async function openRouterJSON(path, options = {}) {
  const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`https://openrouter.ai/api/v1/${path}`, { ...options, signal: controller.signal });
    if (!response.ok) throw Error(`OpenRouter returned HTTP ${response.status}. Check your sign-in and try again.`);
    return await response.json();
  } finally { clearTimeout(timeout); }
}

export async function checkKey(key) {
  if (!/^sk-or-v1-[A-Za-z0-9_-]+$/.test(key)) throw Error("Enter an OpenRouter key beginning sk-or-v1-.");
  await openRouterJSON("key", { headers: { Authorization: `Bearer ${key}` } });
}

export async function signIn(ask) {
  const crypto = globalThis.__janisBuiltin("crypto");
  const base64url = bytes => bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
  const url = `https://openrouter.ai/auth?code_challenge=${challenge}&code_challenge_method=S256&key_label=Dolly%20ClassiCube`;
  console.log(`\nOpen this link in your browser and sign in to OpenRouter:\n\n${url}\n\nPaste the authorization code shown after you approve the connection.`);
  const code = await ask("Authorization code", { secret: true });
  if (!code) throw Error("Sign-in cancelled");
  const result = await openRouterJSON("auth/keys", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: "S256" }) });
  if (typeof result.key !== "string") throw Error("OpenRouter did not return a key. Start sign-in again.");
  return result.key;
}

export function efforts(model) {
  if (!model.reasoning) return ["off"];
  return ["off", "minimal", "low", "medium", "high", "xhigh", "max"].filter(level =>
    model.thinkingLevelMap?.[level] !== null &&
      (!["xhigh", "max"].includes(level) || model.thinkingLevelMap?.[level] !== undefined));
}

export function visionModels(catalog, cached = []) {
  return catalog.filter(model => model.architecture?.input_modalities?.includes("image") &&
    model.architecture?.output_modalities?.includes("text") && model.supported_parameters?.includes("tools"))
    .map(model => ({ id: model.id, name: model.name, input: ["text", "image"],
      reasoning: model.supported_parameters.includes("reasoning"),
      thinkingLevelMap: cached.find(item => item.id === model.id)?.thinkingLevelMap,
      contextWindow: model.context_length, maxTokens: Math.min(model.top_provider?.max_completion_tokens || 8192, 8192),
      cost: { input: Number(model.pricing.prompt) * 1e6, output: Number(model.pricing.completion) * 1e6,
        cacheRead: Number(model.pricing.input_cache_read || 0) * 1e6, cacheWrite: 0 } }));
}

export function validateTask(config) {
  if (typeof config?.model !== "string" || !config.model || typeof config.prompt !== "string" ||
      !config.prompt.trim() || config.prompt.length > 4096 || !Number.isInteger(config.seconds) ||
      config.seconds < 10 || config.seconds > 3600 || !Number.isFinite(config.budget) || config.budget <= 0 ||
      !["off", "minimal", "low", "medium", "high", "xhigh", "max"].includes(config.effort))
    throw Error("Choose a model, effort, task, 10–3600 seconds and a positive budget.");
  return config;
}
