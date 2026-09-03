#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, resolve, sep } from "node:path";

import { discoverImageDefinitions, inspectStaticSources } from "./image-definitions.mjs";

const projectDir = resolve(import.meta.dirname, "..");
const imageDefinitions = await discoverImageDefinitions(projectDir);
const staticSources = await inspectStaticSources(projectDir, imageDefinitions);
const distDirectory = resolve(projectDir, "dist");
const chromeBinary = process.argv[2];
if (chromeBinary === "--help" || chromeBinary === "-h") {
  console.log("usage: browser-harness.mjs CHROME_BINARY");
  process.exit(0);
}
if (!chromeBinary || process.argv.length !== 3) {
  throw new Error("usage: browser-harness.mjs CHROME_BINARY");
}
const browserHostname = process.env.DOLLY_BROWSER_HOSTNAME ?? "127.0.0.1";
if (browserHostname !== "127.0.0.1" && browserHostname !== "localhost") {
  throw new Error("DOLLY_BROWSER_HOSTNAME must be 127.0.0.1 or localhost");
}
const browserBase = process.env.DOLLY_BROWSER_BASE ?? "/";
if (!browserBase.startsWith("/") || !browserBase.endsWith("/") ||
    browserBase.includes("//") || browserBase.split("/").some((part) => part === "." || part === "..")) {
  throw new Error("DOLLY_BROWSER_BASE must be an absolute path ending in /");
}
const browserBasePrefix = browserBase === "/" ? "" : browserBase.slice(0, -1);
const piDevelopmentMode = process.env.DOLLY_BROWSER_MODE === "pi";
const piOpenRouterMode = process.env.DOLLY_BROWSER_MODE === "pi-openrouter";
const piAuditMode = process.env.DOLLY_BROWSER_MODE === "pi-audit";
const realOpenRouterMode = piOpenRouterMode || piAuditMode;
const missingSnapshotMode = process.env.DOLLY_BROWSER_MODE === "snapshot-missing";
const snapshotExportMode = process.env.DOLLY_BROWSER_MODE === "snapshot-export";
const pagesIsolationMode = process.env.DOLLY_BROWSER_MODE === "pages-isolation";
const pagesLiveMode = process.env.DOLLY_BROWSER_MODE === "pages-live";
const menuMode = process.env.DOLLY_BROWSER_MODE === "menu";
const routeSmokeMode = process.env.DOLLY_BROWSER_MODE === "route-smoke";
const sessionMode = process.env.DOLLY_BROWSER_MODE === "session";
const hardSupervisorMode = process.env.DOLLY_BROWSER_MODE === "hard-supervisor";
const pythonPackageMode = process.env.DOLLY_BROWSER_MODE === "python-packages";
const targetPiMode = process.env.DOLLY_BROWSER_MODE === "target-pi";
const piAuditSpec = piAuditMode
  ? JSON.parse(await readFile(resolve(
      projectDir,
      process.env.DOLLY_PI_AUDIT_FILE ?? "scripts/pi-agent-audit-prompts.json",
    ), "utf8"))
  : null;
if (piAuditMode &&
    (!Array.isArray(piAuditSpec?.prompts) || piAuditSpec.prompts.length === 0 ||
     piAuditSpec.prompts.some((prompt) => typeof prompt !== "string" || prompt.length === 0) ||
     !Array.isArray(piAuditSpec?.probes) ||
     piAuditSpec.probes.some((probe) =>
       typeof probe === "string"
         ? probe.length === 0
         : probe === null || typeof probe !== "object" ||
           typeof probe.command !== "string" || probe.command.length === 0 ||
           (probe.status !== undefined && !Number.isInteger(probe.status))))) {
  throw new Error(
    "Pi audit input must contain prompts and string or { command, status } probes",
  );
}
const selectedImage = process.env.DOLLY_IMAGE ?? "default";
if (!new Set(imageDefinitions.map((definition) => definition.image)).has(selectedImage)) {
  throw new Error("DOLLY_IMAGE must name a source-visible Dollyfile image");
}
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
  [".md", "text/markdown; charset=utf-8"],
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
  ...imageDefinitions.map((definition) => definition.filename),
  "src/browser.mjs",
  "src/dollyfile-view.mjs",
  "src/dollyfile-viewer.mjs",
  "src/http-policy.mjs",
  "src/session-store.mjs",
  "src/runtime-worker.mjs",
]);
const sourceArtifacts = new Map(staticSources.map((source) => [
  source.path.slice(1),
  { relative: `dist/${source.path.slice(1)}`, source },
]));
const routeDocuments = new Map([
  ...imageDefinitions.flatMap(({ image }) => [
    [`/${image}`, `build/routes/${image}/index.html`],
    [`/${image}/rebuild`, `build/routes/${image}/rebuild/index.html`],
    [`/view/${image}`, `build/routes/view/${image}/index.html`],
  ]),
  ["/custom/rebuild", "build/routes/custom/rebuild/index.html"],
  ["/rebuild", "build/routes/rebuild/index.html"],
  ["/load", "build/routes/load/index.html"],
]);
let gitDiscoveryRequest = null;
let libcurlPostRequest = null;
let curlCliRequest = null;
let snapshotUpload = null;
const staticRequestPaths = new Set();
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
      if (requestUrl.pathname === "/fixture/curl-options" &&
          request.method === "POST") {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        curlCliRequest = {
          header: request.headers["x-dolly-cli"] ?? "",
          body: Buffer.concat(chunks).toString("utf8"),
        };
        response.writeHead(201, {
          ...isolatedHeaders,
          "content-type": "text/plain; charset=utf-8",
          "x-dolly-response": "yes",
        });
        response.end("CURL-CLI-OK\n");
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
        const wantsTypeScriptProbe = payload.messages?.some((message) =>
          message.role === "user" &&
          JSON.stringify(message.content).includes("TypeScript extension"));
        const nextTool = wantsTypeScriptProbe
          ? toolResultCount === 0 ? {
              name: "dolly_typescript_probe",
              arguments: "{}",
            } : null
          : wantsInstalledProbe
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
      const staticPath = browserBasePrefix === ""
        ? requestUrl.pathname
        : requestUrl.pathname === browserBasePrefix
          ? "/"
          : requestUrl.pathname.startsWith(`${browserBasePrefix}/`)
            ? requestUrl.pathname.slice(browserBasePrefix.length)
            : null;
      if (missingSnapshotMode &&
          (staticPath === "/dist/dolly-default-system.snapshot" ||
           staticPath === "/dist/dolly-default-system-snapshot.mjs")) {
        response.writeHead(404, isolatedHeaders).end("not found");
        return;
      }
      if (staticPath === null) {
        response.writeHead(404, isolatedHeaders).end("not found");
        return;
      }

      const route = decodeURIComponent(staticPath).replace(/\/+$/, "") || "/";
      const requested = route.slice(1);
      const relative = route === "/"
        ? "index.html"
        : routeDocuments.get(route) ?? sourceArtifacts.get(requested)?.relative ?? requested;
      const path = resolve(projectDir, relative);
      const distAsset = relative.startsWith("dist/") &&
        path.startsWith(`${distDirectory}${sep}`);
      if ((request.method !== "GET" && request.method !== "HEAD") ||
          (!publicSources.has(relative) && !routeDocuments.has(route) &&
           !sourceArtifacts.has(requested) &&
           !relative.startsWith("docs/") && !distAsset)) {
        response.writeHead(404, isolatedHeaders).end("not found");
        return;
      }
      const body = await readFile(path);
      staticRequestPaths.add(requestUrl.pathname);
      const source = sourceArtifacts.get(requested)?.source;
      response.writeHead(200, {
        ...isolatedHeaders,
        "content-type": source?.media === "txt" || imageDefinitions.some(
          (definition) => definition.filename === relative,
        ) ? "text/plain; charset=utf-8" :
          mimeTypes.get(extname(path)) ?? "application/octet-stream",
        ...(source?.media === "bin"
          ? { "content-disposition": `attachment; filename="${source.path.split("/").at(-1)}"` }
          : {}),
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
  let launchError = null;
  chrome.once("error", (error) => {
    launchError = error;
  });
  for (let attempt = 0; attempt < 200; attempt++) {
    if (launchError) {
      throw new Error(`could not launch Chrome: ${launchError.message}`, {
        cause: launchError,
      });
    }
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
  throw new Error(
    `timed out waiting for ${description}: ${
      typeof value === "object" ? JSON.stringify(value) : String(value)
    }`,
  );
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

async function waitForPiTurnQuiet(
  send,
  minimumRequests,
  piPid,
  description,
  attempts = 3600,
) {
  let previousCompleted = -1;
  let quietPolls = 0;
  let state;
  for (let attempt = 0; attempt < attempts; attempt++) {
    state = await evaluate(send, `({
      active: window.__dolly?.httpActive ?? false,
      requests: window.__dolly?.httpRequestCount ?? 0,
      completed: window.__dolly?.httpCompletedRequestCount ?? 0,
      foreground: window.__dolly?.foregroundPid ?? 0,
    })`);
    if (!state.active && state.requests >= minimumRequests &&
        state.completed === state.requests && state.completed === previousCompleted &&
        state.foreground === piPid) {
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

const typescriptExtensionSource = [
  'const marker: string = "DOLLY-TYPESCRIPT-EXTENSION-OK";',
  'export default function dollyTypeScriptProbe(pi: any) {',
  '  pi.registerTool({',
  '    name: "dolly_typescript_probe",',
  '    label: "TypeScript probe",',
  '    description: "Return Dolly TypeScript extension proof.",',
  '    parameters: { type: "object", properties: {}, required: [], additionalProperties: false },',
  '    async execute() {',
  '      return { content: [{ type: "text", text: marker }], details: {} };',
  '    },',
  '  });',
  '}',
].join(" ");

async function installTypeScriptExtension(send) {
  assert.doesNotMatch(
    typescriptExtensionSource,
    /'/,
    "TypeScript extension fixture must remain safe for Slop single quoting",
  );
  const sourcePath = "/workspace/dolly-typescript-extension.ts";
  const extensionDir = "/home/dolly/.pi/agent/extensions";
  const commands = [
    `mkdir -p ${extensionDir}`,
    `echo '${typescriptExtensionSource}' > ${sourcePath}`,
    `tsc --target ES2023 --module ES2022 --moduleResolution bundler ` +
      `--pretty false --outDir ${extensionDir} ${sourcePath}`,
    `grep -q DOLLY-TYPESCRIPT-EXTENSION-OK ` +
      `${extensionDir}/dolly-typescript-extension.js`,
  ];
  for (const command of commands) {
    const status = await evaluate(
      send,
      `window.__dolly.submit(${JSON.stringify(command)})`,
    );
    if (status !== 0) console.error(await visibleTerminalText(send));
    assert.equal(status, 0, `TypeScript extension step failed: ${command}`);
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
    `(() => {
      const transport = window.__dolly?.transport;
      if (!transport) return 0;
      const pid = transport.foregroundPid();
      return pid > 0 && pid !== ${piPid} &&
        !transport.foregroundInterruptible() && transport.inputIdle()
        ? pid
        : 0;
    })()`,
    (value) => value > 0,
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

async function measureShellBatch(send, label, count = 8) {
  const frameBefore = await evaluate(
    send,
    "Number(document.documentElement.dataset.frameSequence ?? 0)",
  );
  const started = Date.now();
  for (let index = 0; index < count; index++) {
    const status = await evaluate(
      send,
      `window.__dolly.submit(${JSON.stringify(
        `pwd > /tmp/dolly-${label}-${index}.txt`,
      )})`,
    );
    assert.equal(status, 0);
  }
  await delay(100);
  const frameAfter = await evaluate(
    send,
    "Number(document.documentElement.dataset.frameSequence ?? 0)",
  );
  return {
    milliseconds: Date.now() - started,
    frames: (frameAfter - frameBefore) >>> 0,
    commands: count,
  };
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
const localOrigin = `http://${browserHostname}:${address.port}`;
const rebuildPage = `${localOrigin}${browserBase}${selectedImage}/rebuild/`;
const snapshotPage = `${localOrigin}${browserBase}${selectedImage}/?autorun=shell`;
const menuPage = `${localOrigin}${browserBase}`;
const interactivePage = externalPage
  ? new URL(`${selectedImage}/`, externalPage.endsWith("/") ? externalPage : `${externalPage}/`).href
  : `${localOrigin}${browserBase}${selectedImage}/`;
const fixturePiBase = new URL("/fixture/pi/v1", interactivePage).href;
const fixtureExtensionUrl = new URL("/fixture/pi-extension.js", interactivePage).href;
let openRouterSecret = realOpenRouterMode ? await readSecretLine() : "";
if (realOpenRouterMode && !/^sk-or-v1-[A-Za-z0-9_-]+$/.test(openRouterSecret)) {
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
if (pythonPackageMode) {
  fixturePolicy.rules.unshift(
    {
      origin: "https://pypi.org",
      pathPrefix: "/pypi/",
      methods: ["GET"],
      maxResponseBytes: 32 * 1024 * 1024,
    },
    {
      origin: "https://files.pythonhosted.org",
      pathPrefix: "/packages/",
      methods: ["GET"],
      maxResponseBytes: 64 * 1024 * 1024,
    },
  );
}
if (realOpenRouterMode) {
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
const browserDownloadDirectory = await mkdtemp(`${tmpdir()}/dolly-browser-downloads-`);
if (realOpenRouterMode) {
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
  await debuggerClient.send("Browser.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: browserDownloadDirectory,
    eventsEnabled: true,
  });
  await debuggerClient.send("Browser.grantPermissions", {
    origin: new URL(interactivePage).origin,
    permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
  });
  await debuggerClient.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      ${pagesLiveMode
        ? ""
        : `globalThis.DOLLY_HTTP_POLICY = ${JSON.stringify(fixturePolicy)};`}
      globalThis.__dollyIncompleteBootstrapPaints = 0;
      new MutationObserver(() => {
        const log = document.querySelector("#bootstrap-log");
        if (log && !log.hidden && log.textContent !== "" &&
            !log.textContent.endsWith("\\n")) {
          globalThis.__dollyIncompleteBootstrapPaints += 1;
        }
      }).observe(document, { childList: true, characterData: true, subtree: true });
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
    })();`,
  });
  await debuggerClient.send("Page.navigate", {
    url: menuMode
      ? menuPage
      : snapshotExportMode
      ? rebuildPage
      : piDevelopmentMode || realOpenRouterMode || missingSnapshotMode
        || pagesIsolationMode || pagesLiveMode || routeSmokeMode || sessionMode
        || hardSupervisorMode || pythonPackageMode || targetPiMode
        ? interactivePage
        : snapshotPage,
  });

  browserProof: {
    if (targetPiMode) {
      const state = await waitForValue(
        debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        (value) => value === "ready" || value === "failed",
        "target-built Pi image boot",
        1200,
      );
      assert.equal(state, "ready");
      await enterRecoveryShell(debuggerClient.send);
      const status = await evaluate(
        debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(
          "pi --version",
        )})`,
      );
      if (status !== 0) console.error(await visibleTerminalText(debuggerClient.send));
      assert.equal(status, 0, "target-emitted Pi CLI did not start through Janis");
      const targetOpenAiProbe = [
        'import OpenAI from "openai";',
        `const client = new OpenAI({ apiKey: "sandbox-placeholder", baseURL: ${JSON.stringify(
          fixturePiBase,
        )}, maxRetries: 0 });`,
        'try {',
        '  const stream = await client.chat.completions.create({',
        '    model: "dolly-test-model",',
        '    messages: [{ role: "user", content: "probe" }],',
        '    stream: true,',
        '  });',
        '  for await (const _chunk of stream) break;',
        '  Dolly.writeFile("/tmp/pi-source-openai-probe.txt", "OPENAI-SDK-STREAM-OK\\n");',
        '} catch (error) {',
        '  Dolly.writeFile("/tmp/pi-source-openai-error.txt",',
        '    String(error?.stack ?? error) + "\\nCAUSE\\n" + String(error?.cause?.stack ?? error?.cause));',
        '  process.exit(42);',
        '}',
      ].join(" ");
      assert.doesNotMatch(targetOpenAiProbe, /'/,
        "target OpenAI probe must remain safe for Slop single quoting");
      assert.equal(
        await evaluate(
          debuggerClient.send,
          `window.__dolly.submit(${JSON.stringify(
            `echo '${targetOpenAiProbe}' > /tmp/pi-source-openai-probe.mjs`,
          )})`,
        ),
        0,
        "could not write the target OpenAI SDK probe",
      );
      const targetOpenAiStatus = await evaluate(
        debuggerClient.send,
        'window.__dolly.submit("janis -m /tmp/pi-source-openai-probe.mjs")',
      );
      if (targetOpenAiStatus !== 0) {
        await evaluate(
          debuggerClient.send,
          'window.__dolly.submit("cat /tmp/pi-source-openai-error.txt")',
        );
        console.error(await visibleTerminalText(debuggerClient.send));
      }
      assert.equal(targetOpenAiStatus, 0,
        "the unbundled OpenAI SDK could not stream through Dolly HTTP");
      assert.equal(
        await evaluate(
          debuggerClient.send,
          'window.__dolly.submit("grep -q OPENAI-SDK-STREAM-OK /tmp/pi-source-openai-probe.txt")',
        ),
        0,
      );
      await evaluate(debuggerClient.send, `(() => {
        window.__targetPiResult = null;
        window.__dolly.submit("pi --offline --no-session").then((status) => {
          window.__targetPiResult = status;
        });
      })()`);
      await waitForValue(
        debuggerClient.send,
        "({ foreground: window.__dolly.foregroundPid, result: window.__targetPiResult })",
        (value) => value.foreground !== 0 || value.result !== null,
        "target-emitted Pi interactive process",
        600,
      );
      assert.equal(
        await evaluate(debuggerClient.send, "window.__targetPiResult"),
        null,
        "target-emitted Pi exited during interactive startup",
      );
      await waitForTerminalText(
        debuggerClient.send,
        /pi \/ DOLLY/,
        "target-emitted Pi Dolly extension header",
        600,
      );
      await inputText(debuggerClient.send, "/quit\r");
      assert.equal(
        await waitForValue(
          debuggerClient.send,
          "window.__targetPiResult",
          (value) => value !== null,
          "target-emitted Pi clean exit",
          600,
        ),
        0,
        "target-emitted Pi did not exit cleanly",
      );
      console.log(
        "browser: target-emitted Pi CLI resolved, loaded Dolly tools, and exited cleanly",
      );
      break browserProof;
    }
    if (pythonPackageMode) {
      const state = await waitForValue(
        debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        (value) => value === "ready" || value === "failed",
        "Python package image boot",
        1200,
      );
      assert.equal(state, "ready");
      await enterRecoveryShell(debuggerClient.send);
      assert.match(
        await visibleTerminalText(debuggerClient.send),
        /Python packages: bonnie install PACKAGE/,
        "the Python recovery shell did not advertise Bonnie",
      );
      assert.equal(await evaluate(
        debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(
          "python -c 'import importlib.util; " +
          "assert importlib.util.find_spec(\"numpy\") is None; " +
          "assert importlib.util.find_spec(\"pandas\") is None; " +
          "assert importlib.util.find_spec(\"mesonbuild\") is None'",
        )})`,
      ), 0, "the scientific-package proof did not start from a clean image");
      const pandasStatus = await evaluate(
        debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify("bonnie install pandas")})`,
      );
      if (pandasStatus !== 0) {
        console.error(await visibleTerminalText(debuggerClient.send));
      }
      assert.equal(pandasStatus, 0,
        "Bonnie could not resolve and source-build Pandas's complete dependency graph");
      assert.equal(await evaluate(
        debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(
          "python -c 'from importlib.metadata import version; " +
          "import numpy as np, pandas as pd; " +
          "assert version(\"numpy\") and version(\"pandas\"); " +
          "a=np.array([1,2,3]); assert int((a*a).sum()) == 14; " +
          "frame=pd.DataFrame({\"kind\":[\"a\",\"b\",\"a\"],\"value\":[2,3,5]}); " +
          "totals=frame.groupby(\"kind\")[\"value\"].sum(); " +
          "assert totals.to_dict() == {\"a\":7,\"b\":3}'",
        )})`,
      ), 0, "the transitive NumPy build or source-built Pandas groupby failed");
      assert.equal(await evaluate(
        debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(
          "meson --version | grep -q '^1\\.' && " +
          "python -c 'import mesonbuild.coredata as c; from importlib.metadata import version; " +
          "assert c.version == version(\"meson\")'",
        )})`,
      ), 0, "Pandas's transitive build frontend was not installed as a normal package");
      const abandonedRawStatus = await evaluate(
        debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(
          "python -c 'import tty; tty.setraw(0)'",
        )})`,
      );
      assert.equal(abandonedRawStatus, 0,
        "CPython could not enter Dolly's raw terminal mode");
      const termiosStatus = await evaluate(
        debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(
          "python -c 'import os,termios,tty; " +
          "before=termios.tcgetattr(0); rows,cols=termios.tcgetwinsize(0); " +
          "assert before[3]&termios.ICANON; assert rows>0 and cols>0; tty.setraw(0); " +
          "after=termios.tcgetattr(0); " +
          "print(\"TERMIOS\",rows,cols,before[3],after[3],os.isatty(0)); " +
          "assert after[3]&termios.ICANON==0; " +
          "termios.tcsetattr(0,termios.TCSANOW,before); assert os.isatty(0)'",
        )})`,
      );
      if (termiosStatus !== 0) {
        console.error(await visibleTerminalText(debuggerClient.send));
      }
      assert.equal(termiosStatus, 0,
        "CPython termios did not control and restore Dolly's live terminal");
      const bonnieStatus = await evaluate(
        debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(
          "echo '# Dolly package acceptance' > /tmp/requirements.txt && " +
          "echo 'requests>=2,<3' >> /tmp/requirements.txt && " +
          "echo 'requests[socks]>=2,<3  # merge the extra' >> /tmp/requirements.txt && " +
          "bonnie install --requirement /tmp/requirements.txt",
        )})`,
      );
      if (bonnieStatus !== 0) {
        console.error(await visibleTerminalText(debuggerClient.send));
      }
      assert.equal(bonnieStatus, 0,
        "Bonnie could not resolve and install Requests through PyPI");
      assert.equal(await evaluate(
        debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(
          "python -c 'from importlib.metadata import version; " +
          "assert all(version(name) for name in " +
          "(\"requests\", \"certifi\", \"charset-normalizer\", \"idna\", " +
          "\"urllib3\", \"pysocks\"))'",
        )})`,
      ), 0, "Bonnie did not install Requests' pure-Python dependency closure");
      assert.equal(await evaluate(
        debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(
          "bonnie list | grep -q '^requests 2\\.' && " +
          "bonnie freeze | grep -q '^requests==2\\.' && " +
          "bonnie show requests | grep -q '^Name: requests$' && " +
          "bonnie check | grep -q '^No broken requirements found\\.$' && " +
          "! bonnie freeze | grep -q '^pip=='",
        )})`,
      ), 0, "Bonnie could not inspect its installed environment offline");
      assert.equal(await evaluate(
        debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(
          "bonnie show definitely-not-installed",
        )})`,
      ), 1, "Bonnie show silently accepted a missing distribution");
      assert.equal(await evaluate(
        debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(
          "mkdir -p /usr/lib/python3.14/site-packages/dolly_broken-1.dist-info && " +
          "printf 'Metadata-Version: 2.1\\nName: dolly-broken\\nVersion: 1\\n" +
          "Requires-Dist: definitely-missing>=1\\n' > " +
          "/usr/lib/python3.14/site-packages/dolly_broken-1.dist-info/METADATA && " +
          "! bonnie check && " +
          "rm -rf /usr/lib/python3.14/site-packages/dolly_broken-1.dist-info && " +
          "bonnie check",
        )})`,
      ), 0, "Bonnie check did not detect and recover from broken metadata");
      assert.equal(await evaluate(
        debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(
          "echo '--index-url https://example.invalid/simple' > /tmp/bad-requirements.txt && " +
          "bonnie install --target /tmp/bonnie-bad-requirements " +
          "-r /tmp/bad-requirements.txt",
        )})`,
      ), 2, "Bonnie silently accepted a requirements-file package-index directive");
      assert.equal(await evaluate(
        debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(
          "test ! -d /tmp/bonnie-bad-requirements",
        )})`,
      ), 0, "a rejected requirements-file directive mutated its target");
      const pythonImportsStatus = await evaluate(
        debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(
          "python -c 'import pdb, requests, socket; assert socket.socket'",
        )})`,
      );
      if (pythonImportsStatus !== 0) {
        console.error(await visibleTerminalText(debuggerClient.send));
      }
      assert.equal(pythonImportsStatus, 0,
        "the explicit socket-denial module did not preserve import compatibility");
      assert.equal(await evaluate(
        debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(
          "python -c 'import socket; socket.socket()'",
        )})`,
      ), 1, "CPython unexpectedly acquired a raw socket capability");
      const nativePackageStatus = await evaluate(
        debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(
          "env CIBUILDWHEEL=1 bonnie install markupsafe",
        )})`,
      );
      if (nativePackageStatus !== 0) {
        console.error(await visibleTerminalText(debuggerClient.send));
      }
      assert.equal(nativePackageStatus, 0,
        "Bonnie could not build and install a native CPython extension from an sdist");
      const nativeImportStatus = await evaluate(
        debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(
          "python -c 'import markupsafe, markupsafe._speedups; " +
          "assert str(markupsafe.escape(\"<dolly>\")) == \"&lt;dolly&gt;\"'",
        )})`,
      );
      if (nativeImportStatus !== 0) {
        console.error(await visibleTerminalText(debuggerClient.send));
      }
      assert.equal(nativeImportStatus, 0,
        "the source-built MarkupSafe extension could not be imported");
      assert.equal(await evaluate(
        debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(
          "bonnie install --target /tmp/bonnie-conflict 'idna>=3' 'idna<3'",
        )})`,
      ), 1, "Bonnie silently accepted contradictory version constraints");
      assert.equal(await evaluate(
        debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(
          "test ! -d /tmp/bonnie-conflict",
        )})`,
      ), 0, "Bonnie mutated its target before resolving the complete graph");
      assert.equal(await evaluate(
        debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(
          "python -c 'from importlib.metadata import version; assert version(\"requests\")'",
        )})`,
      ), 0, "a rejected native package damaged the existing Python environment");
      assert.equal(await evaluate(
        debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify("bonnie install pytest")})`,
      ), 0, "Bonnie could not install the pure-Python Pytest dependency graph");
      assert.equal(await evaluate(
        debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify("python -m pytest --version")})`,
      ), 0, "the installed Pytest package could not execute inside Dolly");
      const pytestLauncherStatus = await evaluate(
        debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(
          "echo PYTEST-PATH && which pytest | grep -q '^/usr/bin/pytest$' && " +
          "echo PYTEST-FILE && file /usr/bin/pytest | grep -q WebAssembly && " +
          "echo PYTEST-RUN && pytest --version",
        )})`,
      );
      if (pytestLauncherStatus !== 0) {
        console.error(await visibleTerminalText(debuggerClient.send));
      }
      assert.equal(pytestLauncherStatus, 0,
        "Bonnie did not compile Pytest's console script as a PATH Wasm executable");
      const pytestRunStatus = await evaluate(
        debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(
          "echo 'def test_answer(): assert 6 * 7 == 42' > /tmp/test_sample.py && " +
          "pytest -q /tmp/test_sample.py",
        )})`,
      );
      if (pytestRunStatus !== 0) {
        console.error(await visibleTerminalText(debuggerClient.send));
      }
      assert.equal(pytestRunStatus, 0,
        "Pytest could not run a test with its normal built-in plugins");
      assert.equal(await evaluate(
        debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify("bonnie install black")})`,
      ), 0, "Bonnie could not install Black's pure-Python dependency graph");
      const blackStatus = await evaluate(
        debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(
          "echo 'answer=  6*7' > /tmp/black_sample.py && " +
          "which black | grep -q '^/usr/bin/black$' && " +
          "file /usr/bin/black | grep -q WebAssembly && " +
          "black --quiet /tmp/black_sample.py && " +
          "grep -Fqx 'answer = 6 * 7' /tmp/black_sample.py",
        )})`,
      );
      if (blackStatus !== 0) {
        console.error(await visibleTerminalText(debuggerClient.send));
      }
      assert.equal(blackStatus, 0,
        "Black's compiled PATH launcher could not format a Python file");
      assert.ok(await evaluate(
        debuggerClient.send,
        "window.__dolly.httpCompletedRequestCount >= 20",
      ));
      console.log(
        "browser: Bonnie installed Requests[socks], Pytest, and Black; compiled " +
        "their PATH launchers as separate Wasm executables; formatted a file; " +
        "detected broken installed metadata; and kept rejected graphs from " +
        "mutating their target",
      );
      break browserProof;
    }
    if (sessionMode) {
      const initialState = await waitForValue(
        debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        (value) => value === "ready" || value === "failed",
        "Dolly session source boot",
        1200,
      );
      assert.equal(initialState, "ready");
      await enterRecoveryShell(debuggerClient.send);
      assert.equal(await evaluate(
        debuggerClient.send,
        'window.__dolly.submit("echo SESSION-WORKSPACE > /workspace/session-proof.txt")',
      ), 0);
      assert.equal(await evaluate(
        debuggerClient.send,
        'window.__dolly.submit("echo SESSION-HOME > /home/dolly/session-proof.txt")',
      ), 0);
      assert.equal(await evaluate(
        debuggerClient.send,
        'window.__dolly.submit("echo SESSION-CREDENTIAL > /home/dolly/.pi/agent/auth.json")',
      ), 0);
      await evaluate(
        debuggerClient.send,
        'window.__sessionSave = window.__dolly.saveSession("browser-proof")',
      );
      const saveState = await waitForValue(
        debuggerClient.send,
        "document.documentElement?.dataset.sessionStatus ?? ''",
        (value) => value === "saved" || value === "failed",
        "compressed IndexedDB session save",
        3600,
      );
      assert.equal(saveState, "saved");
      assert.equal(
        await evaluate(debuggerClient.send, "window.__dolly.sessionName"),
        "browser-proof",
      );
      assert.ok(Number(await evaluate(
        debuggerClient.send, "document.documentElement.dataset.sessionBytes",
      )) > 0);

      await debuggerClient.send("Page.navigate", {
        url: `${localOrigin}${browserBase}load/?session=browser-proof`,
      });
      const restoredState = await waitForValue(
        debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        (value) => value === "ready" || value === "failed",
        "named Dolly session restore",
        3600,
      );
      assert.equal(restoredState, "ready");
      assert.equal(
        await evaluate(debuggerClient.send, "document.documentElement.dataset.session"),
        "browser-proof",
      );
      assert.equal(
        await evaluate(debuggerClient.send, "document.documentElement.dataset.sessionStatus"),
        "restored",
      );
      await enterRecoveryShell(debuggerClient.send);
      for (const command of [
        "grep -q SESSION-WORKSPACE /workspace/session-proof.txt",
        "grep -q SESSION-HOME /home/dolly/session-proof.txt",
        "grep -q SESSION-CREDENTIAL /home/dolly/.pi/agent/auth.json",
        "grep -q SESSION-WORKSPACE /home/dolly/.slop_history",
        "grep -q 'DOLLY-SESSION 1' /home/dolly/.dolly-session-name",
        "grep -q 'name browser-proof' /home/dolly/.dolly-session-name",
      ]) {
        assert.equal(await evaluate(
          debuggerClient.send,
          `window.__dolly.submit(${JSON.stringify(command)})`,
        ), 0, command);
      }
      await dispatchKey(debuggerClient.send, {
        key: "S",
        code: "KeyS",
        modifiers: 10,
        windowsVirtualKeyCode: 83,
      });
      assert.equal(await waitForValue(
        debuggerClient.send,
        "document.documentElement?.dataset.sessionStatus ?? ''",
        (value) => value === "saved" || value === "failed",
        "Ctrl+Shift+S session resave",
        3600,
      ), "saved");
      console.log(
        "browser: named session captured in Wasm, compressed into IndexedDB, " +
        "loaded from /load/?session=browser-proof, restored credentials/history/workspace, " +
        "and resaved with Ctrl+Shift+S",
      );
      break browserProof;
    }
    if (hardSupervisorMode) {
      const initialState = await waitForValue(
        debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        (value) => value === "ready" || value === "failed",
        "Dolly hard-supervisor source boot",
        1200,
      );
      assert.equal(initialState, "ready");
      const shellPid = await enterRecoveryShell(debuggerClient.send);
      assert.equal(await evaluate(
        debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(
          "echo HARD-RECOVERY-WORKSPACE > /workspace/hard-recovery.txt && " +
          "echo 'int main(void) { for (;;) {} }' > /tmp/dolly-foreign-loop.c && " +
          "cc -O0 -fdolly-runtime-interrupt-handler /tmp/dolly-foreign-loop.c " +
          "-o /tmp/dolly-foreign-loop",
        )})`,
      ), 0);
      await evaluate(
        debuggerClient.send,
        'window.__hardSave = window.__dolly.saveSession("hard-proof")',
      );
      assert.equal(await waitForValue(
        debuggerClient.send,
        "document.documentElement?.dataset.sessionStatus ?? ''",
        (value) => value === "saved" || value === "failed",
        "hard-supervisor checkpoint save",
        3600,
      ), "saved");
      assert.equal(await evaluate(
        debuggerClient.send,
        "location.pathname + location.search",
      ), `${browserBasePrefix}/load/?session=hard-proof`);

      await evaluate(
        debuggerClient.send,
        `window.__hardResult = window.__dolly.submit(${JSON.stringify(
          "/tmp/dolly-foreign-loop",
        )}); true`,
      );
      await waitForValue(
        debuggerClient.send,
        `(() => {
          const transport = window.__dolly?.transport;
          if (!transport) return 0;
          const pid = transport.foregroundPid();
          return pid !== ${shellPid} && transport.foregroundInterruptible() ? pid : 0;
        })()`,
        (value) => value > 0,
        "foreign non-cooperative foreground command",
        200,
      );
      for (let attempt = 0; attempt < 2; attempt++) {
        await dispatchKey(debuggerClient.send, {
          key: "c",
          code: "KeyC",
          modifiers: 2,
          windowsVirtualKeyCode: 67,
        });
      }
      await delay(1000);
      assert.equal(await waitForValue(
        debuggerClient.send,
        "document.documentElement?.dataset.hardInterruptRecovery ?? ''",
        (value) => value === "session" || value === "base",
        "hard worker replacement",
        1200,
      ), "session");
      assert.equal(await waitForValue(
        debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        (value) => value === "ready" || value === "failed",
        "hard-interrupt checkpoint restore",
        3600,
      ), "ready");
      assert.equal(
        await evaluate(debuggerClient.send,
          "document.documentElement.dataset.sessionStatus"),
        "restored",
      );
      await enterRecoveryShell(debuggerClient.send);
      assert.equal(await evaluate(
        debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(
          "grep -q HARD-RECOVERY-WORKSPACE /workspace/hard-recovery.txt",
        )})`,
      ), 0, "the saved workspace did not survive hard worker replacement");
      console.log(
        "browser: a foreign no-safepoint loop was hard-stopped by worker " +
        "replacement and the named in-Wasm filesystem checkpoint was restored",
      );
      break browserProof;
    }
    if (routeSmokeMode) {
      const routeState = await waitForValue(
        debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        (value) => value === "ready" || value === "failed",
        "prefixed prebuilt route",
        1200,
      );
      assert.equal(routeState, "ready");
      for (const required of [
        `${browserBasePrefix}/${selectedImage}/`,
        `${browserBasePrefix}/Dollyfile${selectedImage === "default" ? "" : `-${selectedImage}`}`,
        `${browserBasePrefix}/dist/dolly-images.mjs`,
        `${browserBasePrefix}/dist/dolly-${selectedImage}-system.snapshot`,
      ]) {
        assert.ok(staticRequestPaths.has(required), `prefixed route did not request ${required}`);
      }
      assert.equal([...staticRequestPaths].some((path) => path.includes("/static/")), false,
        "prebuilt route fetched rebuild-only source inputs");
      await debuggerClient.send("Page.navigate", {
        url: `${localOrigin}${browserBase}view/${selectedImage}/`,
      });
      await waitForValue(
        debuggerClient.send,
        "document.querySelectorAll('#source .line').length",
        (value) => value > 2,
        "Dollyfile source viewer",
        200,
      );
      const viewer = await evaluate(debuggerClient.send, `(() => ({
        title: document.querySelector('#title')?.textContent,
        source: document.querySelector('#source')?.textContent,
        links: Array.from(document.querySelectorAll('#source a'), (anchor) => ({
          href: new URL(anchor.href).pathname,
          download: anchor.hasAttribute('download'),
        })),
        linkColor: getComputedStyle(document.querySelector('#source a')).color,
      }))()`);
      assert.equal(viewer.title, `${selectedImage === "default" ? "Dollyfile" : `Dollyfile-${selectedImage}`} · ${selectedImage}`);
      assert.match(viewer.source, /DOLLY 1/);
      assert.match(viewer.source, new RegExp(`IMAGE ${selectedImage}`));
      assert.ok(viewer.links.some((link) =>
        link.href.startsWith(`${browserBasePrefix}/static/`) ||
        link.href.startsWith(`${browserBasePrefix}/view/`)));
      assert.equal(viewer.linkColor, "rgb(242, 212, 92)");
      console.log(
        `browser: ${browserBase}${selectedImage}/ restored prebuilt image without SOURCE downloads; viewer passed`,
      );
      break browserProof;
    }
    if (menuMode) {
      await waitForValue(
        debuggerClient.send,
        "document.readyState",
        (value) => value === "complete",
        "Dolly image menu",
        200,
      );
      const menuEvidence = await evaluate(debuggerClient.send, `(() => ({
        title: document.querySelector('h1')?.textContent,
        background: getComputedStyle(document.documentElement).backgroundColor,
        font: getComputedStyle(document.documentElement).fontFamily,
        links: Array.from(document.querySelectorAll('.routes a'), (link) =>
          new URL(link.href).pathname),
        docs: Array.from(document.querySelectorAll('.docs a'), (link) =>
          new URL(link.href).pathname),
        text: document.body.textContent,
      }))()`);
      assert.equal(menuEvidence.title, "DOLLY");
      assert.equal(menuEvidence.background, "rgb(38, 38, 38)");
      assert.match(menuEvidence.font, /Dolly IosevkaTerm SemiBold/);
      assert.deepEqual(menuEvidence.links, imageDefinitions.flatMap(({ image }) => [
        `${browserBasePrefix}/${image}/`,
        `${browserBasePrefix}/${image}/rebuild/`,
        `${browserBasePrefix}/view/${image}/`,
      ]));
      for (const { filename } of imageDefinitions) {
        assert.ok(menuEvidence.docs.includes(`${browserBasePrefix}/${filename}`));
      }
      assert.doesNotMatch(menuEvidence.text, /voice input/i);

      const customRecipe = `DOLLY 1
IMAGE browser-custom
EXTENDS default

RUN echo 'int main(void) { return 0; }' > /tmp/menu-tool.c
RUN cc /tmp/menu-tool.c -o /usr/bin/menu-tool
CHECK menu-tool
KEEP /usr/bin/menu-tool
ENTRY /usr/bin/pi --no-session
`;
      await evaluate(debuggerClient.send, `(() => {
        const input = document.querySelector('#dollyfile-upload');
        const transfer = new DataTransfer();
        transfer.items.add(new File(
          [${JSON.stringify(customRecipe)}],
          'Dollyfile-browser-custom',
          { type: 'text/plain' },
        ));
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      })()`);
      await waitForValue(
        debuggerClient.send,
        "document.querySelector('#dollyfile-run').disabled",
        (value) => value === false,
        "custom Dollyfile validation",
        200,
      );
      assert.match(
        await evaluate(
          debuggerClient.send,
          "document.querySelector('#upload-status').textContent",
        ),
        /^browser-custom: ready for in-sandbox validation/,
      );
      await evaluate(
        debuggerClient.send,
        "document.querySelector('#dollyfile-run').click()",
      );
      await waitForValue(
        debuggerClient.send,
        "location.pathname",
        (value) => value === `${browserBasePrefix}/custom/rebuild/`,
        "custom rebuild navigation",
        200,
      );
      const customState = await waitForValue(
        debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        (value) => value === "ready" || value === "failed",
        "uploaded Dollyfile rebuild",
      );
      assert.equal(customState, "ready");
      assert.equal(
        await evaluate(debuggerClient.send, "document.documentElement.dataset.image"),
        "browser-custom",
      );
      assert.equal(
        await evaluate(debuggerClient.send, "document.documentElement.dataset.bootMode"),
        "rebuild",
      );
      assert.ok(Number(await evaluate(
        debuggerClient.send,
        "document.documentElement.dataset.snapshotBytes",
      )) > 0);
      await enterRecoveryShell(debuggerClient.send);
      assert.equal(await evaluate(
        debuggerClient.send,
        'window.__dolly.submit("menu-tool")',
      ), 0);
      assert.equal(await evaluate(
        debuggerClient.send,
        `window.__dolly.submit("grep -q 'IMAGE browser-custom' /etc/dolly/Dollyfile")`,
      ), 0);
      assert.equal(await evaluate(
        debuggerClient.send,
        `window.__dolly.submit("grep -q 'IMAGE default' /etc/dolly/recipes/default.Dollyfile")`,
      ), 0);
      assert.equal(await evaluate(
        debuggerClient.send,
        `window.__dolly.saveSession("custom-proof").then(
          () => "unexpected success",
          (error) => error.message,
        )`,
      ), "Uploaded custom images cannot save named sessions yet");
      console.log(
        "browser: root menu, default/gamedev/rebuild links, local Dollyfile " +
        "upload validation, custom source rebuild, and custom executable passed",
      );
      break browserProof;
    }
    if (snapshotExportMode) {
      const output = resolve(process.env.DOLLY_SNAPSHOT_OUTPUT ?? "");
      const distDirectory = resolve(projectDir, "dist");
      if (!process.env.DOLLY_SNAPSHOT_OUTPUT ||
          !output.startsWith(`${distDirectory}${sep}`)) {
        throw new Error("snapshot export requires an output path inside Dolly's dist directory");
      }
      const rebuildWaitAttempts = Number.parseInt(
        process.env.DOLLY_REBUILD_WAIT_ATTEMPTS ?? "36000",
        10,
      );
      if (!Number.isSafeInteger(rebuildWaitAttempts) || rebuildWaitAttempts < 1) {
        throw new Error("DOLLY_REBUILD_WAIT_ATTEMPTS must be a positive integer");
      }
      const state = await waitForValue(
        debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        (value) => value === "ready" || value === "failed",
        "Dolly source rebuild",
        rebuildWaitAttempts,
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
          incompletePaints: globalThis.__dollyIncompleteBootstrapPaints,
        };
      })()`);
      assert.equal(evidence.mode, "rebuild");
      assert.ok(evidence.snapshotBytes > 0);
      assert.equal(evidence.exportedBytes, evidence.snapshotBytes);
      assert.ok(evidence.lines <= 41);
      assert.ok(evidence.bootstrap.length <= 8192);
      assert.equal(evidence.incompletePaints, 0);
      assert.match(
        evidence.bootstrap,
        new RegExp(`dollyfile: image ${selectedImage} complete; retained \\d+ files`),
      );
      assert.match(evidence.bootstrap, /starting sandbox display/);
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
      console.log(
        `browser: exported ${snapshotUpload.length} byte ${selectedImage} snapshot ` +
        `from /${selectedImage}/rebuild`,
      );
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
        /The packaged system snapshot is missing\. Run npm run snapshot first\./,
      );
      assert.equal((bootstrap.match(/FATAL/g) ?? []).length, 1);
      assert.doesNotMatch(bootstrap, /runtime-worker\.mjs|onMessage@/);
      console.log("browser: missing snapshot shows one actionable build diagnostic");
      break browserProof;
    }
    if (pagesIsolationMode || pagesLiveMode) {
      const pagesBootStarted = Date.now();
      const state = await waitForValue(
        debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        (value) => value === "ready" || value === "failed",
        "service-worker isolated Pages boot",
        pagesLiveMode ? 3600 : 1200,
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
        await enterRecoveryShell(debuggerClient.send);
        await delay(1000);
        assert.equal(
          await evaluate(
            debuggerClient.send,
            `window.__dolly.submit(${JSON.stringify(
              "curl -fsS https://raw.githubusercontent.com/daugasauron/dolly/main/README.md " +
              "> /tmp/pages-generic-network.txt",
            )})`,
          ),
          0,
          "the public Pages broker did not permit a generic HTTPS origin",
        );
        assert.equal(
          await evaluate(
            debuggerClient.send,
            `window.__dolly.submit(${JSON.stringify(
              "grep -q '^Dolly is an experiment' " +
              "/tmp/pages-generic-network.txt",
            )})`,
          ),
          0,
          "the generic Pages request did not return the expected source body",
        );
        console.log(
          `browser: live Pages booted isolated Ghostty and default Pi in ${
            Date.now() - pagesBootStarted
          }ms; generic HTTPS reached raw.githubusercontent.com through Dolly's broker`,
        );
      } else {
        console.log("browser: Pages service worker established cross-origin isolation");
      }
      break browserProof;
    }
    if (piDevelopmentMode || realOpenRouterMode) {
      const state = await waitForValue(
        debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        (value) => value === "ready" || value === "failed",
        "Dolly snapshot boot for Pi",
        1200,
      );
      assert.equal(state, "ready");
      await enterRecoveryShell(debuggerClient.send);

      const modelConfig = JSON.stringify(realOpenRouterMode ? {
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
            baseUrl: fixturePiBase,
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
      assert.equal(
        await evaluate(
          debuggerClient.send,
          'window.__dolly.submit("touch /workspace/dolly-slop-bang-marker")',
        ),
        0,
      );
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

      const piCommand = process.env.DOLLY_PI_COMMAND ?? (realOpenRouterMode
        ? "pi --provider dolly-openrouter --model deepseek/deepseek-v4-flash-0731"
        : "pi --provider dolly-test --model dolly-test-model --api-key sandbox-placeholder");
      if (piAuditMode) {
        await evaluate(debuggerClient.send, `(() => {
          window.__piResult = null;
          window.__piSequence = window.__dolly.transport.currentResultSequence();
          if (!window.__dolly.input(${JSON.stringify(`${piCommand}\r`)})) {
            throw new Error("Pi audit command did not fit in the input mailbox");
          }
        })()`);
      } else {
        await evaluate(debuggerClient.send, `(() => {
          window.__piResult = null;
          window.__piPromise = window.__dolly.submit(
            ${JSON.stringify(piCommand)},
          ).then((status) => { window.__piResult = status; return status; });
        })()`);
      }
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
      const piHeaderText = await visibleTerminalText(debuggerClient.send);
      assert.match(piHeaderText, /! Slop/);
      assert.doesNotMatch(piHeaderText, /!\s+(?:to run )?bash/i);
      await clearTerminalSelection(debuggerClient.send);
      await typeText(debuggerClient.send, "! ls");
      await dispatchKey(debuggerClient.send, {
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
      });
      await waitForTerminalText(
        debuggerClient.send,
        /dolly-slop-bang-marker/,
        "Pi's ! command executing ls through /bin/slop",
      );
      await clearTerminalSelection(debuggerClient.send);

      const screenshot = await debuggerClient.send("Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
      });
      await writeFile(
        resolve(projectDir, realOpenRouterMode
          ? piAuditMode
            ? "build/pi-agent-audit-start-chrome.png"
            : "build/pi-openrouter-start-chrome.png"
          : "build/pi-start-chrome.png"),
        screenshot.data,
        "base64",
      );

      if (piAuditMode) {
        const audit = {
          model: "deepseek/deepseek-v4-flash-0731",
          piPid: settledStartup.foreground,
          turns: [],
          probes: [],
        };
        for (let index = 0; index < piAuditSpec.prompts.length; index++) {
          await clearTerminalSelection(debuggerClient.send);
          const prompt = piAuditSpec.prompts[index];
          const requestCountBefore = await evaluate(
            debuggerClient.send,
            "window.__dolly.httpRequestCount",
          );
          const started = Date.now();
          await inputText(debuggerClient.send, prompt);
          await dispatchKey(debuggerClient.send, {
            key: "Enter",
            code: "Enter",
            windowsVirtualKeyCode: 13,
          });
          let quiet;
          try {
            quiet = await waitForPiTurnQuiet(
              debuggerClient.send,
              requestCountBefore + 1,
              settledStartup.foreground,
              `Pi audit turn ${index + 1}`,
            );
          } catch (error) {
            const visibleText = await visibleTerminalText(debuggerClient.send);
            await clearTerminalSelection(debuggerClient.send);
            const screenshot = await debuggerClient.send("Page.captureScreenshot", {
              format: "png",
              fromSurface: true,
            });
            await writeFile(
              resolve(projectDir, "build/pi-agent-audit-failed.png"),
              screenshot.data,
              "base64",
            );
            audit.failure = {
              turn: index + 1,
              message: error instanceof Error ? error.message : String(error),
              visibleText,
            };
            await writeFile(
              resolve(projectDir, "build/pi-agent-audit.json"),
              `${JSON.stringify(audit, null, 2)}\n`,
            );
            throw error;
          }
          await delay(500);
          const visibleText = await visibleTerminalText(debuggerClient.send);
          await clearTerminalSelection(debuggerClient.send);
          const screenshot = await debuggerClient.send("Page.captureScreenshot", {
            format: "png",
            fromSurface: true,
          });
          await writeFile(
            resolve(projectDir, `build/pi-agent-audit-turn-${index + 1}.png`),
            screenshot.data,
            "base64",
          );
          audit.turns.push({
            prompt,
            elapsedMilliseconds: Date.now() - started,
            requests: quiet.requests - requestCountBefore,
            visibleText,
          });
          await writeFile(
            resolve(projectDir, "build/pi-agent-audit.json"),
            `${JSON.stringify(audit, null, 2)}\n`,
          );
          process.stdout.write(
            `browser: Pi audit turn ${index + 1}/${piAuditSpec.prompts.length} ` +
            `completed in ${audit.turns.at(-1).elapsedMilliseconds}ms ` +
            `(${audit.turns.at(-1).requests} model requests)\n`,
          );
        }

        await clearTerminalSelection(debuggerClient.send);
        await inputText(debuggerClient.send, "/quit");
        await dispatchKey(debuggerClient.send, {
          key: "Enter",
          code: "Enter",
          windowsVirtualKeyCode: 13,
        });
        const piSequence = await evaluate(
          debuggerClient.send,
          "window.__piSequence",
        );
        const exitStatus = await waitForCommandResult(
          debuggerClient.send,
          piSequence,
          "Pi audit exit",
        );
        await evaluate(
          debuggerClient.send,
          `window.__piResult = ${JSON.stringify(exitStatus)}`,
        );
        assert.equal(exitStatus, 0);
        for (const probe of piAuditSpec.probes) {
          const command = typeof probe === "string" ? probe : probe.command;
          const expectedStatus = typeof probe === "string" ? undefined : probe.status;
          await clearTerminalSelection(debuggerClient.send);
          const started = Date.now();
          const status = await evaluate(
            debuggerClient.send,
            `window.__dolly.submit(${JSON.stringify(command)})`,
          );
          await delay(100);
          const visibleText = await visibleTerminalText(debuggerClient.send);
          await clearTerminalSelection(debuggerClient.send);
          audit.probes.push({
            command,
            status,
            ...(expectedStatus === undefined ? {} : { expectedStatus }),
            elapsedMilliseconds: Date.now() - started,
            visibleText,
          });
          await writeFile(
            resolve(projectDir, "build/pi-agent-audit.json"),
            `${JSON.stringify(audit, null, 2)}\n`,
          );
          if (expectedStatus !== undefined) {
            assert.equal(
              status,
              expectedStatus,
              `Pi audit probe failed: ${command}`,
            );
          }
        }
        await writeFile(
          resolve(projectDir, "build/pi-agent-audit.json"),
          `${JSON.stringify(audit, null, 2)}\n`,
        );
        console.log(
          "browser: real OpenRouter Pi audit completed; report build/pi-agent-audit.json",
        );
        break browserProof;
      }

      if (piOpenRouterMode) {
        const requestCountBefore = await evaluate(
          debuggerClient.send,
          "window.__dolly.httpRequestCount",
        );
        const extensionUrl = fixtureExtensionUrl;
        const installPrompt =
          "Install a Pi extension in this Dolly sandbox. Use the bash tool to run exactly: " +
          `mkdir -p /home/dolly/.pi/agent/extensions && curl -fsSL ${extensionUrl} ` +
          "-o /home/dolly/.pi/agent/extensions/installed-proof.js . " +
          "Then use the read tool to verify that file contains DOLLY-INSTALLED-EXTENSION-OK. " +
          "Do the work; do not merely describe it.";
        await inputText(debuggerClient.send, installPrompt);
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
              baseUrl: fixturePiBase,
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
      await inputText(debuggerClient.send, prompt);
      await dispatchKey(debuggerClient.send, {
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
      });

      let thinkingStart;
      try {
        thinkingStart = await waitForValue(
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
      } catch (error) {
        console.error(await visibleTerminalText(debuggerClient.send));
        const failedScreenshot = await debuggerClient.send("Page.captureScreenshot", {
          format: "png",
          fromSurface: true,
        });
        await writeFile(
          resolve(projectDir, "build/pi-stream-start-failed.png"),
          failedScreenshot.data,
          "base64",
        );
        throw error;
      }
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

      await clearTerminalSelection(debuggerClient.send);
      await inputText(debuggerClient.send, "/quit");
      await dispatchKey(debuggerClient.send, {
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
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

      // Author and compile an extension with Dolly's target TypeScript compiler
      // after the first Pi has exited, then prove a fresh Pi resolves and invokes
      // the emitted module from the same WasmFS session.
      await installTypeScriptExtension(debuggerClient.send);
      piModelRequests.length = 0;
      await evaluate(debuggerClient.send, `(() => {
        window.__typescriptPiResult = null;
        window.__dolly.submit(${JSON.stringify(`${piCommand} --no-session`)})
          .then((status) => { window.__typescriptPiResult = status; });
      })()`);
      await waitForValue(
        debuggerClient.send,
        "({ foreground: window.__dolly.foregroundPid, result: window.__typescriptPiResult })",
        (value) => value.foreground !== 0 || value.result !== null,
        "Pi restart with target-compiled TypeScript extension",
        600,
      );
      await delay(Number(process.env.DOLLY_PI_STARTUP_DELAY_MS ?? 3000));
      assert.equal(
        await evaluate(debuggerClient.send, "window.__typescriptPiResult"),
        null,
        "Pi exited while loading the target-compiled TypeScript extension",
      );
      await typeText(debuggerClient.send, "Use the installed TypeScript extension tool now.");
      await dispatchKey(debuggerClient.send, {
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
      });
      for (let attempt = 0; attempt < 600 && piModelRequests.length < 2; attempt++) {
        await delay(100);
      }
      assert.equal(piModelRequests.length, 2);
      const typeScriptToolMessages = piModelRequests[1].payload.messages.filter(
        (message) => message.role === "tool",
      );
      assert.equal(typeScriptToolMessages.length, 1);
      assert.match(
        JSON.stringify(typeScriptToolMessages[0].content),
        /DOLLY-TYPESCRIPT-EXTENSION-OK/,
      );
      await dispatchKey(debuggerClient.send, {
        key: "d",
        code: "KeyD",
        modifiers: 2,
        windowsVirtualKeyCode: 68,
      });
      assert.equal(
        await waitForValue(
          debuggerClient.send,
          "window.__typescriptPiResult",
          (value) => value !== null,
          "Pi TypeScript-extension restart exit",
          600,
        ),
        0,
      );
      console.log(
        `browser: upstream Pi TUI started in Ghostty at frame ${startup.frame}, ` +
        "yellow theme, live thinking animation, incremental SSE, and Dolly " +
        "write/edit extension crossed the HTTP fixture; a target-compiled " +
        "TypeScript extension loaded after restart and ran; Ctrl-D exited; " +
        "screenshot build/pi-chrome.png",
      );
      break browserProof;
    }

  const snapshotStarted = Date.now();
  const snapshotReadyState = await waitForValue(
    debuggerClient.send,
    "document.documentElement?.dataset.dollyStatus ?? ''",
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
  if (state === "failed") {
    console.error(await visibleTerminalText(debuggerClient.send));
    const failedScreenshot = await debuggerClient.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
    });
    await writeFile(
      resolve(projectDir, "build/browser-proof-failed.png"),
      failedScreenshot.data,
      "base64",
    );
  }
  assert.equal(state, "passed");

  const utilityStatus = await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        "which cc | grep -q '^/bin/cc$' && " +
        "printf 'alpha:beta\\n' | cut -d : -f 2 | grep -q '^beta$' && " +
        "printf 'A\\tB\\n' > /tmp/dolly-od-check && " +
        "od -t c /tmp/dolly-od-check | grep -q 'A.*\\\\t.*B' && " +
        "printf 'alpha\\0beta\\0' | xargs -0 -n 1 echo > /tmp/dolly-xargs-check && " +
        "grep -q '^alpha$' /tmp/dolly-xargs-check && " +
        "grep -q '^beta$' /tmp/dolly-xargs-check && " +
        "printf 'left\\nright\\n' | xargs -I ITEM echo value=ITEM > /tmp/dolly-xargs-insert && " +
        "grep -q '^value=left$' /tmp/dolly-xargs-insert && " +
        "grep -q '^value=right$' /tmp/dolly-xargs-insert && " +
        "printf '' | xargs -I ITEM false && " +
        "printf '' | xargs -r false && ! xargs -P 2 true && " +
        "mkdir -p /tmp/find-browser/src /tmp/find-browser/vendor/nested && " +
        "touch /tmp/find-browser/src/one.c /tmp/find-browser/src/two.txt " +
        "/tmp/find-browser/vendor/nested/hidden.c && " +
        "find /tmp/find-browser -path /tmp/find-browser/vendor -prune " +
        "-o -name '*.c' -print > /tmp/find-browser-pruned && " +
        "grep -q '^/tmp/find-browser/src/one.c$' /tmp/find-browser-pruned && " +
        "! grep -q hidden.c /tmp/find-browser-pruned && " +
        "find /tmp/find-browser -type f -print0 | xargs -0 -n 1 test -f && " +
        "find /tmp/find-browser/src -type f -exec echo {} + " +
        "> /tmp/find-browser-exec && " +
        "grep -q '^/tmp/find-browser/src/one.c /tmp/find-browser/src/two.txt$' " +
        "/tmp/find-browser-exec && " +
        "! find /tmp/find-browser -perm 644 2> /tmp/find-permission-error && " +
        "grep -q 'no user, group, or permission model' /tmp/find-permission-error && " +
        "printf 'one\\ntwo\\nthree\\n' > /tmp/tail-browser && " +
        "tail -n 2 /tmp/tail-browser > /tmp/tail-last && " +
        "grep -q '^two$' /tmp/tail-last && grep -q '^three$' /tmp/tail-last && " +
        "tail -n +2 /tmp/tail-browser > /tmp/tail-from && " +
        "grep -q '^two$' /tmp/tail-from && ! grep -q '^one$' /tmp/tail-from && " +
        "tail -c 6 /tmp/tail-browser | grep -q '^three$' && " +
        "! tail -f /tmp/tail-browser 2> /tmp/tail-follow-error && " +
        "grep -q 'serial process model' /tmp/tail-follow-error && " +
        "printf 'binary\\0data\\n' | tee /tmp/tee-binary > /tmp/tee-stdout && " +
        "od -t c /tmp/tee-binary | grep -q 'b.*i.*n.*a.*r.*y.*\\\\0.*d.*a.*t.*a' && " +
        "od -t c /tmp/tee-stdout | grep -q 'b.*i.*n.*a.*r.*y.*\\\\0.*d.*a.*t.*a' && " +
        "printf 'appended\\n' | tee -a /tmp/tee-binary > /tmp/tee-append && " +
        "tail -n 1 /tmp/tee-binary | grep -q '^appended$' && " +
        "! tee -i < /tmp/tail-browser 2> /tmp/tee-interrupt-error && " +
        "grep -q 'always cancels' /tmp/tee-interrupt-error && " +
        "printf 'abc xyz' | tr 'a-z' 'A-Z' | grep -q '^ABC XYZ$' && " +
        "basename /workspace/example.c .c | grep -q '^example$' && " +
        "dirname /workspace/example.c | grep -q '^/workspace$' && " +
        "env DOLLY_CHILD_ENV=inside printenv DOLLY_CHILD_ENV | grep -q '^inside$' && " +
        "! printenv DOLLY_CHILD_ENV && " +
        "env -i PATH=/bin printenv PATH | grep -q '^/bin$' && " +
        "! env -u HOME printenv HOME && ! env false && " +
        "printenv > /tmp/printenv-all && printenv PATH | grep -q '^/bin:/usr/bin$' && " +
        "printf same > /tmp/cmp-browser-one && " +
        "printf same > /tmp/cmp-browser-two && " +
        "cmp /tmp/cmp-browser-one /tmp/cmp-browser-two && " +
        "printf changed > /tmp/cmp-browser-two && " +
        "! cmp -s /tmp/cmp-browser-one /tmp/cmp-browser-two && " +
        "date -u -d 0 '+%Y-%m-%d' | grep -q '^1970-01-01$' && " +
        "mktemp -d /tmp/browser-temp.XXXXXX > /tmp/mktemp-browser && " +
        "xargs -n 1 test -d < /tmp/mktemp-browser && " +
        "printf abc > /tmp/sha256-browser && " +
        "sha256sum /tmp/sha256-browser | " +
        "grep -q '^ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad  /tmp/sha256-browser$' && " +
        "sha256sum /tmp/sha256-browser > /tmp/sha256-browser-list && " +
        "sha256sum -c /tmp/sha256-browser-list && sleep 0 && timeout 1 true && " +
        "md5sum /tmp/sha256-browser | grep -q '^900150983cd24fb0d6963f7d28e17f72  /tmp/sha256-browser$' && " +
        "md5sum /tmp/sha256-browser > /tmp/md5-browser-list && md5sum -c /tmp/md5-browser-list && " +
        "uname -sm | grep -q '^Dolly wasm64$' && " +
        "time true 2> /tmp/time-browser && grep -q '^real [0-9]' /tmp/time-browser && " +
        "! time false 2> /tmp/time-browser-false && " +
        "printf 'link-data\\n' > /tmp/link-browser-target && " +
        "ln -s /tmp/link-browser-target /tmp/link-browser-symbolic && " +
        "readlink /tmp/link-browser-symbolic | grep -q '^/tmp/link-browser-target$' && " +
        "realpath /tmp/link-browser-symbolic | grep -q '^/tmp/link-browser-target$' && " +
        "grep -q '^link-data$' /tmp/link-browser-symbolic && " +
        "! ln /tmp/link-browser-target /tmp/link-browser-hard 2> /tmp/link-browser-hard-error && " +
        "mkdir -p /tmp/rmdir-browser/child && rmdir /tmp/rmdir-browser/child && " +
        "test ! -e /tmp/rmdir-browser/child && " +
        "seq 2 2 6 > /tmp/seq-browser && " +
        "grep -q '^2$' /tmp/seq-browser && grep -q '^4$' /tmp/seq-browser && " +
        "grep -q '^6$' /tmp/seq-browser && " +
        "printf 'a\\nb\\n' > /tmp/paste-browser-left && " +
        "printf '1\\n2\\n' > /tmp/paste-browser-right && " +
        "paste /tmp/paste-browser-left /tmp/paste-browser-right | " +
        "tr '\\t' ':' > /tmp/paste-browser && " +
        "grep -q '^a:1$' /tmp/paste-browser && grep -q '^b:2$' /tmp/paste-browser && " +
        "printf 'a\\nb\\n' > /tmp/comm-browser-left && " +
        "printf 'b\\nc\\n' > /tmp/comm-browser-right && " +
        "comm -12 /tmp/comm-browser-left /tmp/comm-browser-right | grep -q '^b$' && " +
        "expr 6 + 7 | grep -q '^13$' && " +
        "printf 'alpha\\nbeta\\n' > /tmp/nl-browser && " +
        "nl -ba /tmp/nl-browser > /tmp/nl-browser-output && " +
        "grep -q '1.*alpha' /tmp/nl-browser-output && " +
        "grep -q '2.*beta' /tmp/nl-browser-output && " +
        "printf '1 left\\n2 two\\n' > /tmp/join-browser-left && " +
        "printf '1 right\\n3 three\\n' > /tmp/join-browser-right && " +
        "join /tmp/join-browser-left /tmp/join-browser-right | grep -q '^1 left right$' && " +
        "mkdir -p /tmp/split-browser-decimal /tmp/split-browser-alpha && " +
        "printf 'one\\ntwo\\nthree\\n' > /tmp/split-browser-input && " +
        "split -d -l 2 /tmp/split-browser-input /tmp/split-browser-decimal/part- && " +
        "test -f /tmp/split-browser-decimal/part-00 && " +
        "split -l 2 /tmp/split-browser-input /tmp/split-browser-alpha/part- && " +
        "test -f /tmp/split-browser-alpha/part-aa && " +
        "grep -q '^three$' /tmp/split-browser-alpha/part-ab && " +
        "printf '\\0DOLLY-STRING\\0no\\0' | strings | grep -q '^DOLLY-STRING$' && " +
        "printf abc > /tmp/cksum-browser && " +
        "! cksum /tmp/cksum-browser-missing 2> /tmp/cksum-browser-error && " +
        "cksum /tmp/cksum-browser | grep -q '^1219131554 3 /tmp/cksum-browser$' && " +
        "printf 'abc\\n' | rev | grep -q '^cba$' && " +
        "printf 'abcdef\\n' | fold -w 3 > /tmp/fold-browser && " +
        "grep -q '^abc$' /tmp/fold-browser && grep -q '^def$' /tmp/fold-browser && " +
        "printf 'a\\tb\\n' | expand -t 4 | grep -q '^a   b$' && " +
        "printf 'a   b\\n' | unexpand -a -t 4 | tr '\\t' ':' | grep -q '^a:b$' && " +
        "printf 'a b\\nb c\\n' > /tmp/tsort-browser && " +
        "tsort /tmp/tsort-browser > /tmp/tsort-browser-output && " +
        "test \"$(cat /tmp/tsort-browser-output)\" = \"$(printf 'a\\nb\\nc\\n')\" && " +
        "pathchk -p portable/path && ! pathchk -p 'bad:char' 2> /tmp/pathchk-browser-error && " +
        "test \"$(command -v true)\" = /bin/true && " +
        "command printf '%s\\n' command-browser | grep -q '^command-browser$' && " +
        "mkdir -p /tmp/du-browser/nested /tmp/du-browser-empty && " +
        "du -sb /tmp/du-browser-empty | grep -q '^0[[:space:]]' && " +
        "printf abc > /tmp/du-browser/first && " +
        "printf de > /tmp/du-browser/nested/second && " +
        "du -sb /tmp/du-browser | grep -q '^5[[:space:]]' && " +
        "du -ab /tmp/du-browser | grep -q '^2[[:space:]].*/nested/second$' && " +
        "printf abcdef > /tmp/dd-browser-input && " +
        "dd if=/tmp/dd-browser-input of=/tmp/dd-browser-output bs=2 skip=1 count=2 status=none && " +
        "test \"$(cat /tmp/dd-browser-output)\" = cdef && " +
        "printf 000000 > /tmp/dd-browser-output && printf XY > /tmp/dd-browser-replacement && " +
        "dd if=/tmp/dd-browser-replacement of=/tmp/dd-browser-output bs=2 seek=1 count=1 conv=notrunc status=none && " +
        "test \"$(cat /tmp/dd-browser-output)\" = 00XY00 && " +
        "test \"$(printf xyz | dd bs=1 count=2 status=none)\" = xy && " +
        "test \"$(hostname)\" = dolly && test \"$(hostname -f)\" = dolly && " +
        "tty | grep -q '^/dev/tty$' && " +
        "true && ! false && test -x /bin/ls && test ! -x /tmp && " +
        "test -r /bin/ls && test -w /workspace && " +
        "test value = value -a '(' other != missing -o false ')' && " +
        "! test value = missing -o other = absent && " +
        "mkdir -p /tmp/find-browser/-leading && cd /tmp/find-browser && " +
        "test \"$(find -- -leading -maxdepth 0)\" = -leading && cd /workspace && " +
        "printf cp-link > /tmp/cp-link-target-browser && " +
        "ln -s /tmp/cp-link-target-browser /tmp/cp-link-browser && " +
        "! cp /tmp/cp-link-target-browser /tmp/cp-link-browser " +
        "2> /tmp/cp-same-link-error-browser && " +
        "test \"$(cat /tmp/cp-link-target-browser)\" = cp-link && " +
        "grep -q 'are the same file' /tmp/cp-same-link-error-browser && " +
        "ln -s /tmp/cp-missing-target-browser /tmp/cp-broken-link-browser && " +
        "test -L /tmp/cp-broken-link-browser && ! test -e /tmp/cp-broken-link-browser && " +
        "mkdir -p /tmp/rm-link-target-browser && touch /tmp/rm-link-target-browser/keep && " +
        "ln -s /tmp/rm-link-target-browser /tmp/rm-link-directory-browser && " +
        "! rm -r /tmp/rm-link-directory-browser/ && " +
        "test -f /tmp/rm-link-target-browser/keep && test -L /tmp/rm-link-directory-browser && " +
        "cp /tmp/cp-link-browser /tmp/cp-link-copy-browser && " +
        "test \"$(readlink /tmp/cp-link-copy-browser)\" = /tmp/cp-link-target-browser && " +
        "mkdir -p /tmp/mv-source-browser/nested /tmp/mv-destination-browser && " +
        "mv /tmp/mv-source-browser/ /tmp/mv-destination-browser && " +
        "test -d /tmp/mv-destination-browser/mv-source-browser/nested",
      )})`,
    );
  if (utilityStatus !== 0) console.error(await visibleTerminalText(debuggerClient.send));
  assert.equal(
    utilityStatus,
    0,
    "the source-built agent utility set did not preserve its Dolly semantics",
  );

  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        "printf 'same\\n' > /tmp/diff-browser-left && " +
        "printf 'same\\n' > /tmp/diff-browser-right && " +
        "diff /tmp/diff-browser-left /tmp/diff-browser-right",
      )})`,
    ),
    0,
    "diff did not report identical files",
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        "printf 'changed\\n' > /tmp/diff-browser-right && " +
        "diff -u /tmp/diff-browser-left /tmp/diff-browser-right > /tmp/diff-browser-output",
      )})`,
    ),
    1,
    "diff did not report different files with status 1",
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        "grep -q '^-same$' /tmp/diff-browser-output && " +
        "grep -q '^+changed$' /tmp/diff-browser-output",
      )})`,
    ),
    0,
    "diff did not produce the expected unified hunk",
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        "printf 'before\\n' > /tmp/patch-browser && " +
        "printf '%s\\n' '--- a/patch-browser' '+++ b/patch-browser' " +
        "'@@ -1 +1 @@' '-before' '+after' > /tmp/patch-browser-input && " +
        "patch --dry-run -p1 -d /tmp -i /tmp/patch-browser-input && " +
        "patch -p1 -d /tmp -i /tmp/patch-browser-input && " +
        "grep -q '^after$' /tmp/patch-browser",
      )})`,
    ),
    0,
    "patch did not check and apply a unified diff outside a Git worktree",
  );

  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        "echo deferred > /tmp/slop-deferred-browser && " +
        "test \"$(cat /tmp/slop-deferred-browser)\" = deferred && " +
        "DOLLY_DEFERRED_BROWSER=value && " +
        "test \"$DOLLY_DEFERRED_BROWSER\" = value && unset DOLLY_DEFERRED_BROWSER",
      )})`,
    ),
    0,
    "Slop expanded a later simple command before earlier commands completed",
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        "unset DOLLY_PARAMETER_BROWSER DOLLY_FALLBACK_BROWSER && " +
        "test \"${DOLLY_PARAMETER_BROWSER:-fallback}\" = fallback && " +
        "test \"${DOLLY_PARAMETER_BROWSER:=${DOLLY_FALLBACK_BROWSER:-assigned}}\" = assigned && " +
        "test \"$DOLLY_PARAMETER_BROWSER\" = assigned && " +
        "test \"${DOLLY_PARAMETER_BROWSER:+alternate}\" = alternate && " +
        "test \"${DOLLY_MISSING_BROWSER+alternate}\" = '' && " +
        "DOLLY_EMPTY_PARAMETER_BROWSER= && " +
        "test \"${DOLLY_EMPTY_PARAMETER_BROWSER-default}\" = '' && " +
        "test \"${DOLLY_EMPTY_PARAMETER_BROWSER:-default}\" = default && " +
        "test \"${DOLLY_EMPTY_PARAMETER_BROWSER+alternate}\" = alternate && " +
        "test \"${DOLLY_EMPTY_PARAMETER_BROWSER:+alternate}\" = '' && " +
        "! slop -c 'echo \"${DOLLY_MISSING_BROWSER:?required parameter}\"' " +
        "2> /tmp/slop-parameter-browser-error && " +
        "grep -q 'DOLLY_MISSING_BROWSER: required parameter' /tmp/slop-parameter-browser-error",
      )})`,
    ),
    0,
    "Slop parameter default/assignment/alternate/error operators failed",
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        "DOLLY_PATTERN_BROWSER=/usr/local/bin/tool; " +
        "test \"${#DOLLY_PATTERN_BROWSER}\" -eq 19 && " +
        "test \"${DOLLY_PATTERN_BROWSER#*/}\" = usr/local/bin/tool && " +
        "test \"${DOLLY_PATTERN_BROWSER##*/}\" = tool && " +
        "test \"${DOLLY_PATTERN_BROWSER%/*}\" = /usr/local/bin && " +
        "test \"${DOLLY_PATTERN_BROWSER%%/*}\" = ''",
      )})`,
    ),
    0,
    "Slop parameter length or pattern removal failed",
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        "cd /workspace && export DOLLY_SUBSTITUTION_STATE_BROWSER=outer && " +
        "test \"$(cd /; export DOLLY_SUBSTITUTION_STATE_BROWSER=inner; pwd)\" = / && " +
        "test \"$DOLLY_SUBSTITUTION_STATE_BROWSER\" = outer && " +
        "test \"$(pwd)\" = /workspace",
      )})`,
    ),
    0,
    "Slop command substitution leaked cwd or environment state",
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        "DOLLY_LEGACY_BROWSER=before; DOLLY_LEGACY_BROWSER=after; " +
        "test \"`printf '%s' \"$DOLLY_LEGACY_BROWSER\"`\" = after && " +
        "test \"`false; echo legacy-continued`\" = legacy-continued && " +
        "! slop -c 'echo `unterminated'",
      )})`,
    ),
    0,
    "Slop legacy backtick substitution failed",
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        "DOLLY_ARITHMETIC_BROWSER=5; " +
        "test \"$(( DOLLY_ARITHMETIC_BROWSER * 2 + 3 ))\" -eq 13 && " +
        "test \"$(( (1 << 4) | 3 ))\" -eq 19 && " +
        "test \"$(( 3 > 2 && 2 != 1 ))\" -eq 1 && " +
        "test \"$(( 0 && 1 / 0 ))\" -eq 0 && " +
        "test \"$(( 1 || 1 / 0 ))\" -eq 1 && " +
        "slop -c 'test \"$(( $* ))\" -eq 6' arithmetic-test 1 + 2 + 3 && " +
        "! slop -c 'echo \"$(( 1 / 0 ))\"'",
      )})`,
    ),
    0,
    "Slop arithmetic expansion failed",
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        "echo 'DOLLY_SOURCED_BROWSER=$1' > /tmp/dolly-source-browser.slop && " +
        ". /tmp/dolly-source-browser.slop sourced-value && " +
        "test \"$DOLLY_SOURCED_BROWSER\" = sourced-value && " +
        "source /tmp/dolly-source-browser.slop source-value && " +
        "test \"$DOLLY_SOURCED_BROWSER\" = source-value && " +
        "cd /tmp && test \"$PWD\" = /tmp && " +
        "test \"$OLDPWD\" = /workspace && " +
        "cd - > /tmp/dolly-cd-browser && " +
        "test \"$(cat /tmp/dolly-cd-browser)\" = /workspace && " +
        "test \"$PWD\" = /workspace && test \"$OLDPWD\" = /tmp",
      )})`,
    ),
    0,
    "Slop source alias or cd directory state failed",
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        "DOLLY_EVAL_BROWSER_NAME=DOLLY_EVAL_BROWSER && " +
        "eval \"$DOLLY_EVAL_BROWSER_NAME=eval-value\" && " +
        "test \"$DOLLY_EVAL_BROWSER\" = eval-value",
      )})`,
    ),
    0,
    "Slop eval builtin failed",
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        "printf 'test continued %s\\n= continued\\n' '\x5c' " +
        "> /tmp/slop-continuation-browser.slop && " +
        "slop /tmp/slop-continuation-browser.slop && " +
        "slop -c \"$(cat /tmp/slop-continuation-browser.slop)\"",
      )})`,
    ),
    0,
    "Slop backslash-newline continuation failed",
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        "DOLLY_FUNCTION_OUTER_BROWSER=outer; " +
        "dolly_function_browser () { test \"$1\" = inner; DOLLY_FUNCTION_RESULT_BROWSER=$2; }; " +
        "dolly_function_browser inner result; " +
        "test \"$DOLLY_FUNCTION_RESULT_BROWSER\" = result && " +
        "test \"$DOLLY_FUNCTION_OUTER_BROWSER\" = outer && " +
        "dolly_return_browser() { if true; then return 7; fi; false; }; " +
        "! dolly_return_browser && " +
        "DOLLY_LOCAL_BROWSER=outer; unset DOLLY_LOCAL_NEW_BROWSER; " +
        "dolly_local_browser () { local DOLLY_LOCAL_BROWSER=inner DOLLY_LOCAL_NEW_BROWSER; " +
        "test \"$DOLLY_LOCAL_BROWSER\" = inner && DOLLY_LOCAL_NEW_BROWSER=value; }; " +
        "dolly_local_browser && test \"$DOLLY_LOCAL_BROWSER\" = outer && " +
        "test \"${DOLLY_LOCAL_NEW_BROWSER+set}\" = '' && " +
        "dolly_capture_browser () { echo \"$1\"; }; " +
        "test \"$(dolly_capture_browser captured)\" = captured && " +
        "test \"$(dolly_private_browser () { echo private; }; dolly_private_browser)\" = private && " +
        "! dolly_private_browser && " +
        "{ DOLLY_GROUP_BROWSER=grouped; true; } && " +
        "test \"$DOLLY_GROUP_BROWSER\" = grouped",
      )})`,
    ),
    0,
    "Slop functions, local/return, private substitution state, or groups failed",
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        "cd /workspace; DOLLY_SUBSHELL_BROWSER=outer; " +
        "(cd /tmp; DOLLY_SUBSHELL_BROWSER=inner; " +
        "touch /tmp/dolly-subshell-browser-shared; " +
        "test \"$DOLLY_SUBSHELL_BROWSER\" = inner) && " +
        "test \"$DOLLY_SUBSHELL_BROWSER\" = outer && " +
        "test \"$(pwd)\" = /workspace && " +
        "test -f /tmp/dolly-subshell-browser-shared && " +
        "(type type) > /tmp/dolly-subshell-browser-output && " +
        "grep -q 'shell builtin' /tmp/dolly-subshell-browser-output && " +
        "{ type type; } > /tmp/dolly-group-browser-output && " +
        "grep -q 'shell builtin' /tmp/dolly-group-browser-output && " +
        "(type type) | grep -q 'shell builtin' && " +
        "test \"$( (hostname || uname -n) 2>/dev/null | sed 1q)\" = dolly && " +
        "set -o pipefail; DOLLY_COMPOUND_STATUS_BROWSER=0; " +
        "(exit 7) | true || DOLLY_COMPOUND_STATUS_BROWSER=$?; " +
        "set +o pipefail; test \"$DOLLY_COMPOUND_STATUS_BROWSER\" -eq 7 && " +
        "((exit 7) || test \"$?\" -eq 7) && ( (true) ) && " +
        "! slop -c '(true'",
      )})`,
    ),
    0,
    "Slop parenthesized state boundary or nesting failed",
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        "slop -c 'test \"$#\" -eq 3; shift; test \"$1\" = two; shift 2; test \"$#\" -eq 0; ! shift' shift-test one two three && " +
        "slop -c 'set alpha beta; test \"$#\" -eq 2; test \"$1\" = alpha; shift; test \"$1\" = beta; set -- reset values; test \"$2\" = values' set-test ignored && " +
        "slop -c 'outer () { inner () { shift; test \"$1\" = second; }; inner first second; test \"$1\" = outer; }; outer outer' nested-shift-test",
      )})`,
    ),
    0,
    "Slop set/shift positional ownership failed",
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        "slop -c 'DOLLY_FIELDS=\"alpha beta\"; " +
        "set -- $DOLLY_FIELDS; test \"$#\" -eq 2; " +
        "test \"$1\" = alpha; test \"$2\" = beta; " +
        "set -- \"$DOLLY_FIELDS\"; test \"$#\" -eq 1; " +
        "DOLLY_EMPTY=; set -- before $DOLLY_EMPTY after; test \"$#\" -eq 2; " +
        "IFS=:; DOLLY_FIELDS=alpha:beta; set -- $DOLLY_FIELDS; " +
        "test \"$#\" -eq 2; set -- alpha:beta; test \"$#\" -eq 1' field-test",
      )})`,
    ),
    0,
    "Slop finite unquoted IFS field splitting failed",
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        "slop -c 'forward () { test \"$#\" -eq 3; " +
        "test \"$1\" = \"one word\"; test -z \"$2\"; " +
        "test \"$3\" = third; }; forward \"$@\"; set -- \"$@\"; " +
        "test \"$#\" -eq 3; DOLLY_AT=; for value in \"$@\"; do " +
        "DOLLY_AT=\"${DOLLY_AT}[${value}]\"; done; " +
        "test \"$DOLLY_AT\" = \"[one word][][third]\"' " +
        "at-test 'one word' '' third && " +
        "slop -c 'set -- \"$@\"; test \"$#\" -eq 0' at-empty",
      )})`,
    ),
    0,
    "Slop quoted positional field preservation failed",
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        "test \"$(cd ~; pwd)\" = /home/dolly && " +
        "DOLLY_TILDE_BROWSER=~/workspace; " +
        "test \"$DOLLY_TILDE_BROWSER\" = /home/dolly/workspace",
      )})`,
    ),
    0,
    "Slop HOME tilde expansion failed",
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        "DOLLY_ASSIGNMENT_WORD_BROWSER='one two'; " +
        "dolly_assignment_word_browser () { " +
        "local DOLLY_LOCAL_WORD_BROWSER=$DOLLY_ASSIGNMENT_WORD_BROWSER; " +
        "test \"$DOLLY_LOCAL_WORD_BROWSER\" = 'one two'; }; " +
        "dolly_assignment_word_browser && " +
        "export DOLLY_EXPORT_WORD_BROWSER=$DOLLY_ASSIGNMENT_WORD_BROWSER; " +
        "test \"$DOLLY_EXPORT_WORD_BROWSER\" = 'one two'",
      )})`,
    ),
    0,
    "Slop local/export assignment-word preservation failed",
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        "exec 5> /tmp/slop-fd-browser; exec 6>&5; " +
        "type type >&6; exec 6>&-; exec 5>&-; " +
        "grep -q 'shell builtin' /tmp/slop-fd-browser && " +
        "printf 'descriptor input\\n' > /tmp/slop-fd-input-browser && " +
        "exec 7< /tmp/slop-fd-input-browser; " +
        "read DOLLY_FD_INPUT_BROWSER <&7; exec 7<&-; " +
        "test \"$DOLLY_FD_INPUT_BROWSER\" = 'descriptor input' && " +
        "exec 8> /tmp/slop-fd-dynamic-browser; DOLLY_DYNAMIC_FD_BROWSER=8; " +
        "echo dynamic-descriptor >&$DOLLY_DYNAMIC_FD_BROWSER; exec 8>&-; " +
        "grep -q '^dynamic-descriptor$' /tmp/slop-fd-dynamic-browser && " +
        "! slop -c 'echo nope 10>/tmp/slop-fd-ten-browser' && " +
        "! test -e /tmp/slop-fd-ten-browser && " +
        "! slop -c 'echo nope 2>&x' && " +
        "! slop -c 'echo nope 2>&1junk'",
      )})`,
    ),
    0,
    "Slop persistent exec or numbered descriptor redirection failed",
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        "slop -c 'set -ex; case $- in *e*x*) set +ex ;; *) false ;; esac'",
      )})`,
    ),
    0,
    "Slop option-flag parameter expansion failed",
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        "printf '%s\\n' 'DOLLY_HEREDOC_BROWSER=expanded' " +
        "'cat <<EOF > /tmp/slop-heredoc-browser-output' " +
        "'$DOLLY_HEREDOC_BROWSER' '$(echo command)' 'EOF' " +
        "\"cat <<'EOF' > /tmp/slop-heredoc-browser-literal\" " +
        "'$DOLLY_HEREDOC_BROWSER' 'EOF' > /tmp/slop-heredoc-browser.slop && " +
        "slop /tmp/slop-heredoc-browser.slop && " +
        "test \"$(sed -n 1p /tmp/slop-heredoc-browser-output)\" = expanded && " +
        "test \"$(sed -n 2p /tmp/slop-heredoc-browser-output)\" = command && " +
        "test \"$(cat /tmp/slop-heredoc-browser-literal)\" = '$DOLLY_HEREDOC_BROWSER'",
      )})`,
    ),
    0,
    "Slop bounded here-document parsing or expansion failed",
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        "slop -n /tmp/slop-heredoc-browser.slop && " +
        "slop -n -c 'touch /tmp/slop-noexec-browser' && " +
        "! test -e /tmp/slop-noexec-browser && " +
        "slop -n -c 'case ${DOLLY_NOEXEC_MISSING:?must-not-expand} in x) true ;; esac' && " +
        "! slop -n -c 'if true'",
      )})`,
    ),
    0,
    "Slop no-execute syntax checking failed",
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        "DOLLY_SET_LIST_BROWSER=visible; " +
        "set | grep -q \"^DOLLY_SET_LIST_BROWSER='visible'$\" && " +
        "set -o | grep -q '^posix on$' && " +
        "set -o pipefail && ! false | true && " +
        "set +o pipefail && false | true",
      )})`,
    ),
    0,
    "Slop set listing, named options, or pipefail failed",
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        "dolly_typed_browser () { true; }; " +
        "type dolly_typed_browser | grep -q 'shell function' && " +
        "type type | grep -q 'shell builtin' && " +
        "test \"$(type -p cc)\" = /bin/cc && " +
        "! type dolly-definitely-missing",
      )})`,
    ),
    0,
    "Slop type builtin failed",
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        "printf 'alpha beta gamma\\n' > /tmp/slop-read-browser && " +
        "read DOLLY_READ_FIRST_BROWSER DOLLY_READ_REST_BROWSER < /tmp/slop-read-browser && " +
        "test \"$DOLLY_READ_FIRST_BROWSER\" = alpha && " +
        "test \"$DOLLY_READ_REST_BROWSER\" = 'beta gamma' && " +
        "IFS= read -r DOLLY_READ_ALL_BROWSER < /tmp/slop-read-browser && " +
        "test \"$DOLLY_READ_ALL_BROWSER\" = 'alpha beta gamma'",
      )})`,
    ),
    0,
    "Slop read builtin failed",
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        "slop -c 'OPTIND=1; DOLLY_OPTIONS=; " +
        "while getopts \":ab:\" option; do " +
        "case \"$option\" in " +
        "a) DOLLY_OPTIONS=\"${DOLLY_OPTIONS}a\" ;; " +
        "b) DOLLY_OPTIONS=\"${DOLLY_OPTIONS}b=$OPTARG\" ;; " +
        "*) exit 2 ;; esac; done; " +
        "shift \"$((OPTIND - 1))\"; " +
        "test \"$DOLLY_OPTIONS\" = \"ab=value\"; test \"$1\" = rest' " +
        "getopts-test -abvalue rest",
      )})`,
    ),
    0,
    "Slop getopts clustered-option parsing failed",
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        "unset DOLLY_IF_BROWSER; " +
        "if true; then DOLLY_IF_BROWSER=yes; else DOLLY_IF_BROWSER=no; fi; " +
        "test \"$DOLLY_IF_BROWSER\" = yes && " +
        "if false; then false; elif true; then true; else false; fi && " +
        "if true; then if false; then false; else true; fi; else false; fi",
      )})`,
    ),
    0,
    "Slop nested if/elif/else lists failed",
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        "rm -f /tmp/slop-for-browser /tmp/slop-for-browser-nested; " +
        "for value in alpha beta gamma; do echo \"$value\" >> /tmp/slop-for-browser; done; " +
        "test \"$(cat /tmp/slop-for-browser)\" = \"$(printf 'alpha\\nbeta\\ngamma\\n')\" && " +
        "for outer in a b; do for inner in 1 2; do echo \"$outer$inner\" >> /tmp/slop-for-browser-nested; done; done; " +
        "test \"$(cat /tmp/slop-for-browser-nested)\" = \"$(printf 'a1\\na2\\nb1\\nb2\\n')\" && " +
        "test \"$(slop -c 'for value; do echo \"$value\"; done' loop first second)\" = \"$(printf 'first\\nsecond\\n')\"",
      )})`,
    ),
    0,
    "Slop explicit, nested, and positional for loops failed",
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        "test \"$(for value in 1 2 3 4; do if test \"$value\" = 2; then continue; fi; echo \"$value\"; if test \"$value\" = 3; then break; fi; done)\" = \"$(printf '1\\n3\\n')\" && " +
        "test \"$(for outer in a b; do for inner in 1 2; do if test \"$inner\" = 2; then continue 2; fi; echo \"$outer$inner\"; done; echo unreachable; done)\" = \"$(printf 'a1\\nb1\\n')\" && " +
        "test \"$(for outer in a b; do for inner in 1 2; do echo \"$outer$inner\"; break 2; done; done)\" = a1 && " +
        "! slop -c break",
      )})`,
    ),
    0,
    "Slop local and multi-level break/continue failed",
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        "rm -f /tmp/slop-while-browser /tmp/slop-until-browser && " +
        "DOLLY_COUNT_BROWSER=0 && " +
        "while test \"$DOLLY_COUNT_BROWSER\" != 3; do " +
        "echo \"$DOLLY_COUNT_BROWSER\" >> /tmp/slop-while-browser; " +
        "DOLLY_COUNT_BROWSER=$(expr \"$DOLLY_COUNT_BROWSER\" + 1); done && " +
        "test \"$(cat /tmp/slop-while-browser)\" = \"$(printf '0\\n1\\n2\\n')\" && " +
        "DOLLY_COUNT_BROWSER=0 && " +
        "until test \"$DOLLY_COUNT_BROWSER\" = 2; do " +
        "echo \"$DOLLY_COUNT_BROWSER\" >> /tmp/slop-until-browser; " +
        "DOLLY_COUNT_BROWSER=$(expr \"$DOLLY_COUNT_BROWSER\" + 1); done && " +
        "test \"$(cat /tmp/slop-until-browser)\" = \"$(printf '0\\n1\\n')\"",
      )})`,
    ),
    0,
    "Slop while and until loops failed",
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        "unset DOLLY_CASE_BROWSER; DOLLY_CASE_VALUE=beta; " +
        "case \"$DOLLY_CASE_VALUE\" in alpha) false ;; " +
        "beta|gamma) DOLLY_CASE_BROWSER=matched ;; *) false ;; esac; " +
        "test \"$DOLLY_CASE_BROWSER\" = matched && " +
        "case source.c in *.h) false ;; *.c|*.cc) true ;; *) false ;; esac && " +
        "case outer in outer) case inner.c in *.c) true ;; *) false ;; esac ;; *) false ;; esac",
      )})`,
    ),
    0,
    "Slop wildcard, alternative, and nested case clauses failed",
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        "printf 'case blank in blank) true\\n\\n;; *) false ;; esac\\n' " +
        "> /tmp/slop-blank-case-browser.slop && " +
        "slop /tmp/slop-blank-case-browser.slop",
      )})`,
    ),
    0,
    "Slop confused blank lines with case clause terminators",
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        "printf 'echo operator-continuation |\\n grep -q operator-continuation\\ntrue &&\\n true\\nfalse ||\\n true\\n' " +
        "> /tmp/slop-operator-continuation-browser.slop && " +
        "slop /tmp/slop-operator-continuation-browser.slop",
      )})`,
    ),
    0,
    "Slop did not continue a pipeline after newline",
  );

  assert.equal(
    await evaluate(
      debuggerClient.send,
      'window.__dolly.submit("timeout 0.01 sleep 1")',
    ),
    124,
    "timeout did not terminate a checkpointed command with status 124",
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      'window.__dolly.submit("timeout 0.01 timeout 1 sleep 1")',
    ),
    124,
    "a nested timeout did not inherit the earliest active deadline",
  );

  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        `qjs -e "const r = Dolly.shell('cat', ''); if (r.status !== 0) throw new Error(String(r.status))"`,
      )})`,
    ),
    0,
    "a noninteractive Dolly.shell call did not give a stdin reader immediate EOF",
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        "echo 'int main(void) { for (;;) {} }' > /tmp/dolly-timeout.c && " +
        "cc -O0 /tmp/dolly-timeout.c -o /tmp/dolly-timeout",
      )})`,
    ),
    0,
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        `qjs -e "const r = Dolly.shell('/tmp/dolly-timeout', '', 50); ` +
        `if (r.status !== 124) throw new Error('status ' + r.status)"`,
      )})`,
    ),
    0,
    "the in-Wasm spawn deadline did not terminate a CPU-bound command",
  );

  const descriptorLeakSource = [
    "#define _POSIX_C_SOURCE 200809L",
    "#include <fcntl.h>",
    "#include <stdio.h>",
    "#include <stdlib.h>",
    "#include <string.h>",
    "#include <unistd.h>",
    "int main(int argc, char **argv) {",
    "  if (argc > 1 && strcmp(argv[1], \"probe\") == 0) {",
    "    int descriptor = open(\"/tmp/dolly-fd-probe\", O_WRONLY | O_CREAT | O_TRUNC, 0666);",
    "    return descriptor < 0 || descriptor >= 64;",
    "  }",
    "  if (chdir(\"/tmp\") != 0 || setenv(\"DOLLY_LEAKED\", \"yes\", 1) != 0) return 2;",
    "  for (int index = 0; index < 96; ++index) {",
    "    char path[64];",
    "    snprintf(path, sizeof(path), \"/tmp/dolly-fd-%d\", index);",
    "    if (open(path, O_WRONLY | O_CREAT | O_TRUNC, 0666) < 0) return 3;",
    "  }",
    "  close(STDOUT_FILENO);",
    "  return 0;",
    "}",
    "",
  ].join("\n");
  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        `qjs -e 'Dolly.writeFile("/tmp/dolly-fd-leak.c",` +
        `${JSON.stringify(descriptorLeakSource)})' && ` +
        "cc -O0 /tmp/dolly-fd-leak.c -o /tmp/dolly-fd-leak && " +
        "awk 'BEGIN { for (i = 0; i < 80; ++i) print i }' | " +
        "xargs -n 1 /tmp/dolly-fd-leak && " +
        "/tmp/dolly-fd-leak probe && " +
        "pwd | grep -q '^/workspace$' && test -z \"$DOLLY_LEAKED\" && " +
        "echo descriptor-epoch-ok && rm -f /tmp/dolly-fd-*",
      )})`,
    ),
    0,
    "a descriptor/cwd/environment leak poisoned a following command epoch",
  );

  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        "mkdir -p /tmp/copy-source/nested && " +
        "echo COPY-FILE > /tmp/copy-source/file && " +
        "echo COPY-NESTED > /tmp/copy-source/nested/file && " +
        "cp -R /tmp/copy-source /tmp/copy-target && " +
        "grep -q COPY-FILE /tmp/copy-target/file && " +
        "grep -q COPY-NESTED /tmp/copy-target/nested/file",
      )})`,
    ),
    0,
    "the standalone in-Wasm cp command did not preserve a recursive file tree",
  );

  const installMakefile = [
    "prefix := /usr/local",
    "install:",
    "\tinstall -D -m 755 /tmp/install-make-source $(DESTDIR)$(prefix)/bin/installed",
    "",
  ].join("\n");
  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        `qjs -e 'Dolly.writeFile("/tmp/install.Makefile",${JSON.stringify(installMakefile)})' && ` +
        "printf make-install > /tmp/install-make-source && " +
        "make -f /tmp/install.Makefile install DESTDIR=/tmp/install-stage && " +
        "grep -q '^make-install$' /tmp/install-stage/usr/local/bin/installed",
      )})`,
    ),
    0,
    "GNU Make could not run a conventional install -D -m recipe through Slop",
  );

  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        "echo DOLLY-BROWSER-DOWNLOAD > /workspace/browser-download.txt",
      )})`,
    ),
    0,
  );
  const downloadCountBefore = await evaluate(
    debuggerClient.send,
    "Number(document.documentElement.dataset.downloadCount ?? 0)",
  );
  const downloadStatus = await evaluate(
    debuggerClient.send,
    'window.__dolly.submit("download /workspace/browser-download.txt")',
  );
  if (downloadStatus !== 0) {
    console.error(await visibleTerminalText(debuggerClient.send));
    const failedDownloadScreenshot = await debuggerClient.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
    });
    await writeFile(
      resolve(projectDir, "build/browser-download-failed.png"),
      failedDownloadScreenshot.data,
      "base64",
    );
  }
  assert.equal(downloadStatus, 0);
  await waitForValue(
    debuggerClient.send,
    "Number(document.documentElement.dataset.downloadCount ?? 0)",
    (value) => value === downloadCountBefore + 1,
    "browser download dispatch",
    200,
  );
  let downloadedBytes = null;
  for (let attempt = 0; attempt < 200; attempt++) {
    downloadedBytes = await readFile(
      resolve(browserDownloadDirectory, "browser-download.txt"),
      "utf8",
    ).catch(() => null);
    if (downloadedBytes !== null) break;
    await delay(25);
  }
  assert.equal(downloadedBytes, "DOLLY-BROWSER-DOWNLOAD\n");

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
  const interruptStatusLines = (
    (await visibleTerminalText(debuggerClient.send)).match(/slop: status 130/g) ?? []
  ).length;
  assert.ok(interruptStatusLines > 0,
    "Slop did not report the command that was actually interrupted");
  assert.equal(
    await evaluate(debuggerClient.send, "window.__dolly.submit('')"),
    130,
    "an empty line changed the shell's preserved interrupt status",
  );
  const statusLinesAfterEmptyInput = (
    (await visibleTerminalText(debuggerClient.send)).match(/slop: status 130/g) ?? []
  ).length;
  assert.equal(
    statusLinesAfterEmptyInput,
    interruptStatusLines,
    "an empty line reported the preceding interrupt a second time",
  );
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

  if (selectedImage === "gamedev") {
  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        "test -s /usr/src/dolly/gamedev/graphics-demo.c && " +
        "test -s /usr/src/dolly/gamedev/gamedev.mk && " +
        "test -s /usr/src/dolly/gamedev/box3d-platform.c && " +
        "test -s /usr/src/box3d/include/box3d/box3d.h && " +
        "test -s /usr/lib/libbox3d.a",
      )})`,
    ),
    0,
    "the gamedev image did not retain its source-visible starter",
  );
  const performanceBeforeGraphics = await measureShellBatch(
    debuggerClient.send,
    "before-graphics",
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
  assert.equal(
    await waitForValue(
      debuggerClient.send,
      "document.documentElement.dataset.cursorStyle",
      (value) => value === "crosshair",
      "graphics cursor style",
      200,
    ),
    "crosshair",
  );
  assert.equal(
    await evaluate(debuggerClient.send, "window.__dolly.key('e', 'KeyE')"),
    true,
    "graphics-demo did not accept its Box3D explosion input",
  );
  const graphicsCadence = await evaluate(debuggerClient.send, `(async () => {
    const animationBefore = window.__dolly.transport.currentAnimationFrameSequence();
    const presentedBefore = Number(document.documentElement.dataset.frameSequence ?? 0);
    const started = performance.now();
    await new Promise(resolve => setTimeout(resolve, 750));
    const elapsed = performance.now() - started;
    const animationAfter = window.__dolly.transport.currentAnimationFrameSequence();
    const presentedAfter = Number(document.documentElement.dataset.frameSequence ?? 0);
    return {
      elapsed,
      animationFrames: (animationAfter - animationBefore) >>> 0,
      presentedFrames: (presentedAfter - presentedBefore) >>> 0,
      width: document.querySelector('#display').width,
      height: document.querySelector('#display').height,
    };
  })()`);
  assert.ok(graphicsCadence.width <= 800 && graphicsCadence.height <= 450,
    `software framebuffer was not bounded: ${JSON.stringify(graphicsCadence)}`);
  assert.ok(graphicsCadence.animationFrames >= 3, JSON.stringify(graphicsCadence));
  assert.ok(graphicsCadence.presentedFrames >= 3, JSON.stringify(graphicsCadence));
  assert.ok(
    graphicsCadence.animationFrames <= graphicsCadence.elapsed / 4 + 2,
    `browser frame clock ran implausibly fast: ${JSON.stringify(graphicsCadence)}`,
  );
  assert.ok(
    graphicsCadence.presentedFrames <= graphicsCadence.animationFrames + 2,
    `guest outran the browser frame clock: ${JSON.stringify(graphicsCadence)}`,
  );
  assert.ok(
    graphicsCadence.presentedFrames * 2 >= graphicsCadence.animationFrames,
    `bounded software scene rendered below half the browser cadence: ${JSON.stringify(
      graphicsCadence,
    )}`,
  );
  const graphicsPixels = await waitForValue(
    debuggerClient.send,
    `(() => {
      const canvas = document.querySelector('#display');
      const pixels = canvas.getContext('2d')
        .getImageData(0, 0, canvas.width, canvas.height).data;
      let background = 0;
      let accent = 0;
      let yellow = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        const red = pixels[index];
        const green = pixels[index + 1];
        const blue = pixels[index + 2];
        if (red >= 25 && red <= 70 && Math.abs(red - green) <= 8 &&
            Math.abs(red - blue) <= 8 && pixels[index + 3] === 255) background++;
        if (Math.max(red, green, blue) - Math.min(red, green, blue) > 35 &&
            red + green + blue > 200 && pixels[index + 3] === 255) accent++;
        if (red > 200 && green > 170 && blue < 150 &&
            pixels[index + 3] === 255) yellow++;
      }
      return { background, accent, yellow };
    })()`,
    (value) => value.background > 1000 && value.accent > 100 && value.yellow > 100,
    "graphics-demo RGBA frame",
    200,
  );
  assert.ok(graphicsPixels.background > graphicsPixels.accent);
  const graphicsScreenshot = await debuggerClient.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });
  await writeFile(
    resolve(projectDir, "build/gamedev-frame.png"),
    graphicsScreenshot.data,
    "base64",
  );
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
    await waitForValue(
      debuggerClient.send,
      "document.documentElement.dataset.cursorStyle",
      (value) => value === "text",
      "terminal cursor restoration",
      200,
    ),
    "text",
  );
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
    await waitForValue(
      debuggerClient.send,
      "document.documentElement.dataset.cursorStyle",
      (value) => value === "text",
      "terminal cursor restoration after SIGINT",
      200,
    ),
    "text",
  );
  assert.equal(
    await evaluate(
      debuggerClient.send,
      "window.__dolly.submit('grep -q GRAPHICS-RESTORED graphics-restored.txt')",
    ),
    0,
    "terminal or filesystem did not survive forced graphics restoration",
  );
  const performanceAfterGraphics = await measureShellBatch(
    debuggerClient.send,
    "after-graphics",
  );
  assert.ok(
    performanceAfterGraphics.milliseconds <=
      Math.max(2000, performanceBeforeGraphics.milliseconds * 4),
    `commands slowed down after framebuffer restoration: ${JSON.stringify({
      before: performanceBeforeGraphics,
      after: performanceAfterGraphics,
    })}`,
  );
  assert.ok(
    performanceAfterGraphics.frames <= performanceAfterGraphics.commands * 6,
    `terminal produced too many post-graphics frames: ${JSON.stringify(
      performanceAfterGraphics,
    )}`,
  );
  console.log(
    `browser: graphics cadence ${graphicsCadence.animationFrames} rAF/` +
    `${graphicsCadence.presentedFrames} guest frames in ` +
    `${Math.round(graphicsCadence.elapsed)}ms; post-framebuffer command batch ` +
    `${performanceAfterGraphics.milliseconds}ms/` +
    `${performanceAfterGraphics.frames} frames; before ` +
    `${performanceBeforeGraphics.milliseconds}ms/${performanceBeforeGraphics.frames} frames`,
  );
  }

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
  await evaluate(
    debuggerClient.send,
    "delete document.documentElement.dataset.clipboard",
  );
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
    await waitForValue(
      debuggerClient.send,
      "navigator.clipboard.readText()",
      (value) => value === "COPY-BRIDGE-TEXT",
      "Ctrl+Shift+C system clipboard propagation",
      200,
    ),
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
  assert.deepEqual(curlCliRequest, { header: "yes", body: "one=1&two=2" });
  assert.deepEqual(gitDiscoveryRequest, { method: "GET", protocol: "version=2" });
  assert.equal(piModelRequests.length, 0);
  assert.ok(evidence.bootstrap.split("\n").length <= 40);
  assert.ok(evidence.bootstrap.length <= 8192);
  assert.match(
    evidence.bootstrap,
    new RegExp(`DOLLY / ${selectedImage.toUpperCase()} / PRECOMPILED SYSTEM`),
  );
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
  console.log(
    `browser: sandbox Ghostty rendered ${evidence.canvasWidth}x${evidence.canvasHeight} ` +
    `(${evidence.cols}x${evidence.rows} cells), static snapshot boot ` +
    `${snapshotBootMilliseconds}ms, raw keys/Ctrl+Shift+V/C/block-cursor/zoom/fullscreen, ` +
    "Ghostty selection/scroll, phone menu, default Pi, " +
    "Pi OpenRouter credential storage/model discovery, and complete Codex OAuth exchange passed",
  );
  }
} catch (error) {
  if (debuggerClient) {
    if (piAuditMode) {
      const failedAuditScreenshot = await debuggerClient.send(
        "Page.captureScreenshot",
        { format: "png", fromSurface: true },
      ).catch(() => null);
      if (failedAuditScreenshot) {
        await writeFile(
          resolve(projectDir, "build/pi-agent-audit-failed.png"),
          failedAuditScreenshot.data,
          "base64",
        );
      }
      const failedAuditText = await visibleTerminalText(
        debuggerClient.send,
      ).catch(() => "terminal text unavailable");
      await writeFile(
        resolve(projectDir, "build/pi-agent-audit-failed.txt"),
        `${failedAuditText}\n`,
      );
    }
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
  await rm(browserDownloadDirectory, { recursive: true, force: true });
}
