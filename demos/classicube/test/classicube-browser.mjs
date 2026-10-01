// ClassiCube in the classicube image: singleplayer play and saved worlds, then
// the Pi agent overlay against a scripted OpenRouter provider.
// Usage: node demos/classicube/test/classicube-browser.mjs
// DOLLY_CLASSICUBE_MODELS_FILE=models.json (from demos/game-agent/codex-relay.mjs)
// runs the agent and multiplayer clients against that live relay instead; allow
// the test origin on the relay and pick it with DOLLY_BROWSER_PORT.
import { readFile } from "node:fs/promises";
import { acceptDownload, delay, demoTest, leaveGame, redirectFetch } from "../../browser.mjs";
import { relayProvider } from "../../rts/spectator/relay.mjs";
import { runClassiCubeAgentProof } from "./fixtures/classicube-agent-browser.mjs";
import { runClassiCubeMultiplayer } from "./fixtures/classicube-multiplayer-playwright.mjs";
import { classicubeProvider } from "./fixtures/classicube-provider.mjs";
import { runClassiCubeProof } from "./fixtures/classicube-singleplayer.mjs";

const projectDir = new URL("../../..", import.meta.url).pathname;
const relayFile = process.env.DOLLY_CLASSICUBE_MODELS_FILE;
const relay = relayFile && relayProvider(JSON.parse(await readFile(relayFile, "utf8")));
const fixture = relayFile ? null : classicubeProvider();
const handle = async (request, response, path, headers) => {
  if (!fixture || !path.startsWith("/fixture/classicube/api/v1/")) return false;
  await fixture.handle(request, response, headers);
  return true;
};

// The DevTools input these fixtures drive: exact keys, modifiers and mouse events.
async function devtools(page) {
  const cdp = await page.context().newCDPSession(page);
  const send = (method, params) => cdp.send(method, params);
  const evaluate = expression => page.evaluate(expression);
  const wait = async (expression, predicate, label) => {
    let value;
    for (let attempt = 0; attempt < 2400; attempt++, await delay(100)) {
      // A restored session navigates while being polled.
      value = await evaluate(expression).catch(() => undefined);
      if (predicate(value)) return value;
    }
    throw new Error(`timed out waiting for ${label}: ${JSON.stringify(value)}`);
  };
  const key = async ({ modifiers = 0, text, ...event }) => {
    await send("Input.dispatchKeyEvent", { type: "keyDown", modifiers, ...event, ...text ? { text } : {} });
    await send("Input.dispatchKeyEvent", { type: "keyUp", modifiers, ...event });
  };
  return { send, evaluate, wait, key };
}

await demoTest("classicube", { image: "classicube", timeout: 1_800_000,
  server: { handle, port: Number(process.env.DOLLY_BROWSER_PORT ?? 0) } }, async ({ server, open }) => {
  const policy = { maxRequests: 1024, rules: [
    { origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] },
    ...fixture ? [
      { origin: "https://openrouter.ai", path: "/api/v1/models", methods: ["GET"], maxResponseBytes: 16 * 1024 * 1024 },
      { origin: "https://openrouter.ai", path: "/api/v1/key", methods: ["GET"], credentialHeaders: ["authorization"] },
      { origin: "https://openrouter.ai", path: "/api/v1/auth/keys", methods: ["POST"] },
      { origin: "https://openrouter.ai", path: "/api/v1/chat/completions", methods: ["POST"],
        credentialHeaders: ["authorization"], timeoutMilliseconds: 120000 },
    ] : [{ origin: new URL(relay.baseUrl).origin, path: "/codex/responses", methods: ["POST"],
      credentialHeaders: ["authorization"], maxRequestBytes: 8 * 1024 * 1024, timeoutMilliseconds: 120000 }],
  ] };
  const setup = redirectFetch("https://openrouter.ai", `${server.origin}/fixture/classicube`);

  if (fixture) {
    const terminal = await open({ policy, prompt: null });
    const { page, run, start } = terminal;
    await leaveGame(terminal);
    await run("cd /home/dolly/classicube");
    start("classicube --singleplayer");
    await runClassiCubeProof({ ...await devtools(page), projectDir });
    await page.close();
  }

  const agent = await open({ policy, prompt: null, setup });
  await runClassiCubeAgentProof({ ...await devtools(agent.page), input: agent.input, projectDir, relayFile, fixture,
    selectFile: path => agent.page.locator("#file-upload input").setInputFiles(path),
    download: async path => readFile(await (await acceptDownload(agent.page, () => agent.run(`download ${path}`))).path()) });
  fixture?.verify();
  await agent.page.close();
  if (relayFile) {
    const multiplayer = await open({ policy, prompt: null, setup });
    await runClassiCubeMultiplayer({ page: multiplayer.page, modelsFile: relayFile, projectDir });
  }
});
