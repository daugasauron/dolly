#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, resolve, sep } from "node:path";

import {
  discoverImageDefinitions,
  inspectStaticSources,
  selectImageDefinitions,
} from "./image-definitions.mjs";
import { loadDollyfileGraph } from "./dollyfile-graph.mjs";
import { shellCases, sourceFiles, shellQuote } from "../test/fixtures/slop-cases.mjs";
import { decoderCases } from "../test/fixtures/utf8-cases.mjs";

const projectDir = resolve(import.meta.dirname, "..");
const imageDefinitions = selectImageDefinitions(await discoverImageDefinitions(projectDir));
const staticSources = await inspectStaticSources(projectDir, imageDefinitions);
const distDirectory = resolve(projectDir, "dist");
const packagedSite = process.env.DOLLY_BROWSER_SITE
  ? resolve(process.env.DOLLY_BROWSER_SITE) : null;
const chromeBinary = process.argv[2];
if (!chromeBinary) throw new Error("usage: browser-harness.mjs CHROME_BINARY");
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
const cppMode = process.env.DOLLY_BROWSER_MODE === "cpp";
const boundaryMode = process.env.DOLLY_BROWSER_MODE === "boundary";
const processAbiMode = process.env.DOLLY_BROWSER_MODE === "process-abi";
const makeMode = process.env.DOLLY_BROWSER_MODE === "make";
const slopMode = ["slop", "slop-source"].includes(process.env.DOLLY_BROWSER_MODE);
const utf8Mode = process.env.DOLLY_BROWSER_MODE === "utf8";
const piOpenRouterMode = process.env.DOLLY_BROWSER_MODE === "pi-openrouter";
const piAuditMode = process.env.DOLLY_BROWSER_MODE === "pi-audit";
const realOpenRouterMode = piOpenRouterMode || piAuditMode;
const missingSnapshotMode = process.env.DOLLY_BROWSER_MODE === "snapshot-missing";
const snapshotExportMode = process.env.DOLLY_BROWSER_MODE === "snapshot-export";
const pagesIsolationMode = ["pages-isolation", "session-pages"].includes(process.env.DOLLY_BROWSER_MODE);
const pagesLiveMode = process.env.DOLLY_BROWSER_MODE === "pages-live";
const menuMode = process.env.DOLLY_BROWSER_MODE === "menu";
const routeSmokeMode = process.env.DOLLY_BROWSER_MODE === "route-smoke";
const sessionMode = ["session", "session-pages"].includes(process.env.DOLLY_BROWSER_MODE);
const pythonPackageMode = process.env.DOLLY_BROWSER_MODE === "python-packages";
const pythonInteractiveMode = process.env.DOLLY_BROWSER_MODE === "python-interactive";
const toolchainProbeMode = process.env.DOLLY_BROWSER_MODE === "toolchain-probes";
const zigSingleProviderMode = process.env.DOLLY_BROWSER_MODE === "zig-single-provider";
const optimizedLifecycleProbeMode =
  process.env.DOLLY_BROWSER_MODE === "optimized-lifecycle-probe";
const lifecycleProbeMode =
  process.env.DOLLY_BROWSER_MODE === "lifecycle-probe" || optimizedLifecycleProbeMode;
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
const selectedImage = process.env.DOLLY_IMAGE ?? (missingSnapshotMode ? "default" : "pi");
if (!new Set(imageDefinitions.map((definition) => definition.image)).has(selectedImage)) {
  throw new Error("DOLLY_IMAGE must name a source-visible Dollyfile image");
}
const selectedDefinition = imageDefinitions.find(({ image }) => image === selectedImage);
const selectedGraph = await loadDollyfileGraph(projectDir, selectedDefinition.filename);
const selectedModuleNames = new Set(selectedGraph.modules.map(({ name }) => name));
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
  [".dm", "text/plain; charset=utf-8"],
  [".h", "text/plain; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".data", "application/octet-stream"],
  [".snapshot", "application/octet-stream"],
  [".woff2", "font/woff2"],
]);
const publicSources = new Set([
  "test/fixtures/browser-boundary.mjs",
  "test/fixtures/browser-process-abi.mjs",
  "coi-serviceworker.js",
  "index.html",
  ...imageDefinitions.map((definition) => definition.filename),
  "src/browser.mjs",
  "src/dollyfile-view.mjs",
  "src/http-policy.mjs",
  "src/http-broker.mjs",
  "src/kernel-plugin.mjs",
  "src/module-cache.mjs",
  "src/process-ffi.mjs",
  "src/process-abi.mjs",
  "src/wasm-interface.mjs",
  "src/process-supervisor.mjs",
  "src/process-worker.mjs",
  "src/session-store.mjs",
  "src/session-transport.mjs",
  "src/sessions.mjs",
  "src/runtime-worker.mjs",
]);
const sourceArtifacts = new Map(staticSources.map((source) => [
  source.path.slice(1),
  {
    relative: source.path.startsWith("/static/")
      ? `dist/${source.path.slice(1)}`
      : source.path.slice(1),
    source,
  },
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
  ["/session", "build/routes/session/index.html"],
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
      if (utf8Mode && /^\/fixture\/utf8-(?:cases\.mjs|browser\.mjs|writer\.c)$/.test(requestUrl.pathname)) {
        response.writeHead(200, { ...isolatedHeaders, "content-type": "text/plain; charset=utf-8" });
        response.end(await readFile(resolve(projectDir, "test/fixtures", requestUrl.pathname.split("/").at(-1))));
        return;
      }
      if (utf8Mode && requestUrl.pathname === "/fixture/utf8-reference") {
        response.writeHead(200, { ...isolatedHeaders, "content-type": "application/json" });
        response.end(JSON.stringify(decoderCases(TextDecoder)));
        return;
      }
      if (utf8Mode && requestUrl.pathname === "/fixture/utf8-stream") {
        response.writeHead(200, {
          ...isolatedHeaders,
          "content-type": "text/plain; charset=utf-8",
          "x-content-type-options": "nosniff",
        });
        response.flushHeaders();
        for (const byte of [...Buffer.from("日本語😀"), 0xe3]) {
          response.write(Buffer.from([byte]));
          await delay(50);
        }
        response.end();
        return;
      }
      if (slopMode && requestUrl.pathname === "/fixture/slop.c") {
        response.writeHead(200, { ...isolatedHeaders, "content-type": "text/plain" });
        response.end(await readFile(resolve(projectDir, "src/slop.c")));
        return;
      }
      if (processAbiMode && /^\/fixture\/(?:process-(?:minimal|no-dso|wrong-call|wrong-start|wrong-memory|dso-host|dso-bad-host)|dso-(?:types|local|start|small-(?:memory|table)|wrong-(?:self|provider|stack|table|memory|base|tag|got|symbol-kind|data|hook)))\.wasm$/.test(requestUrl.pathname)) {
        const name = requestUrl.pathname.split("/").at(-1);
        response.writeHead(200, { ...isolatedHeaders, "content-type": "application/wasm" });
        response.end(await readFile(resolve(projectDir, "build", name)));
        return;
      }
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
        const nextTool = wantsInstalledProbe
          ? toolResultCount === 0 ? {
              name: "dolly_installed_probe",
              arguments: "{}",
            } : null
          : toolResultCount === 0 ? {
              name: "write",
              arguments: JSON.stringify({
                path: "/workspace/pi-http-test.txt",
                content: "pi crossed Dolly's HTTP broker\n日本語😀\n",
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
                      : "日本語😀 DOLLY-PI-HTTP-",
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
        response.flushHeaders();
        piFixtureStream.request = responseOrdinal;
        piFixtureStream.phase = "waiting";
        // Hold the request open long enough for the TUI's timer-driven
        // thinking indicator to advance while no model bytes are available.
        await delay(750);
        for (let index = 0; index < events.length; index++) {
          const bytes = Buffer.from(`data: ${JSON.stringify(events[index])}\n\n`);
          let start = 0;
          // Split Unicode scalars on the wire, not just between SSE events.
          for (let offset = 0; offset < bytes.length; offset++) if (bytes[offset] >= 0x80) {
            response.write(bytes.subarray(start, offset + 1));
            start = offset + 1;
            await delay(25);
          }
          response.write(bytes.subarray(start));
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
      const sessionRoute = /^\/session\/[A-Za-z0-9._-]{1,64}$/.test(route);
      const relative = route === "/"
        ? "index.html"
        : sessionRoute ? "build/routes/session/open.html"
        : routeDocuments.get(route) ?? sourceArtifacts.get(requested)?.relative ?? requested;
      const path = resolve(projectDir, relative);
      const distAsset = relative.startsWith("dist/") &&
        path.startsWith(`${distDirectory}${sep}`);
      if ((request.method !== "GET" && request.method !== "HEAD") ||
          (!publicSources.has(relative) && !routeDocuments.has(route) && !sessionRoute &&
           !sourceArtifacts.has(requested) &&
           !relative.startsWith("docs/") && !distAsset)) {
        response.writeHead(404, isolatedHeaders).end("not found");
        return;
      }
      const packagedRelative = route === "/" ? "index.html"
        : sessionRoute ? (requested === "session/open.html" ? "session/open.html" : "404.html")
        : routeDocuments.has(route) ? `${requested}/index.html` : requested;
      const servedPath = packagedSite ? resolve(packagedSite, packagedRelative) : path;
      if (packagedSite && !servedPath.startsWith(`${packagedSite}${sep}`)) {
        response.writeHead(404, isolatedHeaders).end("not found");
        return;
      }
      const body = await readFile(servedPath);
      staticRequestPaths.add(requestUrl.pathname);
      const source = sourceArtifacts.get(requested)?.source;
      response.writeHead(packagedSite && sessionRoute && requested !== "session/open.html" ? 404 : 200, {
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
  const entryPid = await waitForValue(
    send,
    `(() => {
      const pid = window.__dolly?.foregroundPid ?? 0;
      return pid === Number(document.documentElement.dataset.entryPid) ? pid : 0;
    })()`,
    (value) => value > 0,
    "image entry foreground process",
    600,
  );
  await delay(500);
  if (selectedImage === "gamedev") {
    await waitForValue(
      send,
      "window.__dolly?.graphicsActive ?? false",
      (value) => value === true,
      "gamedev entry display lease",
      200,
    );
    assert.equal(
      await evaluate(send, "window.__dolly.key('q', 'KeyQ')"),
      true,
    );
  } else {
    await dispatchKey(send, {
      key: "d",
      code: "KeyD",
      modifiers: 2,
      windowsVirtualKeyCode: 68,
    });
  }
  return waitForValue(
    send,
    `(() => {
      const transport = window.__dolly?.transport;
      if (!transport) return 0;
      const pid = transport.foregroundPid();
      return pid > 0 && pid !== ${entryPid} &&
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
  const milliseconds = Date.now() - started;
  const scratch = Array.from(
    { length: count },
    (_, index) => `/tmp/dolly-${label}-${index}.txt`,
  );
  assert.equal(
    await evaluate(
      send,
      `window.__dolly.submit(${JSON.stringify(`rm -f ${scratch.join(" ")}`)})`,
    ),
    0,
  );
  return {
    milliseconds,
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

async function waitForTerminalText(send, pattern, description, attempts = 300) {
  let lastText = "";
  for (let attempt = 0; attempt < attempts; attempt++) {
    lastText = await visibleTerminalText(send);
    if (pattern.test(lastText)) return lastText;
    await delay(50);
  }
  throw new Error(
    `timed out waiting for terminal text: ${description}\n` +
    `last visible terminal text:\n${lastText}`,
  );
}

async function currentFrameSequence(send) {
  return Number(await evaluate(
    send,
    "document.documentElement.dataset.frameSequence ?? '0'",
  )) >>> 0;
}

async function waitForFrameAfter(send, before, description, attempts = 600) {
  return waitForValue(
    send,
    "Number(document.documentElement.dataset.frameSequence ?? '0') >>> 0",
    (value) => Number.isInteger(value) && ((value - before) >>> 0) > 0,
    description,
    attempts,
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
let browserDownloadDirectory = null;
let chrome = null;
let debuggerClient;
let ephemeralProfileRoot = null;
let persistentProfile = null;
let userDataDir = null;
try {
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
persistentProfile = requestedProfile;
browserDownloadDirectory = await mkdtemp(`${tmpdir()}/dolly-browser-downloads-`);
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
chrome = spawn(chromeBinary, [
  "--headless=new",
  "--no-sandbox",
  "--disable-gpu",
  "--remote-debugging-port=0",
  `--user-data-dir=${userDataDir}`,
  "--window-size=1280,800",
  "about:blank",
], { stdio: "ignore" });

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
      : piDevelopmentMode || cppMode || makeMode || slopMode || utf8Mode || realOpenRouterMode || missingSnapshotMode
        || pagesIsolationMode || pagesLiveMode || routeSmokeMode || sessionMode
        || pythonPackageMode || pythonInteractiveMode || toolchainProbeMode || zigSingleProviderMode
        || lifecycleProbeMode || boundaryMode || processAbiMode
        ? interactivePage
        : snapshotPage,
  });

  browserProof: {
    if (utf8Mode) {
      assert.equal(await waitForValue(debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        value => value === "ready" || value === "failed", "UTF-8 regression boot", 1200), "ready");
      await enterRecoveryShell(debuggerClient.send);
      const submit = command => evaluate(debuggerClient.send, `window.__dolly.submit(${JSON.stringify(command)})`);
      const scratch = "/tmp/dolly-utf8-regression";
      assert.equal(await submit(`mkdir ${scratch}`), 0);
      try {
        for (const name of ["cases.mjs", "browser.mjs", "writer.c"]) {
          assert.equal(await submit(`curl -fsS ${localOrigin}/fixture/utf8-${name} -o ${scratch}/utf8-${name}`), 0);
        }
        assert.equal(await submit(`cd ${scratch} && cc utf8-writer.c -o writer`), 0);
        assert.equal(await submit(`janis -m utf8-browser.mjs ${localOrigin}`), 0, "UTF-8 decoder, HTTP, Node, and Pi regressions");
        assert.equal(await submit(`./writer stdin | janis -m utf8-browser.mjs stdin`), 0, "UTF-8 stdin boundary and EOF");
      } finally {
        await submit(`cd /workspace; rm -rf ${scratch}`);
      }
      console.log("browser: UTF-8 split/malformed/BOM/flush cases, HTTP, encoded stdin/children, Pi interleaved pipes and raw binary writes passed");
      break browserProof;
    }
    if (slopMode) {
      assert.equal(await waitForValue(debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        value => value === "ready" || value === "failed", "Slop regression boot", 1200), "ready");
      await enterRecoveryShell(debuggerClient.send);
      const submit = command => evaluate(debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(command)})`);
      const scratch = "/tmp/dolly-slop-regression";
      const writeScript = async (name, source) => {
        const escaped = source.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll("\t", "\\t");
        assert.equal(await submit(`printf %b ${shellQuote(escaped)} > ${scratch}/${name}`), 0);
      };
      assert.equal(await submit(`mkdir ${scratch}`), 0);
      try {
        const executable = "/bin/slop";
        if (process.env.DOLLY_BROWSER_MODE === "slop-source") {
          assert.equal(await submit(`curl -fsS ${localOrigin}/fixture/slop.c -o ${scratch}/slop.c`), 0);
          assert.equal(await submit(`cc ${scratch}/slop.c -o ${scratch}/slop`), 0);
          assert.equal(await submit(`cp ${scratch}/slop ${executable}`), 0);
        }
        for (const [name, source] of Object.entries(sourceFiles)) {
          await writeScript(name, source);
        }
        const failures = [];
        for (const [name, source, expected] of shellCases) {
          await writeScript("fixture-zero", source);
          const actual = await submit(`cd ${scratch}; ${executable} fixture-zero`);
          if (actual !== expected) failures.push({ name, expected, actual });
        }
        assert.deepEqual(failures, []);
        const make = `make -C ${scratch} SHELL=${executable} '.SHELLFLAGS=-e -c'`;
        assert.equal(await submit(`${make} all`), 0, "Make sourcing and .SHELLSTATUS");
        assert.equal(await submit(`${make} fail`), 2, "Make must fail after assignment substitution exits 7");
        assert.equal(await submit(`grep -q SLOP-MAKE-OK ${scratch}/make-success && test ! -e ${scratch}/make-failed`), 0);
        assert.equal(await submit(`${executable} -c 'exit 173'`), 173);
        assert.equal(await submit(""), 173);
        assert.equal(await submit("  # no command"), 173);
        const afterBlank = await visibleTerminalText(debuggerClient.send);
        assert.equal((afterBlank.match(/slop: status 173/g) ?? []).length, 1,
          "blank input must not repeat the error");
        assert.equal(await submit("test $? -eq 173"), 0);
      } finally {
        await submit(`cd /workspace; rm -rf ${scratch}`);
      }
      console.log(`browser: ${shellCases.length} Slop sourcing/argument/status regressions and GNU Make failure propagation passed`);
      break browserProof;
    }
    if (processAbiMode) {
      assert.equal(await waitForValue(debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        value => value === "ready" || value === "failed", "process ABI boot", 1200), "ready");
      const result = await evaluate(debuggerClient.send,
        `import(${JSON.stringify(`${localOrigin}${browserBase}test/fixtures/browser-process-abi.mjs`)})` +
        ".then(module => module.runProcessAbiChecks())");
      assert.equal(result.rejected, 5);
      assert.equal(result.optionalFacilities, "ENOSYS");
      assert.deepEqual(result.dso, { rejected: 14, loaded: 3 });
      await enterRecoveryShell(debuggerClient.send);
      const submit = command => evaluate(debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(command)})`);
      assert.equal(await submit("mkdir /tmp/process-abi"), 0);
      try {
        for (const name of ["minimal", "wrong-call", "wrong-start", "wrong-memory"]) {
          assert.equal(await submit(`curl -fsS ${localOrigin}/fixture/process-${name}.wasm -o /tmp/process-abi/${name}`), 0);
          assert.equal(await submit(`/tmp/process-abi/${name} > /tmp/process-abi/output`), name === "minimal" ? 0 : 126);
          if (name === "minimal") {
            assert.equal(await submit("grep -q PROCESS-FREESTANDING-OK /tmp/process-abi/output"), 0);
          }
        }
        const constants = Object.entries(result.errno).map(([name, value]) =>
          `if (${name} != ${value}) return 1;`).join("\n");
        const source = `#define _POSIX_C_SOURCE 200809L
#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <time.h>
#include <dolly/process.h>
#include <dolly/runtime.h>
int main(int argc, char **argv) {
  ${constants}
  dolly_process_dso_close_request close_request = {123456};
  dolly_process_dso_response response;
  if (dolly_process_call(DOLLY_PROCESS_DSO_CLOSE, &close_request, sizeof(close_request), &response, sizeof(response)) != sizeof(response) || response.error != EBADF) return 2;
  if (dolly_process_call(DOLLY_PROCESS_DSO_CLOSE, &close_request, sizeof(close_request), &response, 1) != -ENOBUFS) return 3;
  if (dolly_process_call(DOLLY_PROCESS_FFI_CALL, NULL, 0, NULL, 0) != -EINVAL) return 4;
  if (argc == 1) return 0;
  struct timespec now;
  if (clock_gettime(CLOCK_MONOTONIC, &now)) return 5;
  dolly_process_clock_sleep_request request = {1, 0, (uint64_t)now.tv_sec * 1000000000 + now.tv_nsec + 60000000000};
  int64_t interrupted = dolly_process_call(DOLLY_PROCESS_CLOCK_SLEEP, &request, sizeof(request), NULL, 0);
  dolly_interrupt_poll();
  FILE *file = fopen("/tmp/process-abi/interrupt-result", "w");
  if (!file) return 6;
  fprintf(file, "%s\\n", interrupted == -EINTR ? "EINTR-OK" : "WRONG-ERRNO");
  fclose(file);
  return interrupted == -EINTR ? 0 : 7;
}
`;
        const sourceFormat = source.replaceAll("\\", "\\\\").replaceAll("\n", "\\n")
          .replaceAll("%", "%%").replaceAll("'", "'\\''");
        assert.equal(await submit(`printf '${sourceFormat}' > /tmp/process-abi/errors.c`), 0);
        assert.equal(await submit("cc -O0 -fno-sanitize-coverage /tmp/process-abi/errors.c -o /tmp/process-abi/errors"), 0);
        assert.equal(await submit("/tmp/process-abi/errors"), 0);
        await evaluate(debuggerClient.send, `window.__processErrnoResult = null;
          window.__dolly.submit('/tmp/process-abi/errors cancel').then(
            status => { window.__processErrnoResult = { status }; },
            error => { window.__processErrnoResult = { error: String(error) }; }); true`);
        await waitForValue(debuggerClient.send, "window.__dolly.transport.foregroundInterruptible()",
          value => value === true, "errno probe foreground ownership", 200);
        await delay(200);
        await dispatchKey(debuggerClient.send, { key: "c", code: "KeyC", modifiers: 2, windowsVirtualKeyCode: 67 });
        const interrupted = await waitForValue(debuggerClient.send, "window.__processErrnoResult",
          value => value !== null, "errno probe cancellation", 200);
        assert.equal(interrupted.error, undefined);
        assert.equal(await submit("grep -q EINTR-OK /tmp/process-abi/interrupt-result"), 0);
      } finally { await submit("rm -rf /tmp/process-abi"); }
      console.log("browser: freestanding WAT ran through Slop; wrong executable/DSO types rejected before allocation; local/GOT linking passed; optional DSO/FFI returned ENOSYS; C/JS errno and interrupted syscall round trips passed");
      break browserProof;
    }
    if (boundaryMode) {
      const state = await waitForValue(debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        value => value === "ready" || value === "failed", "boundary snapshot boot", 1200);
      assert.equal(state, "ready");
      const fixture = `${localOrigin}${browserBase}test/fixtures/browser-boundary.mjs`;
      const result = await evaluate(debuggerClient.send,
        `import(${JSON.stringify(fixture)}).then(module => module.runBrowserBoundaryChecks())`);
      assert.equal(result.imports, 28);
      assert.equal(result.pluginRejections, 3);
      assert.equal(result.policyDeniedBeforeFetch, true);
      assert.equal(result.nonConsumingDeadline, true);
      await enterRecoveryShell(debuggerClient.send);
      for (const command of [
        `if curl -fsS ${localOrigin}/not-allowed; then false; else true; fi`,
        `curl -fsS ${localOrigin}/fixture/http.txt > /tmp/boundary-http.txt`,
        "grep -q FETCHED-THROUGH-BROWSER /tmp/boundary-http.txt",
        "rm -f /tmp/boundary-http.txt",
      ]) {
        assert.equal(await evaluate(debuggerClient.send,
          `window.__dolly.submit(${JSON.stringify(command)})`), 0, command);
      }
      console.log(`browser: boundary checks passed ${JSON.stringify(result)}; rejected and allowed curl requests completed`);
      break browserProof;
    }
    if (pythonInteractiveMode) {
      const state = await waitForValue(
        debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        (value) => value === "ready" || value === "failed",
        "interactive Python image boot",
        1200,
      );
      assert.equal(state, "ready");
      if (selectedGraph.root.entry[0] === "/bin/slop") {
        await waitForValue(
          debuggerClient.send,
          `(() => {
            const transport = window.__dolly?.transport;
            return transport && transport.foregroundPid() > 0 &&
              !transport.foregroundInterruptible() && transport.inputIdle();
          })()`,
          (value) => value === true,
          "Python image Slop prompt",
          600,
        );
      } else {
        await enterRecoveryShell(debuggerClient.send);
      }

      await evaluate(debuggerClient.send, `(() => {
        window.__dollyPythonReplOutcome = null;
        window.__dolly.submit("python").then(
          (status) => { window.__dollyPythonReplOutcome = { status }; },
          (error) => { window.__dollyPythonReplOutcome = { error: String(error) }; },
        );
        return true;
      })()`);
      await waitForValue(
        debuggerClient.send,
        `window.__dolly.transport.foregroundInterruptible() &&
          window.__dolly.transport.inputIdle()`,
        (value) => value === true,
        "interactive Python command consumption",
        200,
      );
      const pythonStartFrame = await currentFrameSequence(debuggerClient.send);
      await waitForFrameAfter(
        debuggerClient.send, pythonStartFrame,
        "Python startup output publication", 2400,
      );
      let terminal = await waitForTerminalText(
        debuggerClient.send, />>>/, "the first Python prompt", 600,
      );
      assert.doesNotMatch(terminal, /Function not implemented|Traceback/);
      assert.doesNotMatch(terminal, /Could not find platform dependent libraries/);
      if (/dolly: preparing [0-9.]+ MiB WebAssembly executable/.test(terminal)) {
        assert.match(terminal, /dolly: executable ready in [0-9.]+s/);
      }
      await inputText(debuggerClient.send, 'print("PYTHON-REPL-LIVE")\r');
      terminal = await waitForTerminalText(
        debuggerClient.send, /PYTHON-REPL-LIVE/, "interactive Python evaluation",
      );
      assert.doesNotMatch(terminal, /Function not implemented|Traceback/);
      assert.equal(
        await evaluate(debuggerClient.send, "window.__dollyPythonReplOutcome"),
        null,
        "Python exited instead of remaining at its next prompt",
      );
      await inputText(debuggerClient.send, "\x04");
      assert.deepEqual(
        await waitForValue(
          debuggerClient.send,
          "window.__dollyPythonReplOutcome",
          (value) => value !== null,
          "interactive Python EOF",
          300,
        ),
        { status: 0 },
      );

      await evaluate(debuggerClient.send, `(() => {
        window.__dollyPythonStreamOutcome = null;
        window.__dolly.submit(${JSON.stringify(
          "python -c 'import sys,time; " +
          "time.sleep(1); print(\"PYTHON-STREAM-\" + \"ONE\", flush=True); " +
          "time.sleep(2); print(\"PYTHON-STREAM-\" + \"TWO\", flush=True)'",
        )}).then(
          (status) => { window.__dollyPythonStreamOutcome = { status }; },
          (error) => { window.__dollyPythonStreamOutcome = { error: String(error) }; },
        );
        return true;
      })()`);
      await waitForValue(
        debuggerClient.send,
        `window.__dolly.transport.foregroundInterruptible() &&
          window.__dolly.transport.inputIdle()`,
        (value) => value === true,
        "streaming Python command consumption",
        200,
      );
      // Let the command echo's dirty frame publish during the program's
      // deliberate initial sleep, then establish a baseline that only program
      // output can advance.
      await delay(200);
      const streamStartFrame = await currentFrameSequence(debuggerClient.send);
      await waitForFrameAfter(
        debuggerClient.send, streamStartFrame,
        "Python's first rendered output before process completion",
      );
      assert.equal(
        await evaluate(debuggerClient.send, "window.__dollyPythonStreamOutcome"),
        null,
        "Python output appeared only after process completion",
      );
      assert.deepEqual(
        await waitForValue(
          debuggerClient.send,
          "window.__dollyPythonStreamOutcome",
          (value) => value !== null,
          "Python streaming process completion",
          300,
        ),
        { status: 0 },
      );
      terminal = await waitForTerminalText(
        debuggerClient.send, /PYTHON-STREAM-TWO/, "Python's complete streamed output",
      );
      assert.match(terminal, /PYTHON-STREAM-ONE[\s\S]*PYTHON-STREAM-TWO/);
      assert.equal(await evaluate(debuggerClient.send, `window.__dolly.submit(${JSON.stringify(
        "python -c 'import ctypes; libc = ctypes.CDLL(None); " +
        "libc.strlen.argtypes = [ctypes.c_char_p]; libc.strlen.restype = ctypes.c_size_t; " +
        "assert libc.strlen(b\"dolly\") == 5; " +
        "callback = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.c_int)(lambda value: value + 1); " +
        "assert callback(41) == 42'",
      )})`), 0, "Python process-local DSO lookup, FFI call, and closure");
      console.log("browser: interactive Python, pre-exit output streaming, ctypes calls and callbacks passed");
      break browserProof;
    }
    if (lifecycleProbeMode) {
      const state = await waitForValue(
        debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        (value) => value === "ready" || value === "failed",
        "command lifecycle probe image boot",
        1200,
      );
      assert.equal(state, "ready");
      await enterRecoveryShell(debuggerClient.send);
      const optimization = optimizedLifecycleProbeMode ? "-O2" : "-O0";
      const libcurlBody =
        "int main(void) { CURL *curl = curl_easy_init(); " +
        "struct curl_slist *headers = 0; " +
        "headers = curl_slist_append(headers, \"X-Dolly-Test: yes\"); " +
        `curl_easy_setopt(curl, CURLOPT_URL, \"${localOrigin}/fixture/libcurl-post\"); ` +
        "curl_easy_setopt(curl, CURLOPT_POSTFIELDS, \"payload\"); " +
        "curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE, 7L); " +
        "curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers); " +
        "CURLcode result = curl_easy_perform(curl); " +
        "curl_slist_free_all(headers); curl_easy_cleanup(curl); return result; }";
      const libcurlSource =
        `awk 'BEGIN { print \"#include <curl/curl.h>\"; print \"${
          libcurlBody.replaceAll("\\", "\\\\").replaceAll('"', '\\"')
        }\" }' > /tmp/dolly-lifecycle-curl.c`;
      const commands = [
        libcurlSource,
        `cc ${optimization} /tmp/dolly-lifecycle-curl.c -lcurl -o /tmp/dolly-lifecycle-curl`,
        "echo 'int baseline(void) { return 1; }' > /tmp/dolly-lifecycle-before.c",
        `cc ${optimization} -c /tmp/dolly-lifecycle-before.c -o /tmp/dolly-lifecycle-before.o`,
        "echo 'int middle(void) { return 2; }' > /tmp/dolly-lifecycle-middle.c",
        `cc ${optimization} -c /tmp/dolly-lifecycle-middle.c -o /tmp/dolly-lifecycle-middle.o`,
        "/tmp/dolly-lifecycle-curl",
        "echo 'int after(void) { return 3; }' > /tmp/dolly-lifecycle-after.c",
        `cc ${optimization} -c /tmp/dolly-lifecycle-after.c -o /tmp/dolly-lifecycle-after.o`,
      ];
      for (const [index, command] of commands.entries()) {
        await evaluate(debuggerClient.send, `(() => {
          window.__dollyLifecycleProbe = null;
          window.__dolly.submit(${JSON.stringify(command)}).then(
            (status) => { window.__dollyLifecycleProbe = { status }; },
            (error) => { window.__dollyLifecycleProbe = { error: String(error) }; },
          );
          return true;
        })()`);
        const outcome = await waitForValue(
          debuggerClient.send,
          "window.__dollyLifecycleProbe",
          (value) => value !== null,
          `lifecycle command ${index + 1}: ${command}`,
          600,
        );
        assert.deepEqual(outcome, { status: 0 }, command);
      }
      assert.deepEqual(libcurlPostRequest, { header: "yes", body: "payload" });
      console.log(
        `browser: compiler ${optimization} lifecycle survived repeated ` +
          "compile/link, libcurl execution, and subsequent code generation",
      );
      break browserProof;
    }
    if (makeMode) {
      const state = await waitForValue(
        debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        (value) => value === "ready" || value === "failed",
        "GNU Make SDK snapshot boot",
        1200,
      );
      assert.equal(state, "ready");
      await enterRecoveryShell(debuggerClient.send);
      const makefile =
        `awk 'BEGIN { print "WHERE := $(shell pwd)"; print "all: make-demo"; ` +
        `print "make-demo: make-main.o make-value.o"; ` +
        `print "\\t$(CC) make-main.o make-value.o -o $@"; ` +
        `print "make-main.o: make-main.c"; print "\\t$(CC) -O0 -std=c17 -c $< -o $@"; ` +
        `print "make-value.o: make-value.c"; print "\\t$(CC) -O0 -std=c17 -c $< -o $@"; ` +
        `print "report:"; print "\\t@echo MAKE-SHELL=$(SHELL)"; ` +
        `print "\\t@echo MAKE-WHERE=$(WHERE)" }' > /tmp/dolly-make/Makefile`;
      for (const [index, command] of [
        "rm -rf /tmp/dolly-make && mkdir -p /tmp/dolly-make",
        "echo 'int value(void) { return 42; }' > /tmp/dolly-make/make-value.c",
        "echo 'int value(void); int main(void) { return value() == 42 ? 0 : 1; }' > /tmp/dolly-make/make-main.c",
        makefile,
        "make -C /tmp/dolly-make -j8 report",
        "make -C /tmp/dolly-make -j8",
        "/tmp/dolly-make/make-demo",
        "make -C /tmp/dolly-make -q",
        "rm -rf /tmp/dolly-make",
      ].entries()) {
        await evaluate(debuggerClient.send, `(() => {
          window.__dollyMakeProbe = null;
          window.__dolly.submit(${JSON.stringify(command)}).then(
            (status) => { window.__dollyMakeProbe = { status }; },
            (error) => { window.__dollyMakeProbe = { error: String(error) }; },
          );
          return true;
        })()`);
        const outcome = await waitForValue(
          debuggerClient.send,
          "window.__dollyMakeProbe",
          (value) => value !== null,
          `GNU Make command ${index + 1}: ${command}`,
          600,
        );
        assert.deepEqual(outcome, { status: 0 }, command);
      }
      console.log("browser: GNU Make used Slop to compile, link, and run a two-file C program");
      break browserProof;
    }
    if (zigSingleProviderMode) {
      const state = await waitForValue(
        debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        (value) => value === "ready" || value === "failed",
        "single-provider Zig image boot",
        1200,
      );
      assert.equal(state, "ready");
      await enterRecoveryShell(debuggerClient.send);
      const commands = [
        "zig version",
        "echo 'export fn browser_zig_answer() callconv(.c) u32 { return 42; }' > /tmp/dolly-zig-single.zig",
        "zig build-obj -OReleaseSmall -target wasm64-emscripten " +
          "-mcpu=generic+atomics -fPIC -fsingle-threaded -fcompiler-rt -lc " +
          "--name dolly-zig-single -femit-bin=/tmp/dolly-zig-single.o " +
          "-Mroot=/tmp/dolly-zig-single.zig",
        "test -s /tmp/dolly-zig-single.o",
        "rm -f /tmp/dolly-zig-single.zig /tmp/dolly-zig-single.o",
      ];
      for (const command of commands) {
        assert.equal(await evaluate(
          debuggerClient.send,
          `window.__dolly.submit(${JSON.stringify(command)})`,
        ), 0, command);
      }
      console.log("browser: native Zig single-provider code generation passed");
      break browserProof;
    }
    if (toolchainProbeMode) {
      const state = await waitForValue(
        debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        (value) => value === "ready" || value === "failed",
        "toolchain probe image boot",
        1200,
      );
      assert.equal(state, "ready");
      await enterRecoveryShell(debuggerClient.send);
      assert.equal(await evaluate(
        debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(
          "echo '#error deliberate compiler failure' > /tmp/dolly-bad-probe.cpp && " +
          "c++ -c /tmp/dolly-bad-probe.cpp -o /tmp/dolly-bad-probe.o",
        )})`,
      ), 1, "a rejected compiler probe did not return an ordinary failure");
      const toolchainCommands = [
        "rm -f /tmp/dolly-bad-probe.cpp /tmp/dolly-bad-probe.o " +
          "/tmp/dolly-bad-link.cpp /tmp/dolly-bad-link " +
          "/tmp/dolly-meson-sanity.cpp /tmp/dolly-meson-sanity " +
          "/tmp/dolly-meson-extension.c /tmp/dolly-meson-extension.so " +
          "/tmp/dolly-preprocess.cpp /tmp/dolly-preprocess.txt " +
          "/tmp/dolly-cxx-macros.txt /tmp/dolly-zig-probe.zig " +
          "/tmp/dolly-zig-probe.o",
        "echo 'int main(int argc, char **argv) { return argc == 0; }' > /tmp/dolly-meson-sanity.cpp",
        "c++ --version",
        "cc --print-search-dirs | grep '^libraries: =/usr/lib:/usr/lib/dolly/process$'",
        "c++ -x c++ -E -dM - < /dev/null > /tmp/dolly-cxx-macros.txt",
        "echo '#include <stddef.h>' > /tmp/dolly-preprocess.cpp",
        "c++ -xc++ -E -P -fpermissive /tmp/dolly-preprocess.cpp > /tmp/dolly-preprocess.txt",
        "test -s /tmp/dolly-preprocess.txt",
        "c++ -xc++ -E -v - < /dev/null > /dev/null",
        "c++ -Wl,--version",
        "c++ -Wl,-v",
        "c++ -D_FILE_OFFSET_BITS=64 -o /tmp/dolly-meson-sanity /tmp/dolly-meson-sanity.cpp -D_FILE_OFFSET_BITS=64",
        "/tmp/dolly-meson-sanity",
        "echo 'extern int dolly_extension_host(void); int dolly_extension(void) { return dolly_extension_host(); }' > /tmp/dolly-meson-extension.c",
        "cc -shared -fPIC -Wl,--allow-shlib-undefined /tmp/dolly-meson-extension.c -o /tmp/dolly-meson-extension.so",
        "test -s /tmp/dolly-meson-extension.so",
        ...(selectedModuleNames.has("zig") ? [
          "echo 'export fn dolly_zig_probe() callconv(.c) u32 { return 42; }' > /tmp/dolly-zig-probe.zig",
          "zig build-obj -OReleaseSmall -target wasm64-emscripten " +
            "-mcpu=generic+atomics -fPIC -fsingle-threaded -fcompiler-rt -lc " +
            "--name dolly-zig-probe -femit-bin=/tmp/dolly-zig-probe.o " +
            "-Mroot=/tmp/dolly-zig-probe.zig",
          "echo 'int main(void) { return 0; }' > /tmp/dolly-after-zig.c",
          "cc -O2 /tmp/dolly-after-zig.c -o /tmp/dolly-after-zig",
          "/tmp/dolly-after-zig",
        ] : []),
        "rm -f /tmp/dolly-meson-sanity.cpp /tmp/dolly-meson-sanity " +
          "/tmp/dolly-meson-extension.c /tmp/dolly-meson-extension.so " +
          "/tmp/dolly-cxx-macros.txt /tmp/dolly-zig-probe.zig " +
          "/tmp/dolly-preprocess.cpp /tmp/dolly-preprocess.txt " +
          "/tmp/dolly-zig-probe.o /tmp/dolly-after-zig.c /tmp/dolly-after-zig",
      ];
      for (const command of toolchainCommands) {
        assert.equal(await evaluate(
          debuggerClient.send,
          `window.__dolly.submit(${JSON.stringify(command)})`,
        ), 0, command);
      }
      console.log(
        "browser: rejected compile probe recovered; repeated Meson-style " +
          "C++ detection, compile, link, and run passed" +
          (selectedModuleNames.has("zig") ? "; Clang also survived Zig codegen" : ""),
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
      assert.equal(await evaluate(
        debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(
          "python -c 'import importlib.util; " +
          "assert importlib.util.find_spec(\"numpy\") is None; " +
          "assert importlib.util.find_spec(\"pandas\") is None; " +
          "assert importlib.util.find_spec(\"mesonbuild\") is None'",
        )})`,
      ), 0, "the scientific-package proof did not start from a clean image");
      await evaluate(debuggerClient.send, `(() => {
        window.__dollyPythonPackageOutcome = null;
        window.__dolly.submit(${JSON.stringify(
          "MESON_FORCE_SHOW_LOGS=1 DOLLY_CC_TRACE=1 bonnie install pandas",
        )}).then(
          (status) => { window.__dollyPythonPackageOutcome = { status }; },
          (error) => {
            window.__dollyPythonPackageOutcome = { error: String(error) };
          },
        );
        return true;
      })()`);
      await waitForValue(
        debuggerClient.send,
        `window.__dolly.transport.foregroundInterruptible() &&
          window.__dolly.transport.inputIdle()`,
        (value) => value === true,
        "Bonnie command consumption",
        200,
      );
      let previousFrame = await currentFrameSequence(debuggerClient.send);
      let liveFrameUpdates = 0;
      let pandasOutcome = null;
      for (let attempt = 0; attempt < 18_000; ++attempt) {
        pandasOutcome = await evaluate(
          debuggerClient.send,
          "window.__dollyPythonPackageOutcome",
        );
        if (pandasOutcome !== null) break;
        const frame = await currentFrameSequence(debuggerClient.send);
        if (frame !== previousFrame) {
          liveFrameUpdates++;
          previousFrame = frame;
          if (liveFrameUpdates <= 10 || liveFrameUpdates % 100 === 0) {
            console.log(`browser: Python package build rendered frame ${frame}`);
          }
        }
        await delay(100);
      }
      if (pandasOutcome?.status !== 0) {
        console.error(await visibleTerminalText(debuggerClient.send));
      }
      assert.deepEqual(pandasOutcome, { status: 0 },
        "Bonnie could not resolve and source-build Pandas's complete dependency graph");
      assert.ok(liveFrameUpdates >= 3,
        `Bonnie rendered only ${liveFrameUpdates} progress frames before completion`);
      const bonnieTerminal = await visibleTerminalText(debuggerClient.send);
      // The build emits more than a thousand lines, so early resolver and
      // source-selection messages are correctly in Ghostty scrollback rather
      // than the final viewport.  Assert the final source-build and atomic
      // publication evidence here; the clean-image/import probes below prove
      // the complete resolved graph.
      assert.match(bonnieTerminal, /Successfully built pandas/);
      assert.match(bonnieTerminal, /bonnie: prepared \d+ packages; publishing/);
      assert.match(bonnieTerminal, /bonnie: installation complete/);

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
          "meson --version && python -c 'import mesonbuild.coredata as c; " +
          "from importlib.metadata import version; assert c.version == version(\"meson\")'",
        )})`,
      ), 0, "Pandas's build frontend was not installed transitively");
      assert.equal(await evaluate(
        debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(
          "python -c 'import socket; assert socket.socket'",
        )})`,
      ), 0, "the denied socket module did not preserve import compatibility");
      assert.equal(await evaluate(
        debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(
          "python -c 'import socket; socket.socket()'",
        )})`,
      ), 1, "CPython unexpectedly acquired a raw socket capability");
      assert.equal(await evaluate(
        debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(
          "python -c 'import glob,os; assert not glob.glob(\"/tmp/bonnie-stage-*\"); " +
          "assert not os.path.exists(\"/tmp/bonnie-last-build.log\")'",
        )})`,
      ), 0, "Bonnie left build staging or diagnostic state behind");
      console.log(
        "browser: Bonnie resolved and source-built Pandas, NumPy, and their " +
        "build dependencies while preserving explicit socket denial",
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
        `window.__dolly.submit(${JSON.stringify("mkdir -p /home/dolly/.pi/agent; echo '{}' > /home/dolly/.pi/agent/auth.json; echo SESSION-CREDENTIAL > /home/dolly/session-credential")})`,
      ), 0);
      for (const command of [
        `awk 'BEGIN { for(i=0;i<1024;i++) printf "%8192s", "x" }' > /workspace/session-large`,
        "echo '# SESSION-BASE-EDIT' >> /etc/gitconfig",
        "rm /usr/include/zconf.h",
        "rm /usr/share/licenses/zlib/LICENSE; mkdir /usr/share/licenses/zlib/LICENSE",
        "echo SESSION-TYPE > /usr/share/licenses/zlib/LICENSE/child",
        "mkdir /workspace/session-empty; ln -s session-proof.txt /workspace/session-link",
      ]) {
        assert.equal(await evaluate(debuggerClient.send,
          `window.__dolly.submit(${JSON.stringify(command)})`), 0, command);
      }
      // Saving cannot depend on the foreground program reading stdin.
      await evaluate(debuggerClient.send,
        'window.__sleepResult = null; void window.__dolly.submit("sleep 20").then(status => { window.__sleepResult = status; })');
      await waitForValue(debuggerClient.send, "window.__dolly.transport.foregroundInterruptible()",
        Boolean, "sleeping foreground child", 100);
      const saveStartedAt = Date.now();
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
      const deltaBytes = Number(await evaluate(debuggerClient.send,
        "document.documentElement.dataset.sessionUncompressedBytes"));
      assert.ok(deltaBytes > 8 * 1024 * 1024 && deltaBytes < 12 * 1024 * 1024,
        `save should contain workspace changes, not the base image: ${deltaBytes}`);
      assert.equal(await evaluate(debuggerClient.send, "window.__sleepResult"), null,
        "save only finished after the foreground child returned");
      console.log(`browser: saved ${deltaBytes} delta bytes in ${Date.now() - saveStartedAt} ms during sleep`);
      assert.equal(await evaluate(debuggerClient.send, "location.pathname"),
        `${browserBase}session/browser-proof`);
      assert.equal(await evaluate(debuggerClient.send, "location.search"), "");

      if (pagesIsolationMode) {
        // Exercise the static 404 launch with no existing worker registration,
        // not just a route handled by an already-installed service worker.
        await evaluate(debuggerClient.send, `(async () => {
          for (const registration of await navigator.serviceWorker.getRegistrations()) {
            await registration.unregister();
          }
        })()`);
      }

      await debuggerClient.send("Page.navigate", {
        url: `${localOrigin}${browserBase}session/browser-proof`,
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
        "grep -q SESSION-CREDENTIAL /home/dolly/session-credential",
        "grep -q '{}' /home/dolly/.pi/agent/auth.json",
        "test $(wc -c < /workspace/session-large) -eq 8388608",
        "grep -q SESSION-BASE-EDIT /etc/gitconfig",
        "test ! -e /usr/include/zconf.h",
        "grep -q SESSION-TYPE /usr/share/licenses/zlib/LICENSE/child",
        "test -d /workspace/session-empty",
        "test -L /workspace/session-link; grep -q SESSION-WORKSPACE /workspace/session-link",
        "grep -q SESSION-WORKSPACE /home/dolly/.slop_history",
        "grep -q 'DOLLY-SESSION 1' /home/dolly/.dolly-session-name",
        "grep -q 'name browser-proof' /home/dolly/.dolly-session-name",
      ]) {
        assert.equal(await evaluate(
          debuggerClient.send,
          `window.__dolly.submit(${JSON.stringify(command)})`,
        ), 0, command);
      }
      assert.equal(await evaluate(debuggerClient.send,
        'window.__dolly.submit("echo SECOND-SAVE >> /workspace/session-proof.txt; rm /workspace/session-large")'), 0);
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
      await debuggerClient.send("Page.navigate", { url: `${localOrigin}${browserBase}session/` });
      assert.equal(await waitForValue(debuggerClient.send,
        "document.documentElement?.dataset.sessionsStatus ?? ''",
        (value) => value === "ready" || value === "failed", "saved session list", 100), "ready");
      assert.equal(await evaluate(debuggerClient.send, "document.querySelectorAll('#sessions li').length"), 1);
      assert.equal(await evaluate(debuggerClient.send, "document.querySelector('#sessions a').pathname"),
        `${browserBase}session/browser-proof`);
      assert.equal(await evaluate(debuggerClient.send, "typeof window.__dolly"), "undefined",
        "listing sessions should not boot a Wasm runtime");
      await evaluate(debuggerClient.send, "document.querySelector('#sessions a').click()");
      assert.equal(await waitForValue(debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        (value) => value === "ready" || value === "failed", "second session restore", 1200), "ready");
      await enterRecoveryShell(debuggerClient.send);
      for (const command of [
        "grep -q SECOND-SAVE /workspace/session-proof.txt",
        "test ! -e /workspace/session-large",
        "test ! -e /usr/include/zconf.h",
        "grep -q SESSION-TYPE /usr/share/licenses/zlib/LICENSE/child",
      ]) assert.equal(await evaluate(debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(command)})`), 0, command);
      // Storage failure must be visible and must not replace the last good
      // checkpoint. Inject the browser's quota error at the actual IDB put.
      assert.deepEqual(await evaluate(debuggerClient.send, `(async () => {
        const store = await import(${JSON.stringify(`${browserBase}src/session-store.mjs`)});
        const before = await store.loadStoredSession("browser-proof");
        const original = IDBObjectStore.prototype.put;
        let error;
        IDBObjectStore.prototype.put = function() {
          throw new DOMException("Storage quota test", "QuotaExceededError");
        };
        try { await window.__dolly.saveSession("browser-proof"); }
        catch (caught) { error = caught.name; }
        finally { IDBObjectStore.prototype.put = original; }
        const after = await store.loadStoredSession("browser-proof");
        return { error, same: before.updatedAt === after.updatedAt &&
          new Uint8Array(before.bytes).every((byte, index) => byte === new Uint8Array(after.bytes)[index]),
          visible: !document.querySelector("#session-status").hidden &&
            document.querySelector("#session-status").textContent.includes("Storage quota test") };
      })()`), { error: "QuotaExceededError", same: true, visible: true });
      await evaluate(debuggerClient.send, `(async () => {
        const store = await import(${JSON.stringify(`${browserBase}src/session-store.mjs`)});
        const good = await store.loadStoredSession("browser-proof");
        await store.saveStoredSession({ ...good, name: "wrong-base", buildId: "different-runtime" });
        await store.saveStoredSession({ ...good, name: "broken-data", encoding: "identity", bytes: new ArrayBuffer(16) });
      })()`);
      for (const name of ["wrong-base", "broken-data", "missing-session"]) {
        await debuggerClient.send("Page.navigate", { url: `${localOrigin}${browserBase}session/${name}` });
        assert.equal(await waitForValue(debuggerClient.send,
          "document.documentElement?.dataset.dollyStatus ?? ''",
          (value) => value === "ready" || value === "failed", `rejected session ${name}`, 1200), "failed");
      }
      await debuggerClient.send("Page.navigate", { url: `${localOrigin}${browserBase}session/` });
      assert.equal(await waitForValue(debuggerClient.send,
        "document.documentElement?.dataset.sessionsStatus ?? ''",
        (value) => value === "ready" || value === "failed", "retained saved records", 100), "ready");
      assert.equal(await evaluate(debuggerClient.send,
        "document.querySelectorAll('#sessions li').length"), 3);
      assert.equal(await evaluate(debuggerClient.send,
        "[...document.querySelectorAll('#sessions a')].some(link => link.textContent === 'wrong-base')"), false);
      // Legacy bookmarks resolve to the canonical path without query params.
      await debuggerClient.send("Page.navigate", { url: `${localOrigin}${browserBase}load/?session=browser-proof` });
      assert.equal(await waitForValue(debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        (value) => value === "ready" || value === "failed", "legacy session redirect", 1200), "ready");
      assert.equal(await evaluate(debuggerClient.send, "location.pathname + location.search"),
        `${browserBase}session/browser-proof`);
      console.log(
        "browser: named session captured in Wasm, compressed into IndexedDB, " +
        "loaded from /session/browser-proof, restored credentials/history/workspace, " +
        "base edits/deletions/types/symlinks; quota, corrupt/wrong-base/missing saves " +
        "fail without deleting checkpoints; legacy links redirect to /session",
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
        `${browserBasePrefix}/dist/dolly-${selectedImage}-system.snapshot${packagedSite ? ".gz" : ""}`,
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
        "document.querySelectorAll('pre .line').length",
        (value) => value > 2,
        "Dollyfile source viewer",
        200,
      );
      const viewer = await evaluate(debuggerClient.send, `(() => ({
        source: document.querySelector('pre')?.textContent,
        links: Array.from(document.querySelectorAll('pre a'), (anchor) => ({
          href: new URL(anchor.href).pathname,
          download: anchor.hasAttribute('download'),
        })),
        linkColor: getComputedStyle(document.querySelector('pre a')).color,
        chrome: document.querySelectorAll('header, nav, h1, main > p').length,
      }))()`);
      assert.equal(viewer.chrome, 0);
      assert.match(viewer.source, /DOLLY 2/);
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
        links: Array.from(document.querySelectorAll('.image-links a'), (link) =>
          new URL(link.href).pathname),
        interactiveElements: document.querySelectorAll('script, form, input, button').length,
        text: document.body.textContent,
      }))()`);
      assert.equal(menuEvidence.title, "DOLLY");
      assert.equal(menuEvidence.background, "rgb(38, 38, 38)");
      assert.match(menuEvidence.font, /Dolly IosevkaTerm SemiBold/);
      assert.deepEqual(menuEvidence.links, [
        `${browserBasePrefix}/default/`,
        `${browserBasePrefix}/default/rebuild/`,
        `${browserBasePrefix}/view/default/`,
        `${browserBasePrefix}/pi/`,
        `${browserBasePrefix}/pi/rebuild/`,
        `${browserBasePrefix}/view/pi/`,
        `${browserBasePrefix}/python/`,
        `${browserBasePrefix}/python/rebuild/`,
        `${browserBasePrefix}/view/python/`,
        `${browserBasePrefix}/python-pi/`,
        `${browserBasePrefix}/python-pi/rebuild/`,
        `${browserBasePrefix}/view/python-pi/`,
        `${browserBasePrefix}/gamedev/`,
        `${browserBasePrefix}/gamedev/rebuild/`,
        `${browserBasePrefix}/view/gamedev/`,
      ]);
      assert.equal(menuEvidence.interactiveElements, 0);
      assert.doesNotMatch(menuEvidence.text, /voice input/i);
      console.log(
        "browser: static root menu exposes open, rebuild, and Dollyfile-view links",
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
      if (process.env.DOLLY_EXPECT_MODULE_CACHE) {
        assert.ok(
          evidence.bootstrap.includes(process.env.DOLLY_EXPECT_MODULE_CACHE),
          `missing expected cache evidence: ${process.env.DOLLY_EXPECT_MODULE_CACHE}`,
        );
        console.log(`browser: ${process.env.DOLLY_EXPECT_MODULE_CACHE}`);
      }
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
        /The packaged system snapshot is missing\. Run npm run snapshot before serving Dolly\./,
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
        assert.equal(
          await evaluate(
            debuggerClient.send,
            'window.__dolly.submit("rm -f /tmp/pages-generic-network.txt")',
          ),
          0,
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
    if (cppMode) {
      const state = await waitForValue(
        debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        (value) => value === "ready" || value === "failed",
        "Dolly C++ SDK snapshot boot",
        1200,
      );
      assert.equal(state, "ready");
      await enterRecoveryShell(debuggerClient.send);
      const source = [
        "#include <cstdio>",
        "#include <string>",
        "#include <vector>",
        "int main() {",
        "  std::vector<std::string> words{\"dolly\", \"c++23\"};",
        "  if (words.size() != 2 || words[0] != \"dolly\") return 1;",
        "  std::puts(words[0].c_str());",
        "  std::puts(words[1].c_str());",
        "  return 0;",
        "}",
      ].join("\\n");
      for (const command of [
        "rm -f /tmp/dolly-cpp-check.cpp /tmp/dolly-cpp-check",
        ...source.split("\\n").map((line) =>
          `echo '${line}' >> /tmp/dolly-cpp-check.cpp`),
        "c++ -O1 -fno-exceptions -fno-rtti /tmp/dolly-cpp-check.cpp -o /tmp/dolly-cpp-check",
        "/tmp/dolly-cpp-check",
        "rm -f /tmp/dolly-cpp-check.cpp /tmp/dolly-cpp-check",
      ]) {
        assert.equal(await evaluate(
          debuggerClient.send,
          `window.__dolly.submit(${JSON.stringify(command)})`,
        ), 0, command);
      }
      console.log("browser: standalone C++ SDK compiled, linked, and ran a libc++ C++23 command");
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
            baseUrl: `${localOrigin}/fixture/pi/v1`,
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
      const piHeaderText = await waitForTerminalText(
        debuggerClient.send, /! Slop/, "Pi's Slop-aware header",
      );
      assert.doesNotMatch(piHeaderText, /!\s+(?:to run )?bash/i);
      if (selectedImage === "python-pi") {
        assert.match(piHeaderText, /\[Skills\][\s\S]*\bbonnie\b/);
      }
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
      await typeText(debuggerClient.send,
        "! slop -e -c 'x=$(exit 7); exit 19'; printf 'DOLLY-SLOP-STATUS=%s\\n' \"$?\"");
      await dispatchKey(debuggerClient.send, {
        key: "Enter", code: "Enter", windowsVirtualKeyCode: 13,
      });
      await waitForTerminalText(debuggerClient.send, /DOLLY-SLOP-STATUS=7/,
        "Pi shell interaction preserving assignment substitution failure");
      await clearTerminalSelection(debuggerClient.send);
      await typeText(
        debuggerClient.send,
        "! printf 'DOLLY-CHILD-%s\\n' PREFIX; sleep 2; printf 'DOLLY-CHILD-%s\\n' SUFFIX",
      );
      await dispatchKey(debuggerClient.send, {
        key: "Enter",
        code: "Enter",
        windowsVirtualKeyCode: 13,
      });
      await waitForTerminalText(
        debuggerClient.send,
        /DOLLY-CHILD-PREFIX/,
        "Pi's ! command publishing child output before exit",
      );
      assert.doesNotMatch(
        await visibleTerminalText(debuggerClient.send),
        /DOLLY-CHILD-SUFFIX/,
        "Pi buffered child output until the command exited",
      );
      await waitForTerminalText(
        debuggerClient.send,
        /DOLLY-CHILD-SUFFIX/,
        "Pi's ! command completing after streamed output",
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
        const extensionUrl = `${localOrigin}/fixture/pi-extension.js`;
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
              baseUrl: `${localOrigin}/fixture/pi/v1`,
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

      let prefixBaselineFrame = null;
      let prefixRenderedFrame = null;
      for (let attempt = 0; attempt < 600; attempt++) {
        if (piFixtureStream.request === 3 && piFixtureStream.phase === "waiting" &&
            prefixBaselineFrame === null) {
          prefixBaselineFrame = await currentFrameSequence(debuggerClient.send);
        }
        if (piFixtureStream.request === 3 && piFixtureStream.phase === "prefix") {
          const frame = await currentFrameSequence(debuggerClient.send);
          if (prefixBaselineFrame !== null && frame !== prefixBaselineFrame) {
            prefixRenderedFrame = frame;
            break;
          }
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
      assert.notEqual(prefixBaselineFrame, null,
        "Pi did not expose the final response's delayed-body interval");
      assert.notEqual(prefixRenderedFrame, null,
        "Pi did not publish a terminal frame while the response suffix was withheld");

      const streamedTurn = await waitForHttpQuiet(
        debuggerClient.send,
        httpRequestCountBefore + 3,
        "Pi's three incrementally streamed fixture requests",
      );
      assert.equal(streamedTurn.requests, httpRequestCountBefore + 3);
      await waitForTerminalText(
        debuggerClient.send,
        /日本語😀 DOLLY-PI-HTTP-EDIT-OK/,
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
        /Wrote 45 bytes to \/workspace\/pi-http-test\.txt/,
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
      const unicodeStatus = await evaluate(
        debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify("grep '日本語😀' /workspace/pi-http-test.txt")})`,
      );
      assert.equal(unicodeStatus, 0, "Pi's streamed tool arguments corrupted UTF-8 file contents");
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

  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify("timeout 0.05 ./interrupt-loop")})`,
    ),
    124,
    "the trusted deadline did not terminate an uncooperative CPU loop",
  );

  if (selectedModuleNames.has("quickjs")) {
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
          "test -s /workspace/interrupt-loop",
        )})`,
      ),
      0,
    );
    assert.equal(
      await evaluate(
        debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(
          `qjs -e "const r = Dolly.shell('/workspace/interrupt-loop', '', 50); ` +
          `if (r.status !== 124) throw new Error('status ' + r.status)"`,
        )})`,
      ),
      0,
      "the in-Wasm spawn deadline did not terminate a CPU-bound command",
    );
  }

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
  assert.equal(
    await evaluate(
      debuggerClient.send,
      'window.__dolly.submit("rm -rf /tmp/copy-source /tmp/copy-target")',
    ),
    0,
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
    ["./interrupt-loop", "uncooperative C loop"],
    ...(selectedModuleNames.has("quickjs")
      ? [["qjs -e 'for (;;) {}'", "QuickJS bytecode loop"]]
      : []),
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

  if (selectedImage === "gamedev") {
  assert.equal(
    await evaluate(
      debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(
        "test -s /usr/src/dolly/gamedev/graphics-demo.c && " +
        "test -s /usr/src/dolly/gamedev/gamedev.mk",
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
  const graphicsPixels = await waitForValue(
    debuggerClient.send,
    `(() => {
      const canvas = document.querySelector('#display');
      const pixels = canvas.getContext('2d')
        .getImageData(0, 0, canvas.width, canvas.height).data;
      let background = 0;
      let accent = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        const red = pixels[index];
        const green = pixels[index + 1];
        const blue = pixels[index + 2];
        if (red >= 24 && red <= 50 && green >= 24 && green <= 50 &&
            blue >= 24 && blue <= 50 &&
            Math.max(red, green, blue) - Math.min(red, green, blue) <= 8 &&
            pixels[index + 3] === 255) background++;
        if (Math.max(red, green, blue) - Math.min(red, green, blue) > 35 &&
            red + green + blue > 200 && pixels[index + 3] === 255) accent++;
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
    `browser: post-framebuffer command batch ${performanceAfterGraphics.milliseconds}ms/` +
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
        `awk 'BEGIN { for (i = 0; i < 100; i++) printf "DOLLY-SCROLL-%03d\\n", i }'`,
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

  if (selectedModuleNames.has("pi")) {
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
  assert.equal(
    await evaluate(
      debuggerClient.send,
      'window.__dolly.submit("rm -f /tmp/openrouter-login-models.txt")',
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
  assert.equal(
    await evaluate(
      debuggerClient.send,
      'window.__dolly.submit("rm -f /tmp/codex-login-models.txt")',
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
  }

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
  assert.match(evidence.bootstrap, /dolly: preparing sandbox display library \/usr\/lib\/libdisplay\.so/);
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
    "Ghostty selection/scroll and phone menu passed" +
    (selectedModuleNames.has("pi")
      ? "; Pi credential storage/model discovery and Codex OAuth exchange passed"
      : ""),
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
    const terminal = await visibleTerminalText(debuggerClient.send)
      .catch(() => "terminal text unavailable");
    const diagnostics = await evaluate(debuggerClient.send, `JSON.stringify({
      dataset: { ...document.documentElement.dataset },
      bootstrap: (document.querySelector('#bootstrap-log')?.textContent ?? '').slice(-5000),
    }, null, 2)`).catch(() => "browser diagnostics unavailable");
    process.stderr.write(`${diagnostics}\n`);
    process.stderr.write(`terminal:\n${terminal.slice(-12000)}\n`);
  }
  throw error;
} finally {
  debuggerClient?.socket.close();
  if (chrome !== null) {
    chrome.kill("SIGTERM");
    await new Promise((resolveExit) => {
      if (chrome.exitCode !== null) resolveExit();
      else chrome.once("exit", resolveExit);
    });
  }
  await new Promise((resolveClose) => server.close(resolveClose));
  if (userDataDir !== null && !persistentProfile &&
      process.env.DOLLY_KEEP_BROWSER_PROFILE !== "1") {
    await rm(ephemeralProfileRoot ?? userDataDir, {
      recursive: true,
      maxRetries: 5,
      retryDelay: 50,
    });
  }
  if (browserDownloadDirectory !== null) {
    await rm(browserDownloadDirectory, { recursive: true, force: true });
  }
}
