// The closed-source-agent image: the notice sends nothing and Ctrl+C leaves
// without a download; arguments reach Claude Code on the run that downloads
// the pinned tarball, and later ones need no key; `p` starts Claude Code as
// published (its connectivity check is requested); Enter starts it with
// --bare and the API key typed at the launcher's prompt, and a file-tool turn
// completes in its REPL against a scripted Messages endpoint.
// Usage: node demos/closed-source-agent/test/closed-source-agent-browser.mjs
// (DOLLY_BROWSER=firefox runs it in Firefox).
import assert from "node:assert/strict";
import { createReadStream } from "node:fs";
import { delay, demoTest, recoveryPrompt, redirectFetch } from "../../browser.mjs";
import { claudeCodeTarball, registry, tarballPath } from "./fixtures/tarball.mjs";

const tarball = await claudeCodeTarball();
const anthropic = "https://api.anthropic.com", platform = "https://platform.claude.com";
const key = "sk-ant-api03-dolly-fixture-not-a-real-key";
const content = "DOLLY-FIXTURE-CONTENT";
const requests = []; // every request the fixture answered: path, method, headers, payload
const tarballRequests = () => requests.filter(({ path }) => path === `/npm${tarballPath}`);
const modelRequests = () => requests.filter(({ path }) => path === "/fixture/anthropic/v1/messages");
// Claude Code's first-run connectivity check, which the real endpoints refuse to a browser (no CORS headers).
const helloRequests = () => requests.filter(({ path }) => path.endsWith("/hello"));

const sse = events => events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join("");
// One streamed assistant message of the given blocks.
function streamed(model, blocks, stopReason) {
  const events = [["message_start", { type: "message_start", message: { id: "msg_dolly", type: "message", role: "assistant", model,
    content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } }]];
  blocks.forEach((block, index) => {
    const [start, delta] = block.type === "text"
      ? [{ type: "text", text: "" }, { type: "text_delta", text: block.text }]
      : [{ type: "tool_use", id: block.id, name: block.name, input: {} }, { type: "input_json_delta", partial_json: JSON.stringify(block.input) }];
    events.push(["content_block_start", { type: "content_block_start", index, content_block: start }],
      ["content_block_delta", { type: "content_block_delta", index, delta }],
      ["content_block_stop", { type: "content_block_stop", index }]);
  });
  events.push(["message_delta", { type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 20 } }],
    ["message_stop", { type: "message_stop" }]);
  return sse(events);
}

async function handle(request, response, path, headers) {
  if (path === `/npm${tarballPath}`) {
    requests.push({ path, method: request.method });
    response.writeHead(200, { ...headers, "content-type": "application/octet-stream" });
    createReadStream(tarball).pipe(response);
    return true;
  }
  if (!path.startsWith("/fixture/")) return false;
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const entry = { path, method: request.method, headers: request.headers, payload: null };
  requests.push(entry);
  if (path === "/fixture/anthropic/v1/messages" && request.method === "POST") {
    // The model asks for the Read tool once, then answers with what it read.
    const payload = entry.payload = JSON.parse(Buffer.concat(chunks).toString());
    const answered = payload.messages.some(({ content }) => Array.isArray(content) && content.some(block => block.type === "tool_result"));
    const [blocks, stop] = !payload.tools?.some(tool => tool.name === "Read") ? [[{ type: "text", text: "ok" }], "end_turn"]
      : answered ? [[{ type: "text", text: `The file says: ${content}` }], "end_turn"]
        : [[{ type: "tool_use", id: "toolu_dolly", name: "Read", input: { file_path: "/workspace/hello.txt" } }], "tool_use"];
    response.writeHead(200, { ...headers, "content-type": "text/event-stream; charset=utf-8" });
    response.end(streamed(payload.model, blocks, stop));
  } else {
    // Everything else, the connectivity check included: the --bare start must not depend on it.
    response.writeHead(404, { ...headers, "content-type": "application/json" });
    response.end(JSON.stringify({ type: "error", error: { type: "not_found_error", message: path } }));
  }
  return true;
}

await demoTest("closed-source-agent", { image: "closed-source-agent", timeout: 600_000, browser: process.env.DOLLY_BROWSER ?? "chromium",
  server: { handle } }, async ({ server, open }) => {
  const policy = { maxRequests: 64, rules: [
    { origin: registry, path: tarballPath, methods: ["GET"], maxResponseBytes: 32 << 20 },
    { origin: anthropic, pathPrefix: "/v1/", methods: ["POST"], credentialHeaders: ["x-api-key", "authorization"], maxRequestBytes: 4 << 20 },
    { origin: anthropic, pathPrefix: "/api/", methods: ["GET"] },
    { origin: platform, path: "/v1/oauth/hello", methods: ["GET"] },
  ] };
  // The broker judges the real URLs; the page's fetches of them go to the fixtures.
  const redirects = [[registry, "/npm"], [anthropic, "/fixture/anthropic"], [platform, "/fixture/platform"]]
    .map(([origin, prefix]) => redirectFetch(origin, server.origin + prefix));
  const setup = async page => { for (const redirect of redirects) await redirect(page); };
  const notice = /Ctrl\+C: leave/, keyPrompt = /API key[^\n]*:\s*$/, repl = /\? for shortcuts/;
  const terminal = await open({ policy, setup, prompt: null, viewport: { width: 1280, height: 960 } });
  const { page, run, start, submit, waitText, text, input } = terminal;
  const sent = () => page.evaluate(() => __dolly.httpRequestCount);
  const settled = async () => { let previous = ""; for (let same = 0; same < 3;) { await delay(700); const now = await text(); if (now === previous) same++; else { same = 0; previous = now; } } return previous; };
  // Starts the launcher from the shell and waits at its notice, where nothing has been requested yet.
  const launch = async command => {
    await run("clear");
    const before = await sent(), running = start(command);
    await waitText(notice);
    await delay(1000);
    assert.equal(await sent(), before, `${command} sent a request before any key was pressed`);
    return running;
  };

  // The notice sends nothing, and Ctrl+C leaves without a download.
  await waitText(notice);
  await delay(2000);
  assert.deepEqual([await sent(), requests.length], [0, 0], "a request left while the notice was showing");
  await page.keyboard.press("Control+c");
  await terminal.prompt(recoveryPrompt);
  assert.equal(await sent(), 0, "Ctrl+C at the notice sent a request");
  await run("test ! -e /opt/claude-code && test ! -e /home/dolly/.claude.json && test ! -e /home/dolly/.claude");
  await run(`printf '${content}\\n' > /workspace/hello.txt`);

  // The first run downloads, and its own arguments still reach Claude Code;
  // with the package present, arguments run it without the notice or a key.
  const version = await launch("closed-source-agent --version");
  await page.keyboard.press("Space");
  assert.equal(await version.done, 0, `the first run did not answer --version:\n${await text()}`);
  assert.match(await text(), /2\.1\.112/, "the first run's argument did not reach Claude Code");
  assert.deepEqual(tarballRequests().map(({ method }) => method), ["GET"]);
  await run("clear && closed-source-agent --version > /tmp/version && grep -q 2.1.112 /tmp/version");

  // `p` is Claude Code as published: its first-run connectivity check, which fails here as in a browser.
  const published = await launch("closed-source-agent");
  await page.keyboard.press("p");
  for (let step = 0; step < 6 && published.status === null && helloRequests().length === 0; step++) {
    await settled();
    await input("\r");
  }
  assert.ok(helloRequests().length > 0, `the as-published start did not run Claude Code's connectivity check:\n${await text()}`);
  assert.notEqual(await published.done, 0);
  const checks = helloRequests().length;

  // Enter is the --bare start: the launcher asks for the key without showing it.
  const claude = await launch("closed-source-agent");
  await page.keyboard.press("Enter");
  await waitText(keyPrompt);
  await page.keyboard.type(key);
  await delay(500);
  const typed = await text();
  assert.ok(!typed.includes(key.slice(0, 16)) && !typed.includes(key.slice(-16)), `the key was shown:\n${typed}`);
  await page.keyboard.press("Enter");
  // Claude Code's own first screens, answered as a user would: the theme,
  // the detected key, its notes and the folder trust question, then the REPL.
  for (let step = 0; step < 12; step++) {
    const screen = await settled();
    if (repl.test(screen) || claude.status !== null) break;
    await input(/Do you want to use this API key/.test(screen) ? "1" : "\r");
  }
  assert.equal(claude.status, null, `Claude Code exited with ${claude.status} before its REPL:\n${await text()}`);
  await page.keyboard.type("Read /workspace/hello.txt");
  await page.keyboard.press("Enter");
  await waitText(new RegExp(`The file says: ${content}`), 180_000);
  const turn = modelRequests().filter(({ payload }) => payload.tools?.some(tool => tool.name === "Read"));
  assert.equal(turn.length, 2, "the file-tool turn took two Messages requests");
  assert.ok(modelRequests().every(({ headers }) => headers["x-api-key"] === key), "a Messages request did not carry the typed key");
  assert.ok(turn.every(({ headers }) => headers["anthropic-dangerous-direct-browser-access"] === "true"));
  const result = turn[1].payload.messages.at(-1).content.find(block => block.type === "tool_result");
  assert.match(JSON.stringify(result), new RegExp(content), "the tool result did not carry the file's content");
  assert.equal(helloRequests().length, checks, "the --bare start ran the connectivity check");
  // Ctrl+C and Ctrl+D do not leave this REPL; /exit does, once its menu has settled.
  await page.keyboard.type("/exit");
  await settled();
  await page.keyboard.press("Enter");
  assert.equal(await claude.done, 0);

  // The session, not the image, now holds the package and Claude Code's own
  // configuration; outside the latter no file holds the key (rg: 1 is no match).
  // The bracket keeps this command, which the shell's history records, from matching itself.
  await run("test -s /opt/claude-code/package/cli.js && test -s /home/dolly/.claude.json");
  assert.equal(await submit(`rg -uuu -l ${key.replace("-fixture-", "-fixture[-]")} /tmp /opt /usr /etc /workspace /home/dolly/.slop_history`), 1,
    `a file outside Claude Code's own holds the key:\n${await text()}`);
  assert.equal(tarballRequests().length, 1, "the tarball was requested more than once");
  assert.ok(requests.every(({ path }) => path.startsWith("/npm/") || path.startsWith("/fixture/")));
});
