// The closed-source-agent image: the notice sends nothing; Ctrl+C leaves without a
// download; after a key the pinned tarball is fetched and checked, Claude
// Code's own onboarding runs, and a file-tool turn completes in its REPL
// against a scripted Messages endpoint. Usage: node demos/closed-source-agent/test/closed-source-agent-browser.mjs
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
  } else if (path === "/fixture/anthropic/api/hello" || path === "/fixture/platform/v1/oauth/hello") {
    // The onboarding's connectivity check, which the real endpoints refuse to a browser (no CORS headers).
    response.writeHead(200, { ...headers, "content-type": "application/json" }).end("{}");
  } else {
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
  // anykey keeps Ctrl+C a signal, so the notice is not an "interactive" prompt for open().
  const notice = /Ctrl\+C/;
  const terminal = await open({ policy, setup, prompt: null, viewport: { width: 1280, height: 960 } });
  const { page, run, start, waitText, text, input } = terminal;
  const http = () => page.evaluate(() => ({ requests: __dolly.httpRequestCount, completed: __dolly.httpCompletedRequestCount }));

  // The notice sends nothing, and Ctrl+C leaves without a download.
  await waitText(notice);
  await delay(2000);
  assert.deepEqual([(await http()).requests, requests.length], [0, 0], "a request left while the notice was showing");
  await page.keyboard.press("Control+c");
  await terminal.prompt(recoveryPrompt);
  assert.equal((await http()).requests, 0, "Ctrl+C at the notice sent a request");
  await run("test ! -e /opt/claude-code && test ! -e /home/dolly/.claude.json && test ! -e /home/dolly/.claude");

  // Started again by hand, with a key in the environment as a user sets it.
  await run(`printf '${content}\\n' > /workspace/hello.txt && export ANTHROPIC_API_KEY=${key} && clear`);
  // The first run downloads, and its own arguments still reach Claude Code.
  const version = start("closed-source-agent --version");
  await waitText(notice);
  await delay(1000);
  assert.equal((await http()).requests, 0, "a request left before any key was pressed");
  await page.keyboard.press("Space");
  assert.equal(await version.done, 0, `the first run did not answer --version:\n${await text()}`);
  assert.match(await text(), /2\.1\.112/, "the first run's argument did not reach Claude Code");
  assert.deepEqual(tarballRequests().map(({ method }) => method), ["GET"]);
  await run("clear");
  const claude = start("closed-source-agent");
  await waitText(notice);
  await page.keyboard.press("Space");

  // Claude Code's own onboarding, answered as a user would: the theme, the
  // detected key, its notes and the folder trust question, then the REPL.
  const settled = async () => { let previous = ""; for (let same = 0; same < 3;) { await delay(700); const now = await text(); if (now === previous) same++; else { same = 0; previous = now; } } return previous; };
  const press = async (...keys) => { for (const key of keys) { await input(key); await delay(300); } };
  const repl = /\? for shortcuts/;
  for (let step = 0; step < 12 && !repl.test(await text()); step++) {
    const screen = await settled();
    if (/Do you want to use this API key/.test(screen)) await press("1", "\r");
    else if (repl.test(screen)) break;
    else await press("\r");
  }
  assert.equal(claude.status, null, `Claude Code exited with ${claude.status} during its onboarding:\n${await text()}`);
  await page.keyboard.type("Read /workspace/hello.txt and tell me what it says");
  await page.keyboard.press("Enter");
  await waitText(new RegExp(`The file says: ${content}`), 180_000);
  const turn = modelRequests().filter(({ payload }) => payload.tools?.some(tool => tool.name === "Read"));
  assert.equal(turn.length, 2, "the file-tool turn took two Messages requests");
  assert.ok(turn.every(({ headers }) => headers["x-api-key"] === key), "the Messages requests did not carry the user's key");
  assert.ok(turn.every(({ headers }) => headers["anthropic-dangerous-direct-browser-access"] === "true"));
  const result = turn[1].payload.messages.at(-1).content.find(block => block.type === "tool_result");
  assert.match(JSON.stringify(result), new RegExp(content), "the tool result did not carry the file's content");
  // Ctrl+C and Ctrl+D do not leave this REPL; /exit does.
  await page.keyboard.type("/exit");
  await page.keyboard.press("Enter");
  assert.equal(await claude.done, 0);
  // The session, not the image, now holds the package and the user's configuration.
  await run("test -s /opt/claude-code/package/cli.js && test -s /home/dolly/.claude.json");
  assert.equal(tarballRequests().length, 1, "the tarball was requested more than once");
  assert.ok(requests.every(({ path }) => path.startsWith("/npm/") || path.startsWith("/fixture/")));
});
