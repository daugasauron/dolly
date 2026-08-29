#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, resolve, sep } from "node:path";

const projectDir = resolve(import.meta.dirname, "..");
const chromeBinary = process.argv[2];
if (!chromeBinary) throw new Error("usage: browser-harness.mjs CHROME_BINARY");

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".data", "application/octet-stream"],
  [".woff2", "font/woff2"],
]);
let gitDiscoveryRequest = null;
let libcurlPostRequest = null;
const piModelRequests = [];

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function startServer() {
  const isolatedHeaders = {
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
        const hasToolResult = payload.messages?.some((message) => message.role === "tool");
        const events = hasToolResult
          ? [
              {
                id: "chatcmpl-dolly-2",
                object: "chat.completion.chunk",
                created: 0,
                model: "dolly-test-model",
                choices: [{
                  index: 0,
                  delta: { content: "DOLLY-PI-HTTP-OK" },
                  finish_reason: null,
                }],
              },
              {
                id: "chatcmpl-dolly-2",
                object: "chat.completion.chunk",
                created: 0,
                model: "dolly-test-model",
                choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
              },
            ]
          : [
              {
                id: "chatcmpl-dolly-1",
                object: "chat.completion.chunk",
                created: 0,
                model: "dolly-test-model",
                choices: [{
                  index: 0,
                  delta: {
                    role: "assistant",
                    tool_calls: [{
                      index: 0,
                      id: "call_dolly_write",
                      type: "function",
                      function: {
                        name: "write",
                        arguments: JSON.stringify({
                          path: "/workspace/pi-http-test.txt",
                          content: "pi crossed Dolly's HTTP broker\n",
                        }),
                      },
                    }],
                  },
                  finish_reason: null,
                }],
              },
              {
                id: "chatcmpl-dolly-1",
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
        response.end(
          `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`,
        );
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

      const relative = decodeURIComponent(requestUrl.pathname) === "/"
        ? "index.html"
        : decodeURIComponent(requestUrl.pathname).slice(1);
      const path = resolve(projectDir, relative);
      if (path !== projectDir && !path.startsWith(`${projectDir}${sep}`)) {
        response.writeHead(403).end("forbidden");
        return;
      }
      const body = await readFile(path);
      response.writeHead(200, {
        ...isolatedHeaders,
        "content-type": mimeTypes.get(extname(path)) ?? "application/octet-stream",
      });
      response.end(body);
    } catch {
      response.writeHead(404).end("not found");
    }
  });
  return new Promise((resolveServer, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolveServer(server));
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
const page = `http://127.0.0.1:${address.port}/?autorun=shell`;
const userDataDir = await mkdtemp(`${tmpdir()}/dolly-chrome-`);
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
  debuggerClient = await connectDebugger({ debugPort, page });
  await debuggerClient.send("Runtime.enable");
  await debuggerClient.send("Page.enable");

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
  const keyboardStatus = await waitForValue(
    debuggerClient.send,
    `(() => {
      const transport = window.__dolly.transport;
      return transport.currentResultSequence() === ${resultSequence}
        ? null
        : Atomics.load(
            transport.words,
            transport.word + transport.constructor.resultStatus,
          );
    })()`,
    (value) => value !== null,
    "raw keyboard command result",
    600,
  );
  assert.equal(keyboardStatus, 0);
  await waitForValue(
    debuggerClient.send,
    "Number(document.documentElement.dataset.frameSequence ?? 0)",
    (value) => value > frameBeforeInput,
    "frame rendered after raw keyboard input",
    200,
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

  const evidence = await evaluate(debuggerClient.send, `(() => {
    const canvas = document.querySelector('#display');
    const context = canvas.getContext('2d');
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let background = 0;
    let foreground = 0;
    let accent = 0;
    let opaque = 0;
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
    return {
      state: document.documentElement.dataset.dollyStatus,
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
      opaquePixels: opaque,
    };
  })()`);

  assert.equal(evidence.state, "passed");
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
  assert.equal(initialFontSize, 15);
  assert.equal(increasedFontSize, 16);
  assert.equal(restoredFontSize, 15);
  assert.deepEqual(libcurlPostRequest, { header: "yes", body: "payload" });
  assert.deepEqual(gitDiscoveryRequest, { method: "GET", protocol: "version=2" });
  assert.equal(piModelRequests.length, 2);
  assert.equal(piModelRequests[0].authorization, "Bearer dolly-no-secret");
  assert.ok(piModelRequests[0].payload.tools.some((tool) => tool.function?.name === "write"));
  assert.ok(piModelRequests[1].payload.messages.some((message) => message.role === "tool"));
  for (const phase of [
    "preparing Dolly userspace",
    "building GNU make",
    "bootstrapping Zig 0.16.0",
    "building Ghostty VT",
    "building Git",
    "installing Pi agent",
    "Dolly userspace ready",
  ]) {
    assert.match(evidence.bootstrap, new RegExp(`=== ${phase} ===`));
  }
  assert.match(evidence.bootstrap, /dolly: loading sandbox display driver/);
  assert.match(evidence.bootstrap, /dolly: sandbox display ready/);
  if (process.env.DOLLY_EXPECT_GHOSTTY_SOURCE_BUILD === "1") {
    assert.match(
      evidence.bootstrap,
      /zig build-obj[\s\S]*-femit-bin=\/tmp\/ghostty\/ghostty-vt\.c/,
    );
  }

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

  console.log(
    `browser: sandbox Ghostty rendered ${evidence.canvasWidth}x${evidence.canvasHeight} ` +
    `(${evidence.cols}x${evidence.rows} cells), raw keys/zoom/fullscreen passed`,
  );
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
  await rm(userDataDir, { recursive: true, maxRetries: 5, retryDelay: 50 });
}
