// Pi in the pi image: package and model commands, rg and fd, its tools over
// Slop, the OpenRouter and Codex logins, session resume, and the TUI against a
// scripted streaming provider. Usage: node demos/pi/test/pi-browser.mjs
import assert from "node:assert/strict";
import { delay, demoTest, recoveryPrompt, shellQuote } from "../../browser.mjs";
import { runFd, runRipgrep } from "../../rust/test/fixtures/rust-tools.mjs";

const credential = "Bearer sandbox-placeholder";
// The fixture model calls these tools in order, then answers.
const tools = [
  ["write", { path: "/workspace/pi-http-test.txt", content: "pi crossed Dolly's HTTP broker\n日本語😀\n" }],
  ["edit", { path: "/workspace/pi-http-test.txt", edits: [{ oldText: "HTTP broker", newText: "HTTP broker via edit" }] }],
  ["bash", { command: "seq 1 3000 | tee /workspace/pi-lines.txt; printf 'old\\377\\n' > /workspace/pi-latin1.txt" }],
  ["read", { path: "/workspace/pi-lines.txt" }],
  ["edit", { path: "/workspace/pi-latin1.txt", edits: [{ oldText: "old", newText: "new" }] }],
];
const finalRequest = tools.length + 1;
const modelRequests = [];
const stream = { request: 0, phase: "idle" };

async function provider(request, response, path, headers) {
  if (path !== "/fixture/pi/v1/chat/completions" || request.method !== "POST") return false;
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const payload = JSON.parse(Buffer.concat(chunks).toString());
  modelRequests.push({ authorization: request.headers.authorization, payload });
  const ordinal = payload.messages.filter(message => message.role === "tool").length + 1;
  const tool = tools[ordinal - 1];
  const chunk = (delta, finish_reason = null) =>
    ({ id: `chatcmpl-dolly-${ordinal}`, object: "chat.completion.chunk", created: 0, model: "dolly-test-model",
      choices: [{ index: 0, delta, finish_reason }] });
  const events = tool ? [
    chunk({ role: "assistant", tool_calls: [{ index: 0, id: `call_dolly_${tool[0]}`, type: "function",
      function: { name: tool[0], arguments: JSON.stringify(tool[1]) } }] }),
    chunk({}, "tool_calls"),
  ] : [chunk({ content: "日本語😀 DOLLY-PI-HTTP-" }), chunk({ content: "EDIT-OK" }), chunk({}, "stop")];
  response.writeHead(200, { ...headers, "content-type": "text/event-stream; charset=utf-8" });
  response.flushHeaders();
  Object.assign(stream, { request: ordinal, phase: "waiting" });
  // No bytes yet: the TUI's thinking indicator must animate on its own.
  await delay(750);
  for (const [index, event] of events.entries()) {
    const bytes = Buffer.from(`data: ${JSON.stringify(event)}\n\n`);
    // Split Unicode scalars on the wire, not just between SSE events.
    let start = 0;
    for (let offset = 0; offset < bytes.length; offset++) if (bytes[offset] >= 0x80) {
      response.write(bytes.subarray(start, offset + 1));
      start = offset + 1;
      await delay(25);
    }
    response.write(bytes.subarray(start));
    if (!tool && index === 0) {
      // The answer's first half must be visible before its second half is sent.
      stream.phase = "prefix";
      await delay(2000);
    } else await delay(100);
  }
  response.end("data: [DONE]\n\n");
  stream.phase = "done";
  return true;
}

await demoTest("pi", { image: "pi", timeout: 900_000, server: { handle: provider, fixtures: {
  "pi-tools.mjs": "demos/pi/test/fixtures/pi-tools.mjs",
  "pi-sessions.mjs": "demos/pi/test/fixtures/pi-sessions.mjs",
  "utf8-writer.c": "demos/javascript/test/fixtures/utf8-writer.c",
} } }, async ({ server, open }) => {
  const policy = { maxRequests: 256, rules: [
    { origin: "https://auth.openai.com", path: "/oauth/token", methods: ["POST"] },
    { origin: server.origin, pathPrefix: "/fixture/pi/", methods: ["POST"], credentialHeaders: ["authorization"] },
    { origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] },
  ] };
  const piStarted = /Bash is not installed/;
  const terminal = await open({ policy, prompt: piStarted, viewport: { width: 1280, height: 1120 } });
  const { page, submit, run, start, prompt, waitText, text, input } = terminal;
  const http = () => page.evaluate(() => ({ active: __dolly.httpActive, requests: __dolly.httpRequestCount,
    completed: __dolly.httpCompletedRequestCount, frame: Number(document.documentElement.dataset.frameSequence ?? 0) }));
  await page.keyboard.press("Control+d");
  await prompt(recoveryPrompt, terminal.pid);

  for (const command of [
    "janis --version && pi --version",
    "janis -m -e \"import { defineTelemetrySchema } from '@earendil-works/pi-telemetry'; if (defineTelemetrySchema('BROWSER') !== 'BROWSER') throw new Error('bad target workspace package')\"",
    "test -s /usr/lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js && test ! -e /usr/src/pi-source/packages/coding-agent/dist-dolly",
    `printf %s ${shellQuote(JSON.stringify({ openrouter: { type: "api_key", key: "sandbox-placeholder" },
      "openai-codex": { type: "oauth", access: "sandbox-placeholder", refresh: "sandbox-placeholder", expires: 4102444800000 } }))} > /home/dolly/.pi/agent/auth.json`,
    "pi --list-models openrouter | grep -q openrouter && pi --list-models openai-codex | grep -q openai-codex",
    "rm /home/dolly/.pi/agent/auth.json",
  ]) await run(command);
  await runRipgrep(submit);
  await runFd(submit);

  const before = (await http()).requests;
  assert.notEqual(await submit("pi install npm:@dolly-test/nonexistent-package@0.0.0"), 0, "Pi pretended npm installed a package");
  assert.equal((await http()).requests, before, "missing npm must fail before network access");

  const scratch = "/tmp/dolly-pi-test";
  await run(`mkdir ${scratch} && cd ${scratch} && for name in pi-tools.mjs pi-sessions.mjs utf8-writer.c; do curl -fsS ${server.origin}/fixture/$name -o $name || exit 1; done`);
  await run(`cc utf8-writer.c -o writer && janis -m pi-tools.mjs ${scratch}`);

  // OpenRouter API-key login, then Codex OAuth with a local token endpoint.
  const tokenRequests = [];
  const accountId = "acct_dolly_browser_fixture";
  const accessToken = [{ alg: "none", typ: "JWT" }, { "https://api.openai.com/auth": { chatgpt_account_id: accountId } }]
    .map(part => Buffer.from(JSON.stringify(part)).toString("base64url")).concat("dolly-browser-fixture").join(".");
  await page.route("https://auth.openai.com/oauth/token", route => {
    tokenRequests.push(route.request());
    return route.fulfill({ headers: { "access-control-allow-origin": "*" },
      json: { access_token: accessToken, refresh_token: "dolly-browser-refresh-token", expires_in: 3600 } });
  });
  await run("clear");
  let pi = start("pi --offline --no-session");
  await waitText(/No models available/);
  await input("/login openrouter\r");
  await waitText(/Select authentication method for OpenRouter/);
  await input("\x1b[B\r");
  await waitText(/Enter OpenRouter API key/);
  assert.equal(await page.evaluate(() => __dolly.paste("sandbox-login-key")), true);
  await input("\r");
  await waitText(/Saved API key for OpenRouter/);
  await input("\x04");
  assert.equal(await pi.done, 0);
  await run("grep -q sandbox-login-key /home/dolly/.pi/agent/auth.json && pi --list-models openrouter | grep -q openrouter && clear");
  pi = start("pi --offline --no-session");
  await waitText(piStarted);
  await input("/login openai-codex\r");
  await waitText(/Select OpenAI Codex login method/);
  await input("\r");
  assert.match(await waitText(/paste the authorization code/), /auth\.openai\.com\/oauth\/authorize/);
  assert.equal(await page.evaluate(() => __dolly.paste("dolly-browser-authorization-code")), true);
  await input("\r");
  await waitText(/Logged in to OpenAI Codex/);
  await input("\x04");
  assert.equal(await pi.done, 0);
  await run(`grep -q ${accountId} /home/dolly/.pi/agent/auth.json && pi --list-models openai-codex | grep -q openai-codex`);
  assert.equal(tokenRequests.length, 1);
  assert.match(tokenRequests[0].headers()["content-type"], /^application\/x-www-form-urlencoded(?:;|$)/);
  const token = Object.fromEntries(new URLSearchParams(tokenRequests[0].postData()));
  assert.equal(token.grant_type, "authorization_code");
  assert.equal(token.code, "dolly-browser-authorization-code");
  assert.ok(token.code_verifier.length >= 43);
  assert.equal(token.redirect_uri, "http://localhost:1455/auth/callback");
  await run("rm /home/dolly/.pi/agent/auth.json");

  // Real Pi sessions are discovered, filtered and resumed in the TUI.
  await run(`janis -m pi-sessions.mjs ${scratch} && clear`);
  pi = start(`pi --session-dir ${scratch}/sessions`);
  await waitText(piStarted);
  await input("/resume\r");
  await waitText(/DOLLY-RESUME-PROOF-/);
  await page.keyboard.type('"DOLLY-RESUME-PROOF-11"');
  await waitText(/^(?![\s\S]*DOLLY-RESUME-PROOF-10)[\s\S]*DOLLY-RESUME-PROOF-11/);
  await page.keyboard.press("Enter");
  await waitText(/resume reply 11/);
  await page.keyboard.press("Control+d");
  assert.equal(await pi.done, 0);
  await run(`cd /workspace && rm -rf ${scratch}`);

  // The TUI against the scripted provider: ! commands, streamed child output,
  // copying, a live thinking indicator, incremental SSE and five upstream tools.
  const models = { providers: { "dolly-test": { baseUrl: `${server.origin}/fixture/pi/v1`, api: "openai-completions",
    apiKey: "sandbox-placeholder", models: [{ id: "dolly-test-model", name: "Dolly browser fixture", reasoning: false,
      input: ["text"], contextWindow: 32_000, maxTokens: 4_096, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] } } };
  await run(`printf %s ${shellQuote(JSON.stringify(models))} > /home/dolly/.pi/agent/models.json && touch /workspace/dolly-slop-bang-marker && clear`);
  pi = start("pi --provider dolly-test --model dolly-test-model --api-key sandbox-placeholder");
  await waitText(piStarted);
  await page.keyboard.type("! ls");
  await page.keyboard.press("Enter");
  await waitText(/(?:^|\n)[ \t]*dolly-slop-bang-marker[ \t]*(?:\r?\n|$)/);
  await page.keyboard.type("! slop -e -c 'x=$(exit 7); exit 19'; printf 'DOLLY-SLOP-STATUS=%s\\n' \"$?\"");
  await page.keyboard.press("Enter");
  await waitText(/DOLLY-SLOP-STATUS=7/);
  await page.keyboard.type("! printf 'DOLLY-CHILD-%s\\n' PREFIX; sleep 8; printf 'DOLLY-CHILD-%s\\n' SUFFIX");
  await page.keyboard.press("Enter");
  assert.doesNotMatch(await waitText(/DOLLY-CHILD-PREFIX/, 5000), /DOLLY-CHILD-SUFFIX/, "Pi buffered child output until exit");
  await text(); // selects the screen
  await page.keyboard.press("Control+Shift+C");
  await page.waitForFunction(() => navigator.clipboard.readText().then(text =>
    text.includes("DOLLY-CHILD-PREFIX") && !text.includes("DOLLY-CHILD-SUFFIX")), null, { timeout: 5000 });
  await waitText(/DOLLY-CHILD-SUFFIX/);

  const request = "Use the write tool to create the requested file.";
  const requestsBefore = (await http()).requests;
  await input(request);
  await page.keyboard.press("Enter");
  let thinking;
  while (!(thinking = await http()).active || thinking.requests === requestsBefore) await delay(20);
  await delay(350);
  const thinkingAfter = await http();
  assert.equal(thinkingAfter.active, true, "the fixture response ended before the thinking-animation check");
  assert.ok(thinkingAfter.frame > thinking.frame, "Pi's thinking indicator did not animate while HTTP was active");
  let baseline = null;
  for (let deadline = Date.now() + 60_000; ; await delay(20)) {
    assert.ok(Date.now() < deadline, `Pi never rendered the final response prefix: ${JSON.stringify(stream)}`);
    if (stream.request !== finalRequest) continue;
    if (stream.phase === "waiting" && baseline === null) baseline = (await http()).frame;
    if (stream.phase === "done") assert.fail("Pi buffered the final response until after its suffix");
    if (stream.phase === "prefix" && baseline !== null && (await http()).frame !== baseline) break;
  }
  await waitText(/日本語😀 DOLLY-PI-HTTP-EDIT-OK/);
  for (let deadline = Date.now() + 30_000; (await http()).completed !== requestsBefore + finalRequest; await delay(100)) {
    assert.ok(Date.now() < deadline, "Pi's fixture requests did not complete");
  }
  assert.equal(modelRequests.length, finalRequest);
  assert.ok(modelRequests.every(request => request.authorization === credential));
  assert.ok(modelRequests.every(request => !JSON.stringify(request.payload).includes(credential)),
    "the credential crossed into Pi's JSON payload");
  assert.ok(modelRequests[0].payload.messages.some(message => message.role === "user" &&
    JSON.stringify(message.content).includes(request)));
  // Each request carries one more tool result in upstream Pi's own wording.
  const results = modelRequests.slice(1).map(({ payload }) =>
    JSON.stringify(payload.messages.filter(message => message.role === "tool").at(-1)?.content));
  for (const [index, expected] of [
    /Successfully wrote \d+ bytes to \/workspace\/pi-http-test\.txt/,
    /Successfully replaced 1 block\(s\) in \/workspace\/pi-http-test\.txt/,
    /Showing lines 1001-3000 of 3000\. Full output: \/tmp\/pi-bash-[0-9a-f]+\.log/,
    /Showing lines 1-2000 of 3001\. Use offset=2001 to continue/,
    /not valid UTF-8/,
  ].entries()) assert.match(results[index], expected, `Pi ${tools[index][0]} tool result`);
  const fullOutput = results[2].match(/\/tmp\/pi-bash-[0-9a-f]+\.log/)[0];
  await input("/quit");
  await page.keyboard.press("Enter");
  assert.equal(await pi.done, 0);
  for (const command of [
    "grep -q \"pi crossed Dolly's HTTP broker via edit\" /workspace/pi-http-test.txt",
    "grep -q '日本語😀' /workspace/pi-http-test.txt",
    `cmp ${fullOutput} /workspace/pi-lines.txt`,
    "printf 'old\\377\\n' | cmp - /workspace/pi-latin1.txt",
  ]) await run(command);
});
