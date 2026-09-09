import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { shellQuote } from "./slop-cases.mjs";

// Upstream tui/input_boundary.rs discards input for up to one second after protected screens draw.
export const codexProtectedInputDelay = 1100;

export async function runCodexTui(send, evaluate, origin) {
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const submit = command => evaluate(`window.__dolly.submit(${JSON.stringify(command)})`);
  const run = async command => assert.equal(await submit(command), 0, command);
  const config = `model = "gpt-5.5"
model_provider = "dolly-test"
approval_policy = "never"
sandbox_mode = "danger-full-access"
allow_login_shell = false
check_for_update_on_startup = false
[features]
plugins = false
[analytics]
enabled = false
[history]
persistence = "none"
[model_providers.dolly-test]
name = "Dolly test fixture"
base_url = "${origin}/demo/v1"
wire_api = "responses"
requires_openai_auth = false
supports_websockets = false
request_max_retries = 0
stream_max_retries = 0
`;
  await run("cp ~/.codex/installation_id /tmp/codex-id; cp ~/.codex/config.toml /tmp/codex-default-config");
  await run("grep -q 'requires_openai_auth = true' /tmp/codex-default-config && ! grep -q 'base_url' /tmp/codex-default-config");
  await run("CODEX_HOME=/tmp/codex-home/nested codex --version && cmp /tmp/codex-home/nested/config.toml /tmp/codex-default-config");
  await run("cp /tmp/codex-home/nested/installation_id /tmp/codex-custom-id && printf '# existing user config\\n' > /tmp/codex-home/nested/config.toml");
  await run("CODEX_HOME=/tmp/codex-home/nested codex --version && cmp /tmp/codex-home/nested/installation_id /tmp/codex-custom-id && grep -q '^# existing user config$' /tmp/codex-home/nested/config.toml");
  assert.equal(await submit("codex --dolly-invalid-option"), 2);
  await run(`printf ${shellQuote(config.replaceAll("\n", "\\n"))} > ~/.codex/config.toml`);
  await run("codex --version > /tmp/codex-version && grep -q '^codex-cli ' /tmp/codex-version && cmp ~/.codex/installation_id /tmp/codex-id");
  await run("mkdir -p /workspace/codex-demo; cd /workspace/codex-demo");
  await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await run("clear");
  const running = submit("codex --no-alt-screen");
  async function waitText(pattern) {
    let text;
    for (let i = 0; i < 600; i++) {
      text = await evaluate("window.__dolly.visibleTerminalText()");
      if (/application panicked|Worker failed/.test(text)) throw Error(`Codex crashed: ${text}`);
      if (pattern.test(text)) return text;
      await pause(100);
    }
    throw new Error(`Codex TUI did not show ${pattern}: ${text}`);
  }
  async function input(text, paste = false) {
    assert.equal(await evaluate(`window.__dolly.${paste ? "paste" : "input"}(${JSON.stringify(text)})`), true);
    await pause(300);
  }
  async function key(key, code = key, modifiers = 0) {
    assert.equal(await evaluate(`window.__dolly.key(${JSON.stringify(key)}, ${JSON.stringify(code)}, ${modifiers})`), true);
    await pause(100);
  }
  await waitText(/Do you trust the contents of this directory/);
  await pause(codexProtectedInputDelay);
  await key("Enter");
  await waitText(/model:\s+gpt-5\.5/);
  await input("AC");
  await key("ArrowLeft");
  await input("B");
  await waitText(/› ABC/);
  await key("End");
  await key("u", "KeyU", 2);
  await input("Use a shell command to create proof.txt containing DOLLY-CODEX-TOOL-PROOF, then read it back.", true);
  await key("Enter");
  const text = await waitText(/verified its contents by running a shell command inside Dolly\./);
  assert.match(text, /└ DOLLY-CODEX-TOOL-PROOF/);
  await mkdir("build/codex-tui-check", { recursive: true });
  await writeFile("build/codex-tui-check/terminal.txt", text);
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  await writeFile("build/codex-tui-check/screenshot.png", Buffer.from(data, "base64"));
  await input("/status");
  await key("Enter");
  await waitText(/Dolly test fixture/);
  await input("/quit");
  await key("Enter");
  assert.equal(await running, 0);
  await run("printf 'DOLLY-CODEX-TOOL-PROOF\\n' > /tmp/codex-expected; cmp proof.txt /tmp/codex-expected");
  await run("cmp ~/.codex/installation_id /tmp/codex-id");
}
