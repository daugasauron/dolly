#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, resolve, sep } from "node:path";

const projectDir = resolve(import.meta.dirname, "..");
const distDirectory = resolve(projectDir, "dist");
const chromeBinary = process.argv[2];
if (!chromeBinary) throw new Error("usage: browser-harness.mjs CHROME_BINARY");
const browserHostname = process.env.DOLLY_BROWSER_HOSTNAME ?? "127.0.0.1";
if (browserHostname !== "127.0.0.1" && browserHostname !== "localhost") {
  throw new Error("DOLLY_BROWSER_HOSTNAME must be 127.0.0.1 or localhost");
}
const piDevelopmentMode = process.env.DOLLY_BROWSER_MODE === "pi";
const piOpenRouterMode = process.env.DOLLY_BROWSER_MODE === "pi-openrouter";
const missingSnapshotMode = process.env.DOLLY_BROWSER_MODE === "snapshot-missing";
const snapshotExportMode = process.env.DOLLY_BROWSER_MODE === "snapshot-export";
const pagesIsolationMode = process.env.DOLLY_BROWSER_MODE === "pages-isolation";
const pagesLiveMode = process.env.DOLLY_BROWSER_MODE === "pages-live";
const snapshotSizeLimit = 512 * 1024 * 1024;
const codexFixtureAuthorizationCode = "dolly-browser-authorization-code";
const codexFixtureAccountId = "acct_dolly_browser_fixture";
const codexFixtureAccessToken = [
  Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url"),
  Buffer.from(JSON.stringify({
    "https://api.openai.com/auth": {
      chatgpt_account_id: codexFixtureAccountId,
    },
  })).toString("base64url"),
  "dolly-browser-fixture",
].join(".");

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".data", "application/octet-stream"],
  [".snapshot", "application/octet-stream"],
  [".woff2", "font/woff2"],
]);
const publicSources = new Set([
  "coi-serviceworker.js",
  "index.html",
  "src/browser.mjs",
  "src/http-policy.mjs",
  "src/runtime-worker.mjs",
]);
let gitDiscoveryRequest = null;
let libcurlPostRequest = null;
let snapshotUpload = null;
const piModelRequests = [];
const piFixtureStream = { request: 0, phase: "idle" };

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function startServer() {
  const isolatedHeaders = pagesIsolationMode ? {
    "cache-control": "no-store",
  } : {
    "cache-control": "no-store",
    "cross-origin-opener-policy": "same-origin",
    "cross-origin-embedder-policy": "require-corp",
    "cross-origin-resource-policy": "same-origin",
  };
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url, "http://127.0.0.1");
      if (requestUrl.pathname === "/fixture/http.txt") {
        response.writeHead(200, {
          ...isolatedHeaders,
          "content-type": "text/plain; charset=utf-8",
        });
        response.end("FETCHED-THROUGH-BROWSER\n");
        return;
      }
      if (requestUrl.pathname === "/fixture/libcurl-post" &&
          request.method === "POST") {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        libcurlPostRequest = {
          header: request.headers["x-dolly-test"] ?? "",
          body: Buffer.concat(chunks).toString("utf8"),
        };
        response.writeHead(200, {
          ...isolatedHeaders,
          "content-type": "text/plain; charset=utf-8",
        });
        response.end("POSTED-THROUGH-LIBCURL\n");
        return;
      }
      if (requestUrl.pathname === "/fixture/pi/v1/chat/completions" &&
          request.method === "POST") {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        piModelRequests.push({
          authorization: request.headers.authorization ?? "",
          payload,
        });
        const toolResultCount = payload.messages?.filter(
          (message) => message.role === "tool",
        ).length ?? 0;
        const wantsInstalledProbe = payload.messages?.some((message) =>
          message.role === "user" &&
          JSON.stringify(message.content).includes("installed extension"));
        const nextTool = wantsInstalledProbe
          ? toolResultCount === 0 ? {
              name: "dolly_installed_probe",
              arguments: "{}",
            } : null
          : toolResultCount === 0 ? {
              name: "write",
              arguments: JSON.stringify({
                path: "/workspace/pi-http-test.txt",
                content: "pi crossed Dolly's HTTP broker\n",
              }),
            } : toolResultCount === 1 ? {
              name: "edit",
              arguments: JSON.stringify({
                path: "/workspace/pi-http-test.txt",
                old_text: "HTTP broker",
                new_text: "HTTP broker via edit",
              }),
            } : null;
        const responseOrdinal = toolResultCount + 1;
        const events = nextTool === null
          ? [
              {
                id: `chatcmpl-dolly-${responseOrdinal}`,
                object: "chat.completion.chunk",
                created: 0,
                model: "dolly-test-model",
                choices: [{
                  index: 0,
                  delta: {
                    content: wantsInstalledProbe
                      ? "DOLLY-PI-INSTALLED-"
                      : "DOLLY-PI-HTTP-",
                  },
                  finish_reason: null,
                }],
              },
              {
                id: `chatcmpl-dolly-${responseOrdinal}`,
                object: "chat.completion.chunk",
                created: 0,
                model: "dolly-test-model",
                choices: [{
                  index: 0,
                  delta: {
                    content: wantsInstalledProbe ? "EXTENSION-OK" : "EDIT-OK",
                  },
                  finish_reason: null,
                }],
              },
              {
                id: `chatcmpl-dolly-${responseOrdinal}`,
                object: "chat.completion.chunk",
                created: 0,
                model: "dolly-test-model",
                choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
              },
            ]
          : [
              {
                id: `chatcmpl-dolly-${responseOrdinal}`,
                object: "chat.completion.chunk",
                created: 0,
                model: "dolly-test-model",
                choices: [{
                  index: 0,
                  delta: {
                    role: "assistant",
                    tool_calls: [{
                      index: 0,
                      id: `call_dolly_${nextTool.name}`,
                      type: "function",
                      function: {
                        name: nextTool.name,
                        arguments: nextTool.arguments,
                      },
                    }],
                  },
                  finish_reason: null,
                }],
              },
              {
                id: `chatcmpl-dolly-${responseOrdinal}`,
                object: "chat.completion.chunk",
                created: 0,
                model: "dolly-test-model",
                choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
              },
            ];
        response.writeHead(200, {
          ...isolatedHeaders,
          "content-type": "text/event-stream; charset=utf-8",
        });
        piFixtureStream.request = responseOrdinal;
        piFixtureStream.phase = "waiting";
        // Hold the request open long enough for the TUI's timer-driven
        // thinking indicator to advance while no model bytes are available.
        await delay(750);
        for (let index = 0; index < events.length; index++) {
          response.write(`data: ${JSON.stringify(events[index])}\n\n`);
          if (nextTool === null && index === 0) {
            // The final answer must become visible before its second half has
            // even been sent by the fixture. This catches buffering at every
            // layer from browser Fetch through QuickJS streams and Pi.
            piFixtureStream.phase = "prefix";
            await delay(2000);
          } else {
            await delay(100);
          }
        }
        response.end("data: [DONE]\n\n");
        piFixtureStream.phase = "done";
        return;
      }
      if (requestUrl.pathname === "/fixture/pi-extension.js") {
        const body = await readFile(
          resolve(projectDir, "test/fixtures/pi-installed-extension.js"),
        );
        response.writeHead(200, {
          ...isolatedHeaders,
          "content-type": "text/javascript; charset=utf-8",
        });
        response.end(body);
        return;
      }
      if (requestUrl.pathname === "/fixture/git/info/refs" &&
          requestUrl.searchParams.get("service") === "git-upload-pack") {
        gitDiscoveryRequest = {
          method: request.method,
          protocol: request.headers["git-protocol"] ?? "",
        };
        response.writeHead(200, {
          ...isolatedHeaders,
          "content-type": "application/x-git-upload-pack-advertisement",
        });
        response.end(
          "000eversion 2\n" +
          "0015agent=git/2.55.0\n" +
          "0013ls-refs=unborn\n" +
          "0020fetch=shallow wait-for-done\n" +
          "0012server-option\n" +
          "0017object-format=sha1\n" +
          "0010object-info\n" +
          "0000",
        );
        return;
      }
      if (requestUrl.pathname === "/__dolly_build_snapshot" &&
          request.method === "POST" && snapshotExportMode) {
        const declaredLength = Number(request.headers["content-length"]);
        if (!Number.isSafeInteger(declaredLength) || declaredLength <= 0 ||
            declaredLength > snapshotSizeLimit) {
          response.writeHead(413, isolatedHeaders).end("invalid snapshot size");
          return;
        }
        const chunks = [];
        let received = 0;
        for await (const chunk of request) {
          received += chunk.length;
          if (received > snapshotSizeLimit) {
            response.writeHead(413, isolatedHeaders).end("snapshot too large");
            return;
          }
          chunks.push(chunk);
        }
        if (received !== declaredLength) {
          response.writeHead(400, isolatedHeaders).end("incomplete snapshot");
          return;
        }
        snapshotUpload = Buffer.concat(chunks, received);
        response.writeHead(204, isolatedHeaders).end();
        return;
      }
      if (missingSnapshotMode &&
          (requestUrl.pathname === "/dist/dolly-system.snapshot" ||
           requestUrl.pathname === "/dist/dolly-system-snapshot.mjs")) {
        response.writeHead(404, isolatedHeaders).end("not found");
        return;
      }

      const route = decodeURIComponent(requestUrl.pathname).replace(/\/+$/, "") || "/";
      const relative = route === "/" || route === "/rebuild"
        ? "index.html"
        : route.slice(1);
      const path = resolve(projectDir, relative);
      const distAsset = relative.startsWith("dist/") &&
        path.startsWith(`${distDirectory}${sep}`);
      if ((request.method !== "GET" && request.method !== "HEAD") ||
          (!publicSources.has(relative) && !distAsset)) {
        response.writeHead(404, isolatedHeaders).end("not found");
        return;
      }
      const body = await readFile(path);
      response.writeHead(200, {
        ...isolatedHeaders,
        "content-type": mimeTypes.get(extname(path)) ?? "application/octet-stream",
      });
      response.end(request.method === "HEAD" ? undefined : body);
    } catch {
      response.writeHead(404).end("not found");
    }
  });
  return new Promise((resolveServer, reject) => {
    server.once("error", reject);
    server.listen(Number(process.env.DOLLY_BROWSER_PORT ?? 0), "127.0.0.1", () => resolveServer(server));
  });
}

async function waitForDebugPort(userDataDir, chrome) {
  const path = resolve(userDataDir, "DevToolsActivePort");
  for (let attempt = 0; attempt < 200; attempt++) {
    if (chrome.exitCode !== null) throw new Error(`Chrome exited with ${chrome.exitCode}`);
    try {
      const [port] = (await readFile(path, "utf8")).trim().split("\n");
      if (port) return Number(port);
    } catch {
      // Chrome creates the file after its debugging endpoint is listening.
    }
    await delay(50);
  }
  throw new Error("timed out waiting for Chrome debugging endpoint");
}

async function connectDebugger({ debugPort, page }) {
  const targetResponse = await fetch(
    `http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(page)}`,
    { method: "PUT" },
  );
  if (!targetResponse.ok) throw new Error(`could not create Chrome target: ${targetResponse.status}`);
  const target = await targetResponse.json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveSocket, reject) => {
    socket.addEventListener("open", resolveSocket, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id) return;
    const handler = pending.get(message.id);
    if (!handler) return;
    pending.delete(message.id);
    if (message.error) handler.reject(new Error(message.error.message));
    else handler.resolve(message.result);
  });

  function send(method, params = {}) {
    const id = nextId++;
    return new Promise((resolveCommand, reject) => {
      pending.set(id, { resolve: resolveCommand, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }
  return { socket, send };
}

async function evaluate(send, expression) {
  const evaluation = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (evaluation.exceptionDetails) {
    throw new Error(
      evaluation.exceptionDetails.exception?.description ?? "browser evaluation failed",
    );
  }
  return evaluation.result.value;
}

async function waitForValue(send, expression, predicate, description, attempts = 12000) {
  let value;
  for (let attempt = 0; attempt < attempts; attempt++) {
    value = await evaluate(send, expression);
    if (predicate(value)) return value;
    await delay(100);
  }
  throw new Error(`timed out waiting for ${description}: ${String(value)}`);
}

async function waitForHttpQuiet(send, minimumRequests, description, attempts = 1800) {
  let previousCompleted = -1;
  let quietPolls = 0;
  let state;
  for (let attempt = 0; attempt < attempts; attempt++) {
    state = await evaluate(send, `({
      active: window.__dolly?.httpActive ?? false,
      requests: window.__dolly?.httpRequestCount ?? 0,
      completed: window.__dolly?.httpCompletedRequestCount ?? 0,
    })`);
    if (!state.active && state.requests >= minimumRequests &&
        state.completed === state.requests && state.completed === previousCompleted) {
      quietPolls += 1;
      if (quietPolls >= 20) return state;
    } else {
      quietPolls = 0;
    }
    previousCompleted = state.completed;
    await delay(100);
  }
  throw new Error(`timed out waiting for ${description}: ${JSON.stringify(state)}`);
}

async function readSecretLine() {
  process.stdin.setEncoding("utf8");
  const raw = process.stdin.isTTY && typeof process.stdin.setRawMode === "function";
  if (raw) process.stdin.setRawMode(true);
  let buffered = "";
  try {
    for await (const chunk of process.stdin) {
      if (chunk.includes("\x03")) throw new Error("secret input cancelled");
      buffered += chunk;
      const newline = buffered.search(/[\r\n]/);
      if (newline >= 0) return buffered.slice(0, newline).trim();
    }
    return buffered.trim();
  } finally {
    if (raw) process.stdin.setRawMode(false);
  }
}

async function dispatchKey(send, {
  key,
  code,
  modifiers = 0,
  windowsVirtualKeyCode = 0,
  text = "",
}) {
  const common = {
    key,
    code,
    modifiers,
    windowsVirtualKeyCode,
    nativeVirtualKeyCode: windowsVirtualKeyCode,
  };
  await send("Input.dispatchKeyEvent", {
    type: "keyDown",
    ...common,
    ...(text ? { text } : {}),
  });
  await send("Input.dispatchKeyEvent", { type: "keyUp", ...common });
}

async function typeText(send, value) {
  for (const character of value) {
    const upper = character.toUpperCase();
    const isLetter = character >= "a" && character <= "z";
    await dispatchKey(send, {
      key: character,
      code: isLetter ? `Key${upper}` : "",
      windowsVirtualKeyCode: isLetter ? upper.charCodeAt(0) : character.charCodeAt(0),
      text: character,
    });
  }
}

async function inputText(send, value) {
  for (let offset = 0; offset < value.length; offset += 64) {
    const accepted = await evaluate(
      send,
      `window.__dolly.input(${JSON.stringify(value.slice(offset, offset + 64))})`,
    );
    assert.equal(accepted, true, "Dolly's bounded text-input mailbox overflowed");
    await delay(10);
  }
}

async function waitForCommandResult(send, sequence, description) {
  return waitForValue(
    send,
    `(() => {
      const transport = window.__dolly.transport;
      return transport.currentResultSequence() === ${sequence}
        ? null
        : Atomics.load(
            transport.words,
            transport.word + transport.constructor.resultStatus,
          );
    })()`,
    (value) => value !== null,
    description,
    600,
  );
}

async function enterRecoveryShell(send) {
  const piPid = await waitForValue(
    send,
    "window.__dolly?.foregroundPid ?? 0",
    (value) => value > 0,
    "default Pi foreground process",
    600,
  );
  await delay(500);
  await dispatchKey(send, {
    key: "d",
    code: "KeyD",
    modifiers: 2,
    windowsVirtualKeyCode: 68,
  });
  return waitForValue(
    send,
    "window.__dolly?.foregroundPid ?? 0",
    (value) => value > 0 && value !== piPid,
    "recovery Slop foreground process",
    600,
  );
}

async function visibleTerminalText(send) {
  await evaluate(send, `(() => {
    const transport = window.__dolly.transport;
    const geometry = transport.geometry();
    const dimensions = transport.dimensions();
    if (!geometry.cellWidth || !geometry.cellHeight ||
        !dimensions.cols || !dimensions.rows) return false;
    const startX = geometry.paddingX + Math.floor(geometry.cellWidth / 2);
    const startY = geometry.paddingY + Math.floor(geometry.cellHeight / 2);
    const endX = geometry.paddingX +
      Math.max(0, dimensions.cols - 1) * geometry.cellWidth +
      Math.floor(geometry.cellWidth / 2);
    const endY = geometry.paddingY +
      Math.max(0, dimensions.rows - 1) * geometry.cellHeight +
      Math.floor(geometry.cellHeight / 2);
    transport.pushPointer(startX, startY, 1, {});
    transport.pushPointer(endX, endY, 2, {});
    transport.pushPointer(endX, endY, 0, {});
    return true;
  })()`);
  await delay(30);
  return await evaluate(send, "window.__dolly.copySelection() ?? ''");
}

async function clearTerminalSelection(send) {
  await evaluate(send, `(() => {
    const transport = window.__dolly.transport;
    const geometry = transport.geometry();
    const x = geometry.paddingX + Math.floor(geometry.cellWidth / 2);
    const y = geometry.paddingY + Math.floor(geometry.cellHeight / 2);
    transport.pushPointer(x, y, 1, {});
    transport.pushPointer(x, y, 0, {});
  })()`);
  await delay(50);
}

async function terminalPaletteEvidence(send) {
  return await evaluate(send, `(() => {
    const canvas = document.querySelector('#display');
    const context = canvas.getContext('2d');
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const geometry = window.__dolly.transport.geometry();
    const cursorLeft = geometry.paddingX + geometry.cursorCol * geometry.cellWidth;
    const cursorTop = geometry.paddingY + geometry.cursorRow * geometry.cellHeight;
    const cursorRight = cursorLeft + geometry.cellWidth;
    const cursorBottom = cursorTop + geometry.cellHeight;
    let accent = 0;
    let accentOutsideCursor = 0;
    let foreground = 0;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const index = (y * canvas.width + x) * 4;
        const r = pixels[index];
        const g = pixels[index + 1];
        const b = pixels[index + 2];
        if (r === 242 && g === 212 && b === 92) {
          accent++;
          if (x < cursorLeft || x >= cursorRight || y < cursorTop || y >= cursorBottom) {
            accentOutsideCursor++;
          }
        }
        if (r === 232 && g === 227 && b === 215) foreground++;
      }
    }
    return { accent, accentOutsideCursor, foreground };
  })()`);
}

async function waitForTerminalText(send, pattern, description) {
  let lastText = "";
  for (let attempt = 0; attempt < 300; attempt++) {
    lastText = await visibleTerminalText(send);
    if (pattern.test(lastText)) return lastText;
    await delay(50);
  }
  throw new Error(
    `timed out waiting for terminal text: ${description}\n` +
    `last visible terminal text:\n${lastText}`,
  );
}

async function typeCorrectedHelp(send) {
  for (const character of "helx") {
    const upper = character.toUpperCase();
    await dispatchKey(send, {
      key: character,
      code: `Key${upper}`,
      windowsVirtualKeyCode: upper.charCodeAt(0),
      text: character,
    });
  }
  await dispatchKey(send, {
    key: "Backspace",
    code: "Backspace",
    windowsVirtualKeyCode: 8,
  });
  await dispatchKey(send, {
    key: "p",
    code: "KeyP",
    windowsVirtualKeyCode: 80,
    text: "p",
  });
  await dispatchKey(send, {
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
  });
}

const server = await startServer();
const address = server.address();
const externalPage = process.env.DOLLY_BROWSER_PAGE;
if (pagesLiveMode &&
    (externalPage === undefined ||
     !/^https:\/\/[a-z0-9-]+\.github\.io\/[a-z0-9._/-]*$/i.test(externalPage))) {
  throw new Error("pages-live mode requires an HTTPS github.io DOLLY_BROWSER_PAGE");
}
const rebuildPage = `http://${browserHostname}:${address.port}/rebuild`;
const snapshotPage = `http://${browserHostname}:${address.port}/?autorun=shell`;
const interactivePage = externalPage ?? `http://${browserHostname}:${address.port}/`;
let openRouterSecret = piOpenRouterMode ? await readSecretLine() : "";
if (piOpenRouterMode && !/^sk-or-v1-[A-Za-z0-9_-]+$/.test(openRouterSecret)) {
  throw new Error("Pi OpenRouter mode requires one API key line on standard input");
}
const fixtureCredential = "Bearer sandbox-placeholder";
const fixturePolicy = {
  maxRequests: 256,
  rules: [
    {
      origin: "https://auth.openai.com",
      path: "/oauth/token",
      methods: ["POST"],
    },
    {
      origin: new URL(interactivePage).origin,
      pathPrefix: "/fixture/pi/",
      methods: ["POST"],
      credentialHeaders: ["authorization"],
    },
    {
      origin: new URL(interactivePage).origin,
      pathPrefix: "/fixture/",
      methods: ["GET", "POST"],
    },
  ],
};
if (piOpenRouterMode) {
  fixturePolicy.rules.unshift({
    origin: "https://openrouter.ai",
    path: "/api/v1/chat/completions",
    methods: ["POST"],
    credentialHeaders: ["authorization"],
    maxRequestBytes: 2 * 1024 * 1024,
    maxResponseBytes: 16 * 1024 * 1024,
    timeoutMilliseconds: 120_000,
  });
}
const requestedProfile = process.env.DOLLY_BROWSER_PROFILE;
let ephemeralProfileRoot = null;
let persistentProfile = requestedProfile;
let userDataDir;
if (piOpenRouterMode) {
  // The real credential is intentionally copied into Dolly's ephemeral
  // in-memory filesystem. A fresh browser profile avoids unrelated persistence
  // outside that sandbox while exercising the same setup applications use.
  ephemeralProfileRoot = await mkdtemp(`${tmpdir()}/dolly-openrouter-chrome-`);
  userDataDir = resolve(ephemeralProfileRoot, "profile");
  await mkdir(userDataDir, { recursive: true });
  persistentProfile = null;
} else {
  userDataDir = requestedProfile
    ? resolve(requestedProfile)
    : await mkdtemp(`${tmpdir()}/dolly-chrome-`);
  if (requestedProfile) await mkdir(userDataDir, { recursive: true });
}
for (const transient of [
  "DevToolsActivePort",
  "SingletonCookie",
  "SingletonLock",
  "SingletonSocket",
]) {
  await rm(resolve(userDataDir, transient), { force: true });
}
const chrome = spawn(chromeBinary, [
  "--headless=new",
  "--no-sandbox",
  "--disable-gpu",
  "--remote-debugging-port=0",
  `--user-data-dir=${userDataDir}`,
  "--window-size=1280,800",
  "about:blank",
], { stdio: "ignore" });

let debuggerClient;
try {
  const debugPort = await waitForDebugPort(userDataDir, chrome);
  debuggerClient = await connectDebugger({
    debugPort,
    page: "about:blank",
  });
  await debuggerClient.send("Runtime.enable");
  await debuggerClient.send("Page.enable");
  await debuggerClient.send("Browser.grantPermissions", {
    origin: new URL(interactivePage).origin,
    permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
  });
  await debuggerClient.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      globalThis.DOLLY_HTTP_POLICY = ${JSON.stringify(fixturePolicy)};
      const nativeFetch = globalThis.fetch.bind(globalThis);
      globalThis.__dollyCodexTokenRequests = [];
      globalThis.fetch = async (input, init) => {
        const target = new URL(
          input instanceof Request ? input.url : String(input),
          location.href,
        );
        if (target.href === "https://auth.openai.com/oauth/token") {
          const request = new Request(target, init);
          globalThis.__dollyCodexTokenRequests.push({
            method: request.method,
            contentType: request.headers.get("content-type") ?? "",
            body: await request.clone().text(),
          });
          return new Response(${JSON.stringify(JSON.stringify({
            access_token: codexFixtureAccessToken,
            refresh_token: "dolly-browser-refresh-token",
            expires_in: 3600,
          }))}, {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return nativeFetch(input, init);
      };
      class DollyTestSpeechRecognition {
        start() {
          this.onstart?.();
          queueMicrotask(() => {
            this.onresult?.({ results: [{ 0: { transcript: "DOLLY VOICE BRIDGE" } }] });
            this.onend?.();
          });
        }
      }
      globalThis.SpeechRecognition = DollyTestSpeechRecognition;
    })();`,
  });
  await debuggerClient.send("Page.navigate", {
    url: snapshotExportMode
      ? rebuildPage
      : piDevelopmentMode || piOpenRouterMode || missingSnapshotMode
        || pagesIsolationMode || pagesLiveMode
        ? interactivePage
        : snapshotPage,
  });

  browserProof: {
    if (snapshotExportMode) {
      const output = resolve(process.env.DOLLY_SNAPSHOT_OUTPUT ?? "");
      const distDirectory = resolve(projectDir, "dist");
      if (!process.env.DOLLY_SNAPSHOT_OUTPUT ||
          !output.startsWith(`${distDirectory}${sep}`)) {
        throw new Error("snapshot export requires an output path inside Dolly's dist directory");
      }
      const state = await waitForValue(
        debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        (value) => value === "ready" || value === "failed",
        "Dolly source rebuild",
      );
      assert.equal(state, "ready");
      const evidence = await evaluate(debuggerClient.send, `(() => {
        const bootstrap = document.querySelector('#bootstrap-log').textContent;
        const snapshot = window.__dolly?.systemSnapshot;
        return {
          mode: document.documentElement.dataset.bootMode,
          snapshotBytes: Number(document.documentElement.dataset.snapshotBytes),
          exportedBytes: snapshot instanceof ArrayBuffer ? snapshot.byteLength : 0,
          bootstrap,
          lines: bootstrap.split('\\n').length,
        };
      })()`);
      assert.equal(evidence.mode, "rebuild");
      assert.ok(evidence.snapshotBytes > 0);
      assert.equal(evidence.exportedBytes, evidence.snapshotBytes);
      assert.ok(evidence.lines <= 40);
      assert.ok(evidence.bootstrap.length <= 8192);
      assert.match(evidence.bootstrap, /=== Dolly userspace ready ===/);
      assert.match(evidence.bootstrap, /captured \d+ byte precompiled system snapshot/);
      const uploadStatus = await evaluate(debuggerClient.send, `fetch(
        "/__dolly_build_snapshot",
        {
          method: "POST",
          headers: { "content-type": "application/octet-stream" },
          body: window.__dolly.systemSnapshot,
        },
      ).then((response) => response.status)`);
      assert.equal(uploadStatus, 204);
      assert.equal(snapshotUpload?.length, evidence.snapshotBytes);
      await writeFile(output, snapshotUpload, { flag: "wx" });
      console.log(`browser: exported ${snapshotUpload.length} byte system snapshot from /rebuild`);
      break browserProof;
    }
    if (missingSnapshotMode) {
      const state = await waitForValue(
        debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        (value) => value === "failed",
        "missing snapshot diagnostic",
        600,
      );
      assert.equal(state, "failed");
      const bootstrap = await evaluate(
        debuggerClient.send,
        "document.querySelector('#bootstrap-log').textContent",
      );
      assert.match(
        bootstrap,
        /The packaged system snapshot is missing\. Run npm run snapshot before serving Dolly\./,
      );
      assert.equal((bootstrap.match(/FATAL/g) ?? []).length, 1);
      assert.doesNotMatch(bootstrap, /runtime-worker\.mjs|onMessage@/);
      console.log("browser: missing snapshot shows one actionable build diagnostic");
      break browserProof;
    }
    if (pagesIsolationMode || pagesLiveMode) {
      const state = await waitForValue(
        debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        (value) => value === "ready" || value === "failed",
        "service-worker isolated Pages boot",
        1200,
      );
      assert.equal(state, "ready");
      assert.equal(await evaluate(debuggerClient.send, "crossOriginIsolated"), true);
      assert.equal(
        await evaluate(debuggerClient.send, "Boolean(navigator.serviceWorker.controller)"),
        true,
      );
      if (pagesLiveMode) {
        assert.equal(
          await evaluate(debuggerClient.send, "document.documentElement.dataset.bootMode"),
          "snapshot",
        );
        assert.equal(
          await evaluate(debuggerClient.send, "document.documentElement.dataset.terminal"),
          "ghostty-rgba-wasm",
        );
        assert.ok(await evaluate(debuggerClient.send, "window.__dolly.foregroundPid") > 0);
        assert.equal(
          await evaluate(debuggerClient.send, '"DOLLY_HTTP_POLICY" in globalThis'),
          false,
        );
        console.log("browser: live Pages booted isolated Ghostty and default Pi");
      } else {
        console.log("browser: Pages service worker established cross-origin isolation");
      }
      break browserProof;
    }
    if (piDevelopmentMode || piOpenRouterMode) {
      const state = await waitForValue(
        debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        (value) => value === "ready" || value === "failed",
        "Dolly snapshot boot for Pi",
        1200,
      );
      assert.equal(state, "ready");
      await enterRecoveryShell(debuggerClient.send);

      const modelConfig = JSON.stringify(piOpenRouterMode ? {
        providers: {
          "dolly-openrouter": {
            baseUrl: "https://openrouter.ai/api/v1",
            api: "openai-completions",
            apiKey: openRouterSecret,
            models: [{
              id: "deepseek/deepseek-v4-flash-0731",
              name: "DeepSeek V4 Flash 0731 through OpenRouter",
              reasoning: true,
              input: ["text"],
              contextWindow: 1_310_720,
              maxTokens: 393_216,
              cost: {
                input: 0.03,
                output: 0.16,
                cacheRead: 0.01,
                cacheWrite: 0,
              },
            }],
          },
        },
      } : {
        providers: {
          "dolly-test": {
            baseUrl: `${interactivePage.replace(/\/$/, "")}/fixture/pi/v1`,
            api: "openai-completions",
            apiKey: "sandbox-placeholder",
            models: [{
              id: "dolly-test-model",
              name: "Dolly browser fixture",
              reasoning: false,
              input: ["text"],
              contextWindow: 32_000,
              maxTokens: 4_096,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            }],
          },
        },
      });
      const writeModelConfig =
        `echo '${modelConfig}' > /home/dolly/.pi/agent/models.json`;
      const configStatus = await evaluate(
        debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(writeModelConfig)})`,
      );
      assert.equal(configStatus, 0);
      if (process.env.DOLLY_PI_SETUP_COMMAND) {
        const setupStatus = await evaluate(
          debuggerClient.send,
          `window.__dolly.submit(${JSON.stringify(process.env.DOLLY_PI_SETUP_COMMAND)})`,
        );
        if (setupStatus !== 0) {
          const failedSetupScreenshot = await debuggerClient.send("Page.captureScreenshot", {
            format: "png",
            fromSurface: true,
          });
          await writeFile(
            resolve(projectDir, "build/pi-chrome.png"),
            failedSetupScreenshot.data,
            "base64",
          );
        }
        assert.equal(setupStatus, 0);
      }

      const piCommand = process.env.DOLLY_PI_COMMAND ?? (piOpenRouterMode
        ? "pi --provider dolly-openrouter --model deepseek/deepseek-v4-flash-0731"
        : "pi --provider dolly-test --model dolly-test-model --api-key sandbox-placeholder");
      await evaluate(debuggerClient.send, `(() => {
        window.__piResult = null;
        window.__piPromise = window.__dolly.submit(
          ${JSON.stringify(piCommand)},
        ).then((status) => { window.__piResult = status; return status; });
      })()`);
      await waitForValue(
        debuggerClient.send,
        "({ foreground: window.__dolly.foregroundPid, result: window.__piResult })",
        (value) => value.foreground !== 0 || value.result !== null,
        "Pi interactive process",
        600,
      );
      const startup = await evaluate(
        debuggerClient.send,
        "({ foreground: window.__dolly.foregroundPid, result: window.__piResult, frame: Number(document.documentElement.dataset.frameSequence ?? 0) })",
      );
      assert.equal(startup.result, null, `Pi exited during startup with status ${startup.result}`);
      assert.notEqual(startup.foreground, 0);
      await delay(Number(process.env.DOLLY_PI_STARTUP_DELAY_MS ?? 3000));
      const settledStartup = await evaluate(
        debuggerClient.send,
        "({ foreground: window.__dolly.foregroundPid, result: window.__piResult })",
      );
      if (settledStartup.result !== null) {
        const failedScreenshot = await debuggerClient.send("Page.captureScreenshot", {
          format: "png",
          fromSurface: true,
        });
        await writeFile(
          resolve(projectDir, "build/pi-chrome.png"),
          failedScreenshot.data,
          "base64",
        );
      }
      assert.equal(
        settledStartup.result,
        null,
        `Pi exited during startup with status ${settledStartup.result}`,
      );
      assert.notEqual(settledStartup.foreground, 0);
      await waitForValue(
        debuggerClient.send,
        "Number(document.documentElement.dataset.frameSequence ?? 0)",
        (value) => value > startup.frame,
        "Pi TUI frame",
        200,
      );
      const piPalette = await terminalPaletteEvidence(debuggerClient.send);
      assert.ok(piPalette.foreground > 100, "Pi did not render normal foreground text");
      assert.ok(
        piPalette.accentOutsideCursor > 20,
        `Pi theme did not render yellow outside the cursor: ${JSON.stringify(piPalette)}`,
      );

      const screenshot = await debuggerClient.send("Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
      });
      await writeFile(
        resolve(projectDir, piOpenRouterMode
          ? "build/pi-openrouter-start-chrome.png"
          : "build/pi-start-chrome.png"),
        screenshot.data,
        "base64",
      );

      if (piOpenRouterMode) {
        const requestCountBefore = await evaluate(
          debuggerClient.send,
          "window.__dolly.httpRequestCount",
        );
        const extensionUrl = `${interactivePage.replace(/\/$/, "")}/fixture/pi-extension.js`;
        const installPrompt =
          "Install a Pi extension in this Dolly sandbox. Use the bash tool to run exactly: " +
          `mkdir -p /home/dolly/.pi/agent/extensions && curl -fsSL ${extensionUrl} ` +
          "-o /home/dolly/.pi/agent/extensions/installed-proof.js . " +
          "Then use the read tool to verify that file contains DOLLY-INSTALLED-EXTENSION-OK. " +
          "Do the work; do not merely describe it.";
        await inputText(debuggerClient.send, `/voice-prompt ${installPrompt}`);
        await dispatchKey(debuggerClient.send, {
          key: "Enter",
          code: "Enter",
          windowsVirtualKeyCode: 13,
        });
        const realTurn = await waitForHttpQuiet(
          debuggerClient.send,
          requestCountBefore + 3,
          "the real OpenRouter install turn",
        );
        assert.ok(realTurn.requests >= requestCountBefore + 3);

        const realScreenshot = await debuggerClient.send("Page.captureScreenshot", {
          format: "png",
          fromSurface: true,
        });
        await writeFile(
          resolve(projectDir, "build/pi-openrouter-chrome.png"),
          realScreenshot.data,
          "base64",
        );
        await dispatchKey(debuggerClient.send, {
          key: "d",
          code: "KeyD",
          modifiers: 2,
          windowsVirtualKeyCode: 68,
        });
        const realExitStatus = await waitForValue(
          debuggerClient.send,
          "window.__piResult",
          (value) => value !== null,
          "real-provider Pi exit",
          600,
        );
        assert.equal(realExitStatus, 0);
        const installedStatus = await evaluate(
          debuggerClient.send,
          "window.__dolly.submit(" + JSON.stringify(
            "grep DOLLY-INSTALLED-EXTENSION-OK /home/dolly/.pi/agent/extensions/installed-proof.js",
          ) + ")",
        );
        assert.equal(installedStatus, 0, "Pi did not install the requested extension");

        const fixtureConfig = JSON.stringify({
          providers: {
            "dolly-test": {
              baseUrl: `${interactivePage.replace(/\/$/, "")}/fixture/pi/v1`,
              api: "openai-completions",
              apiKey: "sandbox-placeholder",
              models: [{
                id: "dolly-test-model",
                name: "Dolly browser fixture",
                reasoning: false,
                input: ["text"],
                contextWindow: 32_000,
                maxTokens: 4_096,
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
              }],
            },
          },
        });
        const fixtureConfigStatus = await evaluate(
          debuggerClient.send,
          `window.__dolly.submit(${JSON.stringify(
            `echo '${fixtureConfig}' > /home/dolly/.pi/agent/models.json`,
          )})`,
        );
        assert.equal(fixtureConfigStatus, 0);
        piModelRequests.length = 0;
        await evaluate(debuggerClient.send, `(() => {
          window.__piResult = null;
          window.__piPromise = window.__dolly.submit(
            "pi --provider dolly-test --model dolly-test-model --api-key sandbox-placeholder",
          ).then((status) => { window.__piResult = status; return status; });
        })()`);
        await waitForValue(
          debuggerClient.send,
          "({ foreground: window.__dolly.foregroundPid, result: window.__piResult })",
          (value) => value.foreground !== 0 || value.result !== null,
          "restarted Pi with installed extension",
          600,
        );
        await delay(Number(process.env.DOLLY_PI_STARTUP_DELAY_MS ?? 3000));
        const restarted = await evaluate(
          debuggerClient.send,
          "({ foreground: window.__dolly.foregroundPid, result: window.__piResult })",
        );
        assert.equal(restarted.result, null);
        assert.notEqual(restarted.foreground, 0);

        const probePrompt = "Use the installed extension tool now.";
        await typeText(debuggerClient.send, probePrompt);
        await dispatchKey(debuggerClient.send, {
          key: "Enter",
          code: "Enter",
          windowsVirtualKeyCode: 13,
        });
        for (let attempt = 0; attempt < 600 && piModelRequests.length < 2; attempt++) {
          await delay(100);
        }
        assert.equal(piModelRequests.length, 2);
        const installedToolMessages = piModelRequests[1].payload.messages.filter(
          (message) => message.role === "tool",
        );
        assert.equal(installedToolMessages.length, 1);
        assert.match(
          JSON.stringify(installedToolMessages[0].content),
          /DOLLY-INSTALLED-EXTENSION-OK/,
        );
        await delay(500);
        const installedScreenshot = await debuggerClient.send("Page.captureScreenshot", {
          format: "png",
          fromSurface: true,
        });
        await writeFile(
          resolve(projectDir, "build/pi-installed-extension-chrome.png"),
          installedScreenshot.data,
          "base64",
        );
        await dispatchKey(debuggerClient.send, {
          key: "d",
          code: "KeyD",
          modifiers: 2,
          windowsVirtualKeyCode: 68,
        });
        const restartedExitStatus = await waitForValue(
          debuggerClient.send,
          "window.__piResult",
          (value) => value !== null,
          "restarted Pi exit",
          600,
        );
        assert.equal(restartedExitStatus, 0);
        console.log(
          "browser: real OpenRouter Pi turn installed an extension through Dolly HTTP; " +
          "restart loaded and invoked its tool; Ctrl-D exited both TUIs",
        );
        break browserProof;
      }

      const prompt = "Use the write tool to create the requested file.";
      const httpRequestCountBefore = await evaluate(
        debuggerClient.send,
        "window.__dolly.httpRequestCount",
      );
      await inputText(debuggerClient.send, `/voice-prompt ${prompt}`);
      await dispatchKey(debuggerClient.send, {
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
      });

      const thinkingStart = await waitForValue(
        debuggerClient.send,
        `({
          active: window.__dolly.httpActive,
          requests: window.__dolly.httpRequestCount,
          frame: Number(document.documentElement.dataset.frameSequence ?? 0),
        })`,
        (value) => value.active && value.requests > httpRequestCountBefore,
        "Pi's first active streaming request",
        200,
      );
      await delay(350);
      const thinkingAfter = await evaluate(
        debuggerClient.send,
        `({
          active: window.__dolly.httpActive,
          frame: Number(document.documentElement.dataset.frameSequence ?? 0),
        })`,
      );
      assert.equal(
        thinkingAfter.active,
        true,
        "the fixture response ended before the thinking-animation proof",
      );
      assert.ok(
        thinkingAfter.frame > thinkingStart.frame,
        `Pi's thinking indicator did not animate while HTTP was active ` +
          `(${thinkingStart.frame} -> ${thinkingAfter.frame})`,
      );

      let streamedPrefixText = "";
      for (let attempt = 0; attempt < 600; attempt++) {
        if (piFixtureStream.request === 3 && piFixtureStream.phase === "prefix") {
          streamedPrefixText = await visibleTerminalText(debuggerClient.send);
          if (streamedPrefixText.includes("DOLLY-PI-HTTP-")) break;
        }
        await delay(20);
      }
      assert.equal(
        piFixtureStream.request,
        3,
        "Pi did not reach the deliberately split final fixture response",
      );
      assert.equal(
        piFixtureStream.phase,
        "prefix",
        "Pi buffered the final response until after the fixture sent its suffix",
      );
      assert.match(streamedPrefixText, /DOLLY-PI-HTTP-/);
      assert.doesNotMatch(streamedPrefixText, /DOLLY-PI-HTTP-EDIT-OK/);

      const streamedTurn = await waitForHttpQuiet(
        debuggerClient.send,
        httpRequestCountBefore + 3,
        "Pi's three incrementally streamed fixture requests",
      );
      assert.equal(streamedTurn.requests, httpRequestCountBefore + 3);
      await waitForTerminalText(
        debuggerClient.send,
        /DOLLY-PI-HTTP-EDIT-OK/,
        "Pi's complete incrementally streamed response",
      );
      await clearTerminalSelection(debuggerClient.send);

      for (let attempt = 0; attempt < 600 && piModelRequests.length < 3; attempt++) {
        await delay(100);
      }
      assert.equal(piModelRequests.length, 3, "Pi did not complete its fixture tool round trip");
      assert.ok(piModelRequests.every((request) => request.authorization === fixtureCredential));
      assert.ok(
        piModelRequests.every((request) =>
          !JSON.stringify(request.payload).includes(fixtureCredential)),
        "the sandbox fixture credential unexpectedly crossed into Pi's JSON payload",
      );
      assert.ok(
        piModelRequests[0].payload.messages.some(
          (message) => message.role === "user" &&
            JSON.stringify(message.content).includes(prompt),
        ),
        `Pi fixture did not receive the typed prompt: ${JSON.stringify(
          piModelRequests[0].payload.messages,
        )}`,
      );
      const toolMessages = piModelRequests[1].payload.messages.filter(
        (message) => message.role === "tool",
      );
      assert.equal(toolMessages.length, 1);
      assert.match(
        JSON.stringify(toolMessages[0].content),
        /Wrote 31 bytes to \/workspace\/pi-http-test\.txt/,
        "Pi did not use Dolly's extension-provided write tool",
      );
      const editedToolMessages = piModelRequests[2].payload.messages.filter(
        (message) => message.role === "tool",
      );
      assert.equal(editedToolMessages.length, 2);
      assert.match(
        JSON.stringify(editedToolMessages.at(-1).content),
        /Edited \/workspace\/pi-http-test\.txt/,
        "Pi did not use Dolly's extension-provided edit tool",
      );
      await delay(500);

      const completedScreenshot = await debuggerClient.send("Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
      });
      await writeFile(
        resolve(projectDir, "build/pi-chrome.png"),
        completedScreenshot.data,
        "base64",
      );

      await dispatchKey(debuggerClient.send, {
        key: "d",
        code: "KeyD",
        modifiers: 2,
        windowsVirtualKeyCode: 68,
      });
      let exitStatus;
      try {
        exitStatus = await waitForValue(
          debuggerClient.send,
          "window.__piResult",
          (value) => value !== null,
          "Pi interactive exit",
          600,
        );
      } catch (error) {
        const failedExitScreenshot = await debuggerClient.send("Page.captureScreenshot", {
          format: "png",
          fromSurface: true,
        });
        await writeFile(
          resolve(projectDir, "build/pi-chrome.png"),
          failedExitScreenshot.data,
          "base64",
        );
        throw error;
      }
      assert.equal(exitStatus, 0);
      const fileStatus = await evaluate(
        debuggerClient.send,
        "window.__dolly.submit(\"grep \\\"pi crossed Dolly's HTTP broker via edit\\\" /workspace/pi-http-test.txt\")",
      );
      assert.equal(fileStatus, 0, "Pi's extension-provided write tool did not create the file");
      console.log(
        `browser: upstream Pi TUI started in Ghostty at frame ${startup.frame}, ` +
        "yellow theme, live thinking animation, incremental SSE, and Dolly " +
        "write/edit extension crossed the HTTP fixture; Ctrl-D exited; " +
        "screenshot build/pi-chrome.png",
      );
      break browserProof;
    }

  const snapshotStarted = Date.now();
  const snapshotReadyState = await waitForValue(
    debuggerClient.send,
    `location.pathname === '/'
      ? (document.documentElement?.dataset.dollyStatus ?? '')
      : ''`,
    (value) => value === "ready" || value === "passed" || value === "failed",
    "precompiled snapshot boot",
    1200,
  );
  assert.notEqual(snapshotReadyState, "failed");
  const snapshotBootMilliseconds = Date.now() - snapshotStarted;

  const state = await waitForValue(
    debuggerClient.send,
    "document.documentElement?.dataset.dollyStatus ?? ''",
    (value) => value === "passed" || value === "failed",
    "Dolly browser proof",
  );
  assert.equal(state, "passed");

  const resultSequence = await evaluate(
    debuggerClient.send,
    "window.__dolly.transport.currentResultSequence()",
  );
  const frameBeforeInput = await evaluate(
    debuggerClient.send,
    "Number(document.documentElement.dataset.frameSequence ?? 0)",
  );
  await typeCorrectedHelp(debuggerClient.send);
  const keyboardStatus = await waitForCommandResult(
    debuggerClient.send,
    resultSequence,
    "raw keyboard command result",
  );
  assert.equal(keyboardStatus, 0);
  await waitForValue(
    debuggerClient.send,
    "Number(document.documentElement.dataset.frameSequence ?? 0)",
    (value) => value > frameBeforeInput,
    "frame rendered after raw keyboard input",
    200,
  );

  let editorSequence = await evaluate(
    debuggerClient.send,
    "window.__dolly.transport.currentResultSequence()",
  );
  await typeText(debuggerClient.send, "pw");
  await dispatchKey(debuggerClient.send, {
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
  });
  await dispatchKey(debuggerClient.send, {
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
  });
  assert.equal(
    await waitForCommandResult(
      debuggerClient.send,
      editorSequence,
      "Tab-completed command result",
    ),
    0,
  );

  editorSequence = await evaluate(
    debuggerClient.send,
    "window.__dolly.transport.currentResultSequence()",
  );
  await dispatchKey(debuggerClient.send, {
    key: "ArrowUp",
    code: "ArrowUp",
    windowsVirtualKeyCode: 38,
  });
  await dispatchKey(debuggerClient.send, {
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
  });
  assert.equal(
    await waitForCommandResult(
      debuggerClient.send,
      editorSequence,
      "history replay command result",
    ),
    0,
  );

  editorSequence = await evaluate(
    debuggerClient.send,
    "window.__dolly.transport.currentResultSequence()",
  );
  await typeText(debuggerClient.send, "hel");
  await dispatchKey(debuggerClient.send, {
    key: "r",
    code: "KeyR",
    modifiers: 2,
    windowsVirtualKeyCode: 82,
  });
  await dispatchKey(debuggerClient.send, {
    key: "Enter",
    code: "Enter",
    windowsVirtualKeyCode: 13,
  });
  assert.equal(
    await waitForCommandResult(
      debuggerClient.send,
      editorSequence,
      "reverse history search command result",
    ),
    0,
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      "window.__dolly.submit(\"grep -q '^help$' \\\"$HISTFILE\\\"\")",
    ),
    0,
    "plain in-Wasm shell history was not grepable",
  );

  for (const [command, description] of [
    ["./interrupt-loop", "compiler-instrumented C loop"],
    ["qjs -e 'for (;;) {}'", "QuickJS bytecode loop"],
  ]) {
    await evaluate(
      debuggerClient.send,
      `window.__interruptResult = null;
       window.__dolly.submit(${JSON.stringify(command)}).then(
         status => { window.__interruptResult = { status }; },
         error => { window.__interruptResult = { error: String(error) }; },
       ); true`,
    );
    await waitForValue(
      debuggerClient.send,
      "window.__dolly.transport.foregroundInterruptible()",
      (value) => value === true,
      `${description} foreground ownership`,
      200,
    );
    await dispatchKey(debuggerClient.send, {
      key: "c",
      code: "KeyC",
      modifiers: 2,
      windowsVirtualKeyCode: 67,
    });
    const interrupted = await waitForValue(
      debuggerClient.send,
      "window.__interruptResult",
      (value) => value !== null,
      `${description} SIGINT result`,
      200,
    );
    assert.deepEqual(interrupted, { status: 130 });
  }
  assert.equal(
    await evaluate(
      debuggerClient.send,
      "window.__dolly.submit(\"echo SESSION-SURVIVED-SIGINT > interrupt-survived.txt\")",
    ),
    0,
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      "window.__dolly.submit(\"grep -q SESSION-SURVIVED-SIGINT interrupt-survived.txt\")",
    ),
    0,
    "the shell or shared filesystem did not survive foreground SIGINT",
  );

  await evaluate(
    debuggerClient.send,
    `window.__graphicsResult = null;
     window.__dolly.submit("graphics-demo").then(
       status => { window.__graphicsResult = { status }; },
       error => { window.__graphicsResult = { error: String(error) }; },
     ); true`,
  );
  await waitForValue(
    debuggerClient.send,
    "window.__dolly.graphicsActive",
    (value) => value === true,
    "graphics framebuffer ownership",
    200,
  );
  const graphicsPixels = await waitForValue(
    debuggerClient.send,
    `(() => {
      const canvas = document.querySelector('#display');
      const pixels = canvas.getContext('2d')
        .getImageData(0, 0, canvas.width, canvas.height).data;
      let background = 0;
      let accent = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index] === 22 && pixels[index + 1] === 26 &&
            pixels[index + 2] === 29 && pixels[index + 3] === 255) background++;
        if (pixels[index] === 242 && pixels[index + 1] === 212 &&
            pixels[index + 2] === 92 && pixels[index + 3] === 255) accent++;
      }
      return { background, accent };
    })()`,
    (value) => value.background > 1000 && value.accent > 100,
    "graphics-demo RGBA frame",
    200,
  );
  assert.ok(graphicsPixels.background > graphicsPixels.accent);
  assert.equal(
    await evaluate(debuggerClient.send, "window.__dolly.key('q', 'KeyQ')"),
    true,
  );
  assert.deepEqual(
    await waitForValue(
      debuggerClient.send,
      "window.__graphicsResult",
      (value) => value !== null,
      "graphics-demo normal release",
      200,
    ),
    { status: 0 },
  );
  assert.equal(await evaluate(debuggerClient.send, "window.__dolly.graphicsActive"), false);
  assert.equal(
    await evaluate(
      debuggerClient.send,
      "window.__dolly.submit('echo GRAPHICS-RESTORED > graphics-restored.txt')",
    ),
    0,
  );

  await evaluate(
    debuggerClient.send,
    `window.__graphicsInterruptResult = null;
     window.__dolly.submit("graphics-demo").then(
       status => { window.__graphicsInterruptResult = { status }; },
       error => { window.__graphicsInterruptResult = { error: String(error) }; },
     ); true`,
  );
  await waitForValue(
    debuggerClient.send,
    "window.__dolly.graphicsActive",
    (value) => value === true,
    "interruptible graphics framebuffer ownership",
    200,
  );
  await dispatchKey(debuggerClient.send, {
    key: "c",
    code: "KeyC",
    modifiers: 2,
    windowsVirtualKeyCode: 67,
  });
  assert.deepEqual(
    await waitForValue(
      debuggerClient.send,
      "window.__graphicsInterruptResult",
      (value) => value !== null,
      "graphics-demo SIGINT restoration",
      200,
    ),
    { status: 130 },
  );
  assert.equal(await evaluate(debuggerClient.send, "window.__dolly.graphicsActive"), false);
  assert.equal(
    await evaluate(
      debuggerClient.send,
      "window.__dolly.submit('grep -q GRAPHICS-RESTORED graphics-restored.txt')",
    ),
    0,
    "terminal or filesystem did not survive forced graphics restoration",
  );

  const initialFontSize = await evaluate(debuggerClient.send, "window.__dolly.fontSize");
  await dispatchKey(debuggerClient.send, {
    key: "+",
    code: "Equal",
    modifiers: 10,
    windowsVirtualKeyCode: 187,
  });
  const increasedFontSize = await waitForValue(
    debuggerClient.send,
    "window.__dolly.fontSize",
    (value) => value > initialFontSize,
    "sandbox font-size increase",
    200,
  );
  await dispatchKey(debuggerClient.send, {
    key: "-",
    code: "Minus",
    modifiers: 2,
    windowsVirtualKeyCode: 189,
  });
  const restoredFontSize = await waitForValue(
    debuggerClient.send,
    "window.__dolly.fontSize",
    (value) => value === initialFontSize,
    "sandbox font-size restore",
    200,
  );

  await dispatchKey(debuggerClient.send, {
    key: "F11",
    code: "F11",
    windowsVirtualKeyCode: 122,
  });
  await waitForValue(
    debuggerClient.send,
    "document.documentElement.dataset.fullscreen ?? ''",
    (value) => value === "on" || value === "failed",
    "fullscreen transition",
    200,
  );
  await waitForValue(
    debuggerClient.send,
    `(() => {
      const canvas = document.querySelector('#display');
      return {
        width: canvas.width,
        height: canvas.height,
        cssWidth: canvas.clientWidth,
        cssHeight: canvas.clientHeight,
      };
    })()`,
    (value) => value.width === value.cssWidth && value.height === value.cssHeight,
    "framebuffer resize after fullscreen",
    200,
  );

  const pasteResultSequence = await evaluate(
    debuggerClient.send,
    "window.__dolly.transport.currentResultSequence()",
  );
  await evaluate(
    debuggerClient.send,
    `navigator.clipboard.writeText("echo PASTE-BRIDGE-OK > paste-bridge.txt\\n")`,
  );
  await evaluate(
    debuggerClient.send,
    'document.querySelector("#keyboard").focus({ preventScroll: true })',
  );
  await dispatchKey(debuggerClient.send, {
    key: "V",
    code: "KeyV",
    modifiers: 10,
    windowsVirtualKeyCode: 86,
  });
  const pasteStatus = await waitForValue(
    debuggerClient.send,
    `(() => {
      const transport = window.__dolly.transport;
      return transport.currentResultSequence() === ${pasteResultSequence}
        ? null
        : Atomics.load(
            transport.words,
            transport.word + transport.constructor.resultStatus,
          );
    })()`,
    (value) => value !== null,
    "clipboard paste command",
    200,
  );
  assert.equal(pasteStatus, 0);
  assert.equal(
    await evaluate(
      debuggerClient.send,
      'window.__dolly.submit("grep -q PASTE-BRIDGE-OK paste-bridge.txt")',
    ),
    0,
  );

  assert.equal(
    await evaluate(
      debuggerClient.send,
      'window.__dolly.submit("echo COPY-BRIDGE-TEXT")',
    ),
    0,
  );
  const selectionGeometry = await evaluate(debuggerClient.send, `(() => {
    const canvas = document.querySelector("#display");
    const bounds = canvas.getBoundingClientRect();
    const geometry = window.__dolly.transport.geometry();
    return { ...geometry, left: bounds.left, top: bounds.top,
      cssWidth: bounds.width, cssHeight: bounds.height,
      canvasWidth: canvas.width, canvasHeight: canvas.height };
  })()`);
  assert.ok(selectionGeometry.cursorRow > 0);
  const selectionRow = selectionGeometry.cursorRow - 1;
  const surfaceToCssX = (value) => selectionGeometry.left +
    value * selectionGeometry.cssWidth / selectionGeometry.canvasWidth;
  const surfaceToCssY = (value) => selectionGeometry.top +
    value * selectionGeometry.cssHeight / selectionGeometry.canvasHeight;
  const selectionStartX = surfaceToCssX(
    selectionGeometry.paddingX + selectionGeometry.cellWidth / 2,
  );
  const selectionEndX = surfaceToCssX(
    // Ghostty uses the pointer half within the final cell to decide whether
    // its grapheme is included. End on the right half of the final T.
    selectionGeometry.paddingX + selectionGeometry.cellWidth * 15.75,
  );
  const selectionY = surfaceToCssY(
    selectionGeometry.paddingY + selectionGeometry.cellHeight * (selectionRow + 0.5),
  );
  await debuggerClient.send("Input.dispatchMouseEvent", {
    type: "mousePressed", x: selectionStartX, y: selectionY,
    button: "left", buttons: 1, clickCount: 1,
  });
  await debuggerClient.send("Input.dispatchMouseEvent", {
    type: "mouseMoved", x: selectionEndX, y: selectionY,
    button: "left", buttons: 1,
  });
  await debuggerClient.send("Input.dispatchMouseEvent", {
    type: "mouseReleased", x: selectionEndX, y: selectionY,
    button: "left", buttons: 0, clickCount: 1,
  });
  const selectedText = await waitForValue(
    debuggerClient.send,
    "window.__dolly.copySelection()",
    (value) => value !== null,
    "in-Wasm terminal selection",
    200,
  );
  assert.equal(selectedText, "COPY-BRIDGE-TEXT");
  await dispatchKey(debuggerClient.send, {
    key: "C",
    code: "KeyC",
    modifiers: 10,
    windowsVirtualKeyCode: 67,
  });
  await waitForValue(
    debuggerClient.send,
    "document.documentElement.dataset.clipboard ?? ''",
    (value) => value === "copied" || value === "denied" || value === "failed",
    "Ctrl+Shift+C clipboard write",
    200,
  );
  assert.equal(
    await evaluate(debuggerClient.send, "navigator.clipboard.readText()"),
    "COPY-BRIDGE-TEXT",
  );

  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        `qjs -e "for (let i = 0; i < 100; i++) console.log('DOLLY-SCROLL-' + String(i).padStart(3, '0'))"`,
      )})`,
    ),
    0,
  );
  const bottomScrollText = await visibleTerminalText(debuggerClient.send);
  const bottomScrollRows = [...bottomScrollText.matchAll(/DOLLY-SCROLL-(\d+)/g)]
    .map((match) => Number(match[1]));
  assert.ok(bottomScrollRows.length > 3);
  const scrollFrame = await evaluate(
    debuggerClient.send,
    "Number(document.documentElement.dataset.frameSequence ?? 0)",
  );
  const scrollGeometry = await evaluate(
    debuggerClient.send,
    "window.__dolly.transport.geometry()",
  );
  await debuggerClient.send("Input.dispatchMouseEvent", {
    type: "mouseWheel",
    x: 400,
    y: 300,
    deltaX: 0,
    deltaY: -Math.max(1, scrollGeometry.cellHeight) * 20,
  });
  await waitForValue(
    debuggerClient.send,
    "Number(document.documentElement.dataset.frameSequence ?? 0)",
    (value) => value > scrollFrame,
    "in-Wasm Ghostty scroll frame",
    200,
  );
  const olderScrollText = await visibleTerminalText(debuggerClient.send);
  const olderScrollRows = [...olderScrollText.matchAll(/DOLLY-SCROLL-(\d+)/g)]
    .map((match) => Number(match[1]));
  assert.ok(olderScrollRows.length > 3);
  assert.ok(Math.min(...olderScrollRows) < Math.min(...bottomScrollRows));
  await evaluate(
    debuggerClient.send,
    "window.__dolly.transport.pushScroll(100000)",
  );
  await clearTerminalSelection(debuggerClient.send);
  await delay(50);

  await evaluate(debuggerClient.send, `(() => {
    window.__piLoginResult = null;
    window.__dolly.submit("pi --offline --no-session").then((status) => {
      window.__piLoginResult = status;
    });
  })()`);
  await waitForValue(
    debuggerClient.send,
    "({ foreground: window.__dolly.foregroundPid, result: window.__piLoginResult })",
    (value) => value.foreground !== 0 || value.result !== null,
    "Pi login TUI startup",
    600,
  );
  assert.equal(
    await evaluate(debuggerClient.send, "window.__piLoginResult"),
    null,
    "Pi exited before the OpenRouter login flow",
  );
  await waitForTerminalText(
    debuggerClient.send,
    /Warning: No models available/,
    "Pi startup without configured credentials",
  );
  await inputText(debuggerClient.send, "/login openrouter\r");
  await waitForTerminalText(
    debuggerClient.send,
    /Select authentication method for OpenRouter/,
    "OpenRouter authentication method selector",
  );
  await inputText(debuggerClient.send, "\x1b[B\r");
  await waitForTerminalText(
    debuggerClient.send,
    /Enter OpenRouter API key/,
    "OpenRouter API-key prompt",
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      'window.__dolly.paste("sandbox-login-key")',
    ),
    true,
  );
  await inputText(debuggerClient.send, "\r");
  await waitForTerminalText(
    debuggerClient.send,
    /Saved API key for OpenRouter/,
    "OpenRouter credential save",
  );
  await inputText(debuggerClient.send, "\x04");
  assert.equal(
    await waitForValue(
      debuggerClient.send,
      "window.__piLoginResult",
      (value) => value !== null,
      "Pi exit after OpenRouter login",
      600,
    ),
    0,
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      'window.__dolly.submit("grep -q sandbox-login-key /home/dolly/.pi/agent/auth.json")',
    ),
    0,
  );
  const openRouterModelsStatus = await evaluate(
    debuggerClient.send,
    'window.__dolly.submit("pi --list-models openrouter > /tmp/openrouter-login-models.txt")',
  );
  if (openRouterModelsStatus !== 0) {
    throw new Error(
      `Pi could not list OpenRouter models after /login (status ${openRouterModelsStatus})\n` +
      await visibleTerminalText(debuggerClient.send),
    );
  }
  assert.equal(
    await evaluate(
      debuggerClient.send,
      'window.__dolly.submit("grep -q openrouter /tmp/openrouter-login-models.txt")',
    ),
    0,
  );

  await evaluate(debuggerClient.send, `(() => {
    window.__piCodexResult = null;
    window.__dolly.submit("pi --offline --no-session").then((status) => {
      window.__piCodexResult = status;
    });
  })()`);
  await waitForValue(
    debuggerClient.send,
    "({ foreground: window.__dolly.foregroundPid, result: window.__piCodexResult })",
    (value) => value.foreground !== 0 || value.result !== null,
    "Pi Codex login TUI startup",
    600,
  );
  assert.equal(
    await evaluate(debuggerClient.send, "window.__piCodexResult"),
    null,
    "Pi exited before the Codex login flow",
  );
  await delay(3000);
  await inputText(debuggerClient.send, "/login openai-codex\r");
  await waitForTerminalText(
    debuggerClient.send,
    /Select OpenAI Codex login method/,
    "Codex login method selector",
  );
  await inputText(debuggerClient.send, "\r");
  const codexLoginText = await waitForTerminalText(
    debuggerClient.send,
    /Complete login in your browser, or paste the authorization code/,
    "Codex manual authorization-code fallback",
  );
  assert.match(codexLoginText, /auth\.openai\.com\/oauth\/authorize/);
  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.paste(${JSON.stringify(codexFixtureAuthorizationCode)})`,
    ),
    true,
  );
  await inputText(debuggerClient.send, "\r");
  await waitForTerminalText(
    debuggerClient.send,
    /Logged in to OpenAI Codex.*Credentials saved/,
    "completed Codex OAuth login",
  );
  await inputText(debuggerClient.send, "\x04");
  assert.equal(
    await waitForValue(
      debuggerClient.send,
      "window.__piCodexResult",
      (value) => value !== null,
      "Pi exit after cancelling Codex login",
      600,
    ),
    0,
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        `grep -q ${codexFixtureAccountId} /home/dolly/.pi/agent/auth.json`,
      )})`,
    ),
    0,
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      'window.__dolly.submit("pi --list-models openai-codex > /tmp/codex-login-models.txt")',
    ),
    0,
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      'window.__dolly.submit("grep -q openai-codex /tmp/codex-login-models.txt")',
    ),
    0,
  );
  const codexTokenRequests = await evaluate(
    debuggerClient.send,
    `globalThis.__dollyCodexTokenRequests.map((request) => ({
      ...request,
      parameters: Object.fromEntries(new URLSearchParams(request.body)),
    }))`,
  );
  assert.equal(codexTokenRequests.length, 1);
  assert.equal(codexTokenRequests[0].method, "POST");
  assert.match(
    codexTokenRequests[0].contentType,
    /^application\/x-www-form-urlencoded(?:;|$)/,
  );
  assert.equal(
    codexTokenRequests[0].parameters.grant_type,
    "authorization_code",
  );
  assert.equal(
    codexTokenRequests[0].parameters.code,
    codexFixtureAuthorizationCode,
  );
  assert.ok(codexTokenRequests[0].parameters.code_verifier.length >= 43);
  assert.equal(
    codexTokenRequests[0].parameters.redirect_uri,
    "http://localhost:1455/auth/callback",
  );
  await evaluate(debuggerClient.send, `(() => {
    const transport = window.__dolly.transport;
    const geometry = transport.geometry();
    const x = geometry.paddingX + Math.floor(geometry.cellWidth / 2);
    const y = geometry.paddingY + Math.floor(geometry.cellHeight / 2);
    transport.pushPointer(x, y, 1, {});
    transport.pushPointer(x, y, 0, {});
  })()`);
  await delay(50);

  const evidence = await evaluate(debuggerClient.send, `(() => {
    const canvas = document.querySelector('#display');
    const context = canvas.getContext('2d');
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let background = 0;
    let foreground = 0;
    let accent = 0;
    let opaque = 0;
    let cursorAccent = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      const a = pixels[index + 3];
      if (r === 38 && g === 38 && b === 38) background++;
      if (r === 232 && g === 227 && b === 215) foreground++;
      if (r === 242 && g === 212 && b === 92) accent++;
      if (a === 255) opaque++;
    }
    const transport = window.__dolly.transport;
    const geometry = transport.geometry();
    const cursorX = geometry.paddingX + geometry.cursorCol * geometry.cellWidth;
    const cursorY = geometry.paddingY + geometry.cursorRow * geometry.cellHeight;
    for (let y = cursorY; y < cursorY + geometry.cellHeight; y++) {
      for (let x = cursorX; x < cursorX + geometry.cellWidth; x++) {
        const index = (y * canvas.width + x) * 4;
        if (pixels[index] === 242 && pixels[index + 1] === 212 &&
            pixels[index + 2] === 92) cursorAccent++;
      }
    }
    return {
      state: document.documentElement.dataset.dollyStatus,
      defaultPi: document.documentElement.dataset.defaultPi,
      bootMode: document.documentElement.dataset.bootMode,
      snapshotBytes: Number(document.documentElement.dataset.snapshotBytes),
      interactive: document.documentElement.dataset.luaInteractive,
      terminal: document.documentElement.dataset.terminal,
      canvasHidden: canvas.hidden,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      cssWidth: canvas.clientWidth,
      cssHeight: canvas.clientHeight,
      frameSequence: Number(document.documentElement.dataset.frameSequence ?? 0),
      cols: Number(document.documentElement.dataset.terminalCols ?? 0),
      rows: Number(document.documentElement.dataset.terminalRows ?? 0),
      dropped: Atomics.load(transport.words, transport.word + transport.constructor.eventDropped),
      bars: document.querySelectorAll('header, footer').length,
      backgroundColor: getComputedStyle(document.body).backgroundColor,
      caretColor: getComputedStyle(document.querySelector('#terminal')).caretColor,
      bootstrapFontLoaded: document.fonts.check('600 15px "Dolly IosevkaTerm SemiBold"'),
      bootstrapHidden: document.querySelector('#bootstrap-log').hidden,
      bootstrap: document.querySelector('#bootstrap-log').textContent,
      networkError: document.documentElement.dataset.networkError ?? '',
      fullscreen: document.documentElement.dataset.fullscreen,
      fullscreenElement: Boolean(document.fullscreenElement),
      resultCount: window.__dolly.commandResults.length,
      totalPixels: pixels.length / 4,
      backgroundPixels: background,
      foregroundPixels: foreground,
      accentPixels: accent,
      cursorAccentPixels: cursorAccent,
      cursorCellPixels: geometry.cellWidth * geometry.cellHeight,
      opaquePixels: opaque,
    };
  })()`);

  assert.equal(evidence.state, "passed");
  assert.equal(evidence.defaultPi, "passed");
  assert.equal(evidence.bootMode, "snapshot");
  assert.ok(evidence.snapshotBytes > 0);
  assert.equal(evidence.interactive, "passed");
  assert.equal(evidence.terminal, "ghostty-rgba-wasm");
  assert.equal(evidence.canvasHidden, false);
  assert.ok(evidence.canvasWidth >= 800 && evidence.canvasHeight >= 550);
  assert.equal(evidence.canvasWidth, evidence.cssWidth);
  assert.equal(evidence.canvasHeight, evidence.cssHeight);
  assert.ok(evidence.frameSequence > 100);
  assert.ok(evidence.cols > 100 && evidence.rows > 20);
  assert.equal(evidence.dropped, 0);
  assert.equal(evidence.bars, 0);
  assert.equal(evidence.backgroundColor, "rgb(38, 38, 38)");
  assert.match(evidence.caretColor, /transparent|rgba\(0, 0, 0, 0\)/);
  assert.equal(evidence.bootstrapFontLoaded, true);
  assert.equal(evidence.bootstrapHidden, true);
  assert.equal(evidence.networkError, "");
  assert.equal(evidence.fullscreen, "on");
  assert.equal(evidence.fullscreenElement, true);
  assert.ok(evidence.resultCount > 100);
  assert.equal(evidence.opaquePixels, evidence.totalPixels);
  assert.ok(evidence.backgroundPixels > evidence.totalPixels * 0.5);
  assert.ok(evidence.foregroundPixels > 100);
  assert.ok(evidence.accentPixels > 10);
  assert.ok(evidence.cursorAccentPixels > evidence.cursorCellPixels * 0.5);
  assert.equal(initialFontSize, 15);
  assert.equal(increasedFontSize, 16);
  assert.equal(restoredFontSize, 15);
  assert.deepEqual(libcurlPostRequest, { header: "yes", body: "payload" });
  assert.deepEqual(gitDiscoveryRequest, { method: "GET", protocol: "version=2" });
  assert.equal(piModelRequests.length, 0);
  assert.ok(evidence.bootstrap.split("\n").length <= 40);
  assert.ok(evidence.bootstrap.length <= 8192);
  assert.match(evidence.bootstrap, /DOLLY \/ PRECOMPILED SYSTEM/);
  assert.match(evidence.bootstrap, /dolly: restoring precompiled system snapshot/);
  assert.match(evidence.bootstrap, /dolly: precompiled system restored/);
  assert.doesNotMatch(evidence.bootstrap, /building GNU make|bootstrapping Zig/);
  assert.match(evidence.bootstrap, /dolly: loading sandbox display driver/);
  assert.match(evidence.bootstrap, /dolly: sandbox display ready/);

  const screenshot = await debuggerClient.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });
  await writeFile(resolve(projectDir, "build/dolly-chrome.png"), screenshot.data, "base64");

  await dispatchKey(debuggerClient.send, {
    key: "F11",
    code: "F11",
    windowsVirtualKeyCode: 122,
  });
  await waitForValue(
    debuggerClient.send,
    "Boolean(document.fullscreenElement)",
    (value) => value === false,
    "fullscreen exit",
    200,
  );

  await debuggerClient.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await debuggerClient.send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 5,
  });
  await evaluate(debuggerClient.send, "dispatchEvent(new Event('resize'))");
  await waitForValue(
    debuggerClient.send,
    "document.documentElement.dataset.phone",
    (value) => value === "on",
    "phone-only Dolly controls",
    200,
  );
  const phoneButton = await evaluate(debuggerClient.send, `(() => {
    const bounds = document.querySelector('#phone-menu-button').getBoundingClientRect();
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  })()`);
  await debuggerClient.send("Input.dispatchMouseEvent", {
    type: "mousePressed", ...phoneButton, button: "left", buttons: 1, clickCount: 1,
  });
  await debuggerClient.send("Input.dispatchMouseEvent", {
    type: "mouseReleased", ...phoneButton, button: "left", buttons: 0, clickCount: 1,
  });
  assert.equal(
    await evaluate(debuggerClient.send, "document.querySelector('#phone-menu').dataset.open"),
    "true",
  );
  const voiceSequence = await evaluate(
    debuggerClient.send,
    "window.__dolly.transport.currentResultSequence()",
  );
  const voiceButton = await evaluate(debuggerClient.send, `(() => {
    const bounds = document.querySelector('[data-dolly-voice]').getBoundingClientRect();
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  })()`);
  await debuggerClient.send("Input.dispatchMouseEvent", {
    type: "mousePressed", ...voiceButton, button: "left", buttons: 1, clickCount: 1,
  });
  await debuggerClient.send("Input.dispatchMouseEvent", {
    type: "mouseReleased", ...voiceButton, button: "left", buttons: 0, clickCount: 1,
  });
  assert.equal(
    await waitForCommandResult(
      debuggerClient.send,
      voiceSequence,
      "browser speech transcript crossing into Slop",
    ),
    127,
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        `grep -q '/voice-prompt DOLLY VOICE BRIDGE' "$HISTFILE"`,
      )})`,
    ),
    0,
  );
  assert.equal(
    await evaluate(debuggerClient.send, "document.documentElement.dataset.voice"),
    "submitted",
  );

  console.log(
    `browser: sandbox Ghostty rendered ${evidence.canvasWidth}x${evidence.canvasHeight} ` +
    `(${evidence.cols}x${evidence.rows} cells), static snapshot boot ` +
    `${snapshotBootMilliseconds}ms, raw keys/Ctrl+Shift+V/C/block-cursor/zoom/fullscreen, ` +
    "Ghostty selection/scroll, phone menu/voice bridge, default Pi, " +
    "Pi OpenRouter credential storage/model discovery, and complete Codex OAuth exchange passed",
  );
  }
} catch (error) {
  if (debuggerClient) {
    const diagnostics = await evaluate(debuggerClient.send, `JSON.stringify({
      dataset: { ...document.documentElement.dataset },
      bootstrap: (document.querySelector('#bootstrap-log')?.textContent ?? '').slice(-5000),
    }, null, 2)`).catch(() => "browser diagnostics unavailable");
    process.stderr.write(`${diagnostics}\n`);
  }
  throw error;
} finally {
  debuggerClient?.socket.close();
  chrome.kill("SIGTERM");
  await new Promise((resolveExit) => {
    if (chrome.exitCode !== null) resolveExit();
    else chrome.once("exit", resolveExit);
  });
  await new Promise((resolveClose) => server.close(resolveClose));
  if (!persistentProfile && process.env.DOLLY_KEEP_BROWSER_PROFILE !== "1") {
    await rm(ephemeralProfileRoot ?? userDataDir, {
      recursive: true,
      maxRetries: 5,
      retryDelay: 50,
    });
  }
}
