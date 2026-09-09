#!/usr/bin/env node

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { waitForDebugger } from "./browser-startup.mjs";
import { runLocalModelProof, runLocalCompatibilityProof, runLocalCacheProof, runLocalMenuProof } from "../test/fixtures/local-model-browser.mjs";
import { runImageBuildProof } from "../test/fixtures/image-build-browser.mjs";
import { lstat, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
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
import { browserShellCases } from "../test/fixtures/browser-shell-cases.mjs";
import { decoderCases } from "../test/fixtures/utf8-cases.mjs";
import { demoFixture } from "../test/fixtures/codex-responses.mjs";
import { createCodexLoginFixture, runCodexLogin, codexLoginRules, codexLoginFetch } from "../test/fixtures/codex-login.mjs";
import { runCodexTui } from "../test/fixtures/codex-tui.mjs";
import { createTokioFixture } from "../test/fixtures/tokio.mjs";
import { rustToolSources, runRustTools, runRipgrep, runFd } from "../test/fixtures/rust-tools.mjs";
import { processSmokeSources, runProcessSmoke } from "../test/fixtures/process-smoke.mjs";
import { parserRecipes, runDollyfileCases } from "../test/fixtures/dollyfile-cases.mjs";
import { createGitTransportFixture, runGitTransport } from "../test/fixtures/git-transport.mjs";
import { createHttpRedirectFixture } from "../test/fixtures/http-redirect-server.mjs";
import { runUploadProof, selectFile } from "../test/fixtures/upload-browser.mjs";
import { runStudioModelProof } from "../test/fixtures/studio-model-browser.mjs";
import { runSessionFilesProof } from "../test/fixtures/session-files-browser.mjs";
import { tarArchive } from "../test/fixtures/tar.mjs";
import { rtsProvider } from "../test/fixtures/rts-provider.mjs";
import { gzipSync } from "node:zlib";

const projectDir = resolve(import.meta.dirname, "..");
const imageDefinitions = await selectImageDefinitions(await discoverImageDefinitions(projectDir));
const staticSources = await inspectStaticSources(projectDir, imageDefinitions);
const distDirectory = resolve(projectDir, "dist");
const packagedSite = process.env.DOLLY_BROWSER_SITE
  ? resolve(process.env.DOLLY_BROWSER_SITE) : null;
const externalPage = process.env.DOLLY_BROWSER_PAGE;
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
const requestedMode = process.env.DOLLY_BROWSER_MODE;
const knownModes = new Set();
function isMode(...names) {
  for (const name of names) knownModes.add(name);
  return names.includes(requestedMode);
}
const piDevelopmentMode = isMode("pi");
const cppMode = isMode("cpp");
const boundaryMode = isMode("boundary");
const httpDefaultsMode = isMode("http-defaults");
const sourceDownloadMode = isMode("source-download");
const processAbiMode = isMode("process-abi");
const processSmokeMode = isMode("process-smoke");
const rustToolsMode = isMode("rust-tools");
const tokioMode = isMode("tokio");
const codexMode = isMode("codex");
const codexLoginMode = isMode("codex-login");
const codexLoginFixture = codexLoginMode ? createCodexLoginFixture() : null;
const codexFixture = codexMode ? demoFixture() : null;
const tokioFixture = tokioMode ? createTokioFixture() : null;
const fdMode = isMode("fd");
const ripgrepMode = isMode("ripgrep");
const libuvMode = isMode("libuv");
const cmakeMode = isMode("cmake");
const neovimMode = isMode("neovim");
const dollyfileParserMode = isMode("dollyfile-parser");
const missingDependencyMode = isMode("v3-missing-dependency");
const iterationMode = isMode("v3-iteration") || missingDependencyMode;
const imageRetentionMode = isMode("image-retention");
const imageInventoryMode = isMode("image-inventory", "image-inventory-rebuild");
const releaseCacheMode = isMode("release-cache");
const makeMode = isMode("make");
const slopMode = isMode("slop", "slop-source");
const utf8Mode = isMode("utf8");
const terminalUiMode = isMode("terminal-ui");
const uploadMode = isMode("upload");
const customDollyfileMode = isMode("custom-dollyfile");
const studioMode = isMode("dollyfile-studio");
const imageBuildMode = isMode("image-build", "image-build-pages");
const graphicsMode = isMode("graphics");
const sdl2Mode = isMode("sdl2");
const rtsMode = isMode("rts");
const rtsLauncherMode = isMode("rts-launcher");
const rtsReplayMode = isMode("rts-replay");
const rtsSplitReplayMode = isMode("rts-split-replay");
const rtsLiveMode = isMode("rts-live");
const rtsLiveConfiguration = rtsLiveMode && process.env.DOLLY_RTS_MODELS_FILE
  ? JSON.parse(await readFile(resolve(process.env.DOLLY_RTS_MODELS_FILE), "utf8")) : null;
const rtsLiveModels = (process.env.DOLLY_RTS_MODELS ??
  "openai/gpt-5.6-luna:low,google/gemini-2.5-flash:low").split(",");
const rtsLiveSeconds = Number(process.env.DOLLY_RTS_SECONDS ?? 1200);
const rtsLiveDollars = Number(process.env.DOLLY_RTS_USD ?? 0.50);
if (rtsLiveMode && (rtsLiveModels.length !== 2 || rtsLiveModels.some(model => !/^[\w./:-]+$/.test(model)) ||
    !Number.isInteger(rtsLiveSeconds) || rtsLiveSeconds < 10 || rtsLiveSeconds > 3600 ||
    !Number.isFinite(rtsLiveDollars) || rtsLiveDollars <= 0 || rtsLiveDollars > 2))
  throw Error("RTS live proof needs two comma-separated models, 10..3600 seconds and a USD limit up to 2");
const bhopMode = isMode("bhop");
const debuggerDisconnectMode = isMode("debugger-disconnect");
const janisFilesMode = isMode("janis-files");
const janisProcessMode = isMode("janis-process");
const processLifecycleMode = isMode("process-lifecycle");
const pythonProcessMode = isMode("python-process");
const libcurlContractMode = isMode("libcurl-contract");
const gitTransportMode = isMode("git-transport");
const piOpenRouterMode = isMode("pi-openrouter");
const piAuditMode = isMode("pi-audit");
const realOpenRouterMode = piOpenRouterMode || piAuditMode || (rtsLiveMode && !rtsLiveConfiguration);
const missingSnapshotMode = isMode("snapshot-missing");
const unpackagedSnapshotMode = isMode("snapshot-unpackaged");
const snapshotExportMode = isMode("snapshot-export") || unpackagedSnapshotMode;
const pagesIsolationMode = isMode("pages-isolation", "session-pages", "image-build-pages");
const pagesLiveMode = isMode("pages-live");
const menuMode = isMode("menu");
const routeSmokeMode = isMode("route-smoke");
const sessionRebuildMode = isMode("session-rebuild");
const sessionMode = isMode("session", "session-pages") || sessionRebuildMode;
const pythonPackageMode = isMode("python-packages");
const pythonInteractiveMode = isMode("python-interactive");
const toolchainProbeMode = isMode("toolchain-probes");
const zigSdkMode = isMode("zig-sdk");
const studioModelMode = isMode("studio-local-model");
const localCompatibilityMode = isMode("local-model-fp32");
const localModelMode = isMode("local-model") || studioModelMode || localCompatibilityMode;
const localCacheMode = isMode("local-model-cache");
const optimizedLifecycleProbeMode =
  isMode("optimized-lifecycle-probe");
const lifecycleProbeMode =
  isMode("lifecycle-probe") || optimizedLifecycleProbeMode;
if (requestedMode && !knownModes.has(requestedMode)) {
  throw new Error(`unknown DOLLY_BROWSER_MODE: ${requestedMode}`);
}
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
const hasZig = selectedGraph.exporters.has("TOOL:zig");
const iterationRecipe = iterationMode ? `DOLLY 3
IMAGE iteration
FROM HOST /${selectedDefinition.filename} ${selectedGraph.root.sha256}
SLOP mkdir -p /opt/iteration/bin; cp /bin/echo /opt/iteration/bin/echo
EXPORTS ENV PATH /opt/iteration/bin:/bin:/usr/bin
EXPORTS TOOL echo
FILE /usr/share/iteration-deleted
    old
SLOP rm /usr/share/iteration-deleted
FILE /tmp/iteration.c
    #include <stdio.h>
    int main(void) { puts("iteration-one"); return 0; }
SLOP cc /tmp/iteration.c -o /usr/bin/iteration
EXPORTS TOOL iteration
EXPORTS ENV DOLLY_ITERATION first
EXPORTS ENV DOLLY_ITERATION APPEND second
FILE /usr/share/iteration-entry.slop
    test "$1" = '\uFEFFargument' || { printf 'ENTRY argument lost U+FEFF\\n'; exit 87; }
    /bin/foreground -i /bin/slop
EXPORTS FILE iteration-entry /usr/share/iteration-entry.slop
ENTRY /bin/slop /usr/share/iteration-entry.slop '\uFEFFargument'
` : null;
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
  "test/fixtures/http-admission-worker.mjs",
  "test/fixtures/browser-process-abi.mjs",
  "coi-serviceworker.js",
  "index.html",
  ...imageDefinitions.map((definition) => definition.filename),
  "src/browser.mjs",
  "src/dollyfile-view.mjs",
  "src/http-policy.mjs",
  "src/http-broker.mjs",
  "src/local-model-contract.mjs",
  "src/local-model-service.mjs",
  "src/local-model-ui.mjs",
  "src/qwen-completions.mjs",
  "src/webgpu-worker.mjs",
  "src/kernel-plugin.mjs",
  "src/image-entry.mjs",
  "src/image-artifact.mjs",
  "src/image-build.mjs",
  "src/image-builder.mjs",
  "src/image-build-service.mjs",
  "src/image-build-ui.mjs",
  "src/local-services.mjs",
  "src/custom-image.mjs",
  "src/image-inputs.mjs",
  "src/snapshot-records.mjs",
  "src/static-asset.mjs",
  "src/source-download.mjs",
  "src/process-ffi.mjs",
  "src/process-abi.mjs",
  "src/wasm-interface.mjs",
  "src/process-supervisor.mjs",
  "src/process-worker.mjs",
  "src/session-store.mjs",
  "src/session-file.mjs",
  "src/session-transport.mjs",
  "src/upload-transport.mjs",
  "src/custom-dollyfile.mjs",
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
  ["/", "build/routes/index.html"],
  ["/index.html", "build/routes/index.html"],
  ...imageDefinitions.flatMap(({ image }) => [
    [`/${image}`, `build/routes/${image}/index.html`],
    [`/${image}/rebuild`, `build/routes/${image}/rebuild/index.html`],
    [`/view/${image}`, `build/routes/view/${image}/index.html`],
  ]),
  ...selectedGraph.modules.map(({ name }) => [
    `/view/${selectedImage}/modules/${name}`, `build/routes/view/${selectedImage}/modules/${name}/index.html`,
  ]),
  ["/custom/rebuild", "build/routes/custom/rebuild/index.html"],
  ["/custom/run", "build/routes/custom/run/index.html"],
  ["/custom", "build/routes/custom/index.html"],
  ["/rebuild", "build/routes/rebuild/index.html"],
  ["/load", "build/routes/load/index.html"],
  ["/session", "build/routes/session/index.html"],
]);
let gitDiscoveryRequest = null;
let gitTransportFixture = null;
let libcurlPostRequest = null;
const libcurlContractRequests = [];
const libcurlCancelledRequests = [];
let curlCliRequest = null;
let snapshotUpload = null;
const staticRequestPaths = new Set();
let corruptAssetPart = false;
const assetPartRequests = [];
const piModelRequests = [];
const rtsModelFixture = rtsProvider();
const janisAbortRequests = [];
let cancelledQueuedRequestSeen = false;
const piFixtureStream = { request: 0, phase: "idle" };

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function startServer() {
  const httpRedirectFixture = createHttpRedirectFixture();
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
      // The selected external app also imports fixture ES-module dependencies
      // from this test server. Production handlers and HTTP policy are unchanged.
      if (externalPage) response.setHeader("access-control-allow-origin", new URL(externalPage).origin);
      if (await httpRedirectFixture(request, response, requestUrl)) return;
      if (requestUrl.pathname.startsWith("/fixture/")) {
        response.setHeader("access-control-allow-methods", "GET, HEAD, POST, PUT, OPTIONS");
        response.setHeader("access-control-allow-headers", request.headers["access-control-request-headers"] ?? "");
        if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }
      }
      if (codexLoginFixture && codexLoginFixture.handle(request, response)) return;
      if (codexFixture && codexFixture.handle(request, response)) return;
      if (tokioFixture && await tokioFixture.handle(request, response, requestUrl)) return;
      if (gitTransportFixture && await gitTransportFixture.serve(request, response, requestUrl)) return;
      if (dollyfileParserMode && parserRecipes.has(requestUrl.pathname)) {
        response.writeHead(200, { ...isolatedHeaders, "content-type": "text/plain" });
        response.end(parserRecipes.get(requestUrl.pathname));
        return;
      }
      if (dollyfileParserMode && /^\/fixture\/parser-(?:dollyfile\.c|fs-record\.h|sha256\.h)$/.test(requestUrl.pathname)) {
        response.writeHead(200, { ...isolatedHeaders, "content-type": "text/plain" });
        response.end(await readFile(resolve(projectDir, "src", requestUrl.pathname.slice("/fixture/parser-".length))));
        return;
      }
      if (libuvMode && requestUrl.pathname === "/fixture/libuv-source.tar") {
        response.writeHead(200, isolatedHeaders);
        response.end(await readFile(resolve(projectDir, "build/fixtures/libuv-source.tar")));
        return;
      }
      if (rustToolsMode && requestUrl.pathname.startsWith("/fixture/rust/")) {
        const name = requestUrl.pathname.slice("/fixture/rust/".length);
        if (Object.hasOwn(rustToolSources, name)) {
          response.writeHead(200, { ...isolatedHeaders, "content-type": "text/plain" });
          response.end(await readFile(resolve(projectDir, rustToolSources[name])));
          return;
        }
      }
      if (sdl2Mode && requestUrl.pathname.startsWith("/fixture/")) {
        const sources = { "sdl2-probe.c": "test/fixtures/sdl2-probe.c",
          "rts-input-probe.cpp": "test/fixtures/rts-input-probe.cpp",
          "input.cpp": "src/rts/input.cpp", "input.h": "src/rts/input.h", "arena.h": "src/rts/arena.h" };
        const name = requestUrl.pathname.slice("/fixture/".length);
        if (Object.hasOwn(sources, name)) {
          response.writeHead(200, { ...isolatedHeaders, "content-type": "text/plain" });
          response.end(await readFile(resolve(projectDir, sources[name])));
          return;
        }
      }
      if (rtsMode && requestUrl.pathname === "/fixture/rts/v1/chat/completions") {
        try { await rtsModelFixture.handle(request, response, isolatedHeaders); }
        catch (error) { console.error("RTS provider fixture:", error); throw error; }
        return;
      }
      if (rtsMode && ["/fixture/rts-match.mjs", "/fixture/rts-history.mjs"].includes(requestUrl.pathname)) {
        response.writeHead(200, { ...isolatedHeaders, "content-type": "text/javascript" });
        response.end(await readFile(resolve(projectDir, "test/fixtures", requestUrl.pathname.split("/").at(-1))));
        return;
      }
      if (rtsLiveMode && requestUrl.pathname === "/fixture/rts-live.mjs") {
        response.writeHead(200, { ...isolatedHeaders, "content-type": "text/javascript" });
        response.end(await readFile(resolve(projectDir, "test/fixtures/rts-live.mjs")));
        return;
      }
      if (rtsSplitReplayMode && requestUrl.pathname === "/fixture/rts-split-replay.mjs") {
        response.writeHead(200, { ...isolatedHeaders, "content-type": "text/javascript" });
        response.end(await readFile(resolve(projectDir, "test/fixtures/rts-split-replay.mjs")));
        return;
      }
      if (processSmokeMode && requestUrl.pathname.startsWith("/fixture/")) {
        const name = requestUrl.pathname.slice("/fixture/".length);
        if (Object.hasOwn(processSmokeSources, name)) {
          response.writeHead(200, { ...isolatedHeaders, "content-type": "text/plain" });
          response.end(await readFile(resolve(projectDir, processSmokeSources[name])));
          return;
        }
      }
      if (imageRetentionMode && requestUrl.pathname.startsWith("/fixture/")) {
        const sources = {
          "fs-record.h": "src/fs-record.h",
          "fs-record.c": "test/fixtures/fs-record.c",
          "image-roundtrip.c": "test/fixtures/image-roundtrip.c",
          "system-snapshot.c": "src/system-snapshot.c",
          "system-snapshot.h": "src/system-snapshot.h",
          "dollyfile.c": "src/dollyfile.c",
          "sha256.h": "src/sha256.h",
        };
        const source = sources[requestUrl.pathname.slice("/fixture/".length)];
        if (source) {
          response.writeHead(200, { ...isolatedHeaders, "content-type": "text/plain" });
          response.end(await readFile(resolve(projectDir, source)));
          return;
        }
      }
      if (utf8Mode && /^\/fixture\/utf8-(?:cases\.mjs|browser\.mjs|writer\.c)$/.test(requestUrl.pathname)) {
        response.writeHead(200, { ...isolatedHeaders, "content-type": "text/plain; charset=utf-8" });
        response.end(await readFile(resolve(projectDir, "test/fixtures", requestUrl.pathname.split("/").at(-1))));
        return;
      }
      if (janisProcessMode && requestUrl.pathname === "/fixture/never-requested") {
        cancelledQueuedRequestSeen = true;
      }
      if (janisProcessMode && requestUrl.pathname === "/fixture/bytes") {
        response.writeHead(200, { ...isolatedHeaders, "content-type": "application/octet-stream" });
        request.pipe(response);
        return;
      }
      if (janisProcessMode && requestUrl.pathname.startsWith("/fixture/abort/")) {
        const record = { path: requestUrl.pathname, finished: false, closed: false };
        janisAbortRequests.push(record);
        response.writeHead(200, { "content-type": "text/plain" });
        if (!requestUrl.pathname.endsWith("/before")) response.write("prefix");
        const timer = setTimeout(() => { record.finished = true; response.end("suffix"); }, 2000);
        response.once("close", () => { record.closed = true; clearTimeout(timer); });
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
      if (libcurlContractMode && requestUrl.pathname === "/fixture/pi/libcurl-contract") {
        if (requestUrl.searchParams.has("cancel")) {
          const record = { phase: requestUrl.searchParams.get("cancel"), finished: false, closed: false };
          libcurlCancelledRequests.push(record);
          response.writeHead(200, { "content-type": "text/plain" });
          response.write("prefix");
          const timer = setTimeout(() => { record.finished = true; response.end("suffix"); }, 2000);
          response.once("close", () => { record.closed = true; clearTimeout(timer); });
          return;
        }
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        libcurlContractRequests.push({ authorization: request.headers.authorization ?? null,
          body: Buffer.concat(chunks).toString() });
        response.writeHead(200, { "content-type": "text/plain" });
        response.end("libcurl contract response\n");
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
          "access-control-expose-headers": "x-dolly-response",
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
      if ((boundaryMode || httpDefaultsMode) && /^\/static\/default\/commands\/curl\.c(?:\.part-[01])?$/.test(staticPath)) {
        const bytes = await readFile(resolve(distDirectory, "static/default/commands/curl.c"));
        const half = Math.ceil(bytes.length / 2), parts = [bytes.subarray(0, half), bytes.subarray(half)];
        const digest = value => createHash("sha256").update(value).digest("hex");
        const index = /\.part-([01])$/.exec(staticPath);
        if (index) {
          assetPartRequests.push(requestUrl.pathname);
          response.writeHead(200, { ...isolatedHeaders, "content-type": "application/octet-stream" });
          response.end(corruptAssetPart ? Buffer.from("corrupt") : parts[Number(index[1])]);
        } else {
          response.writeHead(200, { ...isolatedHeaders, "content-type": "application/octet-stream", "x-dolly-parts": "1" });
          response.end(JSON.stringify({ byteLength: bytes.length, sha256: digest(bytes),
            parts: parts.map(part => ({ byteLength: part.length, sha256: digest(part) })) }));
        }
        return;
      }
      if (requestedMode === "image-inventory" &&
          /\/dist\/dolly(?:\.data|-seed\.mjs)$/.test(staticPath)) {
        response.writeHead(404, isolatedHeaders).end("prebuilt boot must not need the compiler seed");
        return;
      }
      if ((unpackagedSnapshotMode && /^\/dist\/dolly-.+-system(?:\.snapshot(?:\.gz)?|-snapshot\.mjs)$/.test(staticPath)) ||
          (missingDependencyMode && staticPath === "/dist/dolly-pi-system-snapshot.mjs") ||
          missingSnapshotMode &&
          (staticPath === "/dist/dolly-default-system.snapshot" ||
           staticPath === "/dist/dolly-default-system-snapshot.mjs")) {
        response.writeHead(404, isolatedHeaders).end("not found");
        return;
      }
      if (staticPath === null) {
        response.writeHead(404, isolatedHeaders).end("not found");
        return;
      }
      if (packagedSite) {
        const requested = decodeURIComponent(staticPath).slice(1);
        if (/[\\\0]/.test(requested) || requested.split("/").some(part => part === "." || part === "..")) {
          response.writeHead(404, isolatedHeaders).end("not found");
          return;
        }
        let path = resolve(packagedSite, requested);
        let status = 200;
        try {
          const info = await lstat(path);
          if (info.isDirectory()) path = resolve(path, "index.html");
          else if (!info.isFile()) throw new Error("not a static file");
          await lstat(path);
        } catch (error) {
          if (error.code !== "ENOENT" || request.headers["sec-fetch-mode"] !== "navigate") throw error;
          path = resolve(packagedSite, "404.html");
          status = 404;
        }
        if (!path.startsWith(packagedSite + sep) || !["GET", "HEAD"].includes(request.method)) {
          response.writeHead(404, isolatedHeaders).end("not found");
          return;
        }
        const body = await readFile(path);
        staticRequestPaths.add(requestUrl.pathname);
        response.writeHead(status, { ...isolatedHeaders,
          "content-type": /(?:^|\/)Dollyfile(?:-|$)/.test(requested) ? "text/plain; charset=utf-8"
            : mimeTypes.get(extname(path)) ?? "application/octet-stream" });
        response.end(request.method === "HEAD" ? undefined : body);
        return;
      }

      const route = decodeURIComponent(staticPath).replace(/\/+$/, "") || "/";
      const requested = route.slice(1);
      const sessionRoute = /^\/session\/[A-Za-z0-9._-]{1,64}$/.test(route);
      const relative = sessionRoute ? "build/routes/session/open.html"
        : routeDocuments.get(route) ?? sourceArtifacts.get(requested)?.relative ?? requested;
      const path = resolve(projectDir, relative);
      const distAsset = relative.startsWith("dist/") &&
        path.startsWith(`${distDirectory}${sep}`);
      const documentationAsset = relative.startsWith("docs/") &&
        path.startsWith(`${resolve(projectDir, "docs")}${sep}`);
      if ((request.method !== "GET" && request.method !== "HEAD") ||
          (!publicSources.has(relative) && !routeDocuments.has(route) && !sessionRoute &&
           !sourceArtifacts.has(requested) &&
           !documentationAsset && !distAsset)) {
        response.writeHead(404, isolatedHeaders).end("not found");
        return;
      }
      let body = await readFile(path);
      if (iterationMode && !externalPage && relative === "src/runtime-worker.mjs") {
        const resume = "bootstrapStatus = dolly._dolly_process_bootstrap_resume_prepare(BigInt(range.size), 1);";
        const finish = "bootstrapStatus = dolly._dolly_bootstrap_finish();";
        assert.ok(body.toString().includes(resume));
        assert.ok(body.toString().includes(finish));
        body = Buffer.from(body.toString().replace(resume, `${resume}
          if (bootstrapStatus === 0 && dolly.FS.readdir('/bin').filter(name => name !== '.' && name !== '..').join(',') !== 'dollyfile')
            throw new Error('bootstrap restored more than the image builder');`
        ).replace(finish, `${finish}
          if (dolly._dolly_snapshot_address() !== 0n || dolly._dolly_snapshot_size() !== 0n)
            throw new Error('finished rebuild retained its capture buffer');`));
      }
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

async function connectDebugger({ debugPort, page, target }) {
  if (!target) {
    const response = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(page)}`, { method: "PUT" });
    if (!response.ok) throw new Error(`could not create Chrome target: ${response.status}`);
    target = await response.json();
  }
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveSocket, reject) => {
    socket.addEventListener("open", resolveSocket, { once: true });
    socket.addEventListener("error", reject, { once: true });
    socket.addEventListener("close", () => reject(new Error("Chrome debugger closed before opening")), { once: true });
  });

  let nextId = 1;
  const pending = new Map();
  socket.addEventListener("close", () => {
    for (const handler of pending.values()) handler.reject(new Error("Chrome debugger disconnected"));
    pending.clear();
  });
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
    if (socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error("Chrome debugger disconnected"));
    const id = nextId++;
    return new Promise((resolveCommand, reject) => {
      pending.set(id, { resolve: resolveCommand, reject });
      try { socket.send(JSON.stringify({ id, method, params })); }
      catch (error) { pending.delete(id); reject(error); }
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

async function runGraphicsProof(send, phone = false) {
  for (const [arguments_, status] of [["--frames 12", 0], ["--frames 0", 2], ["--frames -1", 2]]) {
    assert.equal(await evaluate(send, `window.__dolly.submit(${JSON.stringify(`graphics-demo ${arguments_}`)})`), status);
  }
  assert.equal(
    await evaluate(
      send,
      `window.__dolly.submit(${JSON.stringify(
        "test -s /usr/src/dolly/gamedev/graphics-demo.c && " +
        "test -s /usr/src/dolly/gamedev/gamedev.mk",
      )})`,
    ),
    0,
    "the gamedev image did not retain its source-visible starter",
  );
  const performanceBeforeGraphics = await measureShellBatch(
    send,
    "before-graphics",
  );
  await evaluate(
    send,
    `window.__graphicsResult = null;
     window.__dolly.submit("graphics-demo").then(
       status => { window.__graphicsResult = { status }; },
       error => { window.__graphicsResult = { error: String(error) }; },
     ); true`,
  );
  await waitForValue(
    send,
    "window.__dolly.graphicsActive",
    (value) => value === true,
    "graphics framebuffer ownership",
    200,
  );
  const graphicsPixels = await waitForValue(
    send,
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
        if (red <= 20 && green <= 35 && blue >= 15 && blue <= 55 &&
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
  await evaluate(send, `(() => {
    const canvas = document.querySelector('#display');
    window.__graphicsBefore = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    window.__dolly.key('g', 'KeyG');
  })()`);
  const framesBefore = await evaluate(send, "Number(document.documentElement.dataset.frameSequence)");
  await delay(1500);
  assert.ok(await evaluate(send, "Number(document.documentElement.dataset.frameSequence)") - framesBefore >= 10,
    "the physics field must keep presenting frames");
  const changed = await evaluate(send, `(() => {
    const canvas = document.querySelector('#display');
    const after = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    const before = window.__graphicsBefore;
    delete window.__graphicsBefore;
    let changed = 0;
    for (let i = 0; i < before.length; i += 4) {
      if (before[i] !== after[i] || before[i + 1] !== after[i + 1] || before[i + 2] !== after[i + 2]) changed++;
    }
    return changed / (after.length / 4);
  })()`);
  assert.ok(changed > 0.01, "the field must visibly change the rigid-body scene");
  if (phone) {
    const screenshot = await send("Page.captureScreenshot", { format: "png" });
    await writeFile(resolve(projectDir, "build/singularity-phone-chrome.png"), screenshot.data, "base64");
  }
  const gesture = await evaluate(send, `(() => {
    const transport = window.__dolly.transport, original = transport.pushPointer;
    window.__graphicsPointerActions = [];
    transport.pushPointer = function(x, y, action, event) {
      window.__graphicsPointerActions.push(action);
      return original.call(this, x, y, action, event);
    };
    window.__restoreGraphicsPointer = () => { transport.pushPointer = original; };
    const bounds = document.querySelector('#display').getBoundingClientRect();
    return { x: bounds.x + bounds.width * 0.5, y: bounds.y + bounds.height * 0.4 };
  })()`);
  try {
    await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...gesture, id: 1 }] });
    for (let i = 1; i <= 4; ++i) {
      await send("Input.dispatchTouchEvent", { type: "touchMove",
        touchPoints: [{ x: gesture.x + i * 12, y: gesture.y + i * 8, id: 1 }] });
    }
    await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const actions = await evaluate(send, "window.__graphicsPointerActions");
    assert.equal(actions[0], 1);
    assert.ok(actions.includes(2), "touch drag must reach graphics, not terminal scrolling");
    assert.equal(actions.at(-1), 0);
  } finally {
    await evaluate(send, "window.__restoreGraphicsPointer(); delete window.__restoreGraphicsPointer; delete window.__graphicsPointerActions");
  }
  if (phone) {
    const exit = await evaluate(send, `(() => {
      const canvas = document.querySelector('#display'), bounds = canvas.getBoundingClientRect();
      return { x: bounds.x + (16 + 4.5 * Math.floor((canvas.width - 32) / 5)) * bounds.width / canvas.width,
        y: bounds.y + (canvas.height - 37) * bounds.height / canvas.height };
    })()`);
    await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...exit, id: 1 }] });
    await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    assert.equal(await evaluate(send, "window.__dolly.key('q', 'KeyQ')"), true);
  }
  assert.deepEqual(
    await waitForValue(
      send,
      "window.__graphicsResult",
      (value) => value !== null,
      "graphics-demo normal release",
      200,
    ),
    { status: 0 },
  );
  assert.equal(await evaluate(send, "window.__dolly.graphicsActive"), false);
  assert.equal(
    await evaluate(
      send,
      "window.__dolly.submit('echo GRAPHICS-RESTORED > graphics-restored.txt')",
    ),
    0,
  );

  await evaluate(
    send,
    `window.__graphicsInterruptResult = null;
     window.__dolly.submit("graphics-demo").then(
       status => { window.__graphicsInterruptResult = { status }; },
       error => { window.__graphicsInterruptResult = { error: String(error) }; },
     ); true`,
  );
  await waitForValue(
    send,
    "window.__dolly.graphicsActive",
    (value) => value === true,
    "interruptible graphics framebuffer ownership",
    200,
  );
  await dispatchKey(send, { key: "c", code: "KeyC", modifiers: 2, windowsVirtualKeyCode: 67 });
  assert.deepEqual(
    await waitForValue(
      send,
      "window.__graphicsInterruptResult",
      (value) => value !== null,
      "graphics-demo SIGINT restoration",
      200,
    ),
    { status: 130 },
  );
  assert.equal(await evaluate(send, "window.__dolly.graphicsActive"), false);
  assert.equal(
    await evaluate(
      send,
      "window.__dolly.submit('grep -q GRAPHICS-RESTORED graphics-restored.txt')",
    ),
    0,
    "terminal or filesystem did not survive forced graphics restoration",
  );
  const performanceAfterGraphics = await measureShellBatch(
    send,
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
    `browser: ${phone ? "portrait/Wasm EXIT button" : "desktop/Q"} graphics, finite frames, gravity, touch drag and Ctrl-C; post-framebuffer command batch ${performanceAfterGraphics.milliseconds}ms/` +
    `${performanceAfterGraphics.frames} frames; before ` +
    `${performanceBeforeGraphics.milliseconds}ms/${performanceBeforeGraphics.frames} frames`,
  );
}

async function enterRecoveryShell(send) {
  if (selectedImage === "rts-arena") {
    await evaluate(send, `window.__dolly.waitForInteractiveTerminal(/Choose \\[1\\]:/, "RTS launcher")`);
    await inputText(send, "5\n");
    return evaluate(send, `window.__dolly.waitForInteractiveTerminal(/(?:^|\\n)dolly:[^\\n]*\\$\\s*$/, "RTS shell")`);
  }
  if (JSON.stringify(selectedGraph.root.entry) === JSON.stringify(["/bin/foreground", "-i", "/bin/slop"])) {
    return evaluate(send,
      `window.__dolly.waitForInteractiveTerminal(/(?:^|\\n)dolly:[^\\n]*\\$\\s*$/, "runtime image Slop prompt")`);
  }
  let entryPid;
  if (["gamedev", "gamedev-phone", "bhop"].includes(selectedImage)) {
    entryPid = await waitForValue(
      send,
      "window.__dolly?.graphicsActive ? window.__dolly.foregroundPid : 0",
      (value) => value > 0,
      "gamedev entry display lease",
      200,
    );
    assert.equal(
      await evaluate(send, "window.__dolly.key('q', 'KeyQ')"),
      true,
    );
  } else if (selectedImage === "codex") {
    await waitForTerminalText(send, /Sign in with ChatGPT/, "Codex entry sign-in TUI", 1200);
    entryPid = await evaluate(send, "window.__dolly.foregroundPid");
    await send("Page.bringToFront");
    await dispatchKey(send, { key: "c", code: "KeyC", modifiers: 2, windowsVirtualKeyCode: 67 });
  } else {
    entryPid = await evaluate(send,
      `window.__dolly.waitForInteractiveTerminal(${["pi", "python-pi", "pi-local", "dollyfile-studio"].includes(selectedImage)
        ? "/Bash is not installed|Dollyfile Studio.*dolly-hello/" : "/(?:^|\\n)dolly:[^\\n]*\\$\\s*$/"}, "image entry terminal")`);
    await dispatchKey(send, {
      key: "d",
      code: "KeyD",
      modifiers: 2,
      windowsVirtualKeyCode: 68,
    });
  }
  return evaluate(send,
    `window.__dolly.waitForInteractiveTerminal(
      /Dolly: image entry exited; entering the recovery Slop shell\\.[\\s\\S]*\\ndolly:[^\\n]*\\$\\s*$/,
      "recovery Slop prompt", ${entryPid})`);
}

async function neovimEx(send, command) {
  await dispatchKey(send, {key: ":", code: "Semicolon", modifiers: 8, text: ":"});
  await inputText(send, command);
  await dispatchKey(send, {key: "Enter", code: "Enter", windowsVirtualKeyCode: 13});
}

let neovimShellSequence = 0;
async function neovimShell(send, command) {
  const marker = `DOLLY-SHELL-${++neovimShellSequence}:`;
  await neovimEx(send, `lua vim.fn.system(${JSON.stringify(command)}); print('${marker}' .. vim.v.shell_error)`);
  const text = await waitForTerminalText(send, new RegExp(`${marker}([0-9]+)`), "Neovim shell status", 600);
  await clearTerminalSelection(send);
  return Number(text.match(new RegExp(`${marker}([0-9]+)`))[1]);
}

async function visibleTerminalText(send) {
  return evaluate(send, "window.__dolly.visibleTerminalText()");
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
let chromeDiagnostics = "";
let debuggerClient;
let ephemeralProfileRoot = null;
let persistentProfile = null;
let userDataDir = null;
try {
if (gitTransportMode) gitTransportFixture = createGitTransportFixture();
const address = server.address();
if (pagesLiveMode &&
    (externalPage === undefined ||
     !/^https:\/\/[a-z0-9-]+\.github\.io\/[a-z0-9._/-]*$/i.test(externalPage))) {
  throw new Error("pages-live mode requires an HTTPS github.io DOLLY_BROWSER_PAGE");
}
const localOrigin = `http://${browserHostname}:${address.port}`;
const rebuildPath = `${iterationMode ? "custom" : selectedImage}/rebuild/`;
const menuPage = externalPage
  ? (externalPage.endsWith("/") ? externalPage : `${externalPage}/`)
  : `${localOrigin}${browserBase}`;
const rebuildPage = new URL(rebuildPath, menuPage).href;
const interactivePage = new URL(`${selectedImage}/`, menuPage).href;
if (realOpenRouterMode) console.log("browser: waiting for an OpenRouter key on standard input (not echoed)");
let openRouterSecret = realOpenRouterMode ? await readSecretLine() : "";
if (realOpenRouterMode && !/^sk-or-v1-[A-Za-z0-9_-]+$/.test(openRouterSecret)) {
  throw new Error("Pi OpenRouter mode requires one API key line on standard input");
}
const fixtureCredential = "Bearer sandbox-placeholder";
const fixturePolicy = {
  maxRequests: rtsLiveMode ? 1024 : 256,
  rules: [
    {
      origin: "https://auth.openai.com",
      path: "/oauth/token",
      methods: ["POST"],
    },
    {
      origin: localOrigin,
      pathPrefix: "/fixture/pi/",
      methods: ["POST"],
      credentialHeaders: ["authorization"],
    },
    {
      origin: localOrigin,
      pathPrefix: "/fixture/",
      methods: ["GET", "POST"],
    },
  ],
};
if (codexLoginMode) fixturePolicy.rules.unshift(...codexLoginRules);
if (codexMode) {
  fixturePolicy.rules.push({ origin: localOrigin, path: "/demo/v1/responses", methods: ["POST"] });
}
if (tokioMode) {
  for (const path of ["/tokio/stream", "/tokio/slow"]) {
    fixturePolicy.rules.push({ origin: localOrigin, path, methods: ["GET"] });
  }
}
if (rtsMode) fixturePolicy.rules.unshift({
  origin: localOrigin, path: "/fixture/rts/v1/chat/completions", methods: ["POST"],
  credentialHeaders: ["authorization"], maxRequestBytes: 16 * 1024 * 1024,
});
if (dollyfileParserMode) {
  for (const path of parserRecipes.keys()) {
    if (path.startsWith("/modules/")) fixturePolicy.rules.push({
      origin: new URL(interactivePage).origin, path, methods: ["GET"],
    });
  }
}
if (snapshotExportMode || requestedMode === "image-inventory-rebuild") {
  // Build tests permit the selected recipe's explicit upstream GETs only.
  for (const record of selectedGraph.records) for (const source of record.sources) {
    if (source.transport !== "url") continue;
    const url = new URL(source.location);
    fixturePolicy.rules.push({ origin: url.origin, path: url.pathname, methods: ["GET"] });
  }
}
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
if (rtsLiveMode && !rtsLiveConfiguration) fixturePolicy.rules.unshift({
  origin: "https://openrouter.ai", path: "/api/v1/models", methods: ["GET"],
  maxResponseBytes: 16 * 1024 * 1024,
}, {
  origin: "https://openrouter.ai", path: "/api/v1/key", methods: ["GET"], credentialHeaders: ["authorization"],
});
if (rtsLiveConfiguration) for (const provider of Object.values(rtsLiveConfiguration.providers)) {
  const url = new URL(provider.baseUrl);
  if (url.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(url.hostname) || provider.api !== "openai-codex-responses")
    throw Error("RTS subscription tests require an explicit loopback Codex relay");
  fixturePolicy.rules.unshift({ origin: url.origin, path: "/codex/responses", methods: ["POST"],
    credentialHeaders: ["authorization"], maxRequestBytes: 8 * 1024 * 1024, timeoutMilliseconds: 120000 });
}
const requestedProfile = process.env.DOLLY_BROWSER_PROFILE;
persistentProfile = requestedProfile;
browserDownloadDirectory = await mkdtemp(`${tmpdir()}/dolly-browser-downloads-`);
if (realOpenRouterMode || rtsLiveMode) {
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
chrome = spawn(chromeBinary, [
  ...(localModelMode ? ["--ozone-platform=x11"] : ["--headless=new"]),
  "--no-sandbox",
  ...(localCompatibilityMode ? ["--enable-unsafe-webgpu", "--use-angle=vulkan",
    "--enable-features=Vulkan,VulkanFromANGLE"] : localModelMode ? ["--ignore-gpu-blocklist", "--enable-unsafe-webgpu",
    "--enable-dawn-features=allow_unsafe_apis,vulkan_enable_f16_on_nvidia",
    "--disable-dawn-features=disallow_unsafe_apis", "--use-angle=vulkan",
    "--enable-webgpu-developer-features", "--use-webgpu-power-preference=default-high-performance",
    "--enable-features=Vulkan,VulkanFromANGLE,WebGPUDeveloperFeatures"] : ["--disable-gpu"]),
  "--remote-debugging-port=0",
  `--user-data-dir=${userDataDir}`,
  piDevelopmentMode || realOpenRouterMode ? "--window-size=1280,1120" : "--window-size=1280,800",
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
chrome.stderr.on("data", bytes => { chromeDiagnostics = (chromeDiagnostics + bytes.toString()).slice(-8000); });

  const debugPort = await waitForDebugger(chrome);
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
      ${pagesLiveMode || httpDefaultsMode
        ? ""
        : `globalThis.DOLLY_HTTP_POLICY = ${JSON.stringify(fixturePolicy)};`}
      ${iterationMode ? `
        if (!sessionStorage.getItem("dolly-custom-source")) sessionStorage.setItem("dolly-custom-source", ${JSON.stringify(iterationRecipe)});
        globalThis.__artifactReads = [];
        globalThis.__artifactFetches = [];
        performance.setResourceTimingBufferSize(4000);
        const get = IDBObjectStore.prototype.get;
        IDBObjectStore.prototype.get = function(key) {
          const request = get.call(this, key), store = this.name;
          request.addEventListener('success', () => {
            const value = request.result;
            globalThis.__artifactReads.push({ store, key, bytes: (value instanceof ArrayBuffer ? value : value?.bytes)?.byteLength ?? 0 });
          });
          return request;
        };
      ` : ""}
      globalThis.__dollyIncompleteBootstrapPaints = 0;
      globalThis.__dollyReusedArtifact = false;
      new MutationObserver(() => {
        const log = document.querySelector("#bootstrap-log");
        if (log?.textContent.includes("reusing local ")) {
          globalThis.__dollyReusedArtifact = true;
        }
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
        ${iterationMode ? `if (/\\.snapshot(?:\\.gz)?$/.test(target.pathname)) globalThis.__artifactFetches.push(target.pathname);` : ""}
        if (!${codexLoginMode} && target.href === "https://auth.openai.com/oauth/token") {
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
  if (codexLoginMode) await debuggerClient.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(${codexLoginFetch.toString()})(${JSON.stringify(localOrigin)});`,
  });
  const initialPage = sourceDownloadMode ? new URL("view/rust-sdk/modules/rust-sdk/", menuPage).href
    : debuggerDisconnectMode ? "about:blank" : customDollyfileMode
      ? new URL("custom/", menuPage).href : menuMode
      ? menuPage
      : snapshotExportMode || iterationMode || sessionRebuildMode || process.env.DOLLY_BROWSER_MODE === "image-inventory-rebuild"
      ? rebuildPage
      : interactivePage;
  console.log(`browser: ${requestedMode ?? "core"} ${initialPage}`);
  await debuggerClient.send("Page.navigate", { url: initialPage });

  browserProof: {
    if (sourceDownloadMode) {
      const send = debuggerClient.send;
      await waitForValue(send, `document.readyState === 'complete' && !!document.querySelector('a.source[href$="/static/rust/rust-sdk.tar.gz"]')`,
        value => value === true, "source viewer", 600);
      const point = await evaluate(send, `(() => {
        const link = document.querySelector('a.source[href$="/static/rust/rust-sdk.tar.gz"]');
        link.scrollIntoView(); const box = link.getBoundingClientRect();
        return {x: box.x + box.width / 2, y: box.y + box.height / 2};
      })()`);
      await send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", buttons: 1, clickCount: 1 });
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", buttons: 0, clickCount: 1 });
      let downloaded;
      for (let attempt = 0; attempt < 2400 && !downloaded; attempt++) {
        downloaded = await readFile(resolve(browserDownloadDirectory, "rust-sdk.tar.gz")).catch(() => null);
        if (!downloaded) await delay(50);
      }
      assert.ok(downloaded, `source download failed: ${await evaluate(send, "document.querySelector('[role=status]')?.textContent")}`);
      const expected = await readFile(resolve(distDirectory, "static/rust/rust-sdk.tar.gz"));
      assert.equal(downloaded.length, expected.length);
      assert.equal(createHash("sha256").update(downloaded).digest("hex"), createHash("sha256").update(expected).digest("hex"));
      console.log(`browser: source viewer downloaded the complete ${downloaded.length}-byte pinned Rust SDK archive`);
      break browserProof;
    }
    if (releaseCacheMode) {
      assert.ok(externalPage, "release-cache requires a published application URL");
      assert.equal(await waitForValue(debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus", value => ["ready", "failed"].includes(value), "release cache boot"), "ready");
      const reads = await evaluate(debuggerClient.send, `(async () => {
        const base = new URL('../', document.baseURI);
        if (!/_dolly\\/[0-9a-f]{64}\\/$/.test(base.pathname)) throw new Error('application assets are not release-pinned');
        performance.clearResourceTimings();
        performance.setResourceTimingBufferSize(1000);
        const reads = [];
        for (const name of ['dolly.mjs', 'dolly.wasm']) {
          const url = new URL('dist/' + name, base);
          for (let attempt = 0; attempt < 2; attempt++) {
            const response = await fetch(url);
            if (!response.ok) throw new Error(name + ': HTTP ' + response.status);
            const bytes = await response.arrayBuffer();
            const timing = performance.getEntriesByName(url.href).at(-1);
            reads.push({ name, attempt, bytes: bytes.byteLength, transferred: timing?.transferSize,
              cache: response.headers.get('cache-control') });
          }
        }
        return reads;
      })()`);
      console.log("browser: release cache reads", JSON.stringify(reads));
      for (const read of reads) {
        assert.ok(read.bytes > 0, read.name);
        assert.match(read.cache, /^public, max-age=31536000, immutable(?:, no-transform)?$/, read.name);
        if (read.attempt === 1) assert.equal(read.transferred, 0, `${read.name} transferred again`);
      }
      console.log("browser: release-pinned kernel loader and Wasm reused with zero network transfer");
      break browserProof;
    }
    if (imageBuildMode) {
      const send = debuggerClient.send;
      assert.equal(selectedImage, "dollyfile-studio");
      assert.equal(await waitForValue(send, "document.documentElement?.dataset.dollyStatus", value => ["ready", "failed"].includes(value), "Studio build boot"), "ready");
      await enterRecoveryShell(send);
      await runImageBuildProof({
        evaluate: expression => evaluate(send, expression),
        wait: (expression, predicate, label) => waitForValue(send, expression, predicate, label),
        submit: command => evaluate(send, `__dolly.submit(${JSON.stringify(command)})`),
        press: key => dispatchKey(send, key),
        pageCount: async () => (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json())
          .filter(target => target.type === "page").length,
        click: async selector => {
          const point = await evaluate(send, `(() => { const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
          await send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", buttons: 1, clickCount: 1 });
          await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", buttons: 0, clickCount: 1 });
        },
        openResult: async () => {
          let target;
          for (let i = 0; i < 100; i++) {
            const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
            target = targets.find(target => target.url && new URL(target.url).pathname.endsWith("/custom/run/"));
            if (target) break;
            await delay(50);
          }
          assert.ok(target, "no result tab opened");
          const client = await connectDebugger({ debugPort, target });
          await client.send("Runtime.enable");
          return {
            evaluate: expression => evaluate(client.send, expression),
            wait: (expression, predicate, label) => waitForValue(client.send, expression, predicate, label),
            close: async () => { await client.send("Page.close"); client.socket.close(); },
          };
        },
      });
      break browserProof;
    }
    if (customDollyfileMode) {
      const send = debuggerClient.send;
      const editor = new URL("custom/", menuPage).href;
      await waitForValue(send, "document.querySelector('#source')?.value ?? ''", Boolean, "Dollyfile editor");
      const original = await evaluate(send, "document.querySelector('#source').value");
      await evaluate(send, `document.querySelector('#source').value = 'DOLLY 2'; document.querySelector('form').requestSubmit(); true`);
      assert.match(await evaluate(send, "document.querySelector('#status').textContent"), /DOLLY 3/);
      assert.equal(await evaluate(send, "location.href"), editor);
      const scratch = await mkdtemp(resolve(tmpdir(), "dolly-custom-upload-"));
      try {
        const oversized = resolve(scratch, "oversized");
        await writeFile(oversized, "x".repeat(128 * 1024 + 1));
        await selectFile(send, "#dollyfile-upload", oversized);
        await waitForValue(send, "document.querySelector('#status').textContent", text => /128 KiB/.test(text), "oversize Dollyfile rejection");
        for (const file of [false, true]) {
          const template = file ? await readFile(resolve(projectDir, "src/studio/examples/tool.in"), "utf8") : original;
          const recipe = template.replace("@SYSTEM_SHA256@", original.match(/FROM HOST \/Dollyfile-system ([0-9a-f]{64})/)[1]);
          if (file) {
            await send("Page.navigate", { url: editor });
            await waitForValue(send, "document.querySelector('#source')?.value ?? ''", Boolean, "Dollyfile file input");
            const path = resolve(scratch, "Dollyfile");
            await writeFile(path, recipe);
            await selectFile(send, "#dollyfile-upload", path);
            await waitForValue(send, "document.querySelector('#source').value", value => value === recipe, "uploaded Dollyfile text");
          } else await evaluate(send, `document.querySelector('#source').value = ${JSON.stringify(recipe)}; true`);
          await evaluate(send, "document.querySelector('form').requestSubmit(); true");
          assert.equal(await waitForValue(send, "document.documentElement?.dataset.dollyStatus ?? ''",
            value => value === "ready" || value === "failed", "custom image build"), "ready");
          assert.equal(await evaluate(send, "location.pathname"), `${browserBase}custom/rebuild/`);
          await evaluate(send, `__dolly.waitForInteractiveTerminal(/(?:^|\\n)dolly:[^\\n]*\\$\\s*$/, 'custom shell')`);
          const command = file ? `test "$(hello agent)" = 'Hello, agent!'`
            : "grep -q 'Hello from your custom image' /usr/share/hello.txt";
          assert.equal(await evaluate(send, `__dolly.submit(${JSON.stringify(command)})`), 0);
        }
      } finally { await rm(scratch, { recursive: true, force: true }); }
      console.log("browser: invalid/oversize Dollyfiles refused; pasted and file-uploaded images build in Wasm, launch Slop and run a source-compiled command");
      break browserProof;
    }
    if (studioMode) {
      const send = debuggerClient.send;
      assert.equal(selectedImage, "dollyfile-studio");
      assert.equal(await waitForValue(send, "document.documentElement?.dataset.dollyStatus",
        value => value === "ready" || value === "failed", "Studio boot"), "ready");
      await waitForTerminalText(send, /Dollyfile Studio.*dolly-hello/, "Pi Studio starter prompts");
      await enterRecoveryShell(send);
      const submit = command => evaluate(send, `__dolly.submit(${JSON.stringify(command)})`);
      assert.equal(await submit("test -f /workspace/Dollyfile && dollyfile-lint /workspace/Dollyfile"), 0);
      assert.equal(await submit("dollyfile-lint /usr/share/dollyfile-studio/examples/Dollyfile-tool"), 0);
      assert.equal(await submit("printf 'DOLLY 2\\n' | dollyfile-lint --stdin Draft"), 1);
      for (const suffix of ["$&", "$$", "$'", "$`", "東京"]) {
        const label = `Dollyfile-${suffix}`;
        assert.equal(await submit(`message=$(printf 'DOLLY 3\\n' | dollyfile-lint --stdin ${shellQuote(label)} 2>&1); status=$?; test "$status" = 1 && test "$message" = ${shellQuote(`${label}:1: missing IMAGE or MODULE`)}`), 0);
      }
      assert.equal(await submit("test -f /home/dolly/.pi/agent/skills/dollyfiles/SKILL.md && test -f /home/dolly/.pi/agent/extensions/browser-model-providers.js"), 0);
      try {
        assert.equal(await submit('base=$(cat /etc/dolly/host.base); curl -f "${base}modules/quickjs.dm" -o /tmp/studio-host-module.dm && curl -f "${base}static/default/quickjs.tar" -o /tmp/studio-host-source.tar'), 0);
        assert.equal(await submit("hash=$(sha256sum /tmp/studio-host-source.tar | awk '{print $1}'); grep -q $hash /tmp/studio-host-module.dm"), 0);
        assert.equal(await submit('base=$(cat /etc/dolly/host.base); curl -f "${base}static/default/runtimes/quickjs-main.c" -o /tmp/studio-host-source.c && grep -q dolly_quickjs_run /tmp/studio-host-source.c'), 0);
      } finally { await submit("rm -f /tmp/studio-host-module.dm /tmp/studio-host-source.tar /tmp/studio-host-source.c"); }
      const source = await readFile(resolve(projectDir, "test/fixtures/studio-nvim.lua"), "utf8");
      assert.equal(await submit(`printf '%s\\n' ${source.trimEnd().split("\n").map(shellQuote).join(" ")} > /tmp/studio-nvim.lua`), 0);
      try {
        assert.equal(await submit("timeout 60 nvim --headless -n -i NONE -S /tmp/studio-nvim.lua"), 0);
      } finally { await submit("rm -f /tmp/studio-nvim.lua /tmp/Dollyfile-studio-lint"); }
      await submit("printf '\\033[2J\\033[H'");
      await evaluate(send, `(() => {
        window.__studioEditorStatus = null;
        __dolly.submit('nvim /workspace/Dollyfile').then(status => { window.__studioEditorStatus = status; });
      })()`);
      await waitForTerminalText(send, /DOLLY 3/, "Studio editor recipe");
      await clearTerminalSelection(send);
      await typeText(send, "G");
      const yellowOnLine = row => evaluate(send, `(() => {
        const { paddingX, paddingY, cellWidth, cellHeight } = __dolly.transport.geometry();
        const pixels = document.querySelector('#display').getContext('2d').getImageData(
          paddingX, paddingY + ${row} * cellHeight, cellWidth * 20, cellHeight).data;
        let count = 0;
        for (let i = 0; i < pixels.length; i += 4)
          if (pixels[i] === 242 && pixels[i + 1] === 212 && pixels[i + 2] === 92) count++;
        return count;
      })()`);
      assert.ok(await yellowOnLine(0) > 10, "DOLLY is visibly highlighted on the canvas");
      assert.ok(await yellowOnLine(5) > 10, "FILE is visibly highlighted on the canvas");
      assert.equal(await yellowOnLine(6), 0, "FILE body remains plain text");
      await typeText(send, "gg$a0");
      await dispatchKey(send, { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      await waitForTerminalText(send, /! .*DOLLY 3/, "visible automatic lint error without saving");
      await clearTerminalSelection(send);
      const errorScreenshot = await send("Page.captureScreenshot", { format: "png" });
      await writeFile(resolve(projectDir, "build/studio-nvim-error.png"), errorScreenshot.data, "base64");
      await typeText(send, "$x");
      await waitForValue(send, "__dolly.visibleTerminalText()", text => !/! .*DOLLY 3/.test(text), "correcting a recipe clears its error");
      await clearTerminalSelection(send);
      const screenshot = await send("Page.captureScreenshot", { format: "png" });
      await writeFile(resolve(projectDir, "build/studio-nvim-colors.png"), screenshot.data, "base64");
      await neovimEx(send, "q!");
      assert.equal(await waitForValue(send, "window.__studioEditorStatus", value => value !== null, "Studio editor quit"), 0);
      console.log("browser: Studio launches Pi with prompts; examples lint with literal filenames; Neovim visibly highlights directives and automatically displays/clears unsaved lint errors, then returns to Slop");
      break browserProof;
    }
    if (uploadMode) {
      const send = debuggerClient.send;
      assert.equal(await waitForValue(send, "document.documentElement?.dataset.dollyStatus",
        value => value === "ready" || value === "failed", "upload image boot"), "ready");
      await enterRecoveryShell(send);
      await runUploadProof({ send, evaluate: expression => evaluate(send, expression),
        wait: (expression, predicate, label, attempts) => waitForValue(send, expression, predicate, label, attempts),
        submit: command => evaluate(send, `__dolly.submit(${JSON.stringify(command)})`),
        press: key => dispatchKey(send, key) });
      console.log("browser: user-approved binary/empty uploads, no overwrite, picker cancellation, Ctrl-C and scratch cleanup passed");
      break browserProof;
    }
    if (localCacheMode) {
      assert.equal(await waitForValue(debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        value => value === "ready" || value === "failed", "local cache UI boot", 1200), "ready");
      await runLocalMenuProof(expression => evaluate(debuggerClient.send, expression),
        key => dispatchKey(debuggerClient.send, key), debuggerClient.send);
      const screenshot = await debuggerClient.send("Page.captureScreenshot", { format: "png" });
      await writeFile(resolve(projectDir, "build/local-model-menu.png"), screenshot.data, "base64");
      await runLocalCacheProof(expression => evaluate(debuggerClient.send, expression));
      break browserProof;
    }
    if (localModelMode) {
      assert.equal(await waitForValue(debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        value => value === "ready" || value === "failed", "local model boot", 1200), "ready");
      await enterRecoveryShell(debuggerClient.send);
      if (studioModelMode) assert.equal(selectedImage, "dollyfile-studio");
      await (localCompatibilityMode ? runLocalCompatibilityProof : studioModelMode ? runStudioModelProof : runLocalModelProof)({
        modelId: process.env.DOLLY_STUDIO_MODEL,
        evaluate: expression => evaluate(debuggerClient.send, expression),
        press: key => dispatchKey(debuggerClient.send, key),
        wait: (expression, predicate, description, attempts) => waitForValue(debuggerClient.send, expression, predicate, description, attempts),
        submit: command => evaluate(debuggerClient.send, `window.__dolly.submit(${JSON.stringify(command)})`),
        setOffline: async offline => {
          await debuggerClient.send("Network.enable");
          await debuggerClient.send("Network.emulateNetworkConditions", {
            offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
          });
        },
      });
      const screenshot = await debuggerClient.send("Page.captureScreenshot", { format: "png" });
      await writeFile(resolve(projectDir, "build/local-model-browser.png"), screenshot.data, "base64");
      break browserProof;
    }
    if (bhopMode) {
      const send = debuggerClient.send;
      assert.equal(selectedImage, "bhop");
      assert.equal(await waitForValue(send, "document.documentElement?.dataset.dollyStatus",
        value => value === "ready" || value === "failed", "Airtime boot"), "ready");
      await enterRecoveryShell(send);
      const submit = command => evaluate(send, `window.__dolly.submit(${JSON.stringify(command)})`);
      assert.equal(await submit("make -f /usr/src/dolly/bhop/bhop.mk check"), 0);
      for (const [args, expected] of [["--frames 12", 0], ["--frames 0", 2], ["--frames -1", 2]]) {
        assert.equal(await submit(`bhop ${args}`), expected);
      }
      await evaluate(send, `window.__bhopResult = null;
        window.__dolly.submit('bhop').then(status => { window.__bhopResult = status; }); true`);
      await waitForValue(send, "window.__dolly.graphicsActive", value => value === true, "Airtime display lease");
      await delay(200);
      assert.equal(await evaluate(send, "document.pointerLockElement"), null, "a Wasm request must not automatically capture input");
      await evaluate(send, "document.querySelector('#display').dispatchEvent(new PointerEvent('pointerdown', {button: 0}))");
      assert.equal(await evaluate(send, "document.pointerLockElement"), null, "synthetic page input must not grant capture");
      const point = await evaluate(send, `(() => {
        const bounds = document.querySelector('#display').getBoundingClientRect();
        return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
      })()`);
      const click = async () => {
        await send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", buttons: 1, clickCount: 1 });
        await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", buttons: 0, clickCount: 1 });
        await waitForValue(send, "document.pointerLockElement?.id", value => value === "display", "click-to-capture mouse");
        const frame = await evaluate(send, "Number(document.documentElement.dataset.frameSequence)");
        await waitForValue(send, "Number(document.documentElement.dataset.frameSequence)",
          value => value >= frame + 2, "game consumes capture before held movement keys");
      };
      await click();
      await evaluate(send, `(() => {
        const transport = window.__dolly.transport, original = transport.pushPointerMotion;
        window.__bhopMotion = [];
        transport.pushPointerMotion = function(event) {
          window.__bhopMotion.push([event.movementX, event.movementY, event.buttons]);
          return original.call(this, event);
        };
        window.__bhopRestoreMotion = () => { transport.pushPointerMotion = original; };
      })()`);
      try {
        await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x + 80, y: point.y + 35, buttons: 0 });
        await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point, buttons: 0 });
        const motion = await waitForValue(send, "window.__bhopMotion", value => value?.length >= 2, "relative motion without a held mouse button");
        assert.ok(motion.some(([x, y, buttons]) => (x || y) && buttons === 0));
        assert.ok(motion.some(([x]) => x < 0), "relative motion must preserve negative deltas");
      } finally { await evaluate(send, "window.__bhopRestoreMotion(); delete window.__bhopRestoreMotion"); }
      await send("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
      await delay(900);
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
      for (const deltaY of [-100, 100]) {
        await send("Input.dispatchMouseEvent", { type: "mouseWheel", ...point, deltaX: 0, deltaY });
        await delay(900);
      }
      const floorFraction = await evaluate(send, `(() => {
        const canvas = document.querySelector('#display');
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let floor = 0;
        for (let y = Math.ceil(canvas.height * 0.55); y < canvas.height * 0.8; y++) {
          for (let x = 0; x < canvas.width; x++) {
            const i = (y * canvas.width + x) * 4;
            if (pixels[i] > 150 && pixels[i + 1] > 150 && pixels[i + 2] > 150) floor++;
          }
        }
        return floor / (canvas.width * canvas.height);
      })()`);
      assert.ok(floorFraction > 0.08, `the starting platform disappeared after camera motion: ${floorFraction}`);
      const shot = await send("Page.captureScreenshot", { format: "png" });
      await writeFile(resolve(projectDir, "build/bhop-firstperson.png"), shot.data, "base64");
      await dispatchKey(send, { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      await waitForValue(send, "document.pointerLockElement", value => value === null, "Escape releases mouse capture");
      assert.equal(await evaluate(send, "window.__bhopResult"), null, "Escape pauses rather than kills the game");
      // Chrome imposes a short recapture cooldown after Escape, even for a new click.
      await delay(1300);
      assert.equal(await evaluate(send, "document.pointerLockElement"), null, "the game must not recapture without a new click");
      await click();
      await dispatchKey(send, { key: "q", code: "KeyQ", windowsVirtualKeyCode: 81 });
      assert.equal(await waitForValue(send, "window.__bhopResult", value => value !== null, "Airtime normal exit"), 0);
      await waitForValue(send, "document.pointerLockElement", value => value === null, "game exit releases captured mouse");
      const terminal = await evaluate(send, "window.__dolly.visibleTerminalText()");
      assert.match(terminal, /bhop: ticks=\d+ jumps=3 falls=0 pad=0/, "Space must jump once, followed by one jump in each wheel direction");
      assert.equal(await submit("echo BHOP-SURVIVED > bhop-survived.txt"), 0);
      await evaluate(send, `window.__bhopResult = null;
        window.__dolly.submit('bhop').then(status => { window.__bhopResult = status; }); true`);
      await waitForValue(send, "window.__dolly.graphicsActive", value => value === true, "second Airtime lease");
      await click();
      for (const section of [2, 3, 4]) {
        await dispatchKey(send, { key: String(section), code: `Digit${section}`, windowsVirtualKeyCode: 48 + section });
        await delay(400);
        const practice = await send("Page.captureScreenshot", { format: "png" });
        await writeFile(resolve(projectDir, `build/bhop-section-${section}.png`), practice.data, "base64");
      }
      await dispatchKey(send, { key: "c", code: "KeyC", modifiers: 2, windowsVirtualKeyCode: 67 });
      assert.equal(await waitForValue(send, "window.__bhopResult", value => value !== null, "Airtime cancellation"), 130);
      await waitForValue(send, "document.pointerLockElement", value => value === null, "cancellation releases captured mouse");
      assert.equal(await submit("grep -q BHOP-SURVIVED bhop-survived.txt"), 0);
      assert.equal(await submit("test ! -f /workspace/bhop-foundry-record.txt"), 0, "section practice cannot create a course record");
      let landing;
      for (const launch of [1450, 1350, 1550]) {
        await evaluate(send, `window.__bhopResult = null;
          window.__dolly.submit('bhop').then(status => { window.__bhopResult = status; }); true`);
        await waitForValue(send, "window.__dolly.graphicsActive", value => value === true, "playable course lease");
        await click();
        await send("Input.dispatchKeyEvent", { type: "keyDown", key: "w", code: "KeyW", modifiers: 0, windowsVirtualKeyCode: 87 });
        await delay(launch);
        await dispatchKey(send, { key: " ", code: "Space", windowsVirtualKeyCode: 32 });
        await delay(650);
        await send("Input.dispatchKeyEvent", { type: "keyUp", key: "w", code: "KeyW", modifiers: 0, windowsVirtualKeyCode: 87 });
        await delay(1000);
        await dispatchKey(send, { key: "q", code: "KeyQ", windowsVirtualKeyCode: 81 });
        assert.equal(await waitForValue(send, "window.__bhopResult", value => value !== null, "played course exit"), 0);
        const output = await evaluate(send, "window.__dolly.visibleTerminalText()");
        landing = [...output.matchAll(/bhop: ticks=(\d+) jumps=(\d+) falls=(\d+) pad=(\d+) peak=([\d.]+) speed=([\d.]+) collapses=(\d+)/g)].at(-1);
        console.log(`browser: Foundry launch ${launch}ms: ${landing?.[0] ?? output}`);
        if (landing && Number(landing[2]) >= 1 && Number(landing[4]) >= 1 && Number(landing[7]) >= 1) break;
      }
      assert.ok(landing && Number(landing[2]) >= 1 && Number(landing[4]) >= 1 && Number(landing[7]) >= 1,
        "real keyboard play must land on a small pad and trigger its collapse");
      console.log("browser: Airtime source-built movement checks, mouse capture/free look/Escape, Space and both wheel jumps, normal exit and Ctrl-C recovery passed");
      break browserProof;
    }
    if (debuggerDisconnectMode) {
      const pending = evaluate(debuggerClient.send, "new Promise(() => {})");
      await evaluate(debuggerClient.send, "true");
      const rejected = assert.rejects(pending, /Chrome debugger disconnected/);
      chrome.kill("SIGTERM");
      await rejected;
      await assert.rejects(evaluate(debuggerClient.send, "true"), /Chrome debugger disconnected/);
      console.log("browser: terminating Chrome rejects pending and subsequent debugger commands and cleans up");
      break browserProof;
    }
    if (rtsLauncherMode) {
      const send = debuggerClient.send;
      assert.equal(await waitForValue(send, "document.documentElement?.dataset.dollyStatus ?? ''",
        value => value === "ready" || value === "failed", "launcher image boot"), "ready");
      const terminal = text => evaluate(send, `window.__dolly.waitForInteractiveTerminal(new RegExp(${JSON.stringify(text + "[^\\n]*:\\s*$")}), "launcher prompt")`);
      const answer = async (prompt, value) => { await terminal(prompt); await inputText(send, value + "\n"); };
      const picker = title => evaluate(send, `window.__dolly.waitForInteractiveTerminal(new RegExp(${JSON.stringify(title)}), "fuzzy picker")`);
      const enter = () => dispatchKey(send, { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" });
      const escape = () => dispatchKey(send, { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      const screenshot = async name => writeFile(resolve(projectDir, `build/rts-launcher-${name}.png`),
        (await send("Page.captureScreenshot", { format: "png" })).data, "base64");
      await terminal("Choose");
      await screenshot("menu");
      const requests = await evaluate(send, "__dolly.httpRequestCount");
      await answer("Choose", "1");
      await waitForValue(send, "__dolly.graphicsActive", Boolean, "included replay without upload");
      await delay(4000);
      await screenshot("demo");
      await dispatchKey(send, { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      await waitForValue(send, "__dolly.graphicsActive", value => !value, "replay returns to launcher");
      await terminal("Choose");
      assert.equal(await evaluate(send, "__dolly.httpRequestCount"), requests, "bundled replay is offline");
      await answer("Choose", "4");
      await answer("Open file picker", "y");
      await waitForValue(send, "!!document.querySelector('#file-upload[open]')", Boolean, "relay file picker");
      const relayPath = resolve(browserDownloadDirectory, "models.json");
      await writeFile(relayPath, JSON.stringify({ providers: { "codex-local": {
        api: "openai-codex-responses", baseUrl: "http://127.0.0.1:9002", apiKey: "fixture-relay-capability",
        models: [{ id: "rts-vision-fixture", name: "Vision fixture", reasoning: true, input: ["text", "image"],
          thinkingLevelMap: { high: "high", xhigh: "xhigh", low: null }, contextWindow: 65536, maxTokens: 4096,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] } } }));
      await selectFile(send, "#file-upload input", relayPath);
      await terminal("Choose");
      assert.match(await visibleTerminalText(send), /Local Codex models imported/);
      await answer("Choose", "2");
      await picker("Player 1 provider");
      await inputText(send, "cdxl");
      await picker("1 / 1 matches");
      await screenshot("providers");
      await enter();
      await picker("Player 1 model");
      await inputText(send, "nonexistent");
      await picker("No matches");
      await enter();
      await picker("No matches");
      await dispatchKey(send, { key: "u", code: "KeyU", modifiers: 2, windowsVirtualKeyCode: 85 });
      await inputText(send, "rtsvsfx");
      await picker("1 / 1 matches");
      await screenshot("models");
      await escape();
      await picker("Player 1 provider");
      await enter();
      await picker("Player 1 model");
      await enter();
      await answer("Thinking", "high");
      await picker("Player 2 provider");
      await enter();
      await picker("Player 2 model");
      await enter();
      await answer("Thinking", "xhigh");
      await answer("Match seconds", "10");
      await answer("Reported USD limit", "0.25");
      await terminal("Start model calls");
      await screenshot("confirm");
      assert.equal(await evaluate(send, "__dolly.httpRequestCount"), requests, "picker and confirmation make no model calls");
      await answer("Start model calls", "n");
      await answer("Choose", "3");
      await terminal("API key");
      await inputText(send, "fixture-hidden-openrouter-key");
      await delay(300);
      assert.doesNotMatch(await visibleTerminalText(send), /fixture-hidden-openrouter-key/);
      await inputText(send, "\n");
      await terminal("Choose");
      assert.doesNotMatch(await visibleTerminalText(send), /fixture-hidden-openrouter-key|fixture-relay-capability/);
      await answer("Choose", "2");
      await picker("Player 1 provider");
      await inputText(send, "opnrtr");
      await picker("1 / 2 matches");
      await enter();
      await picker("Player 1 model");
      await screenshot("openrouter");
      assert.doesNotMatch(await visibleTerminalText(send), /\[text only\]/);
      await inputText(send, "gem fla");
      await picker("> gem fla");
      await screenshot("fuzzy-openrouter");
      const selected = async () => (await visibleTerminalText(send)).match(/^→ .+$/m)?.[0];
      const beforeArrow = await selected();
      assert.ok(beforeArrow, "fuzzy search highlights a matching model");
      await dispatchKey(send, { key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 });
      await picker("> gem fla");
      assert.notEqual(await selected(), beforeArrow, "Down changes the highlighted model");
      await dispatchKey(send, { key: "ArrowUp", code: "ArrowUp", windowsVirtualKeyCode: 38 });
      await picker("> gem fla");
      assert.equal(await selected(), beforeArrow, "Up restores the previous model");
      await escape();
      await picker("Player 1 provider");
      await escape();
      await answer("Choose", "5");
      await evaluate(send, `window.__dolly.waitForInteractiveTerminal(/(?:^|\\n)dolly:[^\\n]*\\$\\s*$/, "launcher shell")`);
      const check = `const fs=globalThis.__janisBuiltin("fs"); const dir=process.env.HOME+"/.pi/agent"; const auth=JSON.parse(fs.readFileSync(dir+"/auth.json","utf8")); if(auth.openrouter?.key!=="fixture-hidden-openrouter-key") throw Error("Pi credential store mismatch"); if(fs.readdirSync("/tmp").some(name=>name.startsWith("rts-relay-import-")||name.startsWith("dolly-rts-replay-"))) throw Error("launcher scratch leak"); console.log("RTS-LAUNCHER-OK");`;
      assert.equal(await evaluate(send, `__dolly.submit(${JSON.stringify("janis -e " + shellQuote(check))})`), 0);
      console.log("browser: baked offline replay, relay upload, live fuzzy provider/model search, arrows/Enter/Escape, vision filtering, confirmation, masked credentials and shell recovery passed");
      break browserProof;
    }
    if (rtsSplitReplayMode) {
      const send = debuggerClient.send;
      assert.equal(await waitForValue(send, "document.documentElement?.dataset.dollyStatus ?? ''",
        value => value === "ready" || value === "failed", "split replay image boot"), "ready");
      await enterRecoveryShell(send);
      const submit = command => evaluate(send, `__dolly.submit(${JSON.stringify(command)})`);
      const replayDirectory = process.env.DOLLY_RTS_REPLAY_BUNDLE ? "/workspace/rts-high-vs-xhigh" : "/usr/share/dolly/rts/rts-high-vs-xhigh";
      if (process.env.DOLLY_RTS_REPLAY_BUNDLE) {
        await evaluate(send, `window.__uploadResult = null; void __dolly.submit('upload /workspace/match.tar.gz').then(status => window.__uploadResult = status); true`);
        await waitForValue(send, "!!document.querySelector('#file-upload[open]')", Boolean, "match bundle picker");
        await selectFile(send, "#file-upload input", resolve(projectDir, process.env.DOLLY_RTS_REPLAY_BUNDLE));
        assert.equal(await waitForValue(send, "window.__uploadResult", value => value !== null, "match bundle upload"), 0);
        assert.equal(await submit("gzip -dc /workspace/match.tar.gz | tar -xf - -C /workspace"), 0);
      }
      assert.equal(await submit(`curl -fsS ${localOrigin}/fixture/rts-split-replay.mjs -o /tmp/rts-split-replay.mjs`), 0);
      const requests = await evaluate(send, "__dolly.httpRequestCount");
      await evaluate(send, `window.__replayResult = null; void __dolly.submit('janis -m /tmp/rts-split-replay.mjs ${replayDirectory}').then(status => window.__replayResult = status); true`);
      const phase = async name => {
        const result = await waitForValue(send,
          "({name:document.documentElement.dataset.downloadName, result:window.__replayResult})",
          value => value.name === `replay-${name}` || value.result !== null, `replay ${name}`, 2400);
        assert.equal(result.name, `replay-${name}`, `replay ended early (${result.result})`);
      };
      try {
        await phase("ready");
        await dispatchKey(send, { key: " ", code: "Space", windowsVirtualKeyCode: 32 });
        await phase("paused");
        const preview = await send("Page.captureScreenshot", { format: "png" });
        await writeFile(resolve(projectDir, "build/rts-split-replay-start.png"), preview.data, "base64");
        await dispatchKey(send, { key: " ", code: "Space", windowsVirtualKeyCode: 32 });
        for (let index = 0; index < 6; ++index) {
          await dispatchKey(send, { key: "=", code: "Equal", windowsVirtualKeyCode: 187 });
          await delay(200);
        }
        await delay(5000);
        const middle = await send("Page.captureScreenshot", { format: "png" });
        await writeFile(resolve(projectDir, "build/rts-split-replay-thinking.png"), middle.data, "base64");
        await phase("eof");
        const end = await send("Page.captureScreenshot", { format: "png" });
        await writeFile(resolve(projectDir, "build/rts-split-replay-end.png"), end.data, "base64");
        await dispatchKey(send, { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
        assert.equal(await waitForValue(send, "window.__replayResult", value => value !== null, "replay cleanup"), 0);
        assert.equal(await evaluate(send, "__dolly.httpRequestCount"), requests, "replay makes no network requests");
        assert.equal(await evaluate(send, "__dolly.graphicsActive"), false);
        await evaluate(send, `window.__replayResult = null; void __dolly.submit('rts-arena --replay ${replayDirectory}').then(status => window.__replayResult = status); true`);
        await waitForValue(send, "__dolly.graphicsActive", Boolean, "replay restarted for cancellation");
        await delay(1500);
        await dispatchKey(send, { key: "c", code: "KeyC", modifiers: 2, windowsVirtualKeyCode: 67 });
        assert.equal(await waitForValue(send, "window.__replayResult", value => value !== null, "Ctrl-C cancels replay"), 130);
        assert.equal(await evaluate(send, "__dolly.graphicsActive"), false);
        assert.equal(await submit("printf 'shell survived replay\\n'"), 0);
        console.log(await visibleTerminalText(send));
      } finally {
        if (await evaluate(send, "__dolly.graphicsActive"))
          await dispatchKey(send, { key: "c", code: "KeyC", modifiers: 2, windowsVirtualKeyCode: 67 });
        await waitForValue(send, "__dolly.graphicsActive", value => !value, "replay test releases display");
        console.log(await visibleTerminalText(send));
      }
      console.log("browser: continuous two-player replay, recorded thinking, pause/speed/EOF, no HTTP and shell recovery passed");
      break browserProof;
    }
    if (rtsReplayMode) {
      const send = debuggerClient.send;
      const replayFile = resolve(process.env.DOLLY_RTS_REPLAY_FILE ?? "build/rts-live-player1.rpl");
      const digest = createHash("sha256").update(await readFile(replayFile)).digest("hex");
      assert.equal(await waitForValue(send, "document.documentElement?.dataset.dollyStatus ?? ''",
        value => value === "ready" || value === "failed", "RTS replay image boot"), "ready");
      await enterRecoveryShell(send);
      const submit = command => evaluate(send, `__dolly.submit(${JSON.stringify(command)})`);
      await evaluate(send, `window.__uploadResult = null; void __dolly.submit('upload /workspace/review.rpl').then(status => window.__uploadResult = status); true`);
      await waitForValue(send, "!!document.querySelector('#file-upload[open]')", Boolean, "replay file picker");
      await selectFile(send, "#file-upload input", replayFile);
      assert.equal(await waitForValue(send, "window.__uploadResult", value => value !== null, "replay upload"), 0);
      assert.equal(await submit(`test "$(sha256sum /workspace/review.rpl | cut -d ' ' -f 1)" = ${digest}`), 0);
      await evaluate(send, `window.__replayResult = null; void __dolly.submit('seven-kingdoms -noaudio -win -replay /workspace/review.rpl').then(status => window.__replayResult = status); true`);
      await waitForValue(send, "__dolly.graphicsActive", Boolean, "normal-speed replay display");
      await delay(1000);
      const preview = await send("Page.captureScreenshot", { format: "png" });
      await writeFile(resolve(projectDir, "build/rts-replay-review.png"), preview.data, "base64");
      await dispatchKey(send, { key: "c", code: "KeyC", modifiers: 2, windowsVirtualKeyCode: 67 });
      assert.ok([0, 130].includes(await waitForValue(send, "window.__replayResult", value => value !== null, "replay cancellation")));
      await evaluate(send, `window.__replayResult = null; void __dolly.submit('seven-kingdoms -noaudio -win -speed 99 -replay /workspace/review.rpl').then(status => window.__replayResult = status); true`);
      for (let elapsed = 0; elapsed < 3600 && await evaluate(send, "window.__replayResult") === null; elapsed += 10) {
        await delay(10000);
        console.log(`browser: replay ${elapsed + 10}s`);
        if (await evaluate(send, "__dolly.graphicsActive")) {
          const screenshot = await send("Page.captureScreenshot", { format: "png" });
          await writeFile(resolve(projectDir, "build/rts-replay-review.png"), screenshot.data, "base64");
        }
      }
      assert.equal(await evaluate(send, "window.__replayResult"), 0, "file replay exits normally");
      const output = await visibleTerminalText(send);
      assert.match(output, /RTS replay reached EOF at game frame [1-9]\d*/);
      assert.equal(await submit(`test "$(sha256sum /workspace/review.rpl | cut -d ' ' -f 1)" = ${digest}`), 0,
        "playback must not change the uploaded recording");
      console.log(output);
      console.log("browser: uploaded replay verified through native EOF; original bytes unchanged");
      break browserProof;
    }
    if (rtsLiveMode) {
      const send = debuggerClient.send;
      assert.equal(await waitForValue(send, "document.documentElement?.dataset.dollyStatus ?? ''",
        value => value === "ready" || value === "failed", "live RTS image boot"), "ready");
      await enterRecoveryShell(send);
      const submit = command => evaluate(send, `__dolly.submit(${JSON.stringify(command)})`);
      try {
        assert.equal(await submit(`mkdir /tmp/rts-live-agent; curl -fsS ${localOrigin}/fixture/rts-live.mjs -o /tmp/rts-live.mjs`), 0);
        const auth = JSON.stringify(rtsLiveConfiguration ? {} : { openrouter: { type: "api_key", key: openRouterSecret } });
        assert.equal(await submit(`printf %s ${shellQuote(auth)} > /tmp/rts-live-agent/auth.json`), 0);
        if (rtsLiveConfiguration) {
          assert.equal(await submit(`printf %s ${shellQuote(JSON.stringify(rtsLiveConfiguration))} > /tmp/rts-live-agent/models.json`), 0);
          assert.equal(await submit(`printf %s '{"transport":"sse"}' > /tmp/rts-live-agent/settings.json`), 0);
        } else assert.equal(await submit(`janis -m /tmp/rts-live.mjs prepare ${rtsLiveModels.map(model =>
          shellQuote(model.replace(/:(off|minimal|low|medium|high|xhigh|max|ultra)$/, ""))).join(" ")}`), 0);
        await submit("printf '\\033[2J\\033[3J\\033[H'");
        const command = `PI_CODING_AGENT_DIR=/tmp/rts-live-agent rts-arena ${rtsLiveModels.map(shellQuote).join(" ")} ${rtsLiveSeconds} ${rtsLiveDollars}`;
        await evaluate(send, `window.__liveResult = null; void __dolly.submit(${JSON.stringify(command)}).then(status => window.__liveResult = status); true`);
        for (let elapsed = 0; elapsed < rtsLiveSeconds + 90 && await evaluate(send, "window.__liveResult") === null; elapsed += 10) {
          await delay(10000);
          console.log(`browser: live RTS ${elapsed + 10}s, HTTP requests: ${await evaluate(send, "__dolly.httpRequestCount")}`);
          if (await evaluate(send, "__dolly.graphicsActive")) {
            const screenshot = await send("Page.captureScreenshot", { format: "png" });
            await writeFile(resolve(projectDir, "build/rts-live-chrome.png"), screenshot.data, "base64");
          }
        }
        const status = await evaluate(send, "window.__liveResult");
        assert.notEqual(status, null, "live match must stop at its time limit");
        const inspected = await submit("janis -m /tmp/rts-live.mjs inspect");
        const report = await visibleTerminalText(send);
        const secrets = rtsLiveConfiguration ? Object.values(rtsLiveConfiguration.providers).map(provider => provider.apiKey) : [openRouterSecret];
        assert.ok(secrets.every(secret => typeof secret === "string" && secret.length > 0 && !report.includes(secret)), "credential must not enter terminal output");
        console.log(report);
        const download = async name => {
          assert.match(name, /^(parts\.json|match-\d+\.part|player[12]\.rpl)$/);
          assert.equal(await submit(`download /tmp/rts-live-export/${name}`), 0);
          let bytes;
          for (let attempt = 0; attempt < 400 && !bytes; attempt++) {
            bytes = await readFile(resolve(browserDownloadDirectory, name)).catch(() => null);
            if (!bytes) await delay(25);
          }
          assert.ok(bytes, `live match export ${name} must download`);
          return bytes;
        };
        const parts = JSON.parse(await download("parts.json")), chunks = [];
        assert.ok(parts.length > 0 && parts.length <= 256, "bounded live match archive");
        for (const name of parts) chunks.push(await download(name));
        const archive = Buffer.concat(chunks);
        const exported = JSON.parse(archive); // Reassembly must preserve UTF-8 across chunk boundaries.
        assert.ok(secrets.every(secret => !archive.includes(Buffer.from(secret))), "credential must not enter match archive");
        await writeFile(resolve(projectDir, "build/rts-live-match.json"), archive);
        const matchNames = new Set(Object.keys(exported.files).map(name => name.split("/")[0]));
        assert.equal(matchNames.size, 1, "archive must contain exactly one match");
        const matchName = [...matchNames][0];
        for (const player of [1, 2]) {
          const replay = await download(`player${player}.rpl`);
          assert.equal(replay.subarray(0, 4).toString(), "7KRP", "native replay file header");
          assert.deepEqual(replay, Buffer.from(exported.files[`${matchName}/player${player}-game/NONAME.RPL`] ?? "", "base64"),
            "independent replay download matches the archived bytes");
          await writeFile(resolve(projectDir, `build/rts-live-player${player}.rpl`), replay);
        }
        for (const name of ["result.txt", "player1.jsonl", "player2.jsonl",
          "player1.events.jsonl", "player2.events.jsonl", "player1-game/NONAME.RPL", "player2-game/NONAME.RPL"])
          assert.ok(Buffer.from(exported.files[`${matchName}/${name}`] ?? "", "base64").length > 0,
            `downloaded archive is missing ${name}`);
        assert.equal(inspected, 0, "both live models must act and retain histories");
        assert.equal(status, 0, "live arena must exit cleanly");
        console.log("browser: live RTS provider histories, actions and replays verified and exported");
      } finally {
        if (await evaluate(send, "__dolly.graphicsActive")) {
          await dispatchKey(send, { key: "c", code: "KeyC", modifiers: 2, windowsVirtualKeyCode: 67 });
          await waitForValue(send, "__dolly.graphicsActive", value => !value, "live RTS cancellation");
        }
        await submit("rm -rf /tmp/rts-live-agent /tmp/rts-live.mjs /tmp/rts-live-export");
        openRouterSecret = "";
      }
      break browserProof;
    }
    if (rtsMode) {
      const send = debuggerClient.send;
      assert.equal(await waitForValue(send, "document.documentElement?.dataset.dollyStatus ?? ''",
        value => value === "ready" || value === "failed", "RTS image boot"), "ready");
      await enterRecoveryShell(send);
      const submit = command => evaluate(send, `__dolly.submit(${JSON.stringify(command)})`);
      try {
        assert.equal(await submit(`mkdir /tmp/rts-replay-test; curl -fsS ${localOrigin}/fixture/rts-match.mjs -o /tmp/rts-match.mjs`), 0);
        assert.equal(await submit("rts-arena --help"), 64, "compiled match command loads its real JavaScript entry");
        await evaluate(send, `window.__rtsResult = null; void __dolly.submit('seven-kingdoms -demo -noaudio -win -rnd 12345').then(status => window.__rtsResult = status); true`);
        const gameStart = await waitForValue(send, "({active: __dolly.graphicsActive, result: window.__rtsResult})",
          state => state.active || state.result !== null, "real game framebuffer", 1800);
        assert.equal(gameStart.active, true, `game exited before display: ${gameStart.result}`);
        await delay(3000);
        assert.equal(await evaluate(send, "window.__rtsResult"), null, "game must remain live before interruption");
        await dispatchKey(send, { key: "c", code: "KeyC", modifiers: 2, windowsVirtualKeyCode: 67 });
        assert.ok([0, 130].includes(await waitForValue(send, "window.__rtsResult", value => value !== null, "game cancellation")),
          "SDL may handle interrupted event polling as a clean quit");
        assert.equal(await evaluate(send, "__dolly.transport.graphicsActive()"), false);
        assert.equal(await submit("test -f /tmp/rts-match.mjs"), 0);
        await evaluate(send, `window.__matchResult = null; void __dolly.submit('janis -m /tmp/rts-match.mjs /tmp/rts-replay-test').then(status => window.__matchResult = status); true`);
        const matchStart = await waitForValue(send, "({active: __dolly.graphicsActive, result: window.__matchResult})",
          state => state.active || state.result !== null, "two-player spectator display", 2400);
        if (!matchStart.active) for (const name of ["training-key.png", "training-click.png"]) {
          if (await submit(`test -f /tmp/rts-replay-test/${name}`) !== 0) continue;
          assert.equal(await submit(`download /tmp/rts-replay-test/${name}`), 0);
          let bytes;
          for (let attempt = 0; attempt < 200 && !bytes; attempt++) {
            bytes = await readFile(resolve(browserDownloadDirectory, name)).catch(() => null);
            if (!bytes) await delay(25);
          }
          if (bytes) await writeFile(resolve(projectDir, `build/rts-${name}`), bytes);
        }
        assert.equal(matchStart.active, true, `match exited before display: ${matchStart.result}` +
          (matchStart.active ? "" : `\n${await visibleTerminalText(send)}`));
        await waitForValue(send, `(() => { const c = document.querySelector('canvas'); return c.width === 1600 && c.height === 972; })()`,
          Boolean, "two-player spectator geometry");
        const screenshot = await send("Page.captureScreenshot", { format: "png" });
        await writeFile(resolve(projectDir, "build/rts-match-chrome.png"), screenshot.data, "base64");
        assert.equal(await waitForValue(send, "window.__matchResult", value => value !== null, "two-player match proof"), 0);
        assert.equal(await evaluate(send, "__dolly.transport.graphicsActive()"), false);
        const replayMarker = `(() => { const c = document.querySelector('canvas');
          const pixels = c.getContext('2d').getImageData(5, 5, 100, 50).data;
          let hash = 2166136261; for (const byte of pixels) hash = Math.imul(hash ^ byte, 16777619);
          return hash >>> 0; })()`;
        for (const player of [1, 2]) {
          await evaluate(send, `window.__replayResult = null; void __dolly.submit('SKCONFIG=/tmp/rts-replay-test/player${player} seven-kingdoms -noaudio -win').then(status => window.__replayResult = status); true`);
          await waitForValue(send, "__dolly.graphicsActive", Boolean, "upstream replay menu");
          await delay(500);
          const menu = await evaluate(send, replayMarker);
          await dispatchKey(send, { key: "r", code: "KeyR", windowsVirtualKeyCode: 82 });
          await waitForValue(send, replayMarker, value => value !== menu, "recorded match starts playing");
          const replayScreenshot = await send("Page.captureScreenshot", { format: "png" });
          await writeFile(resolve(projectDir, `build/rts-replay-${player}.png`), replayScreenshot.data, "base64");
          await waitForValue(send, replayMarker, value => value === menu, "replay reaches EOF and returns to the main menu", 2400);
          assert.equal(await evaluate(send, "window.__replayResult"), null, "replay returns to the game menu, not a crashed process");
          await dispatchKey(send, { key: "c", code: "KeyC", modifiers: 2, windowsVirtualKeyCode: 67 });
          assert.ok([0, 130].includes(await waitForValue(send, "window.__replayResult", value => value !== null, "replay process cancellation")));
        }
        console.log("browser: real recruitment recorded by both engines; both upstream replays play to EOF");
        assert.equal(await submit("seven-kingdoms -noaudio -win -replay"), 64);
        assert.equal(await submit("seven-kingdoms -noaudio -win -replay /tmp/absent-replay.rpl"), 65);
        assert.equal(await submit("printf invalid > /tmp/rts-replay-test/invalid.rpl; seven-kingdoms -noaudio -win -replay /tmp/rts-replay-test/invalid.rpl"), 65);
        assert.equal(await submit("seven-kingdoms -noaudio -win -speed 99 -replay /tmp/rts-replay-test/player1/NONAME.RPL"), 0);
        assert.match(await visibleTerminalText(send), /RTS replay reached EOF at game frame [1-9]\d*/);
        await evaluate(send, `window.__replayResult = null; void __dolly.submit('SKCONFIG=/tmp/rts-replay-test/corrupt seven-kingdoms -noaudio -win').then(status => window.__replayResult = status); true`);
        await waitForValue(send, "__dolly.graphicsActive", Boolean, "corrupted replay menu");
        await delay(500);
        await dispatchKey(send, { key: "r", code: "KeyR", windowsVirtualKeyCode: 82 });
        assert.equal(await waitForValue(send, "window.__replayResult", value => value !== null, "replay checksum mismatch fails explicitly"), 74);
        assert.match(await visibleTerminalText(send), /RTS: game state synchronization failed/);
        assert.equal(await evaluate(send, "__dolly.graphicsActive"), false);
        console.log("browser: a damaged replay checksum is rejected, not silently played with divergent state");
        assert.equal(await submit("seven-kingdoms -noaudio -win -speed 99 -replay /tmp/rts-replay-test/corrupt/NONAME.RPL"), 74);
        console.log("browser: direct replay CLI handles EOF, missing/bad files and checksum rejection");
        const config = { providers: { openrouter: { baseUrl: `${localOrigin}/fixture/rts/v1`, api: "openai-completions",
          apiKey: "rts-fixture-only", models: ["rts-test-fast", "rts-test-slow"].map(id => ({ id, name: id,
            reasoning: true, input: ["text", "image"], contextWindow: 128000, maxTokens: 4096,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } })) } } };
        assert.equal(await submit(`mkdir /tmp/rts-pi-agent; printf %s ${shellQuote(JSON.stringify(config))} > /tmp/rts-pi-agent/models.json`), 0);
        await evaluate(send, `window.__piMatchResult = null; void __dolly.submit('PI_CODING_AGENT_DIR=/tmp/rts-pi-agent rts-arena rts-test-fast rts-test-slow 25').then(status => window.__piMatchResult = status); true`);
        const piStart = await waitForValue(send, "({active: __dolly.graphicsActive, result: window.__piMatchResult})",
          state => state.active || state.result !== null, "Pi match viewer");
        assert.equal(piStart.active, true, `Pi match exited before display: ${piStart.result}`);
        await delay(8000);
        const piScreenshot = await send("Page.captureScreenshot", { format: "png" });
        await writeFile(resolve(projectDir, "build/rts-pi-chrome.png"), piScreenshot.data, "base64");
        const piStatus = await waitForValue(send, "window.__piMatchResult", value => value !== null, "Pi match time limit", 2400);
        if (piStatus !== 0) {
          await submit(`janis -e ${shellQuote('const fs=globalThis.__janisBuiltin("fs"); for(const name of fs.readdirSync("/workspace/rts-matches")) for(const player of [1,2]) console.log(fs.readFileSync(`/workspace/rts-matches/${name}/player${player}.stderr.log`,"utf8"));')}`);
          console.log(await visibleTerminalText(send));
          await submit(`janis -e ${shellQuote('const fs=globalThis.__janisBuiltin("fs"); for(const name of fs.readdirSync("/workspace/rts-matches")) for(const player of [1,2]) console.log(fs.readFileSync(`/workspace/rts-matches/${name}/player${player}.events.jsonl`,"utf8"));')}`);
          console.log(await visibleTerminalText(send));
        }
        assert.equal(piStatus, 0);
        console.log(`browser: actual Pi sessions against scripted provider: ${JSON.stringify(rtsModelFixture.verify())}`);
        assert.equal(await submit(`curl -fsS ${localOrigin}/fixture/rts-history.mjs -o /tmp/rts-history.mjs; janis -m /tmp/rts-history.mjs`), 0);
        await evaluate(send, `window.__piMatchResult = null; void __dolly.submit('PI_CODING_AGENT_DIR=/tmp/rts-pi-agent rts-arena rts-test-fast rts-test-slow 25').then(status => window.__piMatchResult = status); true`);
        await waitForValue(send, "__dolly.graphicsActive", Boolean, "restarted Pi match");
        await delay(8000);
        assert.equal(await evaluate(send, "window.__piMatchResult"), null);
        await dispatchKey(send, { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
        assert.equal(await waitForValue(send, "window.__piMatchResult", value => value !== null, "Escape stops both Pi players and engines"), 0);
        assert.equal(await evaluate(send, "__dolly.graphicsActive"), false);
        assert.equal(await submit("janis -m /tmp/rts-history.mjs 'Viewer exited (0)'"), 0);
      } finally {
        if (await evaluate(send, "__dolly.graphicsActive")) {
          await dispatchKey(send, { key: "c", code: "KeyC", modifiers: 2, windowsVirtualKeyCode: 67 });
          await waitForValue(send, "__dolly.graphicsActive", value => !value, "failed RTS test releases its display");
        }
        await submit("rm -rf /tmp/rts-match.mjs /tmp/rts-history.mjs /tmp/rts-pi-agent /tmp/rts-replay-test");
      }
      console.log("browser: real RTS multiplayer, player-view separation, continuous simulation, sequential input, orderly stop/replay and foreground cancellation passed");
      break browserProof;
    }
    if (sdl2Mode) {
      const send = debuggerClient.send;
      assert.equal(await waitForValue(send, "document.documentElement?.dataset.dollyStatus ?? ''",
        value => value === "ready" || value === "failed", "SDL2 image boot"), "ready");
      await enterRecoveryShell(send);
      const submit = command => evaluate(send, `__dolly.submit(${JSON.stringify(command)})`);
      try {
        assert.equal(await submit(`mkdir /tmp/dolly-sdl2; curl -fsS ${localOrigin}/fixture/sdl2-probe.c -o /tmp/dolly-sdl2/probe.c; cc -O0 -I/usr/include/SDL2 /tmp/dolly-sdl2/probe.c -o /tmp/dolly-sdl2/probe -lSDL2 -lm`), 0);
        for (let i = 0; i < 2; ++i) assert.equal(await submit("/tmp/dolly-sdl2/probe"), 0);
        await evaluate(send, `window.__sdlResult = null; void __dolly.submit('/tmp/dolly-sdl2/probe input').then(status => window.__sdlResult = status); true`);
        await waitForValue(send, "__dolly.transport.graphicsActive()", Boolean, "SDL2 framebuffer lease");
        await waitForValue(send, `(() => { const c = document.querySelector('canvas');
          if (c.width !== 320 || c.height !== 240) return false;
          const x = c.getContext('2d'); return JSON.stringify([[80,60],[240,60],[80,180],[240,180]].map(([a,b]) => Array.from(x.getImageData(a,b,1,1).data))); })()`,
          value => value === '[[255,0,0,255],[0,255,0,255],[0,0,255,255],[255,255,255,255]]', "SDL2 RGB565 texture presentation");
        const box = await evaluate(send, `(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return {x:r.left+r.width/4,y:r.top+r.height/4}; })()`);
        await send("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", clickCount: 1, ...box });
        await send("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", clickCount: 1, ...box });
        await dispatchKey(send, { key: "a", code: "KeyA", windowsVirtualKeyCode: 65 });
        await dispatchKey(send, { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
        assert.equal(await waitForValue(send, "window.__sdlResult", value => value !== null, "SDL2 input completion"), 0);
        assert.equal(await evaluate(send, "__dolly.transport.graphicsActive()"), false);
        assert.equal(await submit("test -s /tmp/dolly-sdl2/probe.c"), 0);
        for (const name of ["input.cpp", "input.h", "arena.h", "rts-input-probe.cpp"])
          assert.equal(await submit(`curl -fsS ${localOrigin}/fixture/${name} -o /tmp/dolly-sdl2/${name}`), 0);
        assert.equal(await submit("mkdir /tmp/dolly-sdl2/player && c++ -O0 -I/usr/include/SDL2 /tmp/dolly-sdl2/input.cpp /tmp/dolly-sdl2/rts-input-probe.cpp -o /tmp/dolly-sdl2/rts-input-probe -lSDL2 -lz -lm && /tmp/dolly-sdl2/rts-input-probe"), 0);
        assert.equal(await evaluate(send, "__dolly.transport.graphicsActive()"), false, "offscreen player input must not acquire the browser display");
      } finally {
        if (await evaluate(send, "window.__sdlResult === null")) {
          await dispatchKey(send, { key: "c", code: "KeyC", modifiers: 2, windowsVirtualKeyCode: 67 });
          await waitForValue(send, "window.__sdlResult", value => value !== null, "SDL2 probe cancellation");
        }
        await submit("rm -rf /tmp/dolly-sdl2");
      }
      console.log("browser: SDL2 source build, RGB565 presentation, keyboard/click input, display restoration, offscreen ordered batches, PNG screenshots, invalid batches and held-input cancellation passed");
      break browserProof;
    }
    if (graphicsMode) {
      assert.ok(["gamedev", "gamedev-phone"].includes(selectedImage));
      assert.equal(await waitForValue(debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        value => value === "ready" || value === "failed", "gamedev boot"), "ready");
      await enterRecoveryShell(debuggerClient.send);
      await runGraphicsProof(debuggerClient.send);
      await debuggerClient.send("Emulation.setDeviceMetricsOverride", {
        width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
      });
      await debuggerClient.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
      await evaluate(debuggerClient.send, "dispatchEvent(new Event('resize'))");
      assert.equal(await evaluate(debuggerClient.send, "document.querySelector('#phone-menu')"), null);
      await runGraphicsProof(debuggerClient.send, true);
      break browserProof;
    }
    if (gitTransportMode) {
      assert.equal(await waitForValue(debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        value => value === "ready" || value === "failed", "Git transport boot", 1200), "ready");
      await enterRecoveryShell(debuggerClient.send);
      const submit = command => evaluate(debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(command)})`);
      await runGitTransport({ submit, origin: localOrigin, fixture: gitTransportFixture });
      console.log("browser: Git HTTP clone/fetch/push, large packs, shallow/deepen, remote rejection, lock cleanup and transfer cancellation/recovery passed");
      break browserProof;
    }
    if (libcurlContractMode) {
      assert.equal(await waitForValue(debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        value => value === "ready" || value === "failed", "libcurl contract boot", 1200), "ready");
      await enterRecoveryShell(debuggerClient.send);
      const submit = command => evaluate(debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(command)})`);
      const scratch = "/tmp/dolly-libcurl-contract-test";
      const source = await readFile(resolve(projectDir, "test/fixtures/libcurl-contract.c"), "utf8");
      try {
        assert.equal(await submit(`mkdir -p ${scratch}`), 0);
        assert.equal(await submit(`printf '%s\\n' ${source.trimEnd().split("\n").map(shellQuote).join(" ")} > ${scratch}/probe.c`), 0);
        const status = await submit(`cc -O0 ${scratch}/probe.c -lcurl -o ${scratch}/probe && timeout 20 ${scratch}/probe ${localOrigin}/fixture/pi/libcurl-contract`);
        assert.equal(status, 0, status === 0 ? undefined : await evaluate(debuggerClient.send, "window.__dolly.visibleTerminalText()"));
        assert.deepEqual(libcurlContractRequests, [
          { authorization: null, body: "payload" },
          { authorization: "Basic dXNlcjpwYXNz", body: "payload" },
          { authorization: null, body: "abc" },
          { authorization: null, body: "" },
          { authorization: null, body: "ab" },
          { authorization: null, body: "payload" },
          { authorization: null, body: "" },
        ], "protocol rejection must prevent HTTP, and authentication selection must change the actual request");
        await delay(100);
        assert.deepEqual(libcurlCancelledRequests, [
          { phase: "body", finished: false, closed: true },
          { phase: "header", finished: false, closed: true },
        ], "rejected callbacks must close the actual HTTP connections");
      } finally { await submit(`rm -rf ${scratch}`); }
      console.log("browser: libcurl rejects unavailable options, enforces protocol restrictions before HTTP, and preserves explicit authentication/callback state");
      break browserProof;
    }
    if (janisProcessMode) {
      assert.equal(await waitForValue(debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        value => value === "ready" || value === "failed", "Janis process boot", 1200), "ready");
      await enterRecoveryShell(debuggerClient.send);
      const submit = command => evaluate(debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(command)})`);
      const scratch = "/tmp/dolly-janis-process-test";
      const source = await readFile(resolve(projectDir, "test/fixtures/janis-process.mjs"), "utf8");
      try {
        assert.equal(await submit(`mkdir -p ${scratch}`), 0);
        assert.equal(await submit(`printf '%s\\n' ${source.trimEnd().split("\n").map(shellQuote).join(" ")} > ${scratch}/probe.mjs`), 0);
        assert.equal(await submit(`timeout 30 janis -m ${scratch}/probe.mjs ${scratch} ${localOrigin}`), 0);
        await delay(100);
        assert.equal(cancelledQueuedRequestSeen, false, "a cancelled queued fetch must never reach HTTP");
        assert.deepEqual(janisAbortRequests.map(({ path, finished, closed }) => [path.split("/").at(-1), finished, closed]),
          [["before", false, true], ["body", false, true], ["cancel", false, true]], "abort/cancel must close the actual HTTP connections");
      } finally { await submit(`rm -rf ${scratch}`); }
      console.log("browser: Janis real children, input/env/cwd, streaming, kill, child/HTTP abort and deadlines passed");
      break browserProof;
    }
    if (pythonProcessMode) {
      assert.equal(await waitForValue(debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        value => value === "ready" || value === "failed", "Python process boot", 1200), "ready");
      await enterRecoveryShell(debuggerClient.send);
      const submit = command => evaluate(debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(command)})`);
      const scratch = "/tmp/dolly-python-process-test";
      const source = await readFile(resolve(projectDir, "test/fixtures/python-process.py"), "utf8");
      try {
        assert.equal(await submit(`mkdir -p ${scratch}`), 0);
        assert.equal(await submit(`printf '%s\\n' ${source.trimEnd().split("\n").map(shellQuote).join(" ")} > ${scratch}/probe.py`), 0);
        assert.equal(await submit(`python ${scratch}/probe.py ${scratch}`), 0);
        const policySource = await readFile(resolve(projectDir, "test/fixtures/bonnie-policy.py"), "utf8");
        assert.equal(await submit(`printf '%s\\n' ${policySource.trimEnd().split("\n").map(shellQuote).join(" ")} > ${scratch}/policy.py`), 0);
        assert.equal(await submit(`python ${scratch}/policy.py /usr/lib/bonnie/bonnie.py ${scratch} --build`), 0,
          "Bonnie must pass image-configured settings to a real PEP 517 backend and clean its temporary state");
      } finally { await submit(`rm -rf ${scratch}`); }
      console.log("browser: Python children, streaming, cancellation and Bonnie's real PEP 517 policy/cleanup passed");
      break browserProof;
    }
    if (processLifecycleMode) {
      assert.equal(await waitForValue(debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        value => value === "ready" || value === "failed", "process lifecycle boot", 1200), "ready");
      const outerPid = await enterRecoveryShell(debuggerClient.send);
      const submit = command => evaluate(debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(command)})`);
      const scratch = "/tmp/dolly-process-lifecycle-test";
      const source = await readFile(resolve(projectDir, "test/fixtures/process-lifecycle.c"), "utf8");
      let lifecycleFailure;
      try {
        assert.equal(await submit(`mkdir -p ${scratch}`), 0);
        assert.equal(await submit(`printf '%s\\n' ${source.trimEnd().split("\n").map(shellQuote).join(" ")} > ${scratch}/probe.c`), 0);
        assert.equal(await submit(`cc -O0 -fno-sanitize-coverage ${scratch}/probe.c -o ${scratch}/probe && timeout 15 ${scratch}/probe`), 0);
        const descriptors = await readFile(resolve(projectDir, "test/fixtures/process-descriptors.c"), "utf8");
        assert.equal(await submit(`printf '%s\\n' ${descriptors.trimEnd().split("\n").map(shellQuote).join(" ")} > ${scratch}/descriptors.c`), 0);
        assert.equal(await submit(`cc -O0 -fno-sanitize-coverage ${scratch}/descriptors.c -o ${scratch}/descriptors && timeout 60 ${scratch}/descriptors`), 0);
        const signals = await readFile(resolve(projectDir, "test/fixtures/process-signals.c"), "utf8");
        assert.equal(await submit(`printf '%s\\n' ${signals.trimEnd().split("\n").map(shellQuote).join(" ")} > ${scratch}/signals.c`), 0);
        assert.equal(await submit(`cc -O0 -rdynamic ${scratch}/signals.c -o ${scratch}/signals && timeout 30 ${scratch}/signals ${scratch}`), 0);
        const childSignals = await readFile(resolve(projectDir, "test/fixtures/process-sigchld.c"), "utf8");
        assert.equal(await submit(`printf '%s\\n' ${childSignals.trimEnd().split("\n").map(shellQuote).join(" ")} > ${scratch}/sigchld.c`), 0);
        assert.equal(await submit(`cc -O0 ${scratch}/sigchld.c -o ${scratch}/sigchld && timeout 5 ${scratch}/sigchld`), 0);
        const tar = tarArchive("nested/message", Buffer.from("TAR-STDIN-OK\n"));
        const octal = bytes => [...bytes].map(byte => "\\" + byte.toString(8).padStart(3, "0")).join("");
        assert.equal(await submit(`printf '${octal(gzipSync(tar))}' > ${scratch}/input.tgz`), 0);
        assert.equal(await submit(`gzip -dc ${scratch}/input.tgz | tar -xf - -C ${scratch}`), 0);
        assert.equal(await submit(`test "$(cat ${scratch}/nested/message)" = TAR-STDIN-OK`), 0);
        let ignoreFinished = false;
        const ignoring = submit(`${scratch}/signals ${scratch} ignore-loop`).then(status => {
          ignoreFinished = true;
          return status;
        });
        await waitForTerminalText(debuggerClient.send, /SIGNAL-IGNORE-READY\s*$/, "signal-ignoring command ready");
        const interruptKey = {key: "c", code: "KeyC", modifiers: 2, windowsVirtualKeyCode: 67};
        await dispatchKey(debuggerClient.send, interruptKey);
        await new Promise(resolve => setTimeout(resolve, 50));
        assert.equal(ignoreFinished, false, "one Ctrl-C must honor SIG_IGN");
        await dispatchKey(debuggerClient.send, interruptKey);
        assert.equal(await ignoring, 130);
        assert.equal(await submit(`test -f ${scratch}/signal.lock && test ! -e ${scratch}/atexit`), 0);
        assert.equal(await submit(`git config --file ${scratch}/config user.email before && timeout 5 git config --file ${scratch}/config user.email after`), 0);
        if (selectedImage === "default") {
          const send = debuggerClient.send;
          const exitShell = () => dispatchKey(send, {
            key: "d", code: "KeyD", modifiers: 2, windowsVirtualKeyCode: 68,
          });
          const shellPrompt = '/(?:^|\\n)dolly:[^\\n]*\\$\\s*$/';
          const nestedCommand = async command => {
            const sequence = await evaluate(send, "window.__dolly.transport.currentResultSequence()");
            await inputText(send, `${command}\r`);
            assert.equal(await waitForCommandResult(send, sequence, command), 0);
          };
          try {
            for (const [name, rc] of [
              ["failed", "exit 7\n"],
              ["missing", null],
              ["directory", null],
              ["cancel", "printf 'DOLLY-INIT-RC-SLEEP\\n'\nsleep 30\nprintf 'DOLLY-INIT-RC-WRONG\\n'\n"],
            ]) {
              const home = `${scratch}/init-${name}`;
              assert.equal(await submit(`mkdir -p ${home}${name === "directory" ? "/.dollyrc" : ""}`), 0);
              if (rc !== null) assert.equal(await submit(`printf '%s\\n' ${rc.trimEnd().split("\n").map(shellQuote).join(" ")} > ${home}/.dollyrc`), 0);
              assert.equal(await submit("printf '\\033[2J\\033[H'"), 0);
              const marker = `DOLLY-INIT-OUTER-${name}`;
              // No pending submit promise: nested interactive shells publish
              // their own command results before the outer invocation exits.
              await inputText(send, `HOME=${home} timeout 45 /bin/foreground -i /bin/slop /etc/dolly/init.slop; printf '\\n${marker}=%s\\n' "$?"\r`);
              let cancelledAt;
              if (name === "cancel") {
                await waitForTerminalText(send, /DOLLY-INIT-RC-SLEEP/, "sleeping startup script", 200);
                await waitForValue(send, "window.__dolly.transport.foregroundInterruptible()",
                  Boolean, "interruptible startup script", 100);
                cancelledAt = Date.now();
                await dispatchKey(send, {
                  key: "c", code: "KeyC", modifiers: 2, windowsVirtualKeyCode: 67,
                });
              }
              const appPid = await evaluate(send,
                `window.__dolly.waitForInteractiveTerminal(${shellPrompt}, "nested image app", ${outerPid})`);
              if (cancelledAt !== undefined) assert.ok(Date.now() - cancelledAt < 10_000,
                "Ctrl+C must reach the app before the thirty-second startup sleep ends");
              const terminal = await visibleTerminalText(send);
              if (name === "failed") assert.match(terminal, /Dolly: .*\.dollyrc exited with status 7; continuing\./);
              else assert.doesNotMatch(terminal, /Dolly: .*\.dollyrc exited with status/);
              assert.doesNotMatch(terminal, /DOLLY-INIT-RC-WRONG/);
              await nestedCommand(`printf '%s\\n' app-${name} > "$HOME/proof"`);
              assert.equal(await evaluate(send,
                `window.__dolly.waitForInteractiveTerminal(${shellPrompt}, "usable nested image app")`), appPid);
              await exitShell();
              const recoveryPid = await evaluate(send,
                `window.__dolly.waitForInteractiveTerminal(
                  /Dolly: image entry exited; entering the recovery Slop shell\\.[\\s\\S]*\\ndolly:[^\\n]*\\$\\s*$/,
                  "nested image recovery", ${appPid})`);
              assert.notEqual(recoveryPid, outerPid);
              await nestedCommand(`test "$HOME" = ${home}`);
              assert.equal(await evaluate(send,
                `window.__dolly.waitForInteractiveTerminal(${shellPrompt}, "usable nested recovery")`), recoveryPid);
              await exitShell();
              await waitForValue(send, "window.__dolly.foregroundPid", pid => pid === outerPid,
                "outer shell restored after nested recovery", 200);
              await waitForTerminalText(send, new RegExp(`${marker}=0`), "nested init exit status", 100);
              assert.equal(await submit(`test "$(cat ${home}/proof)" = app-${name}`), 0);
            }
          } finally {
            // The ordinary timeout also bounds cleanup if a readiness assertion fails.
            await waitForValue(send,
              `window.__dolly.foregroundPid === ${outerPid} && !window.__dolly.transport.foregroundInterruptible()`,
              Boolean, "nested startup watchdog cleanup", 600);
          }
          console.log("browser: image-owned rc failure/missing/directory/cancellation and nested app/recovery/outer-shell lifecycle passed");
        }
      } catch (error) {
        lifecycleFailure = error;
        throw error;
      } finally {
        try { await submit(`rm -rf ${scratch}`); }
        catch (error) {
          if (!lifecycleFailure) throw error;
          console.error("browser: lifecycle scratch cleanup also failed:", error.message);
        }
      }
      console.log("browser: process PID/parent, wait, signal handlers/escalation, descriptor flags/inheritance/mappings and pipe cleanup passed");
      break browserProof;
    }
    if (janisFilesMode) {
      assert.equal(await waitForValue(debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        value => value === "ready" || value === "failed", "Janis filesystem boot", 1200), "ready");
      await enterRecoveryShell(debuggerClient.send);
      const submit = command => evaluate(debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(command)})`);
      const scratch = "/tmp/dolly-janis-files-test";
      const source = await readFile(resolve(projectDir, "test/fixtures/janis-files.mjs"), "utf8");
      try {
        assert.equal(await submit(`mkdir -p ${scratch} && echo target > ${scratch}/target && ln -s target ${scratch}/link && ln -s absent ${scratch}/dangling && ln -s keep-dir ${scratch}/directory-link`), 0);
        assert.equal(await submit(`printf '%s\\n' ${source.trimEnd().split("\n").map(shellQuote).join(" ")} > ${scratch}/probe.mjs`), 0);
        assert.equal(await submit(`janis -m ${scratch}/probe.mjs ${scratch}`), 0);
        const sessions = await readFile(resolve(projectDir, "test/fixtures/pi-sessions.mjs"), "utf8");
        assert.equal(await submit(`printf '%s\\n' ${sessions.trimEnd().split("\n").map(shellQuote).join(" ")} > ${scratch}/sessions.mjs`), 0);
        assert.equal(await submit(`janis -m ${scratch}/sessions.mjs ${scratch}`), 0);
        assert.equal(await submit("clear"), 0);
        await evaluate(debuggerClient.send, `globalThis.__resumeExit=null;
          void __dolly.submit('pi --session-dir ${scratch}/sessions').then(status=>{__resumeExit=status;}); true`);
        await waitForTerminalText(debuggerClient.send, /Bash is not installed|Dollyfile Studio.*dolly-hello/, "Pi restart");
        await clearTerminalSelection(debuggerClient.send);
        await inputText(debuggerClient.send, "/resume");
        await dispatchKey(debuggerClient.send, { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
        await waitForTerminalText(debuggerClient.send, /DOLLY-RESUME-PROOF-/, "Pi resume picker");
        await clearTerminalSelection(debuggerClient.send);
        await typeText(debuggerClient.send, '"DOLLY-RESUME-PROOF-11"');
        await waitForValue(debuggerClient.send, "__dolly.visibleTerminalText()",
          text => text.includes("DOLLY-RESUME-PROOF-11") && !text.includes("DOLLY-RESUME-PROOF-10"), "filtered Pi session");
        await clearTerminalSelection(debuggerClient.send);
        await dispatchKey(debuggerClient.send, { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
        await waitForTerminalText(debuggerClient.send, /resume reply 11/, "resumed Pi conversation");
        await clearTerminalSelection(debuggerClient.send);
        await dispatchKey(debuggerClient.send, { key: "d", code: "KeyD", modifiers: 2, windowsVirtualKeyCode: 68 });
        assert.equal(await waitForValue(debuggerClient.send, "__resumeExit", value => value !== null, "Pi quit after resume"), 0);
      } finally {
        if (await evaluate(debuggerClient.send, "globalThis.__resumeExit === null")) {
          await dispatchKey(debuggerClient.send, { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
          await dispatchKey(debuggerClient.send, { key: "c", code: "KeyC", modifiers: 2, windowsVirtualKeyCode: 67 });
          await dispatchKey(debuggerClient.send, { key: "d", code: "KeyD", modifiers: 2, windowsVirtualKeyCode: 68 });
          await waitForValue(debuggerClient.send, "__resumeExit", value => value !== null, "Pi stopped before cleanup");
        }
        await submit(`rm -rf ${scratch}`);
      }
      console.log("browser: Janis filesystem and Pi session save/list/reopen plus interactive /resume passed");
      break browserProof;
    }
    if (terminalUiMode) {
      assert.equal(await waitForValue(debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        value => value === "ready" || value === "failed", "terminal UI boot", 1200), "ready");
      await enterRecoveryShell(debuggerClient.send);
      const submit = command => evaluate(debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(command)})`);
      const scratch = "/tmp/dolly-terminal-ui-test";
      const source = await readFile(resolve(projectDir, "test/fixtures/terminal-ui.c"), "utf8");
      assert.equal(await submit(`mkdir -p ${scratch}`), 0);
      try {
        await clearTerminalSelection(debuggerClient.send);
        assert.equal(await submit("printf '\\033[48;2;20;22;27m\\033[2J\\033[HXX  XX\\033[K\\033[3;1H\\033[48;5;24mXX  XX\\033[K\\033[0m\\033[5;1H'"), 0);
        await delay(100);
        const backgrounds = await evaluate(debuggerClient.send, `(() => {
          const { paddingX, paddingY, cellWidth, cellHeight } = window.__dolly.transport.geometry();
          const context = document.querySelector('#display').getContext('2d');
          return [[0, 0], [2, 0], [10, 0], [10, 1], [0, 2], [2, 2], [10, 2]].map(([x, y]) =>
            [...context.getImageData(paddingX + x * cellWidth, paddingY + y * cellHeight, 1, 1).data]);
        })()`);
        assert.deepEqual(backgrounds, [
          ...Array(4).fill([20, 22, 27, 255]), ...Array(3).fill([0, 95, 135, 255]),
        ], "text, spaces and erased cells must share their RGB/palette background");
        assert.equal(await submit("printf '\\033[0m\\033[2J\\033[H'"), 0);
        assert.equal(await submit(`printf '%s\\n' ${source.trimEnd().split("\n").map(shellQuote).join(" ")} > ${scratch}/main.c && cc ${scratch}/main.c -o ${scratch}/probe`), 0);
        await evaluate(debuggerClient.send, `(() => {
          window.__terminalUiStatus = null;
          window.__dolly.submit('${scratch}/probe keys').then(status => {window.__terminalUiStatus = status});
        })()`);
        await waitForTerminalText(debuggerClient.send, /DOLLY-KEYS-READY/, "kitty keyboard probe");
        for (const [key, code] of [[":", "Semicolon"], ["A", "KeyA"], ["?", "Slash"], ["_", "Minus"]]) {
          await dispatchKey(debuggerClient.send, {key, code, modifiers: 8, text: key});
        }
        await dispatchKey(debuggerClient.send, {key: "Escape", code: "Escape", windowsVirtualKeyCode: 27});
        assert.equal(await waitForValue(debuggerClient.send, "window.__terminalUiStatus",
          value => value !== null, "shifted text and Escape in kitty keyboard mode", 100), 0);
        assert.equal(await submit(`${scratch}/probe discipline`), 0,
          "termios output flags must round-trip and control Ghostty's actual cursor position");
        const pythonTermios = await readFile(resolve(projectDir, "src/runtimes/cpython-termios.c"), "utf8");
        assert.equal(await submit(`printf '%s\\n' ${pythonTermios.trimEnd().split("\n").map(shellQuote).join(" ")} > ${scratch}/python-termios.c`), 0);
        assert.equal(await submit(`cc -Dtcgetattr=dolly_py_tcgetattr -Dtcsetattr=dolly_py_tcsetattr -Dioctl=dolly_py_ioctl ${scratch}/main.c ${scratch}/python-termios.c -o ${scratch}/python-probe`), 0);
        assert.equal(await submit(`${scratch}/python-probe discipline`), 0,
          "CPython's termios adapter must agree with the standard libc behavior");
        for (const argument of ["", "query", "partial"]) {
          assert.equal(await submit("printf '\\033[2J\\033[H'"), 0);
          await clearTerminalSelection(debuggerClient.send);
          await evaluate(debuggerClient.send, `(() => {
            window.__terminalUiStatus = null;
            window.__dolly.submit(${JSON.stringify(`${scratch}/probe ${argument}`)}).then(
              status => { window.__terminalUiStatus = status; });
          })()`);
          await waitForValue(debuggerClient.send,
            "window.__dolly.transport.foregroundInterruptible()", Boolean, "sleeping UI probe", 100);
          await delay(300);
          if (argument === "") await typeText(debuggerClient.send, "typed");
          else assert.equal(await evaluate(debuggerClient.send, "window.__dolly.input('typed')"), true);
          assert.equal(await evaluate(debuggerClient.send, "window.__dolly.paste('PASTED')"), true);
          const started = Date.now();
          const text = await waitForTerminalText(debuggerClient.send,
            argument === "partial" ? /DOLLY-UI-PRIMED/ : /DOLLY-UI-PREFIX/,
            "selection while child is sleeping with queued input", 20);
          assert.ok(Date.now() - started < 4000, "selection must not await the eight-second child");
          assert.doesNotMatch(text, /DOLLY-UI-DONE/);
          assert.equal(await evaluate(debuggerClient.send, "window.__terminalUiStatus"), null);
          if (argument === "") {
            // More than one ring's worth of UI events must recycle slots even
            // while an unread key or paste remains at the front.
            for (let batch = 0; batch < 24; ++batch) {
              assert.equal(await evaluate(debuggerClient.send, `(() => {
                for (let i = 0; i < 32; ++i) {
                  if (!window.__dolly.transport.pushScroll(i % 2 ? 0.001 : -0.001)) return false;
                }
                return true;
              })()`), true, "UI events must not accumulate behind unread input");
              await delay(30);
            }
          }
          await dispatchKey(debuggerClient.send, {
            key: "C", code: "KeyC", modifiers: 10, windowsVirtualKeyCode: 67,
          });
          await waitForValue(debuggerClient.send, "navigator.clipboard.readText()",
            text => text.includes("DOLLY-UI-PREFIX"), "copy while child sleeps", 20);
          assert.equal(await waitForValue(debuggerClient.send, "window.__terminalUiStatus",
            status => status !== null, "queued text/paste and terminal reply preserved", 150), 0);
        }
        await evaluate(debuggerClient.send, `(() => {
          window.__terminalUiStatus = null;
          window.__dolly.submit(${JSON.stringify(`${scratch}/probe lease`)}).then(
            status => { window.__terminalUiStatus = status; });
        })()`);
        await waitForValue(debuggerClient.send, "window.__dolly.graphicsActive",
          Boolean, "UI probe display lease", 100);
        assert.equal(await evaluate(debuggerClient.send, `(() => {
          const transport = window.__dolly.transport;
          return transport.pushPointer(20, 20, 1, {}) &&
            transport.pushPointer(40, 20, 2, {}) &&
            transport.pushPointer(40, 20, 0, {}) && transport.pushScroll(1);
        })()`), true);
        assert.equal(await waitForValue(debuggerClient.send, "window.__terminalUiStatus",
          status => status !== null, "graphics owner receives every UI event", 100), 0);
        assert.equal(await evaluate(debuggerClient.send, "window.__dolly.graphicsActive"), false);
      } finally {
        await waitForValue(debuggerClient.send, "window.__terminalUiStatus",
          status => status !== null, "UI probe finished before scratch cleanup", 150);
        await submit(`rm -rf ${scratch}`);
      }
      console.log("browser: selection/copy during sleeping children preserves queued text, paste and terminal-query replies; UI traffic recycles the bounded ring and remains exclusive to a graphics owner");
      break browserProof;
    }
    if (dollyfileParserMode) {
      assert.equal(await waitForValue(debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        value => value === "ready" || value === "failed", "Dollyfile parser boot", 1200), "ready");
      await enterRecoveryShell(debuggerClient.send);
      await runDollyfileCases(command => evaluate(debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(command)})`), localOrigin);
      console.log("browser: Dollyfile preserves quoted commands/CWD and literal ENV, fetches/executes rows sequentially, supports mixed/repeated modules and overwrites, captures completed exports, and rejects wrong export kinds");
      break browserProof;
    }
    if (cmakeMode) {
      assert.equal(await waitForValue(debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        value => value === "ready" || value === "failed", "CMake probe boot", 1200), "ready");
      await enterRecoveryShell(debuggerClient.send);
      const submit = command => evaluate(debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(command)})`);
      const run = async command => assert.equal(await submit(command), 0,
        await evaluate(debuggerClient.send, "window.__dolly.visibleTerminalText()"));
      const scratch = "/tmp/dolly-cmake-smoke";
      await run(`mkdir ${scratch}`);
      try {
        const sources = {
          "CMakeLists.txt": `cmake_minimum_required(VERSION 3.20)
project(dolly_probe C CXX)
add_library(answer STATIC answer.c)
add_executable(probe main.cpp)
target_link_libraries(probe PRIVATE answer)
install(TARGETS probe RUNTIME DESTINATION bin)
`,
          "answer.c": "int answer(void) { return 42; }\n",
          "main.cpp": '#include <iostream>\nextern "C" int answer(void);\nint main() { std::cout << "CMAKE-OK\\n"; return answer() != 42; }\n',
        };
        for (const [name, source] of Object.entries(sources)) {
          const lines = source.trimEnd().split("\n").map(line => `echo -- ${shellQuote(line)}`);
          await run(`{ ${lines.join("; ")}; } > ${scratch}/${name}`);
        }
        await run(`cmake -S ${scratch} -B ${scratch}/build -DCMAKE_C_FLAGS=-O0 -DCMAKE_CXX_FLAGS=-O0 -DCMAKE_INSTALL_PREFIX=${scratch}/install`);
        await run(`cmake --build ${scratch}/build --parallel 1`);
        await run(`cmake --install ${scratch}/build`);
        await run(`${scratch}/install/bin/probe`);
        await run(`cmake --build ${scratch}/build --parallel 1`);
      } finally {
        await submit(`cd /workspace; rm -rf ${scratch}`);
      }
      console.log("browser: installed CMake configured, built, installed and reran a C/C++ project using Dolly processes");
      break browserProof;
    }
    if (neovimMode) {
      assert.equal(await waitForValue(debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        value => value === "ready" || value === "failed", "Neovim boot", 1200), "ready");
      if (selectedImage === "neovim") {
        await runLocalMenuProof(expression => evaluate(debuggerClient.send, expression),
          key => dispatchKey(debuggerClient.send, key), debuggerClient.send);
        await dispatchKey(debuggerClient.send, {key: "Escape", code: "Escape", windowsVirtualKeyCode: 27});
        await waitForTerminalText(debuggerClient.send, /Neovim inside Dolly/, "direct Neovim ENTRY");
        await clearTerminalSelection(debuggerClient.send);
        await neovimEx(debuggerClient.send, "edit /tmp/dolly-neovim-entry.txt");
        await typeText(debuggerClient.send, "i");
        for (const [key, code] of [["A", "KeyA"], [":", "Semicolon"], ["?", "Slash"], ["_", "Minus"]])
          await dispatchKey(debuggerClient.send, {key, code, modifiers: 8, text: key});
        await waitForTerminalText(debuggerClient.send, /A:\?_/, "Neovim physically shifted text");
        await clearTerminalSelection(debuggerClient.send);
        await dispatchKey(debuggerClient.send, {key: "Escape", code: "Escape", windowsVirtualKeyCode: 27});
        await delay(300);
        await neovimEx(debuggerClient.send, "w");
        await waitForTerminalText(debuggerClient.send, /written/, "Neovim :w");
        await clearTerminalSelection(debuggerClient.send);
        assert.equal(await neovimShell(debuggerClient.send,
          "test ! -e /usr/bin/cmake && test ! -d /usr/share/cmake-4.4 && test \"$(cat /tmp/dolly-neovim-entry.txt)\" = 'A:?_'"), 0);
        await neovimEx(debuggerClient.send, "!printf NVIM-SLOP-COMMAND");
        await waitForTerminalText(debuggerClient.send, /NVIM-SLOP-COMMAND[\s\S]*Press ENTER/, "Neovim :! command output");
        await dispatchKey(debuggerClient.send, {key: "Enter", code: "Enter", windowsVirtualKeyCode: 13});
        assert.equal(await neovimShell(debuggerClient.send, "rm /tmp/dolly-neovim-entry.txt"), 0);
        await neovimEx(debuggerClient.send, "q");
        await evaluate(debuggerClient.send, `window.__dolly.waitForInteractiveTerminal(
          /Dolly: image entry exited; entering the recovery Slop shell\\.[\\s\\S]*\\ndolly:[^\\n]*\\$\\s*$/,
          "Neovim :q recovery shell")`);
        assert.equal(await evaluate(debuggerClient.send,
          `window.__dolly.submit("printf NVIM-RECOVERY-OK")`), 0);
        console.log("browser: Neovim startup, local menu focus, shifted text, Escape, :w, :! Slop command and :q recovery passed");
        break browserProof;
      }
      await enterRecoveryShell(debuggerClient.send);
      const submit = command => evaluate(debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(command)})`);
      const scratch = "/tmp/dolly-neovim-smoke";
      assert.equal(await submit(`mkdir ${scratch}`), 0);
      const escape = () => dispatchKey(debuggerClient.send,
        { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
      try {
        const modeProbe = "#include <dolly/runtime.h>\nint main(void) { return dolly_terminal_mode_get(0); }\n";
        assert.equal(await submit(`printf '%s\\n' ${modeProbe.trimEnd().split("\n").map(shellQuote).join(" ")} > ${scratch}/mode.c && cc ${scratch}/mode.c -o ${scratch}/mode`), 0);
        const terminalMode = await submit(`${scratch}/mode`);
        assert.ok(terminalMode >= 0 && terminalMode <= 15);
        assert.equal(await submit(`printf 'DOLLY-NVIM-READY\\n' > ${scratch}/edit.txt`), 0);
        assert.equal(await submit("printf '\\033[2J\\033[H'"), 0);
        await evaluate(debuggerClient.send, `(() => {
          window.__neovimStatus = null;
          window.__dolly.submit('nvim --clean ${scratch}/edit.txt').then(status => {
            window.__neovimStatus = status;
          });
        })()`);
        await waitForTerminalText(debuggerClient.send, /DOLLY-NVIM-READY/, "Neovim TUI file", 200);
        await clearTerminalSelection(debuggerClient.send);
        await typeText(debuggerClient.send, "ggi");
        assert.equal(await evaluate(debuggerClient.send,
          'window.__dolly.paste("Dolly 日本語\\n")'), true);
        try {
          await waitForTerminalText(debuggerClient.send, /Dolly 日本語/, "Neovim Unicode paste", 100);
        } finally {
          await clearTerminalSelection(debuggerClient.send);
          const screenshot = await debuggerClient.send("Page.captureScreenshot", {
            format: "png", fromSurface: true,
          });
          await writeFile(resolve(projectDir, "build/dolly-neovim.png"), screenshot.data, "base64");
        }
        const modePixels = `(() => {
          const { paddingX, paddingY, cellWidth, cellHeight } = window.__dolly.transport.geometry();
          const { rows } = window.__dolly.transport.dimensions();
          const pixels = document.querySelector('#display').getContext('2d').getImageData(
            paddingX, paddingY + (rows - 1) * cellHeight, cellWidth * 12, cellHeight).data;
          let count = 0;
          for (let i = 0; i < pixels.length; i += 4)
            if (pixels[i] > 100 && pixels[i + 1] > 100 && pixels[i + 2] > 100) count++;
          return count;
        })()`;
        assert.ok(await evaluate(debuggerClient.send, modePixels) > 0, "Insert mode is visible");
        await escape();
        // Reading pixels sends no input events that could wake a stuck TUI.
        await waitForValue(debuggerClient.send, modePixels, value => value === 0,
          "Escape leaves Insert mode without another key or resize", 40);
        await clearTerminalSelection(debuggerClient.send);
        const before = await evaluate(debuggerClient.send, "window.__dolly.transport.dimensions()");
        await debuggerClient.send("Emulation.setDeviceMetricsOverride", {
          width: 1000, height: 750, deviceScaleFactor: 1, mobile: false,
        });
        const dimensions = await waitForValue(debuggerClient.send,
          "window.__dolly.transport.dimensions()", value => value.cols !== before.cols,
          "Neovim resized terminal", 100);
        await neovimEx(debuggerClient.send,
          `lua vim.fn.writefile({vim.o.columns .. 'x' .. vim.o.lines}, '${scratch}/size')`);
        await neovimEx(debuggerClient.send, "wq");
        assert.equal(await waitForValue(debuggerClient.send, "window.__neovimStatus",
          value => value !== null, "Neovim save and quit", 200), 0);
        assert.equal(await submit(`test "$(cat ${scratch}/size)" = '${dimensions.cols}x${dimensions.rows}'`), 0);
        assert.equal(await submit(`grep -q '^Dolly 日本語$' ${scratch}/edit.txt`), 0);
        assert.equal(await submit(`timeout 30 nvim --clean --headless ${scratch}/edit.txt -c 'lua assert(vim.api.nvim_get_current_line() == "Dolly 日本語")' -c quit`), 0);
        assert.equal(await submit(`${scratch}/mode`), terminalMode, "normal exit restores terminal discipline");
        assert.equal(await submit(`timeout 30 nvim --headless -c 'lua assert(vim.o.shell == "/bin/slop"); assert(vim.fn.system("printf SLOP-NVIM") == "SLOP-NVIM")' -c quit`), 0);
        await submit("printf '\\033[2J\\033[H'");
        await evaluate(debuggerClient.send, `(() => {
          window.__neovimStatus = null;
          window.__dolly.submit('nvim --clean ${scratch}/edit.txt').then(status => {
            window.__neovimStatus = status;
          });
        })()`);
        await waitForTerminalText(debuggerClient.send, /Dolly 日本語/, "Neovim reopened TUI", 200);
        await clearTerminalSelection(debuggerClient.send);
        await neovimEx(debuggerClient.send, "sleep 30");
        await delay(100);
        await dispatchKey(debuggerClient.send,
          { key: "c", code: "KeyC", modifiers: 2, windowsVirtualKeyCode: 67 });
        assert.notEqual(await waitForValue(debuggerClient.send, "window.__neovimStatus",
          value => value !== null, "Neovim interrupted before its thirty-second sleep finishes", 100), 0);
        assert.equal(await submit(`${scratch}/mode`), terminalMode, "SIGINT exit restores terminal discipline");
        assert.equal(await submit(`grep -q '^Dolly 日本語$' ${scratch}/edit.txt`), 0);
      } finally {
        await debuggerClient.send("Emulation.clearDeviceMetricsOverride");
        if (await evaluate(debuggerClient.send, "window.__neovimStatus === null")) {
          await escape();
          await neovimEx(debuggerClient.send, "qa!");
          await waitForValue(debuggerClient.send, "window.__neovimStatus",
            value => value !== null, "Neovim stopped before cleanup", 200);
        }
        await submit(`cd /workspace; rm -rf ${scratch}`);
      }
      console.log("browser: Neovim TUI edited, pasted Unicode, resized, saved/reopened, used Slop, and restored terminal modes after normal exit and Ctrl-C");
      break browserProof;
    }
    if (libuvMode) {
      assert.equal(await waitForValue(debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        value => value === "ready" || value === "failed", "libuv probe boot", 1200), "ready");
      await enterRecoveryShell(debuggerClient.send);
      const submit = command => evaluate(debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(command)})`);
      try {
        for (const command of [
          `curl -fsS ${localOrigin}/fixture/libuv-source.tar -o /tmp/libuv-source.tar`,
          "tar -xf /tmp/libuv-source.tar -C /",
          "cd /tmp/dolly-libuv && make",
          "cc -O0 -Isource/include probe.c libuv.a -o probe",
          "timeout 30 ./probe",
          "cc -shared -rdynamic objects/*.o -o libuv.so",
          "cc -O0 -rdynamic -Isource/include dso.c -o dso",
          "timeout 30 ./dso",
        ]) assert.equal(await submit(command), 0, command);
        for (const cancel of [false, true]) {
          assert.equal(await submit("printf '\\033[2J\\033[H'"), 0);
          await clearTerminalSelection(debuggerClient.send);
          await evaluate(debuggerClient.send, `(() => {
            window.__libuvStatus = null;
            window.__dolly.submit('timeout 15 ./probe tty').then(status => {
              window.__libuvStatus = status;
            });
          })()`);
          await waitForTerminalText(debuggerClient.send, /LIBUV-TTY-READY/, "libuv raw terminal", 100);
          await debuggerClient.send("Emulation.setDeviceMetricsOverride", {
            width: cancel ? 1000 : 900, height: cancel ? 750 : 650,
            deviceScaleFactor: 1, mobile: false,
          });
          await waitForTerminalText(debuggerClient.send, /LIBUV-RESIZED/, "libuv SIGWINCH", 100);
          if (cancel) await dispatchKey(debuggerClient.send,
            { key: "c", code: "KeyC", modifiers: 2, windowsVirtualKeyCode: 67 });
          else await typeText(debuggerClient.send, "hello");
          assert.equal(await waitForValue(debuggerClient.send, "window.__libuvStatus",
            value => value !== null, "libuv terminal completion", 200), cancel ? 130 : 0);
          if (cancel) assert.equal(await submit("test -f interrupt-handled"), 0,
            "SIGINT must reach the libuv callback, not only terminate its Worker");
        }
      } finally {
        if (await evaluate(debuggerClient.send, "window.__libuvStatus === null")) {
          await dispatchKey(debuggerClient.send,
            { key: "c", code: "KeyC", modifiers: 2, windowsVirtualKeyCode: 67 });
          await waitForValue(debuggerClient.send, "window.__libuvStatus",
            value => value !== null, "libuv probe stopped before cleanup", 200);
        }
        await debuggerClient.send("Emulation.clearDeviceMetricsOverride");
        await submit("cd /workspace; rm -rf /tmp/dolly-libuv /tmp/libuv-source.tar");
      }
      console.log("browser: source-built libuv work, cancellation, files, streamed children, cleanup, TTY input, resize and restoration passed");
      break browserProof;
    }
    if (codexMode || codexLoginMode) {
      assert.equal(await waitForValue(debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        value => value === "ready" || value === "failed", "Codex image boot", 1200), "ready");
      await enterRecoveryShell(debuggerClient.send);
      if (codexLoginMode) {
        await runCodexLogin(debuggerClient.send, expression => evaluate(debuggerClient.send, expression), codexLoginFixture);
        codexLoginFixture.verify();
        console.log("browser: Codex device login cancellation, persistence, authenticated tool use, restart, refresh and CLI passed");
        break browserProof;
      }
      await runCodexTui(debuggerClient.send, expression => evaluate(debuggerClient.send, expression), localOrigin);
      codexFixture.verify();
      console.log("browser: real Codex TUI editing, paste, shell tool, file bytes, status and exit passed");
      break browserProof;
    }
    if (rustToolsMode || ripgrepMode || fdMode || tokioMode) {
      assert.equal(await waitForValue(debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        value => value === "ready" || value === "failed", "Rust tools boot", 1200), "ready");
      if (fdMode && selectedImage === "dollyfile-studio") {
        const startup = await waitForTerminalText(debuggerClient.send,
          /Dollyfile Studio.*dolly-hello/, "Studio prompts after tool discovery");
        assert.doesNotMatch(startup, /(?:fd|ripgrep)\s+not found|Failed to download (?:fd|ripgrep)/i);
        await clearTerminalSelection(debuggerClient.send);
        const screenshot = await debuggerClient.send("Page.captureScreenshot", { format: "png" });
        await writeFile(resolve(projectDir, "build/studio-system-tools.png"), screenshot.data, "base64");
      }
      await enterRecoveryShell(debuggerClient.send);
      const submit = command => evaluate(debuggerClient.send, `window.__dolly.submit(${JSON.stringify(command)})`);
      if (tokioMode) await tokioFixture.run(submit, localOrigin, iteration =>
        waitForTerminalText(debuggerClient.send, new RegExp(`TOKIO-HTTP-FIRST-${iteration}`), "Tokio first HTTP chunk"));
      else if (rustToolsMode) await runRustTools(submit, localOrigin);
      else if (fdMode) await runFd(submit);
      else await runRipgrep(submit);
      console.log(`browser: ${requestedMode} source-built tools passed in the shared Wasm filesystem`);
      break browserProof;
    }
    if (processSmokeMode) {
      assert.equal(await waitForValue(debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        value => value === "ready" || value === "failed", "process smoke boot", 1200), "ready");
      await enterRecoveryShell(debuggerClient.send);
      await runProcessSmoke(command => evaluate(debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(command)})`), localOrigin);
      console.log("browser: source-built process probes passed fresh invocation, shared files, env, C++23, HTTP, nested Slop, pipes/poll and C/C++ DSOs");
      break browserProof;
    }
    if (imageInventoryMode) {
      assert.equal(await waitForValue(debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        value => value === "ready" || value === "failed", "image inventory boot"), "ready");
      if (!externalPage) {
        const definition = imageDefinitions.find(({ image }) => image === selectedImage);
        const needsSeed = requestedMode === "image-inventory-rebuild" &&
          !definition.artifacts.some(reference => !reference.copy);
        assert.equal([...staticRequestPaths].some(path => path.endsWith("/dist/dolly.data")), needsSeed,
          "only a root rebuild may download the compiler seed");
      }
      if (selectedImage === "default" && process.env.DOLLY_BROWSER_MODE === "image-inventory") {
        assert.equal(await evaluate(debuggerClient.send, "window.__dolly.httpRequestCount"), 0,
          "prebuilt startup must not run HTTP acceptance probes");
      }
      const editorEntry = selectedImage === "neovim";
      if (editorEntry) {
        await waitForTerminalText(debuggerClient.send, /Neovim inside Dolly/, "Neovim inventory entry");
        await clearTerminalSelection(debuggerClient.send);
      } else await enterRecoveryShell(debuggerClient.send);
      const submit = command => editorEntry ? neovimShell(debuggerClient.send, command)
        : evaluate(debuggerClient.send, `window.__dolly.submit(${JSON.stringify(command)})`);
      const scratch = "/tmp/dolly-image-inventory";
      assert.equal(await submit(`mkdir ${scratch}`), 0);
      try {
        const source = (await readFile(resolve(projectDir, "test/fixtures/image-inventory.c"), "utf8"))
          .replace('#include "sha256.h"', await readFile(resolve(projectDir, "src/sha256.h"), "utf8"));
        const lines = source.trimEnd().split("\n").map(line => `echo -- ${shellQuote(line)}`);
        assert.equal(await submit(`{ ${lines.join("; ")}; } > ${scratch}/inventory.c`), 0);
        assert.equal(await submit(`cc -O1 ${scratch}/inventory.c -o ${scratch}/inventory`), 0);
        assert.equal(await submit("type dollyfile && dollyfile --help"), 0);
        assert.equal(await submit(`help > ${scratch}/help`), 0);
        const { DOLLY_SYSTEM_SNAPSHOT } = await import(
          `../dist/dolly-${selectedImage}-system-snapshot.mjs`);
        const manifestHash = createHash("sha256")
          .update(DOLLY_SYSTEM_SNAPSHOT.manifest.join("\n") + "\n").digest("hex");
        assert.notEqual(await submit(`${scratch}/inventory ${scratch}/help ${"0".repeat(64)}`), 0,
          "live manifest verification must reject a different digest");
        assert.equal(await submit(`${scratch}/inventory ${scratch}/help ${manifestHash}`), 0,
          "live manifest, system paths and help must match the packaged image");
        if (selectedImage === "external-source") {
          assert.equal(await submit("test \"$(command -v xxd)\" = /usr/bin/xxd"), 0);
          assert.equal(await submit("test \"$(printf Dolly | xxd -p)\" = 446f6c6c79"), 0);
          assert.equal(await submit("test \"$(printf 446f6c6c79 | xxd -r -p)\" = Dolly"), 0);
        }
      } finally {
        await submit(`rm -rf ${scratch}`);
      }
      console.log(`browser: ${selectedImage} ${process.env.DOLLY_BROWSER_MODE}: live system/PATH inventory matches the sealed image`);
      break browserProof;
    }
    if (imageRetentionMode) {
      assert.equal(await waitForValue(debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        value => value === "ready" || value === "failed", "image retention boot", 1200), "ready");
      const snapshotContract = await readFile(resolve(distDirectory, "dolly-snapshot-0.wasm"));
      assert.equal(await evaluate(debuggerClient.send, `(async () => {
        const memory = new WebAssembly.Memory({ initial: 1024n, maximum: 131072n, shared: true, address: 'i64' });
        const { instance } = await WebAssembly.instantiate(
          new Uint8Array(${JSON.stringify([...snapshotContract])}), { env: { memory } });
        return instance.exports.dolly_snapshot_format_version();
      })()`), 2, "snapshot contract version");
      await enterRecoveryShell(debuggerClient.send);
      const submit = command => evaluate(debuggerClient.send, `window.__dolly.submit(${JSON.stringify(command)})`);
      const scratch = "/tmp/dolly-image-retention";
      assert.equal(await submit(`mkdir ${scratch}`), 0);
      try {
        for (const name of ["fs-record.h", "fs-record.c", "image-roundtrip.c", "system-snapshot.c",
          "system-snapshot.h", "dollyfile.c", "sha256.h"]) {
          assert.equal(await submit(`curl -fsS ${localOrigin}/fixture/${name} -o ${scratch}/${name}`), 0);
        }
        for (const [name, source] of [["records", "fs-record.c"],
          ["system", "image-roundtrip.c"]]) {
          assert.equal(await submit(`cd ${scratch} && cc -O0 -I. ${source} -o ${name}`), 0, `compile ${name}`);
          assert.equal(await submit(`./${name} ${scratch}`), 0, `${name} preserves path kinds`);
        }
        assert.equal(await submit(`cc -O0 dollyfile.c -o dollyfile`), 0);
        const entryRecipe = "DOLLY 3\nIMAGE entry-missing\nENTRY /bin/slop\n";
        assert.equal(await submit(`printf %b ${shellQuote(entryRecipe.replaceAll("\n", "\\n"))} > ${scratch}/Dollyfile`), 0);
        assert.equal(await submit(`./dollyfile FILE:${scratch}/Dollyfile ${localOrigin} 2> ${scratch}/entry-error`), 1);
        assert.equal(await submit(`grep -q 'must be retained' ${scratch}/entry-error`), 0,
          "an existing executable omitted from exports must fail sealing");
      } finally {
        await submit(`cd /workspace; rm -rf ${scratch}`);
      }
      console.log("browser: shared restore and system image preserve directories/files/symlinks; omitted ENTRY fails sealing");
      break browserProof;
    }
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
        assert.equal(await submit("janis -m -e 'await new Promise(() => {})'"), 1,
          "a genuinely stranded promise fails instead of spinning forever");
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
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <time.h>
#include <dolly/process.h>
#include <dolly/runtime.h>
static volatile sig_atomic_t received;
static void on_interrupt(int number) { received = number; }
int main(int argc, char **argv) {
  ${constants}
  dolly_process_dso_close_request close_request = {123456};
  dolly_process_dso_response response;
  if (dolly_process_call(DOLLY_PROCESS_DSO_CLOSE, &close_request, sizeof(close_request), &response, sizeof(response)) != sizeof(response) || response.error != EBADF) return 2;
  if (dolly_process_call(DOLLY_PROCESS_DSO_CLOSE, &close_request, sizeof(close_request), &response, 1) != -ENOBUFS) return 3;
  if (dolly_process_call(DOLLY_PROCESS_FFI_CALL, NULL, 0, NULL, 0) != -EINVAL) return 4;
  if (argc == 1) return 0;
  struct sigaction action = {.sa_handler = on_interrupt};
  if (sigaction(SIGINT, &action, NULL)) return 8;
  struct timespec now;
  if (clock_gettime(CLOCK_MONOTONIC, &now)) return 5;
  dolly_process_clock_sleep_request request = {1, 0, (uint64_t)now.tv_sec * 1000000000 + now.tv_nsec + 60000000000};
  int64_t interrupted = dolly_process_call(DOLLY_PROCESS_CLOCK_SLEEP, &request, sizeof(request), NULL, 0);
  FILE *file = fopen("/tmp/process-abi/interrupt-result", "w");
  if (!file) return 6;
  fprintf(file, "%s\\n", interrupted == -EINTR ? "EINTR-OK" : "WRONG-ERRNO");
  fclose(file);
  return interrupted == -EINTR && received == SIGINT ? 0 : 7;
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
        assert.equal(interrupted.status, 0);
        assert.equal(await submit("grep -q EINTR-OK /tmp/process-abi/interrupt-result"), 0);
      } finally { await submit("rm -rf /tmp/process-abi"); }
      console.log("browser: freestanding WAT ran through Slop; wrong executable/DSO types rejected before allocation; local/GOT linking passed; optional DSO/FFI returned ENOSYS; C/JS errno and interrupted syscall round trips passed");
      break browserProof;
    }
    if (boundaryMode || httpDefaultsMode) {
      const state = await waitForValue(debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        value => value === "ready" || value === "failed", "boundary snapshot boot", 1200);
      assert.equal(state, "ready");
      const fixture = `${localOrigin}${browserBase}test/fixtures/browser-boundary.mjs`;
      const result = await evaluate(debuggerClient.send,
        `import(${JSON.stringify(fixture)}).then(module => module.runBrowserBoundaryChecks(new URL('../', document.baseURI).href))`);
      assert.equal(result.imports, 28);
      assert.equal(result.pluginRejections, 3);
      assert.equal(result.policyDeniedBeforeFetch, true);
      assert.equal(result.nonConsumingDeadline, true);
      assert.equal(result.defaultRedirects, true);
      for (const path of ["docs/..%2fAGENTS.md", "docs/..%2fsrc%2fcompiler.cpp"]) {
        assert.equal(await evaluate(debuggerClient.send,
          `fetch(${JSON.stringify(`${localOrigin}${browserBase}${path}`)}).then(response => response.status)`),
        404, `development server escaped its public documentation root: ${path}`);
      }
      await enterRecoveryShell(debuggerClient.send);
      if (httpDefaultsMode) {
        for (const command of [
          `if curl -fsS ${localOrigin}/fixture/http-redirect; then false; else true; fi`,
          `curl -fsSL ${localOrigin}/fixture/http-redirect > /tmp/boundary-redirect.txt`,
          'grep -q \'"method":"GET"\' /tmp/boundary-redirect.txt',
          "rm -f /tmp/boundary-redirect.txt",
        ]) assert.equal(await evaluate(debuggerClient.send, `window.__dolly.submit(${JSON.stringify(command)})`), 0, command);
      }
      if (!externalPage) {
        const source = `${localOrigin}${browserBase}static/default/commands/curl.c`;
        const digest = createHash("sha256").update(await readFile(resolve(distDirectory, "static/default/commands/curl.c"))).digest("hex");
        const submit = command => evaluate(debuggerClient.send, `window.__dolly.submit(${JSON.stringify(command)})`);
        assert.equal(await submit(`curl -fsS ${source} -o /tmp/boundary-source.c`), 0);
        assert.equal(await submit(`test "$(sha256sum /tmp/boundary-source.c | cut -d ' ' -f 1)" = ${digest}`), 0);
        assert.equal(assetPartRequests.length, 2, "one authorized source fetch reads its two fixed parts");
        if (boundaryMode) {
          assert.notEqual(await submit(`curl -fsS ${source}.part-0 -o /tmp/boundary-denied`), 0);
          assert.equal(assetPartRequests.length, 2, "derived delivery does not grant guest access to sibling URLs");
        }
        corruptAssetPart = true;
        assert.notEqual(await submit(`curl -fsS ${source} -o /tmp/boundary-corrupt`), 0);
        await submit("rm -f /tmp/boundary-source.c /tmp/boundary-denied /tmp/boundary-corrupt");
        console.log("browser: broker reconstructed an authorized multipart source; corruption and unauthorized sibling access rejected");
      }
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
      if (selectedImage === "default" || selectedImage === "python") {
        await evaluate(debuggerClient.send,
          'window.__dolly.waitForInteractiveTerminal(/(?:^|\\n)dolly:[^\\n]*\\$\\s*$/, "Python image Slop prompt")');
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
    if (zigSdkMode) {
      const state = await waitForValue(
        debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        (value) => value === "ready" || value === "failed",
        "standalone Zig image boot",
        1200,
      );
      assert.equal(state, "ready");
      await enterRecoveryShell(debuggerClient.send);
      const bootMemoryBytes = await evaluate(debuggerClient.send,
        "window.__dolly.display.buffer.byteLength");
      const { runZigSdkCases } = await import("../test/fixtures/zig-sdk.mjs");
      await runZigSdkCases(command => evaluate(
          debuggerClient.send,
          `window.__dolly.submit(${JSON.stringify(command)})`,
      ));
      console.log(`browser: native Zig math/u128/container compile-link-run and test-object build passed; boot kernel memory ${bootMemoryBytes} bytes`);
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
        ...(hasZig ? [
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
          (hasZig ? "; Clang also survived Zig codegen" : ""),
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
      const sessionOrigin = new URL(interactivePage).origin;
      const piSessions = selectedModuleNames.has("pi") ? "/workspace/pi-session-proof" : null;
      const initialState = await waitForValue(
        debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        (value) => value === "ready" || value === "failed",
        "Dolly session source boot",
        sessionRebuildMode ? 12_000 : 1200,
      );
      assert.equal(initialState, "ready");
      const sessionAssets = await evaluate(debuggerClient.send,
        `new URL(${JSON.stringify(sessionRebuildMode ? "../../" : "../")}, document.baseURI).href`);
      if (sessionRebuildMode) {
        const comparison = await evaluate(debuggerClient.send, `(async () => {
          const bytes = window.__dolly.systemSnapshot;
          const { DOLLY_SYSTEM_SNAPSHOT: metadata } = await import(
            ${JSON.stringify(new URL(`dist/dolly-${selectedImage}-system-snapshot.mjs`, sessionAssets).href)});
          const digest = await crypto.subtle.digest("SHA-256", bytes);
          const actual = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
          return { actual, expected: metadata.sha256, mode: document.documentElement.dataset.bootMode };
        })()`);
        assert.equal(comparison.mode, "rebuild");
        assert.equal(comparison.actual, comparison.expected, "rebuilt session base differs from the prebuilt image");
        console.log(`browser: ${selectedImage} rebuilt session base is byte-identical to the packaged snapshot`);
        assert.equal(await evaluate(debuggerClient.send, `(async () => {
          const bytes = new Uint8Array(window.__dolly.systemSnapshot);
          bytes[bytes.length - 1] ^= 1;
          let error;
          try { await window.__dolly.saveSession("wrong-rebuilt-base"); }
          catch (caught) { error = caught.message; }
          finally { bytes[bytes.length - 1] ^= 1; }
          const store = await import(${JSON.stringify(new URL("src/session-store.mjs", sessionAssets).href)});
          return /differs from the prebuilt session base/.test(error) &&
            await store.loadStoredSession("wrong-rebuilt-base") === null;
        })()`), true, "a non-identical rebuilt base must not produce a named save");
      }
      await enterRecoveryShell(debuggerClient.send);
      if (piSessions) {
        const source = await readFile(resolve(projectDir, "test/fixtures/pi-sessions.mjs"), "utf8");
        for (const command of [`mkdir ${piSessions}`,
          `printf '%s\\n' ${source.trimEnd().split("\n").map(shellQuote).join(" ")} > ${piSessions}/probe.mjs`,
          `janis -m ${piSessions}/probe.mjs ${piSessions}`]) {
          assert.equal(await evaluate(debuggerClient.send, `__dolly.submit(${JSON.stringify(command)})`), 0);
        }
      }
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
        url: `${sessionOrigin}${browserBase}session/browser-proof`,
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
        ...(piSessions ? [`janis -m ${piSessions}/probe.mjs ${piSessions} verify`] : []),
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
      await debuggerClient.send("Page.navigate", { url: `${sessionOrigin}${browserBase}session/` });
      assert.equal(await waitForValue(debuggerClient.send,
        "document.documentElement?.dataset.sessionsStatus ?? ''",
        (value) => value === "ready" || value === "failed", "saved session list", 100), "ready");
      assert.equal(await evaluate(debuggerClient.send, "document.querySelectorAll('#sessions li').length"), 1);
      assert.equal(await evaluate(debuggerClient.send, "document.querySelector('#sessions a').pathname"),
        `${browserBase}session/browser-proof`);
      assert.equal(await evaluate(debuggerClient.send, "typeof window.__dolly"), "undefined",
        "listing sessions should not boot a Wasm runtime");
      await runSessionFilesProof({
        evaluate: expression => evaluate(debuggerClient.send, expression),
        wait: (...args) => waitForValue(debuggerClient.send, ...args),
        selectFile: (...args) => selectFile(debuggerClient.send, ...args),
        downloadDirectory: browserDownloadDirectory,
      });
      await evaluate(debuggerClient.send, "document.querySelector('#sessions a').click()");
      assert.equal(await waitForValue(debuggerClient.send,
        "document.documentElement?.dataset.dollyStatus ?? ''",
        (value) => value === "ready" || value === "failed", "second session restore", 1200), "ready");
      await enterRecoveryShell(debuggerClient.send);
      for (const command of [
        "grep -q SECOND-SAVE /workspace/session-proof.txt",
        ...(piSessions ? [`janis -m ${piSessions}/probe.mjs ${piSessions} verify`] : []),
        "test ! -e /workspace/session-large",
        "test ! -e /usr/include/zconf.h",
        "grep -q SESSION-TYPE /usr/share/licenses/zlib/LICENSE/child",
      ]) assert.equal(await evaluate(debuggerClient.send,
        `window.__dolly.submit(${JSON.stringify(command)})`), 0, command);
      // Storage failure must be visible and must not replace the last good
      // checkpoint. Inject the browser's quota error at the actual IDB put.
      assert.deepEqual(await evaluate(debuggerClient.send, `(async () => {
        const store = await import(${JSON.stringify(new URL("src/session-store.mjs", sessionAssets).href)});
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
        const store = await import(${JSON.stringify(new URL("src/session-store.mjs", sessionAssets).href)});
        const good = await store.loadStoredSession("browser-proof");
        await store.saveStoredSession({ ...good, name: "wrong-base", buildId: "different-runtime" });
        await store.saveStoredSession({ ...good, name: "broken-data", encoding: "identity", bytes: new ArrayBuffer(16) });
      })()`);
      for (const name of ["wrong-base", "broken-data", "missing-session"]) {
        await debuggerClient.send("Page.navigate", { url: `${sessionOrigin}${browserBase}session/${name}` });
        assert.equal(await waitForValue(debuggerClient.send,
          "document.documentElement?.dataset.dollyStatus ?? ''",
          (value) => value === "ready" || value === "failed", `rejected session ${name}`, 1200), "failed");
      }
      await debuggerClient.send("Page.navigate", { url: `${sessionOrigin}${browserBase}session/` });
      assert.equal(await waitForValue(debuggerClient.send,
        "document.documentElement?.dataset.sessionsStatus ?? ''",
        (value) => value === "ready" || value === "failed", "retained saved records", 100), "ready");
      assert.equal(await evaluate(debuggerClient.send,
        "document.querySelectorAll('#sessions li').length"), 3);
      assert.equal(await evaluate(debuggerClient.send,
        "[...document.querySelectorAll('#sessions a')].some(link => link.textContent === 'wrong-base')"), false);
      // Legacy bookmarks resolve to the canonical path without query params.
      await debuggerClient.send("Page.navigate", { url: `${sessionOrigin}${browserBase}load/?session=browser-proof` });
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
        ...(!packagedSite ? [`${browserBasePrefix}/dist/dolly-${selectedImage}-system.snapshot`] : []),
      ]) {
        assert.ok(staticRequestPaths.has(required), `prefixed route did not request ${required}`);
      }
      if (packagedSite) assert.ok([...staticRequestPaths].some(path => path.includes("/dist/packs/")), "packaged image did not load shared packs");
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
      assert.match(viewer.source, /DOLLY 3/);
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
        url: location.href,
        base: document.baseURI,
        title: document.querySelector('h1')?.textContent,
        background: getComputedStyle(document.documentElement).backgroundColor,
        font: getComputedStyle(document.documentElement).fontFamily,
        links: Array.from(document.querySelectorAll('.image-links a'), (link) => link.href),
        descriptions: Array.from(document.querySelectorAll('tr.image'), (row) => ({
          image: row.dataset.image,
          text: row.querySelector('.description')?.textContent.trim() ?? '',
          height: row.getBoundingClientRect().height,
        })),
        interactiveElements: document.querySelectorAll('script, form, input, button').length,
        text: document.body.textContent,
      }))()`);
      assert.equal(menuEvidence.url, menuPage);
      assert.equal(new URL(menuEvidence.base).origin, new URL(menuPage).origin);
      assert.equal(menuEvidence.title, "DOLLY");
      assert.equal(menuEvidence.background, "rgb(38, 38, 38)");
      assert.match(menuEvidence.font, /Dolly IosevkaTerm SemiBold/);
      assert.deepEqual(menuEvidence.links.toSorted(), imageDefinitions.flatMap(({ image }) => [
        `${image}/`, `${image}/rebuild/`, `view/${image}/`,
      ]).map(path => new URL(path, menuEvidence.url).href).toSorted());
      assert.equal(menuEvidence.descriptions.length, imageDefinitions.length);
      const menuOrder = ["default", "bhop", "codex", "dollyfile-studio", "external-source",
        "gamedev", "gamedev-phone", "javascript", "neovim", "pi", "pi-local", "python", "python-pi", "rts-arena",
        "cmake-build", "codex-build", "fd-build", "gamedev-sdk", "ghostty-build", "neovim-build", "pi-runtime",
        "protox-build", "python-runtime", "ripgrep", "rts-build", "rust-sdk", "rust-tools", "sdl2-build", "system", "system-build"];
      const selected = new Set(imageDefinitions.map(({ image }) => image));
      assert.deepEqual(menuEvidence.descriptions.map(({ image }) => image), menuOrder.filter(image => selected.has(image)));
      for (const { image, text, height } of menuEvidence.descriptions) {
        assert.ok(text, `${image}: missing image description`);
        assert.ok(height <= 40, `${image}: row is too tall (${height}px)`);
      }
      const screenshots = resolve(projectDir, "build/menu-check");
      await mkdir(screenshots, { recursive: true });
      for (const [name, width] of [["desktop", 1280], ["mobile", 390]]) {
        await debuggerClient.send("Emulation.setDeviceMetricsOverride", {
          width, height: 900, deviceScaleFactor: 1, mobile: false,
        });
        await evaluate(debuggerClient.send, "document.fonts.ready.then(() => true)");
        const layout = await evaluate(debuggerClient.send, `({
          width: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
          heights: Array.from(document.querySelectorAll('tr.image'), row => row.getBoundingClientRect().height),
        })`);
        assert.equal(layout.scrollWidth, layout.width, `${name}: page overflows horizontally`);
        assert.ok(layout.heights.every(height => height <= 40), `${name}: image rows wrap`);
        const { cssContentSize } = await debuggerClient.send("Page.getLayoutMetrics");
        const { data } = await debuggerClient.send("Page.captureScreenshot", {
          format: "png", captureBeyondViewport: true, clip: { ...cssContentSize, scale: 1 },
        });
        await writeFile(resolve(screenshots, `${name}.png`), Buffer.from(data, "base64"));
      }
      assert.equal(menuEvidence.interactiveElements, 0);
      assert.doesNotMatch(menuEvidence.text, /voice input/i);
      await evaluate(debuggerClient.send, `document.querySelector('a[href$="#shortcuts"]').click()`);
      await waitForValue(debuggerClient.send, "location.hash",
        value => value === "#shortcuts", "shortcuts link navigation", 200);
      const shortcuts = await evaluate(debuggerClient.send, `(() => {
        const section = document.querySelector('#shortcuts');
        return { hash: location.hash, text: section.textContent,
          load: section.querySelector('a').href };
      })()`);
      assert.equal(shortcuts.hash, "#shortcuts");
      for (const key of ["Ctrl+Shift+C", "Ctrl+Shift+V", "Ctrl+Shift+S", "F11"]) {
        assert.ok(shortcuts.text.includes(key), `shortcuts guide is missing ${key}`);
      }
      assert.doesNotMatch(shortcuts.text, /Ctrl\+C|mouse capture/);
      assert.equal(shortcuts.load, new URL("session/", menuEvidence.url).href);
      console.log(
        "browser: static root menu exposes image links and a working shortcuts reference",
      );
      break browserProof;
    }
    if (iterationMode) {
      let firstDigest;
      for (const label of missingDependencyMode ? ["missing-base"] : ["published-base", "cached-base", "edited-command"]) {
        const started = performance.now();
        assert.equal(await waitForValue(debuggerClient.send,
          "document.documentElement?.dataset.dollyStatus ?? ''", value => ["ready", "failed", "exited"].includes(value), "v3 iteration"), "ready");
        assert.equal(await evaluate(debuggerClient.send, "location.origin"),
          externalPage ? new URL(externalPage).origin : localOrigin, "rebuild ignored the requested server");
        await waitForTerminalText(debuggerClient.send, /(?:^|\n)dolly:[^\n]*\$\s*$/, "custom image Slop entry");
        await clearTerminalSelection(debuggerClient.send);
        const marker = label === "edited-command" ? "iteration-two" : "iteration-one";
        assert.equal(await evaluate(debuggerClient.send,
          `window.__dolly.submit(${JSON.stringify(`test "$(iteration)" = ${marker} && test "$DOLLY_ITERATION" = first:second && test ! -f /usr/share/iteration-deleted && test -f /opt/iteration/bin/echo && test "$(which echo)" = /opt/iteration/bin/echo`)})`), 0);
        const evidence = await evaluate(debuggerClient.send, `(async () => ({
          digest: [...new Uint8Array(await crypto.subtle.digest("SHA-256", window.__dolly.systemSnapshot))].map(b => b.toString(16).padStart(2, "0")).join(""),
          log: document.querySelector("#bootstrap-log").textContent,
          kernelBytes: window.__dolly.display.buffer.byteLength,
          reads: window.__artifactReads, downloads: window.__artifactFetches,
          packs: performance.getEntriesByType('resource').filter(entry => entry.name.includes('/dist/packs/'))
            .map(entry => ({ transferred: entry.transferSize, encoded: entry.encodedBodySize })),
        }))()`);
        assert.match(evidence.log, /reusing (?:local|published) /);
        assert.doesNotMatch(evidence.log, /private compiler, Slop, and Dollyfile engine installed/);
        assert.equal([...staticRequestPaths].some(path => path.includes("/static/")), false, "iteration fetched build sources for its foundation");
        assert.equal([...staticRequestPaths].some(path => path.endsWith("/dist/dolly.data")), false,
          "derived builds must reuse their base compiler without downloading the seed");
        const payloadReads = evidence.reads.filter(read => read.bytes > 0);
        if (label === "published-base" || missingDependencyMode) {
          assert.equal(payloadReads.length, 0, "fresh profile unexpectedly read cached payloads");
          assert.ok(evidence.downloads.length > 0);
          const baseSnapshot = missingDependencyMode ? "pi-runtime" : "pi";
          assert.ok(evidence.downloads.every(path => path.includes("/packs/") || path.endsWith(`/dolly-${baseSnapshot}-system.snapshot`)),
            `downloaded an unused ancestor snapshot: ${evidence.downloads}`);
        } else {
          assert.equal(evidence.downloads.length, 0, "cached iteration downloaded a snapshot");
          assert.equal(payloadReads.length, 1, "cached iteration read unused ancestor payloads");
          assert.equal(payloadReads[0].store, "payloads");
          assert.ok(payloadReads[0].key.endsWith(':' + selectedGraph.root.sha256));
        }
        if (label === "published-base") firstDigest = evidence.digest;
        else if (label === "cached-base") assert.equal(evidence.digest, firstDigest, "cached composition changed the artifact");
        else assert.notEqual(evidence.digest, firstDigest, "editing the command did not change the artifact");
        console.log(`browser: v3 ${label}: command, environment and deletion verified; ${(performance.now() - started).toFixed(0)}ms; ${evidence.digest}`);
        console.log(`browser: v3 ${label}: kernel linear memory ${evidence.kernelBytes} bytes`);
        console.log(`browser: v3 ${label}: ${payloadReads.reduce((sum, read) => sum + read.bytes, 0)} cached payload bytes, ${evidence.downloads.length} snapshot fetches; no unused ancestor payloads`);
        if (evidence.packs.length) console.log(`browser: v3 ${label}: ${evidence.packs.length} pack resources, ` +
          `${evidence.packs.reduce((sum, pack) => sum + pack.transferred, 0)} network bytes, ` +
          `${evidence.packs.reduce((sum, pack) => sum + pack.encoded, 0)} encoded body bytes`);
        if (missingDependencyMode) {
          assert.match(evidence.log, /building missing pi artifact/);
          assert.match(evidence.log, /reusing published pi-runtime artifact/);
          break browserProof;
        }
        if (label === "edited-command") break;
        if (label === "cached-base") await evaluate(debuggerClient.send,
          `sessionStorage.setItem("dolly-custom-source", ${JSON.stringify(iterationRecipe.replace("iteration-one", "iteration-two"))})`);
        staticRequestPaths.clear();
        await debuggerClient.send("Page.navigate", { url: "about:blank" });
        await debuggerClient.send("Page.navigate", { url: rebuildPage });
      }
      const iterationAssets = await evaluate(debuggerClient.send, "new URL('../../', document.baseURI).href");
      const invalidation = await evaluate(debuggerClient.send, `(async () => {
        const { DOLLY_IMAGES } = await import(${JSON.stringify(new URL("dist/dolly-images.mjs", iterationAssets).href)});
        const { loadImageArtifactDescriptor, loadImageArtifact, describeImageArtifact, saveImageArtifact,
          loadPackagedSnapshotMetadata, loadPackagedSystemSnapshot } = await import(${JSON.stringify(new URL("src/image-artifact.mjs", iterationAssets).href)});
        const { decodeSnapshotRecords, encodeSnapshotRecords } = await import(${JSON.stringify(new URL("src/snapshot-records.mjs", iterationAssets).href)});
        const { prepareImageArtifacts } = await import(${JSON.stringify(new URL("src/image-build.mjs", iterationAssets).href)});
        const base = DOLLY_IMAGES.find(image => image.image === 'system');
        const child = DOLLY_IMAGES.find(image => image.image === 'javascript');
        const prime = async definition => {
          const metadata = await loadPackagedSnapshotMetadata(definition.image);
          const artifact = await describeImageArtifact(await loadPackagedSystemSnapshot(definition.image, metadata), definition.sha256, metadata.inputs);
          if (!await saveImageArtifact(artifact, '/' + definition.dollyfile)) throw new Error('cache priming failed');
          return artifact;
        };
        const primedBase = await prime(base);
        await prime(child);
        const original = await loadImageArtifact(await loadImageArtifactDescriptor(base.sha256, primedBase.inputs));
        if (!original) throw new Error('missing cached system');
        const oldInputs = [{ recipeSha256: base.sha256, sha256: original.sha256 }];
        if (!await loadImageArtifactDescriptor(child.sha256, oldInputs)) throw new Error('missing cached JavaScript');
        const records = decodeSnapshotRecords(original.bytes);
        const init = records.get('/etc/gitconfig');
        if (init?.kind !== 2) throw new Error('missing base Git config');
        records.set('/etc/gitconfig', { kind: 2, data: new TextEncoder().encode(
          new TextDecoder().decode(init.data) + '\\n# changed base output\\n') });
        const changed = await describeImageArtifact(encodeSnapshotRecords(records).buffer, base.sha256, original.inputs);
        try {
          if (!await saveImageArtifact(changed, '/' + base.dollyfile)) throw new Error('cache write failed');
          const staleHit = await loadImageArtifactDescriptor(child.sha256, [{ recipeSha256: base.sha256, sha256: changed.sha256 }]);
          let requested, failure;
          try {
            await prepareImageArtifacts('gamedev', null, async image => {
              requested = image;
              throw new Error('EXPECTED_REBUILD');
            }, () => {});
          } catch (error) { failure = error.message; }
          return { sameRecipe: changed.recipeSha256 === original.recipeSha256,
            changedBytes: changed.sha256 !== original.sha256, staleHit: Boolean(staleHit), requested, failure };
        } finally {
          if (!await saveImageArtifact(original, '/' + base.dollyfile)) throw new Error('cache restoration failed');
        }
      })()`);
      assert.deepEqual(invalidation, { sameRecipe: true, changedBytes: true, staleHit: false,
        requested: 'javascript', failure: 'EXPECTED_REBUILD' });
      console.log('browser: changing base bytes without changing its recipe rejects cached and published child artifacts');
      const cacheChecks = await evaluate(debuggerClient.send, `(async () => {
        const { loadImageArtifactDescriptor, loadImageArtifact, describeImageArtifact, saveImageArtifact, sha256 } =
          await import(${JSON.stringify(new URL("src/image-artifact.mjs", iterationAssets).href)});
        const { encodeSnapshotRecords } = await import(${JSON.stringify(new URL("src/snapshot-records.mjs", iterationAssets).href)});
        const { DOLLY_IMAGES } = await import(${JSON.stringify(new URL("dist/dolly-images.mjs", iterationAssets).href)});
        const { prepareImageArtifacts } = await import(${JSON.stringify(new URL("src/image-build.mjs", iterationAssets).href)});
        const make = async (name, value) => {
          const source = new TextEncoder().encode('DOLLY 3\\nIMAGE ' + name + '\\nENTRY /bin/slop\\n');
          return describeImageArtifact(encodeSnapshotRecords(new Map([
            ['/etc/dolly/Dollyfile', {kind: 2, data: source}],
            ['/etc/dolly/artifact', {kind: 2, data: new TextEncoder().encode(value)}],
          ])).buffer, await sha256(source));
        };
        const first = await make('cache-proof', 'first'), second = await make('cache-proof', 'other');
        const slot = '/cache-proof';
        if (!await saveImageArtifact(first, slot)) throw new Error('initial cache write failed');
        const original = await loadImageArtifactDescriptor(first.recipeSha256);
        const put = IDBObjectStore.prototype.put;
        let rejected;
        try {
          IDBObjectStore.prototype.put = function(value, key) {
            if (this.name === 'images' && value.slot === slot) throw new DOMException('injected metadata quota failure', 'QuotaExceededError');
            return put.call(this, value, key);
          };
          rejected = !await saveImageArtifact(second, slot);
        } finally { IDBObjectStore.prototype.put = put; }
        const afterFailure = await loadImageArtifact(await loadImageArtifactDescriptor(first.recipeSha256));
        if (!await saveImageArtifact(second, slot)) throw new Error('replacement cache write failed');
        const staleRejected = await loadImageArtifact(original) === null;
        const replacement = await loadImageArtifactDescriptor(second.recipeSha256);
        if (!await saveImageArtifact({...second, bytes: first.bytes}, slot)) throw new Error('corrupt fixture write failed');
        const corruptionRejected = await loadImageArtifact(replacement) === null;
        const next = await make('cache-next', 'next');
        if (!await saveImageArtifact(next, slot)) throw new Error('new recipe write failed');
        const oldDescriptorGone = await loadImageArtifactDescriptor(first.recipeSha256) === null;
        // A missing payload has zero bytes in the real IndexedDB read instrumentation.
        const before = window.__artifactReads.length;
        await loadImageArtifact(original);
        const oldPayloadGone = window.__artifactReads.slice(before).some(read => read.store === 'payloads' && read.bytes === 0);
        const writes = await Promise.all([saveImageArtifact(first, slot), saveImageArtifact(next, slot)]);
        const survivors = (await Promise.all([loadImageArtifactDescriptor(first.recipeSha256),
          loadImageArtifactDescriptor(next.recipeSha256)])).filter(Boolean);
        const concurrent = writes.every(Boolean) && survivors.length === 1 &&
          (await loadImageArtifact(survivors[0]))?.sha256 === survivors[0].sha256;
        const pi = DOLLY_IMAGES.find(image => image.image === 'pi');
        const { DOLLY_SYSTEM_SNAPSHOT: metadata } = await import(${JSON.stringify(new URL("dist/dolly-pi-system-snapshot.mjs", iterationAssets).href)});
        const piArtifact = await loadImageArtifact(await loadImageArtifactDescriptor(pi.sha256, metadata.inputs));
        if (!piArtifact) throw new Error('missing Pi cache');
        let recovered;
        try {
          if (!await saveImageArtifact({...piArtifact, bytes: new ArrayBuffer(1), byteLength: 1}, '/' + pi.dollyfile)) throw new Error('corrupt Pi fixture write failed');
          const [artifact] = await prepareImageArtifacts('custom',
            'DOLLY 3\\nIMAGE cache-consumer\\nFROM HOST /' + pi.dollyfile + ' ' + pi.sha256 + '\\nENTRY /bin/slop\\n',
            async () => { throw new Error('corruption must recover the exact published bytes, not rebuild a new identity'); }, () => {});
          recovered = artifact.sha256 === piArtifact.sha256 && artifact.bytes.byteLength === piArtifact.bytes.byteLength;
        } finally { await saveImageArtifact(piArtifact, '/' + pi.dollyfile); }
        const { saveStoredSession, loadStoredSession } = await import(${JSON.stringify(new URL("src/session-store.mjs", iterationAssets).href)});
        await saveStoredSession({ name: 'cache-migration-proof', formatVersion: 2, buildId: first.buildId,
          image: 'pi', imageIdentity: 'pi:' + pi.sha256, updatedAt: 0, encoding: 'identity', bytes: first.bytes });
        // Reset only this disposable test origin's image cache to its old schema.
        await new Promise((resolve, reject) => {
          const request = indexedDB.deleteDatabase('dolly-image-artifacts-v3');
          request.onsuccess = resolve; request.onerror = () => reject(request.error);
        });
        await new Promise((resolve, reject) => {
          const request = indexedDB.open('dolly-image-artifacts-v3', 2);
          request.onupgradeneeded = () => {
            const store = request.result.createObjectStore('images', {keyPath: 'id'});
            store.createIndex('slot', ['buildId', 'slot']);
            store.put({...first, id: first.buildId + ':' + first.recipeSha256, slot});
          };
          request.onsuccess = () => { request.result.close(); resolve(); };
          request.onerror = () => reject(request.error);
        });
        const legacyDiscarded = await loadImageArtifactDescriptor(first.recipeSha256) === null;
        const upgraded = await saveImageArtifact(first, slot) &&
          (await loadImageArtifact(await loadImageArtifactDescriptor(first.recipeSha256)))?.sha256 === first.sha256;
        const savedSession = await loadStoredSession('cache-migration-proof');
        const sessionPreserved = await sha256(savedSession.bytes) === first.sha256;
        return { rejected, atomic: afterFailure?.sha256 === first.sha256,
          staleRejected, corruptionRejected, oldDescriptorGone, oldPayloadGone, concurrent, recovered,
          legacyDiscarded, upgraded, sessionPreserved };
      })()`);
      assert.deepEqual(cacheChecks, { rejected: true, atomic: true, staleRejected: true,
        corruptionRejected: true, oldDescriptorGone: true, oldPayloadGone: true, concurrent: true, recovered: true,
        legacyDiscarded: true, upgraded: true, sessionPreserved: true });
      console.log('browser: real IndexedDB transaction rollback under injected quota failure, selected-digest pinning, atomic concurrent publication/cleanup, and exact published corruption recovery passed');
      console.log('browser: image-cache schema upgrade discards only rebuildable cache entries and preserves the separate named-session record');
      if (externalPage) {
        const packCache = await evaluate(debuggerClient.send, `(async () => {
          const { loadPackagedSystemSnapshot } = await import(${JSON.stringify(new URL("src/image-artifact.mjs", iterationAssets).href)});
          const { DOLLY_SYSTEM_SNAPSHOT: metadata } = await import(${JSON.stringify(new URL("dist/dolly-pi-system-snapshot.mjs", iterationAssets).href)});
          if (metadata.encoding !== 'packs') throw new Error('external app did not publish shared packs');
          performance.clearResourceTimings();
          performance.setResourceTimingBufferSize(2000);
          await loadPackagedSystemSnapshot('pi', metadata);
          const resources = performance.getEntriesByType('resource').filter(entry => entry.name.includes('/dist/packs/'));
          return { expected: metadata.packs.length, reads: resources.map(entry => ({
            path: new URL(entry.name).pathname, transferred: entry.transferSize, encoded: entry.encodedBodySize,
          })) };
        })()`);
        assert.equal(packCache.reads.length, packCache.expected);
        assert.ok(packCache.reads.every(read => read.path.startsWith(`${browserBasePrefix}/dist/packs/`)), "pack URLs still contain a release ID");
        assert.ok(packCache.reads.every(read => read.encoded > 0 && read.transferred === 0),
          `published packs were not reused from the browser HTTP cache: ${JSON.stringify(packCache.reads.filter(read => read.transferred !== 0))}`);
        console.log(`browser: ${packCache.reads.length} release-independent Pi packs reloaded with zero network transfer`);
      }
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
        // Source builds have no fixed duration; the caller controls cancellation.
        Infinity,
      );
      assert.equal(state, "ready");
      const evidence = await evaluate(debuggerClient.send, `(() => {
        const bootstrap = document.querySelector('#bootstrap-log').textContent;
        const snapshot = window.__dolly?.systemSnapshot;
        return {
          mode: document.documentElement.dataset.bootMode,
          snapshotBytes: Number(document.documentElement.dataset.snapshotBytes),
          exportedBytes: snapshot instanceof ArrayBuffer ? snapshot.byteLength : 0,
          inputs: window.__dolly.systemInputs,
          bootstrap,
          lines: bootstrap.split('\\n').length,
          incompletePaints: globalThis.__dollyIncompleteBootstrapPaints,
          reusedArtifact: globalThis.__dollyReusedArtifact,
        };
      })()`);
      assert.equal(evidence.mode, "rebuild");
      assert.ok(evidence.snapshotBytes > 0);
      assert.equal(evidence.exportedBytes, evidence.snapshotBytes);
      assert.ok(evidence.lines <= 41);
      assert.ok(evidence.bootstrap.length <= 8192);
      assert.equal(evidence.incompletePaints, 0);
      if (unpackagedSnapshotMode) {
        assert.equal(evidence.reusedArtifact, selectedGraph.artifacts.length !== 0 && process.env.DOLLY_EXPECT_CACHE_STATE === "warm",
          "reproducibility run did not exercise its requested cold/cached path");
      }
      assert.match(
        evidence.bootstrap,
        new RegExp(`dollyfile: image ${selectedImage} complete; retained \\d+ paths`),
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
      await writeFile(`${output}.inputs.json`, JSON.stringify(evidence.inputs), { flag: "wx" });
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
              "grep -q '^# Dolly$' " +
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
          `browser: live Pages booted isolated Ghostty and ${selectedImage} in ${
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
      const { runCppSdkCases } = await import("../test/fixtures/cpp-sdk.mjs");
      if (!hasZig) assert.equal(await evaluate(debuggerClient.send,
        `window.__dolly.submit('test ! -e /usr/bin/zig && test ! -e /usr/lib/zig')`), 0,
      "C/C++ image must not retain the Zig compiler or SDK");
      await runCppSdkCases(command => evaluate(
          debuggerClient.send,
          `window.__dolly.submit(${JSON.stringify(command)})`,
      ), selectedModuleNames.has("cpython"));
      console.log("browser: implicit/explicit C++ SDK linking, containers, exceptions/destructors, RTTI, shared DSO runtime" +
        (selectedModuleNames.has("cpython") ? ", Python extension" : "") +
        " and kernel-plugin compilation passed");
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

      const installRequests = await evaluate(debuggerClient.send, "__dolly.httpRequestCount");
      assert.notEqual(await evaluate(debuggerClient.send,
        `__dolly.submit('pi install npm:@dolly-test/nonexistent-package@0.0.0')`), 0,
      "Pi must not pretend npm installed a package");
      assert.match(await visibleTerminalText(debuggerClient.send), /npm/);
      assert.equal(await evaluate(debuggerClient.send, "__dolly.httpRequestCount"), installRequests,
        "missing npm must fail before network access");

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
      assert.equal(await evaluate(debuggerClient.send,
        `__dolly.submit(${JSON.stringify("printf '\\033[2J\\033[3J\\033[H'")})`), 0);
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
      await waitForTerminalText(debuggerClient.send, /Bash is not installed/, "fresh Pi session_start notification");
      await clearTerminalSelection(debuggerClient.send);
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
        /(?:^|\n)[ \t]*dolly-slop-bang-marker[ \t]*(?:\r?\n|$)/,
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
        "! printf 'DOLLY-CHILD-%s\\n' PREFIX; sleep 8; printf 'DOLLY-CHILD-%s\\n' SUFFIX",
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
        20,
      );
      assert.doesNotMatch(
        await visibleTerminalText(debuggerClient.send),
        /DOLLY-CHILD-SUFFIX/,
        "Pi buffered child output until the command exited",
      );
      await dispatchKey(debuggerClient.send, {
        key: "C", code: "KeyC", modifiers: 10, windowsVirtualKeyCode: 67,
      });
      await waitForValue(debuggerClient.send, "navigator.clipboard.readText()",
        text => text.includes("DOLLY-CHILD-PREFIX") && !text.includes("DOLLY-CHILD-SUFFIX"),
        "Pi child output copied while the child is sleeping", 20);
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
        assert.equal(await evaluate(debuggerClient.send,
          `__dolly.submit(${JSON.stringify("printf '\\033[2J\\033[3J\\033[H'")})`), 0);
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
        await waitForTerminalText(debuggerClient.send, /Bash is not installed/, "fresh restarted Pi session_start notification");
        await clearTerminalSelection(debuggerClient.send);
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
    (value) => value === "ready" || value === "failed",
    "precompiled snapshot boot",
    1200,
  );
  assert.notEqual(snapshotReadyState, "failed");
  const snapshotBootMilliseconds = Date.now() - snapshotStarted;

  assert.equal(await evaluate(debuggerClient.send, "location.href"), interactivePage);
  await enterRecoveryShell(debuggerClient.send);
  const commandCases = browserShellCases(selectedModuleNames, localOrigin);
  for (const [command, input, expected = 0] of commandCases) {
    const status = await evaluate(debuggerClient.send, input === undefined
      ? `window.__dolly.submit(${JSON.stringify(command)})`
      : `(async () => {
          const transport = window.__dolly.transport;
          const sequence = transport.currentResultSequence();
          if (!window.__dolly.input(${JSON.stringify(input)})) throw new Error("input mailbox full");
          return transport.waitForResult(sequence);
        })()`);
    assert.equal(status, expected, command);
  }
  console.log(`browser: ${commandCases.length} shell/tool cases passed`);

  const compositionPrefix = "printf '%s' '";
  const composedText = "a".repeat(88 - Buffer.byteLength(compositionPrefix)) + "\uFEFFあ😀";
  const compositionSequence = await evaluate(debuggerClient.send, `(() => {
    const sequence = window.__dolly.transport.currentResultSequence();
    document.querySelector('#keyboard').dispatchEvent(new CompositionEvent('compositionend', {
      data: ${JSON.stringify(`${compositionPrefix}${composedText}' > /tmp/composed-text.txt`)},
    }));
    return sequence;
  })()`);
  await dispatchKey(debuggerClient.send, { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  assert.equal(await evaluate(debuggerClient.send,
    `window.__dolly.transport.waitForResult(${compositionSequence})`), 0);
  assert.equal(await evaluate(debuggerClient.send, `window.__dolly.submit(${JSON.stringify(
    `test "$(wc -c < /tmp/composed-text.txt)" -eq ${Buffer.byteLength(composedText)} && rm /tmp/composed-text.txt`,
  )})`), 0, "composed UTF-8 text changed at the 88-byte packet boundary");

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

  for (const name of ["browser-download.txt", "\uFEFFbrowser-download.txt"]) {
    const path = `/workspace/${name}`;
    const submit = command => evaluate(debuggerClient.send,
      `window.__dolly.submit(${JSON.stringify(command)})`);
    assert.equal(await submit(`echo DOLLY-BROWSER-DOWNLOAD > ${path}`), 0);
    const count = await evaluate(debuggerClient.send,
      "Number(document.documentElement.dataset.downloadCount ?? 0)");
    const previousFiles = new Set(await readdir(browserDownloadDirectory));
    assert.equal(await submit(`download ${path}`), 0);
    await waitForValue(debuggerClient.send,
      "Number(document.documentElement.dataset.downloadCount ?? 0)",
      value => value === count + 1, "browser download dispatch", 200);
    assert.equal(await evaluate(debuggerClient.send, "document.documentElement.dataset.downloadName"),
      name, "download dispatch changed the literal filename");
    let downloadedBytes = null, savedName;
    for (let attempt = 0; attempt < 200; attempt++) {
      const files = (await readdir(browserDownloadDirectory)).filter(file =>
        !previousFiles.has(file) && !file.endsWith(".crdownload"));
      if (files.length === 1) {
        savedName = files[0];
        downloadedBytes = await readFile(resolve(browserDownloadDirectory, savedName), "utf8").catch(() => null);
      }
      if (downloadedBytes !== null) break;
      await delay(25);
    }
    assert.equal(downloadedBytes, "DOLLY-BROWSER-DOWNLOAD\n");
    if (name === "browser-download.txt") assert.equal(savedName, name);
    console.log(`browser: download requested ${JSON.stringify(name)}, Chrome saved ${JSON.stringify(savedName)}`);
    assert.equal(await submit(`rm ${path}`), 0);
  }

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

  if (["gamedev", "gamedev-phone"].includes(selectedImage)) await runGraphicsProof(debuggerClient.send);

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
    selectionGeometry.paddingX + selectionGeometry.cellWidth / 4,
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
      geometry,
      dropped: Atomics.load(transport.words, transport.word + transport.constructor.eventDropped),
      bars: [...document.querySelectorAll('header, footer')].filter(element => element.getClientRects().length).length,
      backgroundColor: getComputedStyle(document.body).backgroundColor,
      caretColor: getComputedStyle(document.querySelector('#terminal')).caretColor,
      bootstrapFontLoaded: document.fonts.check('600 20px "Dolly IosevkaTerm SemiBold"'),
      bootstrapHidden: document.querySelector('#bootstrap-log').hidden,
      bootstrap: document.querySelector('#bootstrap-log').textContent,
      networkError: document.documentElement.dataset.networkError ?? '',
      fullscreen: document.documentElement.dataset.fullscreen,
      fullscreenElement: Boolean(document.fullscreenElement),
      totalPixels: pixels.length / 4,
      backgroundPixels: background,
      foregroundPixels: foreground,
      accentPixels: accent,
      cursorAccentPixels: cursorAccent,
      cursorCellPixels: geometry.cellWidth * geometry.cellHeight,
      opaquePixels: opaque,
    };
  })()`);

  assert.equal(evidence.state, "ready");
  assert.equal(evidence.bootMode, "snapshot");
  assert.ok(evidence.snapshotBytes > 0);
  assert.equal(evidence.terminal, "ghostty-rgba-wasm");
  assert.equal(evidence.canvasHidden, false);
  assert.ok(evidence.canvasWidth >= 800 && evidence.canvasHeight >= 550);
  assert.equal(evidence.canvasWidth, evidence.cssWidth);
  assert.equal(evidence.canvasHeight, evidence.cssHeight);
  assert.ok(evidence.frameSequence > 100);
  assert.ok(evidence.cols > 0 && evidence.rows > 0);
  assert.equal(evidence.cols, Math.floor(
    (evidence.canvasWidth - 2 * evidence.geometry.paddingX) / evidence.geometry.cellWidth));
  assert.equal(evidence.rows, Math.floor(
    (evidence.canvasHeight - 2 * evidence.geometry.paddingY) / evidence.geometry.cellHeight));
  assert.equal(evidence.dropped, 0);
  assert.equal(evidence.bars, 0);
  assert.equal(evidence.backgroundColor, "rgb(38, 38, 38)");
  assert.match(evidence.caretColor, /transparent|rgba\(0, 0, 0, 0\)/);
  assert.equal(evidence.bootstrapFontLoaded, true);
  assert.equal(evidence.bootstrapHidden, true);
  assert.equal(evidence.networkError, "");
  assert.equal(evidence.fullscreen, "on");
  assert.equal(evidence.fullscreenElement, true);
  assert.equal(evidence.opaquePixels, evidence.totalPixels);
  assert.ok(evidence.backgroundPixels > evidence.totalPixels * 0.5);
  assert.ok(evidence.foregroundPixels > 100);
  assert.ok(evidence.accentPixels > 10);
  assert.ok(evidence.cursorAccentPixels > evidence.cursorCellPixels * 0.5);
  assert.equal(initialFontSize, 20);
  assert.equal(increasedFontSize, 21);
  assert.equal(restoredFontSize, 20);
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

  console.log(
    `browser: sandbox Ghostty rendered ${evidence.canvasWidth}x${evidence.canvasHeight} ` +
    `(${evidence.cols}x${evidence.rows} cells), static snapshot boot ` +
    `${snapshotBootMilliseconds}ms, raw keys/Ctrl+Shift+V/C/block-cursor/zoom/fullscreen, ` +
    "Ghostty selection/scroll passed" +
    (selectedModuleNames.has("pi")
      ? "; Pi credential storage/model discovery and Codex OAuth exchange passed"
      : ""),
  );
  }
} catch (error) {
  if (chrome && (chrome.exitCode !== null || chrome.signalCode !== null ||
      debuggerClient?.socket.readyState === WebSocket.CLOSED)) {
    process.stderr.write(`browser process: exit ${chrome?.exitCode}, signal ${chrome?.signalCode}\n${chromeDiagnostics}\n`);
  }
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
  gitTransportFixture?.dispose();
  debuggerClient?.socket.close();
  if (chrome !== null) {
    chrome.kill("SIGTERM");
    await new Promise((resolveExit) => {
      if (chrome.exitCode !== null || chrome.signalCode !== null) resolveExit();
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
