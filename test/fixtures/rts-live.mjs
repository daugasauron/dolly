// Opt-in paid browser test. Runs in Dolly; credentials never enter this file.
const fs = globalThis.__janisBuiltin("fs");
function assert(condition, message) { if (!condition) throw Error(message); }
const directory = "/tmp/rts-live-agent";
if (process.argv[2] === "prepare") {
  const response = await fetch("https://openrouter.ai/api/v1/models");
  assert(response.ok, `Model catalog HTTP ${response.status}`);
  const catalog = (await response.json()).data;
  const models = ["deepseek/deepseek-v4-flash-vision-exp", "x-ai/grok-4.6"].map(id => {
    const model = catalog.find(item => item.id === id);
    assert(model?.architecture?.input_modalities?.includes("image") && model.supported_parameters?.includes("tools"),
      `${id} must support images and tools`);
    return { id, name: model.name, input: ["text", "image"], reasoning: true,
      contextWindow: model.context_length, maxTokens: 8192,
      cost: { input: Number(model.pricing.prompt) * 1e6, output: Number(model.pricing.completion) * 1e6,
        cacheRead: Number(model.pricing.input_cache_read ?? 0) * 1e6, cacheWrite: 0 } };
  });
  fs.writeFileSync(`${directory}/models.json`, JSON.stringify({ providers: { openrouter: {
    baseUrl: "https://openrouter.ai/api/v1", api: "openai-completions", models,
  } } }));
  console.log("RTS live model catalog verified");
} else {
  assert(process.argv[2] === "inspect", "expected prepare or inspect");
  const root = "/workspace/rts-matches";
  const matches = fs.readdirSync(root);
  assert(matches.length === 1, "expected exactly one live match");
  const match = `${root}/${matches[0]}`;
  const secret = JSON.parse(fs.readFileSync(`${directory}/auth.json`, "utf8")).openrouter.key;
  const files = {};
  function checkSecrets(path) {
    for (const name of fs.readdirSync(path)) {
      const child = `${path}/${name}`;
      if (fs.statSync(child).isDirectory()) checkSecrets(child);
      else {
        const bytes = fs.readFileSync(child);
        assert(!bytes.includes(Buffer.from(secret)), "credential leaked into match files");
        files[child.slice(root.length + 1)] = bytes.toString("base64");
      }
    }
  }
  checkSecrets(match);
  const report = { result: fs.readFileSync(`${match}/result.txt`, "utf8").trim(), players: [] };
  for (const index of [1, 2]) {
    const events = fs.readFileSync(`${match}/player${index}.events.jsonl`, "utf8").trim().split("\n").map(JSON.parse);
    const tools = events.filter(event => event.type === "tool_result" && !event.isError);
    const actions = tools.flatMap(event => event.details?.actions ?? []);
    const history = fs.readFileSync(`${match}/player${index}.jsonl`, "utf8");
    report.players.push({ player: index, tools: tools.length, actions: actions.length,
      images: history.split('"type":"image"').length - 1,
      thinkingDeltas: events.filter(event => event.type === "thinking_delta").length,
      frames: tools.map(event => event.details?.frame),
      cost: events.filter(event => event.type === "usage").reduce((sum, event) => sum + (event.usage?.cost?.total ?? 0), 0),
      errors: events.filter(event => event.type === "usage" && event.stopReason === "error").length });
    assert(fs.statSync(`${match}/player${index}-game/NONAME.RPL`).size > 0, "replay missing");
  }
  console.log("RTS-LIVE " + JSON.stringify(report));
  assert(report.result === "Match time limit reached", "live match stopped unexpectedly");
  assert(report.players.every(player => player.actions > 0 && player.images >= 2 && player.errors === 0),
    "both live models must execute actions and retain screenshots without API errors");
  assert(!fs.readdirSync("/tmp").some(name => name.startsWith("dolly-rts-")), "match scratch was not cleaned");
  fs.writeFileSync("/tmp/rts-live-match.json", JSON.stringify({ report, files }));
}
