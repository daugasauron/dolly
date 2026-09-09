// Opt-in live provider test. Runs in Dolly; credentials never enter this file.
const fs = globalThis.__janisBuiltin("fs");
function assert(condition, message) { if (!condition) throw Error(message); }
const directory = "/tmp/rts-live-agent";
const auth = JSON.parse(fs.readFileSync(`${directory}/auth.json`, "utf8"));
const secret = auth.openrouter?.key;
async function billing() {
  const response = await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${secret}` } });
  assert(response.ok, `Key usage HTTP ${response.status}`);
  const { data } = await response.json();
  assert(Number.isFinite(data.usage), "key usage must be available before spending");
  return data.usage;
}
if (process.argv[2] === "prepare") {
  const response = await fetch("https://openrouter.ai/api/v1/models");
  assert(response.ok, `Model catalog HTTP ${response.status}`);
  const catalog = (await response.json()).data;
  assert(process.argv.length === 5, "prepare requires two model IDs");
  const models = process.argv.slice(3).map(id => {
    const model = catalog.find(item => item.id === id);
    assert(model?.architecture?.input_modalities?.includes("image") && model.supported_parameters?.includes("tools"),
      `${id} must support images and tools`);
    assert(Number(model.pricing.prompt) <= 1e-6 && Number(model.pricing.completion) <= 5e-6,
      "live proof is restricted to inexpensive models");
    return { id, name: model.name, input: ["text", "image"], reasoning: model.supported_parameters.includes("reasoning"),
      contextWindow: Math.min(model.context_length, 65536), maxTokens: 4096,
      cost: { input: Number(model.pricing.prompt) * 1e6, output: Number(model.pricing.completion) * 1e6,
        cacheRead: Number(model.pricing.input_cache_read ?? 0) * 1e6, cacheWrite: 0 } };
  });
  fs.writeFileSync(`${directory}/models.json`, JSON.stringify({ providers: { openrouter: {
    baseUrl: "https://openrouter.ai/api/v1", api: "openai-completions", models,
  } } }));
  fs.writeFileSync(`${directory}/billing-before`, String(await billing()));
  console.log("RTS live model catalog verified");
} else {
  assert(process.argv[2] === "inspect", "expected prepare or inspect");
  const root = "/workspace/rts-matches";
  const matches = fs.readdirSync(root);
  assert(matches.length === 1, "expected exactly one live match");
  const match = `${root}/${matches[0]}`;
  const files = {};
  const secrets = secret ? [secret] : Object.values(JSON.parse(fs.readFileSync(`${directory}/models.json`, "utf8")).providers).map(provider => provider.apiKey);
  function includeFile(child) {
    const bytes = fs.readFileSync(child);
    assert(secrets.every(value => value && !bytes.includes(Buffer.from(value))), "credential leaked into match files");
    files[child.slice(root.length + 1)] = bytes.toString("base64");
  }
  function checkSecrets(path) {
    for (const name of fs.readdirSync(path)) {
      const child = `${path}/${name}`;
      if (fs.statSync(child).isDirectory()) checkSecrets(child);
      else includeFile(child);
    }
  }
  checkSecrets(match);
  for (const name of ["match.json", "result.txt"]) includeFile(`${match}/${name}`);
  const report = { result: fs.readFileSync(`${match}/result.txt`, "utf8").trim(), players: [] };
  try { if (secret) {
    report.billingStartUSD = Number(fs.readFileSync(`${directory}/billing-before`, "utf8"));
    report.billingEndUSD = await billing();
    report.billedUSD = report.billingEndUSD - report.billingStartUSD;
  } }
  catch (error) { report.billingError = error.message; }
  for (const index of [1, 2]) {
    const events = fs.readFileSync(`${match}/player${index}.events.jsonl`, "utf8").trim().split("\n").map(JSON.parse);
    const tools = events.filter(event => event.type === "tool_result" && !event.isError);
    const actions = tools.flatMap(event => event.details?.actions ?? []);
    const history = fs.readFileSync(`${match}/player${index}.jsonl`, "utf8");
    report.players.push({ player: index, tools: tools.length, actions: actions.length,
      rejectedBatches: events.filter(event => event.type === "tool_result" && event.isError).length,
      images: history.split('"type":"image"').length - 1,
      thinkingDeltas: events.filter(event => event.type === "thinking_delta").length,
      textDeltas: events.filter(event => event.type === "text_delta").length,
      keys: actions.filter(action => action.type === "key").length,
      frames: tools.map(event => event.details?.frame),
      cost: events.filter(event => event.type === "usage").reduce((sum, event) => sum + (event.usage?.cost?.total ?? 0), 0),
      errors: events.filter(event => event.type === "usage" && event.stopReason === "error").length });
    // Verify and include the actual files, not just their directory entries.
    for (const name of [`player${index}.jsonl`, `player${index}.events.jsonl`, `player${index}.txt`,
      `player${index}-game/NONAME.RPL`, `player${index}-game/inputs.log`]) includeFile(`${match}/${name}`);
  }
  console.log("RTS-LIVE " + JSON.stringify(report));
  // Keep each download below the browser's 64 MiB transfer limit even when
  // an hour of screenshot history makes the complete archive much larger.
  const archive = Buffer.from(JSON.stringify({ report, files }));
  const chunkSize = 16 * 1024 * 1024, parts = [];
  fs.mkdirSync("/tmp/rts-live-export");
  for (const index of [1, 2])
    fs.copyFileSync(`${match}/player${index}-game/NONAME.RPL`, `/tmp/rts-live-export/player${index}.rpl`);
  for (let offset = 0; offset < archive.length; offset += chunkSize) {
    const name = `match-${parts.length}.part`;
    fs.writeFileSync(`/tmp/rts-live-export/${name}`, archive.subarray(offset, offset + chunkSize));
    parts.push(name);
  }
  fs.writeFileSync("/tmp/rts-live-export/parts.json", JSON.stringify(parts));
  assert(/^(Match time limit reached|Reported model cost limit reached|Viewer exited \(0\)|Player [12] won at game frame \d+)/.test(report.result),
    "live match stopped unexpectedly");
  assert(report.players.every(player => player.actions > 0 && player.images >= 2),
    "both live models must execute actions and retain screenshots");
  assert(!fs.readdirSync("/tmp").some(name => name.startsWith("dolly-rts-")), "match scratch was not cleaned");
}
