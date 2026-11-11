// A conversation with Pi survives a saved session: Pi answers a scripted model, the session is
// saved while Pi runs, and the page opened at the save has Pi's conversation file and shows
// the conversation again with `pi --continue`, having loaded no image. Pi starts in /workspace and
// sends the model its AGENTS.md there.
// Usage: node demos/pi/test/pi-session-browser.mjs (DOLLY_BROWSER=firefox runs it in Firefox).
import assert from "node:assert/strict";
import { demoTest, recoveryPrompt, shellQuote } from "../../browser.mjs";

let workspaceContext = false;
async function provider(request, response, path, headers) {
  if (path !== "/fixture/pi/v1/chat/completions" || request.method !== "POST") return false;
  let body = "";
  for await (const chunk of request) body += chunk;
  workspaceContext ||= body.includes("SQUID-FROM-WORKSPACE");
  const event = delta => `data: ${JSON.stringify({ id: "chatcmpl-dolly", object: "chat.completion.chunk", created: 0,
    model: "dolly-test-model", choices: [{ index: 0, delta, finish_reason: delta.content ? null : "stop" }] })}\n\n`;
  response.writeHead(200, { ...headers, "content-type": "text/event-stream; charset=utf-8" });
  response.end(event({ role: "assistant", content: "DOLLY-SAVED-REPLY" }) + event({}) + "data: [DONE]\n\n");
  return true;
}

await demoTest("pi session", { image: "pi-agent", timeout: 600_000, browser: process.env.DOLLY_BROWSER ?? "chromium",
  server: { handle: provider } }, async ({ server, open }) => {
  const piStarted = /Bash is not installed/;
  const policy = { rules: [{ origin: server.origin, pathPrefix: "/fixture/pi/", methods: ["POST"], credentialHeaders: ["authorization"] }] };
  const terminal = await open({ policy, prompt: piStarted, viewport: { width: 1280, height: 1120 } });
  const { page, run, start, waitText, input, prompt } = terminal;
  // The image's entry starts Pi; Ctrl+D leaves it for the recovery shell.
  await page.keyboard.press("Control+d");
  await prompt(recoveryPrompt, terminal.pid);
  const models = { providers: { "dolly-test": { baseUrl: `${server.origin}/fixture/pi/v1`, api: "openai-completions",
    apiKey: "sandbox-placeholder", models: [{ id: "dolly-test-model", name: "Dolly session fixture", reasoning: false,
      input: ["text"], contextWindow: 32_000, maxTokens: 4_096, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] } } };
  await run(`test "$(pwd)" = /workspace && echo 'The project word is SQUID-FROM-WORKSPACE.' > AGENTS.md`);
  await run(`printf %s ${shellQuote(JSON.stringify(models))} > /home/dolly/.pi/agent/models.json && clear`);
  const pi = "pi --provider dolly-test --model dolly-test-model --api-key sandbox-placeholder";
  start(pi);
  await waitText(piStarted);
  await input("Remember the word OCTOPUS-IN-THE-SAVE.");
  await page.keyboard.press("Enter");
  await waitText(/DOLLY-SAVED-REPLY/);
  assert.ok(workspaceContext, "Pi sends /workspace/AGENTS.md");
  // Saved while Pi runs, as a user saves with Ctrl+Shift+S.
  assert.equal(await page.evaluate(() => __dolly.saveSession("pi-conversation")), "pi-conversation");

  const packs = [];
  page.on("request", request => { if (/\/dist\/packs\/|-system\.snapshot/.test(request.url())) packs.push(request.url()); });
  await page.goto(`${server.origin}/session/?name=pi-conversation`);
  await page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus), null, { timeout: 180_000 });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.dollyStatus), "ready",
    await page.locator("#bootstrap-log").textContent());
  assert.deepEqual(packs, [], "a restore loads no image");
  await waitText(piStarted);
  await page.keyboard.press("Control+d");
  await prompt(recoveryPrompt);
  await run("grep -l OCTOPUS-IN-THE-SAVE /home/dolly/.pi/agent/sessions/*/*.jsonl && grep -q DOLLY-SAVED-REPLY /home/dolly/.pi/agent/sessions/*/*.jsonl");
  await run("clear");
  start(`${pi} --continue`);
  await waitText(/OCTOPUS-IN-THE-SAVE[\s\S]*DOLLY-SAVED-REPLY/);
});
