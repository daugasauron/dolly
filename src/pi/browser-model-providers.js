// Local service capability and protocol: /view/docs/browser-local-models.md
export default async function (pi) {
  try {
    const response = await fetch("https://webgpu.dolly.invalid/v1/models");
    if (!response.ok) return;
    const catalog = await response.json();
    pi.registerProvider("webgpu", {
      baseUrl: "https://webgpu.dolly.invalid/v1", api: "openai-completions",
      apiKey: "dolly-local", // Non-secret; the local broker discards credentials.
      models: catalog.data.map(model => ({
        id: model.id, name: model.name, reasoning: false, input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: model.context_window, maxTokens: model.max_tokens,
        compat: { supportsDeveloperRole: false, supportsStore: false,
          supportsUsageInStreaming: true, maxTokensField: "max_tokens" },
      })),
    });
  } catch { /* Local inference is optional; existing providers remain available. */ }
}
