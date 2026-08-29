#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, mkdtemp, rm } from "node:fs/promises";
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
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url, "http://127.0.0.1");
      if (requestUrl.pathname === "/fixture/http.txt") {
        response.writeHead(200, {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
          "cross-origin-opener-policy": "same-origin",
          "cross-origin-embedder-policy": "require-corp",
          "cross-origin-resource-policy": "same-origin",
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
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
          "cross-origin-opener-policy": "same-origin",
          "cross-origin-embedder-policy": "require-corp",
          "cross-origin-resource-policy": "same-origin",
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
                choices: [{ index: 0, delta: { content: "DOLLY-PI-HTTP-OK" }, finish_reason: null }],
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
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-store",
          "cross-origin-opener-policy": "same-origin",
          "cross-origin-embedder-policy": "require-corp",
          "cross-origin-resource-policy": "same-origin",
        });
        response.end(`${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`);
        return;
      }
      if (requestUrl.pathname === "/fixture/git/info/refs" &&
          requestUrl.searchParams.get("service") === "git-upload-pack") {
        gitDiscoveryRequest = {
          method: request.method,
          protocol: request.headers["git-protocol"] ?? "",
        };
        response.writeHead(200, {
          "content-type": "application/x-git-upload-pack-advertisement",
          "cache-control": "no-store",
          "cross-origin-opener-policy": "same-origin",
          "cross-origin-embedder-policy": "require-corp",
          "cross-origin-resource-policy": "same-origin",
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
        "content-type": mimeTypes.get(extname(path)) ?? "application/octet-stream",
        "cache-control": "no-store",
        "cross-origin-opener-policy": "same-origin",
        "cross-origin-embedder-policy": "require-corp",
        "cross-origin-resource-policy": "same-origin",
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

async function connectDebugger(url) {
  const targetResponse = await fetch(
    `http://127.0.0.1:${url.debugPort}/json/new?${encodeURIComponent(url.page)}`,
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
    throw new Error(evaluation.exceptionDetails.exception?.description ?? "browser evaluation failed");
  }
  return evaluation.result.value;
}

async function pressF11(send) {
  const key = {
    key: "F11",
    code: "F11",
    windowsVirtualKeyCode: 122,
    nativeVirtualKeyCode: 122,
  };
  await send("Input.dispatchKeyEvent", { type: "keyDown", ...key });
  await send("Input.dispatchKeyEvent", { type: "keyUp", ...key });
}

async function pressControlKey(send, key, code, windowsVirtualKeyCode) {
  const event = {
    key,
    code,
    modifiers: 2,
    windowsVirtualKeyCode,
    nativeVirtualKeyCode: windowsVirtualKeyCode,
  };
  await send("Input.dispatchKeyEvent", { type: "keyDown", ...event });
  await send("Input.dispatchKeyEvent", { type: "keyUp", ...event });
}

const server = await startServer();
const address = server.address();
const page = `http://127.0.0.1:${address.port}/?autorun=shell`;
const libcurlCheckBody =
  `int main(int argc, char **argv) { (void)argc; (void)argv; CURL *curl = curl_easy_init(); struct curl_slist *headers = 0; headers = curl_slist_append(headers, "X-Dolly-Test: yes"); curl_easy_setopt(curl, CURLOPT_URL, "http://127.0.0.1:${address.port}/fixture/libcurl-post"); curl_easy_setopt(curl, CURLOPT_POSTFIELDS, "payload"); curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE, 7L); curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers); CURLcode result = curl_easy_perform(curl); curl_slist_free_all(headers); curl_easy_cleanup(curl); return result; }`;
const libcurlSourceCommand =
  `awk 'BEGIN { print "#include <curl/curl.h>"; print "${libcurlCheckBody.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}" }' > libcurl-check.c`;
const makefileCommand =
  `awk 'BEGIN { print "WHERE := $(shell pwd)"; print "all: make-demo"; print "make-demo: make-main.o make-value.o"; print "\\t$(CC) make-main.o make-value.o -o $@"; print "make-main.o: make-main.c"; print "\\t$(CC) -std=c17 -c $< -o $@"; print "make-value.o: make-value.c"; print "\\t$(CC) -std=c17 -c $< -o $@"; print "report:"; print "\\t@echo MAKE-SHELL=$(SHELL)"; print "\\t@echo MAKE-WHERE=$(WHERE)" }' > Makefile`;
const gitFixtureCommand =
  `awk 'BEGIN {print "list"; print ""}' | /usr/libexec/git-core/git-remote-http origin http://127.0.0.1:${address.port}/fixture/git`;
const piFixtureCommand =
  `DOLLY_PI_BASE_URL=http://127.0.0.1:${address.port}/fixture/pi/v1 pi --http-self-test`;
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

  let state = "";
  // A cold browser run also interprets Zig's bootstrap compiler while building
  // Ghostty. Keep the polling responsive, but allow the intentionally simple
  // interpreter enough time on slower CI machines.
  for (let attempt = 0; attempt < 12000; attempt++) {
    state = await evaluate(
      debuggerClient.send,
      "document.documentElement?.dataset.dollyStatus ?? ''",
    );
    if (state === "passed" || state === "failed") break;
    await delay(100);
  }

  const initialFontSize = await evaluate(
    debuggerClient.send,
    "window.__dolly?.terminal?.options?.fontSize ?? 0",
  );
  await pressControlKey(debuggerClient.send, "=", "Equal", 187);
  const increasedFontSize = await evaluate(
    debuggerClient.send,
    "window.__dolly?.terminal?.options?.fontSize ?? 0",
  );
  await pressControlKey(debuggerClient.send, "-", "Minus", 189);
  const restoredFontSize = await evaluate(
    debuggerClient.send,
    "window.__dolly?.terminal?.options?.fontSize ?? 0",
  );

  await pressF11(debuggerClient.send);
  for (let attempt = 0; attempt < 100; attempt++) {
    const fullscreen = await evaluate(
      debuggerClient.send,
      "document.documentElement.dataset.fullscreen ?? ''",
    );
    if (fullscreen === "on" || fullscreen === "failed") break;
    await delay(20);
  }

  const evidence = await evaluate(debuggerClient.send, `({
    state: document.documentElement.dataset.dollyStatus,
    interactive: document.documentElement.dataset.luaInteractive,
    terminal: document.documentElement.dataset.terminal,
    canvas: Boolean(document.querySelector('#terminal canvas')),
    bars: document.querySelectorAll('header, footer').length,
    background: getComputedStyle(document.body).backgroundColor,
    caret: getComputedStyle(document.querySelector('#terminal')).caretColor,
    fontLoaded: document.fonts.check('15px "Dolly IosevkaTerm SemiBold"'),
    terminalFont: window.__dolly?.terminal?.options?.fontFamily ?? '',
    fullscreen: document.documentElement.dataset.fullscreen,
    fullscreenElement: Boolean(document.fullscreenElement),
    transcript: document.querySelector('#transcript')?.textContent ?? '',
    results: window.__dolly?.commandResults ?? [],
    html: document.documentElement.outerHTML,
  })`);

  try {
    assert.equal(evidence.state, "passed");
    assert.equal(evidence.interactive, "passed");
    assert.equal(evidence.terminal, "ghostty-web");
    assert.equal(evidence.canvas, true);
    assert.equal(evidence.bars, 0);
    assert.equal(evidence.background, "rgb(38, 38, 38)");
    assert.match(evidence.caret, /transparent|rgba\(0, 0, 0, 0\)/);
    assert.equal(evidence.fontLoaded, true);
    assert.match(evidence.terminalFont, /Dolly IosevkaTerm SemiBold/);
    assert.equal(initialFontSize, 15);
    assert.equal(increasedFontSize, 16);
    assert.equal(restoredFontSize, 15);
    assert.equal(evidence.fullscreen, "on");
    assert.equal(evidence.fullscreenElement, true);
    assert.deepEqual(libcurlPostRequest, { header: "yes", body: "payload" });
    assert.deepEqual(gitDiscoveryRequest, { method: "GET", protocol: "version=2" });
    assert.equal(piModelRequests.length, 2);
    assert.equal(piModelRequests[0].authorization, "Bearer dolly-no-secret");
    assert.ok(piModelRequests[0].payload.tools.some((tool) => tool.function?.name === "write"));
    assert.ok(piModelRequests[1].payload.messages.some((message) => message.role === "tool"));
    assert.match(
      evidence.transcript,
      /dolly: compiling \/usr\/src\/dolly\/slop\.c to \/bin\/slop inside Wasm/,
    );
    for (const command of [
      "help", "pwd", "cd", "cat", "echo", "mkdir", "touch", "rm", "clear", "ls", "cc", "ld", "ar",
    ]) {
      assert.match(
        evidence.transcript,
        new RegExp(`dolly: compiling /usr/src/dolly/commands/${command}\\.c to /bin/${command} inside Wasm`),
      );
    }
    assert.match(
      evidence.transcript,
      /dolly: compiling \/usr\/src\/dolly\/commands\/c\+\+\.c to \/bin\/c\+\+ inside Wasm/,
    );
    for (const phase of [
      "preparing Dolly userspace",
      "building GNU make",
      "bootstrapping Zig 0.16.0",
      "checking Zig-generated code",
      "building Ghostty VT",
      "inspecting Ghostty terminal cells",
      "building sbase commands",
      "building One True Awk",
      "building Fetch-backed libcurl and curl",
      "building zlib",
      "building Git",
      "building QuickJS-ng",
      "installing Pi agent",
      "building Dolly compiler probes",
      "Dolly userspace ready",
    ]) {
      assert.match(evidence.transcript, new RegExp(`=== ${phase} ===`));
    }
    assert.match(evidence.transcript, /\+ echo '=== building GNU make ==='/);
    assert.match(evidence.transcript, /\+ make -f \/usr\/src\/dolly\/startup\.mk zlib/);
    for (const marker of [
      "Dolly Slop: minimal agent-tool compatibility inside Wasm",
      "shell-created",
      "SLOP-C",
      "SLOP-AND",
      "SLOP-OR",
      "SLOP-NOT",
      "SLOP-VAR-42",
      "SLOP-SUB-/workspace",
      "first\nsecond",
      "awk-data.txt awk-one.txt awk-two.txt",
      "/workspace",
      "/workspace/path-test",
      "c++ /usr/src/dolly/cpp-check.cpp -o /usr/libexec/dolly/cpp-check",
      "cc /usr/src/dolly/demo.c -o /usr/bin/demo",
      "dolly toolchain: Clang/LLD 24, wasm64-unknown-emscripten",
      "command-local-exit-survived",
      "2:Beta",
      "grep-runtime-survived",
      "DOLLY-PIPE",
      "awk version 20260426",
      "Vone",
      "THREE",
      "FETCHED-THROUGH-BROWSER",
      "POSTED-THROUGH-LIBCURL",
      "git version 2.55.0",
      "GNU Make 4.4.1",
      "MAKE-SHELL=/bin/slop",
      "MAKE-WHERE=/workspace",
      "MAKE-42",
      "zig-check: Zig stage1 generated Dolly-compatible C inside WasmFS",
      "row 0:",
      "row 1:",
      "row 2:",
      "dolly@example.invalid",
      "root-commit",
      "tracked.txt",
      "cc: unsupported option: --definitely-unsupported",
      "QuickJS-ng 0.15.0",
      "JS-42",
      "ARGS-alpha:beta",
      "ESM-42",
      "QJS-PERSIST",
      "2,4,6",
      "JS-EXPECTED",
      "qjs: unsupported option: --unsupported",
      "0.84.4",
      "DOLLY-PI-OK",
      "pi agent wrote this inside WasmFS",
      "DOLLY-PI-HTTP-OK",
      "pi crossed Dolly's HTTP broker",
      "ls: unsupported option: -l",
      "     1\tshell-created",
      "ls",
      "lua",
      "lua from slop",
      "RESULT-42",
      "^C",
      "expected status",
      "PIPE-42",
      "writer: stored 49 bytes",
      "reader: observed 49 bytes",
      "inspector: dlopen module observed 49 bytes from WasmFS",
      "c++23: span/string_view module observed 49 bytes from WasmFS",
      "lua 5.5.1: observed 49 bytes from WasmFS; subprocess denied",
    ]) {
      assert.match(evidence.transcript, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    const gitIdentity = evidence.transcript.slice(
      evidence.transcript.indexOf("git config --global --get user.name"),
      evidence.transcript.indexOf("mkdir git-repo"),
    );
    assert.match(gitIdentity, /git config --global --get user\.name\nDolly\n/);
    assert.match(
      gitIdentity,
      /git config --global --get user\.email\ndolly@example\.invalid\n/,
    );
    assert.match(
      gitIdentity,
      /git config --global user\.email asdf\n[\s\S]*git config --global --get user\.email\nasdf\n/,
    );
    const defaultLsStart = evidence.transcript.indexOf("ls flags");
    const defaultLsEnd = evidence.transcript.indexOf("echo LS-ALL-BEGIN", defaultLsStart);
    const defaultLs = evidence.transcript.slice(defaultLsStart, defaultLsEnd);
    assert.match(defaultLs, /(?:^|\n)deep\n/);
    assert.match(defaultLs, /(?:^|\n)visible\n/);
    assert.doesNotMatch(defaultLs, /(?:^|\n)\.hidden\n/);
    const allLsStart = evidence.transcript.indexOf("ls -a flags");
    const allLsEnd = evidence.transcript.indexOf("echo LS-ALL-END", allLsStart);
    const allLs = evidence.transcript.slice(allLsStart, allLsEnd);
    for (const entry of [".", "..", ".hidden", "deep", "visible"]) {
      const escaped = entry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      assert.match(allLs, new RegExp(`(?:^|\\n)${escaped}\\n`));
    }
    const binStart = evidence.transcript.indexOf("ls /bin");
    const binEnd = evidence.transcript.indexOf("echo BIN-LIST-END", binStart);
    assert.ok(binStart >= 0 && binEnd > binStart, "could not isolate /bin listing");
    const binListing = evidence.transcript.slice(binStart, binEnd);
    for (const command of [
      "slop", "help", "pwd", "cat", "echo", "mkdir", "touch", "rm", "clear",
      "cd", "ls", "grep", "sed", "head", "wc", "awk", "cc", "c++", "ld", "ar",
    ]) {
      const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      assert.match(binListing, new RegExp(`(?:^|\\n)${escaped}\\n`));
    }
    assert.doesNotMatch(binListing, /(?:^|\n)(?:lua|demo)\n/);
    assert.doesNotMatch(binListing, /(?:^|\n)(?:.*tmp.*|\..*)\n/);
    const usrBinStart = evidence.transcript.indexOf("ls /usr/bin");
    const usrBinEnd = evidence.transcript.indexOf("echo USR-BIN-LIST-END", usrBinStart);
    assert.ok(usrBinStart >= 0 && usrBinEnd > usrBinStart, "could not isolate /usr/bin listing");
    const usrBinListing = evidence.transcript.slice(usrBinStart, usrBinEnd);
    for (const command of [
      "curl", "git", "make", "zig", "ghostty-vt", "qjs", "pi", "lua", "demo",
    ]) {
      assert.match(usrBinListing, new RegExp(`(?:^|\\n)${command}\\n`));
    }
    assert.doesNotMatch(
      usrBinListing,
      /(?:^|\n)(?:help|pwd|cd|cat|echo|mkdir|touch|rm|clear|ls|grep|sed|head|wc|awk|cc|c\+\+|ld|ar|.*tmp.*|\..*)\n/,
    );
    const zigVersionStart = evidence.transcript.indexOf("zig version");
    const zigVersion = evidence.transcript.slice(
      zigVersionStart,
      evidence.transcript.indexOf("ls /usr/lib/libghostty-vt.a", zigVersionStart),
    );
    assert.match(zigVersion, /\n0\.16\.0\n/);
    const grepCount = evidence.transcript.slice(
      evidence.transcript.indexOf("grep -c a corpus.txt"),
      evidence.transcript.indexOf("grep -v alpha corpus.txt"),
    );
    assert.match(grepCount, /\n2\n/);
    const grepInvertStart = evidence.transcript.indexOf("grep -v alpha corpus.txt");
    const grepInvert = evidence.transcript.slice(
      grepInvertStart,
      evidence.transcript.indexOf("grep -q Beta corpus.txt", grepInvertStart),
    );
    assert.match(grepInvert, /\nBeta\n/);
    const grepPipe = evidence.transcript.slice(
      evidence.transcript.indexOf("echo PIPE-GREP | grep PIPE"),
      evidence.transcript.indexOf("grep -Z"),
    );
    assert.match(grepPipe, /\nPIPE-GREP\n/);
    const sedSubstitute = evidence.transcript.slice(
      evidence.transcript.indexOf("sed s/Beta/Gamma/ corpus.txt"),
      evidence.transcript.indexOf("sed -n 2p corpus.txt"),
    );
    assert.match(sedSubstitute, /\nalpha\nGamma\n/);
    const sedSelect = evidence.transcript.slice(
      evidence.transcript.indexOf("sed -n 2p corpus.txt"),
      evidence.transcript.indexOf("echo SED-PIPE | sed s/SED/DOLLY/"),
    );
    assert.match(sedSelect, /\nBeta\n/);
    const headOutput = evidence.transcript.slice(
      evidence.transcript.indexOf("head -n 1 corpus.txt"),
      evidence.transcript.indexOf("head -1 beta.txt"),
    );
    assert.match(headOutput, /\nalpha\n/);
    const wcLines = evidence.transcript.slice(
      evidence.transcript.indexOf("wc -l corpus.txt"),
      evidence.transcript.indexOf("echo one | wc -w"),
    );
    assert.match(wcLines, /\n\s*2 corpus\.txt\n/);
    const wcWords = evidence.transcript.slice(
      evidence.transcript.indexOf("echo one | wc -w"),
      evidence.transcript.indexOf("awk --version"),
    );
    assert.match(wcWords, /\n\s*1\n/);
    const awkSeparator = evidence.transcript.slice(
      evidence.transcript.indexOf("awk -F:"),
      evidence.transcript.indexOf("echo \"one 2\""),
    );
    assert.match(awkSeparator, /\nvalue\n/);
    const awkSum = evidence.transcript.slice(
      evidence.transcript.indexOf("awk '{sum += $2}"),
      evidence.transcript.indexOf("awk -v prefix=V"),
    );
    assert.match(awkSum, /\n6\n/);
    const awkPipe = evidence.transcript.slice(
      evidence.transcript.indexOf("echo \"pipe 7\" | awk"),
      evidence.transcript.indexOf("echo 'a,\"b,c\"'"),
    );
    assert.match(awkPipe, /\n42\n/);
    const awkCsv = evidence.transcript.slice(
      evidence.transcript.indexOf("awk --csv"),
      evidence.transcript.indexOf("awk 'BEGIN {print system"),
    );
    assert.match(awkCsv, /\n2:b,c\n/);
    const awkPipeDeniedStart = evidence.transcript.indexOf(
      "awk 'BEGIN {status = (\"denied\"",
    );
    assert.notEqual(awkPipeDeniedStart, -1);
    const awkSystem = evidence.transcript.slice(
      evidence.transcript.indexOf("awk 'BEGIN {print system"),
      awkPipeDeniedStart,
    );
    assert.match(awkSystem, /\n-1\n/);
    assert.doesNotMatch(awkSystem, /(?:^|\n)HOST-ESCAPE\n/);
    const awkPipeDenied = evidence.transcript.slice(
      awkPipeDeniedStart,
      evidence.transcript.indexOf("awk -f", awkPipeDeniedStart),
    );
    assert.match(awkPipeDenied, /\n-1\n/);
    assert.equal(
      evidence.transcript.match(/dolly: shared in-Wasm filesystem verified/g)?.length,
      2,
    );
    assert.deepEqual(
      evidence.results.map(({ command, status }) => ({ command, status })),
      [
        { command: "help", status: 0 },
        { command: "echo shell-created > shell.txt", status: 0 },
        { command: "cat shell.txt", status: 0 },
        { command: "echo alpha > alpha.txt", status: 0 },
        { command: "echo Beta > beta.txt", status: 0 },
        { command: "cat alpha.txt beta.txt > corpus.txt", status: 0 },
        { command: "slop -c 'echo SLOP-C'", status: 0 },
        { command: "grep -q Beta corpus.txt && echo SLOP-AND", status: 0 },
        { command: "grep missing corpus.txt || echo SLOP-OR", status: 0 },
        { command: "! grep missing corpus.txt && echo SLOP-NOT", status: 0 },
        { command: "VALUE=42 slop -c 'echo SLOP-VAR-$VALUE'", status: 0 },
        { command: "echo SLOP-SUB-$(pwd)", status: 0 },
        { command: "echo first > append.txt", status: 0 },
        { command: "echo second >> append.txt", status: 0 },
        { command: "cat append.txt", status: 0 },
        { command: "grep -n -i beta corpus.txt", status: 0 },
        { command: "grep -c a corpus.txt", status: 0 },
        { command: "grep -v alpha corpus.txt", status: 0 },
        { command: "grep -q Beta corpus.txt", status: 0 },
        { command: "grep missing corpus.txt", status: 1 },
        { command: "echo PIPE-GREP | grep PIPE", status: 0 },
        { command: "grep -Z", status: 2 },
        { command: "echo grep-runtime-survived", status: 0 },
        { command: "sed s/Beta/Gamma/ corpus.txt", status: 0 },
        { command: "sed -n 2p corpus.txt", status: 0 },
        { command: "echo SED-PIPE | sed s/SED/DOLLY/", status: 0 },
        { command: "head -n 1 corpus.txt", status: 0 },
        { command: "head -1 beta.txt", status: 0 },
        { command: "wc -l corpus.txt", status: 0 },
        { command: "echo one | wc -w", status: 0 },
        { command: "awk --version", status: 0 },
        { command: "echo \"key:value\" > colon.txt", status: 0 },
        { command: "awk -F: '{print $2}' colon.txt", status: 0 },
        { command: "echo \"one 2\" > awk-one.txt", status: 0 },
        { command: "echo \"three 4\" > awk-two.txt", status: 0 },
        { command: "cat awk-one.txt awk-two.txt > awk-data.txt", status: 0 },
        { command: "echo awk-*.txt", status: 0 },
        { command: "awk '{sum += $2} END {print sum}' awk-data.txt", status: 0 },
        { command: "awk -v prefix=V '{print prefix $1}' awk-one.txt", status: 0 },
        { command: "echo '{print toupper($1)}' > upper.awk", status: 0 },
        { command: "awk -f upper.awk awk-two.txt", status: 0 },
        { command: "echo \"pipe 7\" | awk '{print $2 * 6}'", status: 0 },
        { command: "echo 'a,\"b,c\"' > csv.txt", status: 0 },
        { command: "awk --csv '{print NF \":\" $2}' csv.txt", status: 0 },
        { command: "awk 'BEGIN {print system(\"echo HOST-ESCAPE\")}'", status: 0 },
        { command: "awk 'BEGIN {status = (\"denied\" | getline value); print status; exit status == -1 ? 0 : 1}'", status: 0 },
        { command: "awk -f", status: 2 },
        { command: "curl -fsSL /fixture/http.txt -o fetched.txt", status: 0 },
        { command: "cat fetched.txt", status: 0 },
        { command: "curl -f /fixture/missing", status: 22 },
        { command: libcurlSourceCommand, status: 0 },
        { command: "cc libcurl-check.c -lcurl -o libcurl-check", status: 0 },
        { command: "./libcurl-check", status: 0 },
        { command: "git --version", status: 0 },
        { command: "git config --global --get user.name", status: 0 },
        { command: "git config --global --get user.email", status: 0 },
        { command: "git config --global user.email asdf", status: 0 },
        { command: "git config --global --get user.email", status: 0 },
        { command: "mkdir git-repo", status: 0 },
        { command: "cd git-repo", status: 0 },
        { command: "git init", status: 0 },
        { command: "echo tracked > tracked.txt", status: 0 },
        { command: "git add tracked.txt", status: 0 },
        { command: "git commit -m initial", status: 0 },
        { command: "git --no-pager log --oneline", status: 0 },
        { command: gitFixtureCommand, status: 0 },
        { command: "cd ..", status: 0 },
        { command: "pwd", status: 0 },
        { command: "mkdir path-test", status: 0 },
        { command: "cd path-test", status: 0 },
        { command: "pwd", status: 0 },
        { command: "cd ..", status: 0 },
        { command: "mkdir -p flags/deep", status: 0 },
        { command: "mkdir -p flags/deep", status: 0 },
        { command: "touch flags/.hidden", status: 0 },
        { command: "echo visible > flags/visible", status: 0 },
        { command: "ls flags", status: 0 },
        { command: "echo LS-ALL-BEGIN", status: 0 },
        { command: "ls -a flags", status: 0 },
        { command: "echo LS-ALL-END", status: 0 },
        { command: "cat -n shell.txt", status: 0 },
        { command: "pwd -P", status: 0 },
        { command: "rm -f flags/missing", status: 0 },
        { command: "rm -rf flags", status: 0 },
        { command: "ls flags", status: 1 },
        { command: "ls -l", status: 2 },
        { command: "touch -c absent", status: 0 },
        { command: "ls absent", status: 1 },
        { command: "echo -n tight > tight.txt", status: 0 },
        { command: "cat tight.txt", status: 0 },
        { command: "ls /bin", status: 0 },
        { command: "echo BIN-LIST-END", status: 0 },
        { command: "ls /usr/bin", status: 0 },
        { command: "echo USR-BIN-LIST-END", status: 0 },
        { command: "zig version", status: 0 },
        { command: "ls /usr/lib/libghostty-vt.a", status: 0 },
        { command: "ghostty-vt", status: 0 },
        { command: "cc --version", status: 0 },
        { command: "c++ --version", status: 0 },
        { command: "echo \"int answer(void) { return 42; }\" > answer.c", status: 0 },
        { command: "cc -Wall -Wextra -O2 -c answer.c -o answer.o", status: 0 },
        { command: "echo \"int answer(void); int main(int argc, char **argv) { (void)argc; (void)argv; return answer() == 42 ? 0 : 1; }\" > use.c", status: 0 },
        { command: "cc -std=c17 use.c answer.o -o c-multi", status: 0 },
        { command: "./c-multi", status: 0 },
        { command: "ld --help", status: 0 },
        { command: "cc -c use.c -o use.o", status: 0 },
        { command: "ld use.o answer.o -o c-linked", status: 0 },
        { command: "./c-linked", status: 0 },
        { command: "ld use.c -o rejected", status: 64 },
        { command: "ar --version", status: 0 },
        { command: "ar rcs libanswer.a answer.o", status: 0 },
        { command: "cc use.c libanswer.a -o archive-direct", status: 0 },
        { command: "./archive-direct", status: 0 },
        { command: "cc use.c -L. -lanswer -o archive-library", status: 0 },
        { command: "./archive-library", status: 0 },
        { command: "echo \"int main() { constexpr int value = 6 * 7; return value == 42 ? 0 : 1; }\" > cli.cpp", status: 0 },
        { command: "c++ -std=c++23 cli.cpp -o cpp-cli", status: 0 },
        { command: "./cpp-cli", status: 0 },
        { command: "echo \"void exit(int); int main(int argc, char **argv) { (void)argc; (void)argv; exit(23); }\" > exit23.c", status: 0 },
        { command: "cc exit23.c -o exit23", status: 0 },
        { command: "./exit23", status: 23 },
        { command: "echo command-local-exit-survived", status: 0 },
        { command: "cc --definitely-unsupported", status: 64 },
        { command: "make --version", status: 0 },
        { command: "echo \"int value(void) { return 42; }\" > make-value.c", status: 0 },
        { command: "echo \"#include <stdio.h>\" > make-main.c", status: 0 },
        { command: "echo \"int value(void); int main(void) { printf(\\\"MAKE-%d\\\\n\\\", value()); return value() == 42 ? 0 : 1; }\" >> make-main.c", status: 0 },
        { command: makefileCommand, status: 0 },
        { command: "make -j8 report", status: 0 },
        { command: "make -j8", status: 0 },
        { command: "./make-demo", status: 0 },
        { command: "make -j8", status: 0 },
        { command: "qjs --version", status: 0 },
        { command: "qjs -e \"console.log('JS-' + (6 * 7))\"", status: 0 },
        { command: "echo \"console.log('ARGS-' + scriptArgs.join(':'))\" > args.js", status: 0 },
        { command: "qjs args.js alpha beta", status: 0 },
        { command: "echo \"export const answer = 42\" > esm-value.mjs", status: 0 },
        { command: "echo \"import { answer } from './esm-value.mjs'; console.log('ESM-' + answer)\" > esm-main.mjs", status: 0 },
        { command: "qjs esm-main.mjs", status: 0 },
        { command: "qjs -e \"Dolly.writeFile('/workspace/qjs-persist.txt', 'QJS-PERSIST')\"", status: 0 },
        { command: "cat qjs-persist.txt", status: 0 },
        { command: "echo \"print([1,2,3].map(x => x * 2).join(','))\" | qjs -", status: 0 },
        { command: "qjs -e \"throw new Error('JS-EXPECTED')\"", status: 1 },
        { command: "qjs --unsupported", status: 64 },
        { command: "pi --version", status: 0 },
        { command: "pi --self-test", status: 0 },
        { command: "cat pi-self-test.txt", status: 0 },
        { command: piFixtureCommand, status: 0 },
        { command: "cat pi-http-test.txt", status: 0 },
        { command: "lua -e \"print('lua from slop')\"", status: 0 },
        { command: "lua", status: 0 },
        { command: "lua -e \"error('expected status')\"", status: 1 },
        { command: "echo \"print('PIPE-' .. (6 * 7))\" | lua", status: 0 },
        { command: "demo", status: 0 },
        { command: "demo", status: 0 },
      ],
    );
    await pressF11(debuggerClient.send);
    for (let attempt = 0; attempt < 100; attempt++) {
      if (!await evaluate(debuggerClient.send, "Boolean(document.fullscreenElement)")) break;
      await delay(20);
    }
    assert.equal(
      await evaluate(debuggerClient.send, "Boolean(document.fullscreenElement)"),
      false,
    );
  } catch (error) {
    process.stderr.write(`${evidence.transcript}\n${evidence.html}\n`);
    throw error;
  }

  console.log("browser: Dolly source-built Zig/Ghostty VT and passed the shared userspace proof");
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
