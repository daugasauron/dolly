const fs = globalThis.__janisBuiltin("fs");
function assert(condition, message) { if (!condition) throw Error(message); }
const root = "/workspace/rts-matches";
const matches = fs.readdirSync(root);
assert(matches.length === 1, "expected exactly one fixture match");
const match = `${root}/${matches[0]}`;
for (const index of [1, 2]) {
  const history = fs.readFileSync(`${match}/player${index}.jsonl`, "utf8");
  assert(history.includes("game_input") && history.includes('"toolCall"'), "Pi's normal session must contain tool history");
  assert(history.split('"type":"image"').length >= 3, "saved history must retain earlier screenshots");
  const observations = history.trim().split("\n").map(JSON.parse).map(record => record.message)
    .filter(message => Array.isArray(message?.content) && message.content.some(part => part.type === "image"));
  assert(observations.length >= 2 && observations.every(message => message.content.some(part =>
    part.type === "text" && part.text.includes("Use absolute integer pixels in this 800x600 screenshot:") &&
    part.text.includes("(0,0) is top-left") && part.text.includes("player 2 must not add 800"))),
    "every initial and tool-result screenshot must state the player-local pixel convention");
  const events = fs.readFileSync(`${match}/player${index}.events.jsonl`, "utf8");
  assert(events.includes("RTS-FIXTURE-THINKING") && events.includes('"thinking_delta"'), "actual Pi thinking events must be recorded");
  assert(history.includes("RTS-FIXTURE-INTENT") && events.includes('"text_delta"'), "ordinary assistant intent must be saved and streamed");
  assert(events.includes('"tool_result"') && events.includes('"frame"'), "executed tool results must be recorded");
  if (index === 2) {
    const records = events.trim().split("\n").map(JSON.parse);
    const observation = records.find(event => event.type === "observation");
    const result = records.find(event => event.type === "tool_result");
    assert(result.details.frame > observation.frame + 30, "both native games must animate during the slow model's response, not wait for tools");
  }
  assert(fs.statSync(`${match}/player${index}-game/NONAME.RPL`).size > 0, "game replay missing");
  assert(fs.readFileSync(`${match}/player${index}-game/inputs.log`, "utf8").includes("action "), "execution frame log missing");
  assert(!history.includes("rts-fixture-only") && !events.includes("rts-fixture-only"), "API key must not enter histories");
}
assert(fs.readFileSync(`${match}/result.txt`, "utf8").includes(process.argv[2] ?? "Match time limit reached"), "unexpected match termination");
assert(!fs.readdirSync("/tmp").some(name => name.startsWith("dolly-rts-")), "match scratch was not cleaned");
console.log("RTS-PI-HISTORY-OK");
fs.rmSync(match, { recursive: true, force: true });
