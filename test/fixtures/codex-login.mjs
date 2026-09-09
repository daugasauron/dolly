import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { demoFixture } from "./codex-responses.mjs";
import { codexProtectedInputDelay } from "./codex-tui.mjs";

const issuer = "https://auth.openai.com";
const backend = "https://chatgpt.com";
const prefix = "/fixture/codex-login";
const account = "acct_dolly_device_fixture";
const accessToken = "dolly-device-access-token";
const refreshToken = "dolly-device-refresh-token";
const codeVerifier = "dolly-device-pkce-verifier-000000000000000000000000";
const idToken = [
  Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url"),
  Buffer.from(JSON.stringify({ email: "device-fixture@example.invalid",
    "https://api.openai.com/auth": { chatgpt_account_id: account, chatgpt_plan_type: "plus" },
  })).toString("base64url"), "fixture",
].join(".");

export const codexLoginRules = [
  ...["/api/accounts/deviceauth/usercode", "/api/accounts/deviceauth/token", "/oauth/token", "/oauth/revoke"]
    .map(path => ({ origin: issuer, path, methods: ["POST"] })),
  ...["/backend-api/codex/models", "/backend-api/codex/responses", "/backend-api/wham/usage"]
    .map(path => ({ origin: backend, path, methods: [path.endsWith("/responses") ? "POST" : "GET"], credentialHeaders: ["authorization"] })),
];

// Installed only by the test harness, after broker admission. Production URLs
// remain visible to Codex and the policy; a local service supplies synthetic OAuth.
export function codexLoginFetch(origin) {
  const nativeFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    if (["https://auth.openai.com", "https://chatgpt.com"].includes(url.origin)) {
      const request = new Request(input, init);
      const response = await nativeFetch(`${origin}/fixture/codex-login${url.pathname}${url.search}`, {
        method: request.method, headers: request.headers, signal: request.signal,
        credentials: "omit", redirect: "error",
        body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.arrayBuffer(),
      });
      Object.defineProperty(response, "url", { value: url.href });
      return response;
    }
    return nativeFetch(input, init);
  };
}

export function createCodexLoginFixture() {
  const responses = demoFixture();
  const attempts = new Map();
  let approved = false, exchanges = 0, authenticated = 0, refreshes = 0, revocations = 0;
  const errors = [];
  let currentAccessToken = accessToken;
  return {
    approve() { approved = true; },
    polls() { return [...attempts.values()].reduce((sum, value) => sum + value, 0); },
    handle(request, response) {
      const url = new URL(request.url, "http://fixture.invalid");
      if (!url.pathname.startsWith(prefix)) return false;
      const path = url.pathname.slice(prefix.length);
      response.setHeader("Access-Control-Allow-Origin", "*");
      response.setHeader("Access-Control-Allow-Headers", "*");
      response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      if (request.method === "OPTIONS") { response.writeHead(204).end(); return true; }
      const json = (status, body) => response.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
      if (path.startsWith("/backend-api/")) {
        try {
          assert.equal(request.headers.authorization, `Bearer ${currentAccessToken}`);
          assert.equal(request.headers["chatgpt-account-id"], account);
          authenticated++;
          if (path === "/backend-api/codex/models") json(200, { models: [] });
          else if (path === "/backend-api/wham/usage") json(200, { plan_type: "plus" });
          else if (path === "/backend-api/codex/responses") {
            request.url = "/demo/v1/responses";
            responses.handle(request, response);
          } else throw Error(`Unexpected authenticated path: ${path}`);
        } catch (error) { errors.push(error); json(500, { error: error.message }); }
        return true;
      }
      (async () => {
        assert.equal(request.method, "POST");
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const text = Buffer.concat(chunks).toString();
        if (path === "/api/accounts/deviceauth/usercode") {
          assert.ok(JSON.parse(text).client_id);
          const id = `device-${attempts.size + 1}`;
          attempts.set(id, 0);
          json(200, { device_auth_id: id, user_code: "DOLLY-TEST", interval: "1" });
        } else if (path === "/api/accounts/deviceauth/token") {
          const body = JSON.parse(text);
          assert.equal(body.user_code, "DOLLY-TEST");
          assert.ok(attempts.has(body.device_auth_id));
          const polls = attempts.get(body.device_auth_id) + 1;
          attempts.set(body.device_auth_id, polls);
          if (!approved || polls < 2) json(403, { error: "authorization_pending" });
          else json(200, { authorization_code: "dolly-device-authorization", code_verifier: codeVerifier, code_challenge: "dolly-device-challenge" });
        } else if (path === "/oauth/token") {
          const body = request.headers["content-type"]?.includes("application/json")
            ? JSON.parse(text) : Object.fromEntries(new URLSearchParams(text));
          if (body.grant_type === "refresh_token") {
            assert.equal(body.refresh_token, refreshToken);
            refreshes++;
            currentAccessToken = "dolly-refreshed-access-token";
            json(200, { id_token: idToken, access_token: "dolly-refreshed-access-token", refresh_token: "dolly-refreshed-refresh-token" });
          } else {
            assert.equal(body.grant_type, "authorization_code");
            assert.equal(body.code, "dolly-device-authorization");
            assert.equal(body.code_verifier, codeVerifier);
            assert.equal(body.redirect_uri, `${issuer}/deviceauth/callback`);
            exchanges++;
            currentAccessToken = accessToken;
            json(200, { id_token: idToken, access_token: accessToken, refresh_token: refreshToken });
          }
        } else if (path === "/oauth/revoke") {
          const body = JSON.parse(text);
          assert.equal(body.token, "dolly-refreshed-refresh-token");
          assert.equal(body.token_type_hint, "refresh_token");
          revocations++;
          json(200, {});
        } else throw Error(`Unexpected OAuth path: ${path}`);
      })().catch(error => { errors.push(error); json(500, { error: error.message }); });
      return true;
    },
    verify() {
      assert.deepEqual(errors, []);
      assert.equal(attempts.size, 3, "cancelled TUI login, successful TUI login, successful CLI login");
      assert.equal(exchanges, 2);
      assert.ok(authenticated >= 2);
      assert.equal(refreshes, 1);
      assert.ok(revocations >= 1);
      responses.verify();
    },
  };
}

export async function runCodexLogin(send, evaluate, fixture) {
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const submit = command => evaluate(`window.__dolly.submit(${JSON.stringify(command)})`);
  const run = async command => assert.equal(await submit(command), 0, command);
  const input = async text => {
    assert.equal(await evaluate(`window.__dolly.input(${JSON.stringify(text)})`), true);
    await pause(300);
  };
  const key = async (key, code = key, modifiers = 0) => {
    assert.equal(await evaluate(`window.__dolly.key(${JSON.stringify(key)}, ${JSON.stringify(code)}, ${modifiers})`), true);
    await pause(200);
  };
  async function waitText(pattern) {
    let text;
    for (let i = 0; i < 900; i++) {
      text = await evaluate("window.__dolly.visibleTerminalText()");
      if (/application panicked|Worker failed/.test(text)) throw Error(`Codex crashed: ${text}`);
      if (pattern.test(text)) return text;
      await pause(100);
    }
    throw Error(`Codex did not show ${pattern}: ${text}`);
  }
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await run("mkdir -p /workspace/codex-demo; cd /workspace/codex-demo");
  await run("clear");
  let running = submit("codex --no-alt-screen -m gpt-5.5");
  await waitText(/Sign in with Device Code/);
  await pause(codexProtectedInputDelay);
  await key("ArrowDown");
  await key("Enter");
  await waitText(/DOLLY-TEST/);
  await pause(1500);
  await key("Escape");
  await waitText(/Sign in with Device Code/);
  const polls = fixture.polls();
  await pause(1500);
  assert.equal(fixture.polls(), polls, "Escape must stop polling");
  await key("c", "KeyC", 2);
  await running;
  await run("test ! -f ~/.codex/auth.json");
  console.log("CODEX-DEVICE-CANCEL-PASSED");

  await run("clear");
  running = submit("codex --no-alt-screen -m gpt-5.5");
  await waitText(/Sign in with Device Code/);
  await pause(codexProtectedInputDelay);
  await key("ArrowDown");
  await key("Enter");
  await waitText(/DOLLY-TEST/);
  fixture.approve();
  await waitText(/Signed in with your ChatGPT account/);
  await key("Enter");
  await waitText(/Do you trust the contents of this directory/);
  await pause(codexProtectedInputDelay);
  await key("Enter");
  await waitText(/model:\s+gpt-5\.5/);
  await input("Use a shell command to create proof.txt containing DOLLY-CODEX-TOOL-PROOF, then read it back.");
  await key("Enter");
  const terminal = await waitText(/verified its contents by running a shell command inside Dolly\./);
  assert.match(terminal, /└ DOLLY-CODEX-TOOL-PROOF/);
  assert.doesNotMatch(terminal, /MCP startup incomplete/);
  await mkdir("build/codex-login-check", { recursive: true });
  await writeFile("build/codex-login-check/terminal.txt", terminal);
  await input("/quit");
  await key("Enter");
  assert.equal(await running, 0);
  await run("grep -q '\"auth_mode\": \"chatgpt\"' ~/.codex/auth.json && grep -q 'acct_dolly_device_fixture' ~/.codex/auth.json");
  await run("codex login status > /tmp/codex-login-status 2>&1 && grep -q 'Logged in using ChatGPT' /tmp/codex-login-status");
  await run("grep -q 'trust_level = \"trusted\"' ~/.codex/config.toml");
  console.log("CODEX-DEVICE-PERSIST-TRUST-AND-TOOL-PASSED");

  // Expire the saved freshness timestamp; the next process must load and refresh it.
  await run(`sed 's/"last_refresh": "[^"]*"/"last_refresh": "2000-01-01T00:00:00Z"/' ~/.codex/auth.json > /tmp/codex-stale-auth && cp /tmp/codex-stale-auth ~/.codex/auth.json`);
  await run("clear");
  running = submit("codex --no-alt-screen -m gpt-5.5");
  await waitText(/model:\s+gpt-5\.5/);
  await pause(1500);
  await input("/quit");
  await key("Enter");
  assert.equal(await running, 0);
  await run("grep -q dolly-refreshed-access-token ~/.codex/auth.json && grep -q dolly-refreshed-refresh-token ~/.codex/auth.json");
  await run("codex logout && test ! -f ~/.codex/auth.json");
  await run("codex login --device-auth > /tmp/codex-cli-login 2>&1 && grep -q 'Successfully logged in' /tmp/codex-cli-login");
  await run("test -s ~/.codex/log/codex-login.log && codex login status");
  console.log("CODEX-DEVICE-RESTART-REFRESH-CLI-PASSED");
}
