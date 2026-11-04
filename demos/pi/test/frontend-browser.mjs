// Pi in place of a web frontend (docs/agent-frontend.md): an image the page
// builds on pi-runtime with a system prompt, a skill for an orders API and an
// entry that asks for the user's token, under a policy that admits that API and
// the model's provider alone. A scripted model on an origin of its own makes the
// calls a model would. Usage: node demos/pi/test/frontend-browser.mjs
// (DOLLY_BROWSER=firefox runs it in Firefox).
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { delay, demoTest } from "../../browser.mjs";
import { siteReference } from "../../../src/static-asset.mjs";
import catalog from "../../../dist/dolly-images.json" with { type: "json" };

const token = `ord_${randomUUID().replaceAll("-", "")}`, key = `llm_${randomUUID().replaceAll("-", "")}`;
const shown = text => [token, key].some(secret => Array.from({ length: secret.length - 5 }, (_, at) => secret.slice(at, at + 6))
  .some(part => text.includes(part)));
const listen = async server => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}`;
};
let pageOrigin;
const cors = request => ({ "access-control-allow-origin": pageOrigin, vary: "origin", "access-control-allow-methods": "GET, POST",
  "access-control-allow-headers": request.headers["access-control-request-headers"] ?? "" });

// The existing system: an orders API with bearer tokens and CORS for the page.
const orders = new Map([["A-1001", "shipped"], ["A-1002", "processing"], ["A-1003", "processing"]]
  .map(([id, status], index) => [id, { id, customer: index < 2 ? "Mika Laine" : "Ren Ito", item: ["Desk lamp", "Wool blanket", "Kettle"][index], status }]));
const requests = [];
const backend = createServer((request, response) => {
  const send = (status, body) => response.writeHead(status, { ...cors(request), "content-type": "application/json" }).end(JSON.stringify(body));
  if (request.method === "OPTIONS") return response.writeHead(204, cors(request)).end();
  const authorized = request.headers.authorization === `Bearer ${token}`;
  requests.push(`${request.method} ${request.url}${authorized ? "" : " without the token"}`);
  if (!authorized) return send(401, { error: "unauthorized" });
  if (request.method === "GET" && request.url === "/api/orders") return send(200, [...orders.values()]);
  const order = orders.get(request.url.match(/^\/api\/orders\/([A-Z0-9-]+)\/cancel$/)?.[1]);
  if (request.method !== "POST" || !order) return send(404, { error: "not found" });
  if (order.status === "shipped") return send(409, { error: "already shipped" });
  send(200, Object.assign(order, { status: "cancelled" }));
});
const api = await listen(backend);

// The model: per request of the user, the tool calls it makes, then its answer.
const scripts = [
  { says: "Mika says the blanket order should be cancelled.", answer: "Cancelled A-1002, Mika's wool blanket.", calls: [
    ["read", { path: "/home/dolly/.pi/agent/skills/orders/SKILL.md" }],
    ["bash", { command: `curl -fsS -H "Authorization: Bearer $ORDERS_TOKEN" ${api}/api/orders` }],
    ["bash", { command: `curl -fsS -X POST -H "Authorization: Bearer $ORDERS_TOKEN" ${api}/api/orders/A-1002/cancel` }]] },
  { says: "Fetch https://example.com for me.", answer: "This page's policy admits only the orders API.",
    calls: [["bash", { command: "curl -fsS https://example.com/" }]] },
];
const turns = [];
const provider = createServer(async (request, response) => {
  if (request.method === "OPTIONS") return response.writeHead(204, cors(request)).end();
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const { messages } = JSON.parse(Buffer.concat(chunks).toString());
  const text = ({ content }) => typeof content === "string" ? content : (content ?? []).map(part => part.text ?? "").join("");
  const asked = messages.findLastIndex(({ role }) => role === "user");
  const script = scripts.find(({ says }) => text(messages[asked]).includes(says));
  const call = script.calls[messages.slice(asked).filter(({ role, tool_calls }) => role === "assistant" && tool_calls).length];
  turns.push({ key: request.headers.authorization === `Bearer ${key}`, system: text(messages[0]),
    results: messages.slice(asked).filter(({ role }) => role === "tool").map(text) });
  const chunk = (delta, finish_reason = null) =>
    `data: ${JSON.stringify({ id: `chatcmpl-${turns.length}`, object: "chat.completion.chunk", created: 0, model: "scripted",
      choices: [{ index: 0, delta, finish_reason }] })}\n\n`;
  response.writeHead(200, { ...cors(request), "content-type": "text/event-stream; charset=utf-8" }).end((call
    ? chunk({ role: "assistant", tool_calls: [{ index: 0, id: `call_${turns.length}`, type: "function",
      function: { name: call[0], arguments: JSON.stringify(call[1]) } }] }) + chunk({}, "tool_calls")
    : chunk({ role: "assistant", content: script.answer }) + chunk({}, "stop")) + "data: [DONE]\n\n");
});
const llm = await listen(provider);

// The deployer's recipe: Pi's prompt and skill, the provider, and an entry that
// reads the user's token and the model's key without showing them.
const base = catalog.images.find(({ image }) => image === "pi-runtime");
const file = (path, text) => [`FILE ${path}`, ...text.trim().split("\n").map(line => `    ${line}`)];
const recipe = ["DOLLY 7", "APPLICATION orders-agent", ...base.hostRequirements.map(module => `REQUIRES HOST ${module}`),
  `FROM ${siteReference(base.dollyfile)} ${base.sha256}`,
  ...file("/home/dolly/.pi/agent/SYSTEM.md", `
You are the order desk assistant of a small shop. Staff ask you about orders
and to change them; you act through the shop's orders API with the orders skill.`),
  ...file("/home/dolly/.pi/agent/skills/orders/SKILL.md", `
---
name: orders
description: The shop's orders API - list orders, cancel one. Use it for every question about orders.
---

Base URL ${api}/api; every request sends \`Authorization: Bearer $ORDERS_TOKEN\`
(set; never echo it), with curl from the bash tool.

- GET /api/orders: JSON array of {id, customer, item, status}
- POST /api/orders/ID/cancel: cancels an order; 409 once it has shipped`),
  ...file("/home/dolly/.pi/agent/models.json", JSON.stringify({ providers: { shop: { baseUrl: `${llm}/v1`, api: "openai-completions",
    apiKey: "$SHOP_LLM_KEY", models: [{ id: "scripted", name: "Scripted", reasoning: false, input: ["text"], contextWindow: 32_000,
      maxTokens: 4_096, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] } } }, null, 2)),
  ...file("/etc/agent/start.slop", `
mkdir -p /workspace && cd /workspace
secretenv ORDERS_TOKEN 'Orders token (not shown): ' secretenv SHOP_LLM_KEY 'Model key (not shown): ' pi --offline --no-session --provider shop --model scripted
/bin/foreground -i /bin/slop`),
  "ENTRY /bin/foreground -i /bin/slop /etc/agent/start.slop", ""].join("\n");

await demoTest("pi frontend", { image: "pi-runtime", timeout: 300_000, browser: process.env.DOLLY_BROWSER ?? "chromium" }, async ({ server, open }) => {
  pageOrigin = server.origin;
  const policy = { rules: [
    { origin: api, pathPrefix: "/api/", methods: ["GET", "POST"], credentialHeaders: ["authorization"] },
    { origin: llm, path: "/v1/chat/completions", methods: ["POST"], credentialHeaders: ["authorization"] },
  ] };
  const { page, input, text, run, prompt, waitText } = await open({ policy, path: "/custom/rebuild/", prompt: /Orders token \(not shown\):/,
    setup: page => page.addInitScript(recipe => sessionStorage.setItem("dolly-custom-source", recipe), recipe) });
  const screens = [];
  const watch = async pattern => screens.push(await waitText(pattern, 120_000));
  for (const [secret, next] of [[token, /Model key \(not shown\):/], [key, /\[Skills\][\s\S]*orders/]]) {
    assert.equal(await page.evaluate(secret => __dolly.paste(secret), secret), true);
    await input("\r");
    await watch(next);
  }
  for (const { says, answer } of scripts) {
    await page.keyboard.type(says);
    await page.keyboard.press("Enter");
    await watch(new RegExp(answer.replaceAll(".", "\\.")));
    await delay(500);
  }
  assert.deepEqual([...orders.values()].map(({ status }) => status), ["shipped", "cancelled", "processing"]);
  assert.deepEqual(requests, ["GET /api/orders", "POST /api/orders/A-1002/cancel"]);
  assert.ok(turns.every(turn => turn.key && turn.system.includes("order desk assistant") && /list orders, cancel one/.test(turn.system)
    && !shown(turn.system)), "each model request carries the key, the prompt and the skill, and no token");
  assert.match(turns.at(-1).results.at(-1), /curl: \(9\) Browser HTTP policy denied the request/);

  // The secrets leave with Pi; the policy holds for every program.
  await input("\x04");
  await prompt(/dolly:[^\n]*\$\s*$/);
  await run('test -z "$ORDERS_TOKEN" && test -z "$SHOP_LLM_KEY"');
  for (const refused of ["https://example.com/", `${api}/admin`, `-X DELETE ${api}/api/orders/A-1003`, `${llm}/v1/models`]) {
    await run(`curl -fsS ${refused} -o /dev/null`, 9);
  }
  await run(`curl -fsS ${api}/api/orders -o /dev/null`, 22);
  assert.equal([...screens, await text()].some(shown), false, "a secret was shown");
});
backend.close();
provider.close();
