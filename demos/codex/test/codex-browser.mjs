// Codex in the codex image: the TUI's editing, paste, shell tool, status and
// exit against a scripted Responses provider, then device login, cancellation,
// persistence, token refresh and the login CLI against synthetic OAuth.
// Usage: node demos/codex/test/codex-browser.mjs
import { delay, demoTest, recoveryPrompt } from "../../browser.mjs";
import { codexLoginFetch, codexLoginRules, createCodexLoginFixture, runCodexLogin } from "./fixtures/codex-login.mjs";
import { codexProtectedInputDelay, runCodexTui } from "./fixtures/codex-tui.mjs";
import { demoFixture } from "./fixtures/codex-responses.mjs";

const responses = demoFixture(), login = createCodexLoginFixture();
const handle = (request, response) => responses.handle(request, response) || login.handle(request, response);
await demoTest("codex", { image: "codex", timeout: 1_200_000, server: { handle } }, async ({ server, open }) => {
  // The image enters Codex's sign-in screen; Ctrl-C leaves it for the shell.
  const shell = async options => {
    const terminal = await open({ ...options, prompt: null });
    await terminal.waitText(/Sign in with ChatGPT/, 120_000);
    await delay(codexProtectedInputDelay);
    const entry = await terminal.page.evaluate(() => __dolly.foregroundPid);
    await terminal.page.keyboard.press("Control+c");
    await terminal.prompt(recoveryPrompt, entry);
    return terminal;
  };
  const tui = await shell({ policy: { maxRequests: 256,
    rules: [{ origin: server.origin, path: "/demo/v1/responses", methods: ["POST"] }] } });
  await runCodexTui(tui.page, server.origin);
  responses.verify();
  await tui.page.close();

  const device = await shell({ policy: { maxRequests: 256, rules: codexLoginRules },
    setup: page => page.addInitScript(codexLoginFetch, server.origin) });
  await runCodexLogin(device.page, login);
  login.verify();
});
