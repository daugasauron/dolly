// Dollyfile Studio in the dollyfile-studio image: Pi starts with its prompts
// and search tools, dollyfile-lint, host module sources, Neovim highlighting
// and inline lint, and in-session dollyfile-build with its result tab.
// Usage: node demos/studio/test/studio-browser.mjs
import assert from "node:assert/strict";
import { delay, demoTest, recoveryPrompt, shellQuote, writeCommand } from "../../browser.mjs";

await demoTest("studio", { image: "dollyfile-studio", webgpu: true, timeout: 900_000,
  server: { fixtures: { "studio-nvim.lua": "demos/studio/test/fixtures/studio-nvim.lua" } } }, async ({ server, open }) => {
  const terminal = await open({ prompt: /Dollyfile Studio.*dolly-hello/,
    policy: { rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] } });
  const { page, run, start, prompt, waitText, text, input } = terminal;
  assert.doesNotMatch(await text(), /(?:fd|ripgrep)\s+not found|Failed to download (?:fd|ripgrep)/i);
  await page.keyboard.press("Control+d");
  await prompt(recoveryPrompt, terminal.pid);

  await run("dollyfile-lint /workspace/Dollyfile && dollyfile-lint /usr/share/dollyfile-studio/examples/Dollyfile-tool");
  await run("printf 'DOLLY 2\\n' | dollyfile-lint --stdin Draft", 1);
  // Errors name the literal file, even with replacement patterns or Unicode.
  for (const label of ["Dollyfile-$&", "Dollyfile-$$", "Dollyfile-$'", "Dollyfile-$`", "Dollyfile-東京"]) {
    await run(`message=$(printf 'DOLLY 6\\n' | dollyfile-lint --stdin ${shellQuote(label)} 2>&1); test "$?" = 1 && test "$message" = ${shellQuote(`${label}:1: missing APPLICATION, TOOLCHAIN or PACKAGE`)}`);
  }
  await run("test -f /home/dolly/.pi/agent/skills/dollyfiles/SKILL.md && test -f /home/dolly/.pi/agent/extensions/local-model-provider.js");
  // Recipes name canonical URLs; the page serves its own copies, pinned by hash.
  await run("curl -f https://daugasauron.com/demos/javascript/Dollyfile-typescript-build -o /tmp/module.dm && curl -f https://daugasauron.com/dist/static/default/quickjs.tar -o /tmp/source.tar && grep -q \"$(sha256sum /tmp/source.tar | cut -d ' ' -f 1)\" /tmp/module.dm");
  await run("curl -f https://daugasauron.com/dist/static/default/runtimes/quickjs-main.c | grep -q dolly_quickjs_run && rm /tmp/module.dm /tmp/source.tar");
  await run(`curl -fsS ${server.origin}/fixture/studio-nvim.lua -o /tmp/studio-nvim.lua && timeout 60 nvim --headless -n -i NONE -S /tmp/studio-nvim.lua`);
  await run("rm -f /tmp/studio-nvim.lua /tmp/Dollyfile-studio-lint && clear");
  const editor = start("nvim /workspace/Dollyfile");
  await waitText(/DOLLY 6/);
  // An edit shows its lint error without saving; correcting it clears the error.
  await page.keyboard.type("gg$a0");
  await page.keyboard.press("Escape");
  await waitText(/! .*DOLLY 6/);
  await page.keyboard.type("$x");
  for (const deadline = Date.now() + 30_000; /! .*DOLLY 6/.test(await text()); await delay(100)) {
    assert.ok(Date.now() < deadline, "correcting the recipe did not clear its error");
  }
  await page.keyboard.type(":");
  await input("q!\r");
  assert.equal(await editor.done, 0);

  // dollyfile-build streams a build in the page without approval; only clicking
  // Open image opens the result, which has neither parent files nor build services.
  const { DOLLY_IMAGES } = await import("../../../dist/dolly-images.mjs");
  const system = DOLLY_IMAGES.find(definition => definition.image === "system").sha256;
  const recipe = `DOLLY 6
APPLICATION build-proof
REQUIRES HOST runtime@0
REQUIRES HOST display@0
REQUIRES HOST input@0
REQUIRES HOST download@0
REQUIRES HOST http@0
REQUIRES HOST snapshot@0
REQUIRES HOST upload@0
FROM https://daugasauron.com/Dollyfile-system ${system}
FILE /tmp/proof/hello.c
    #include <stdio.h>
    #warning BUILD-COMPILER-WARNING
    int main(void) { puts("BUILT-IN-WASM"); fputs("LIVE-BUILD-STDERR\\n", stderr); return 0; }
FILE /tmp/proof/check.slop
    if curl -fsS https://webgpu.dolly.invalid/v1/models; then exit 1; fi
    if download /etc/dolly/Dollyfile; then exit 1; fi
    printf 'BUILD-SERVICES-DENIED\\n'
SLOP slop -e /tmp/proof/check.slop
FILE /tmp/proof/stdin.c
    #include <unistd.h>
    int main(void) { char byte; return isatty(0) || read(0, &byte, 1) != 0 || read(0, &byte, 1) != 0; }
SLOP cc /tmp/proof/stdin.c -o /tmp/proof/stdin
SLOP timeout 2 /tmp/proof/stdin
SLOP test "$(printf pipe-input | cat)" = pipe-input
SLOP printf file-input > /tmp/proof/input
SLOP test "$(cat < /tmp/proof/input)" = file-input
SLOP cc /tmp/proof/hello.c -o /usr/bin/hello
SLOP /usr/bin/hello
SLOP printf 'LIVE-BUILD-OUTPUT\\n'
SLOP sleep 4
EXPORTS TOOL hello
SLOP rm -rf /tmp/proof
ENTRY /bin/foreground -i /bin/slop
`;
  const panel = page.locator("#image-build");
  const state = value => page.waitForFunction(value => document.querySelector("#image-build")?.dataset.state === value,
    value, { timeout: 300_000 });
  const build = async source => {
    await run(writeCommand("/workspace/Dollyfile-build-proof", source));
    const running = start("dollyfile-build /workspace/Dollyfile-build-proof");
    await state("building");
    assert.equal(running.status, null);
    assert.equal(await panel.locator("[data-action=approve]").count(), 0);
    assert.equal(await panel.locator("[data-action=open]").isHidden(), true);
    return running;
  };
  await run("dollyfile-build --help");
  await run("dollyfile-build --version", 2);
  await run("dollyfile-build --open /workspace/Dollyfile", 2);
  await run("dollyfile-build /workspace/missing-Dollyfile", 1);
  await run("printf kept > /workspace/build-parent-proof");
  const pages = page.context().pages().length;
  let building = await build(recipe);
  assert.equal(await panel.locator("[data-recipe]").textContent(), recipe);
  await waitText(/\nLIVE-BUILD-OUTPUT\r?\n/, 120_000);
  assert.equal(building.status, null, "the build log must stream before completion");
  const output = await panel.locator("[data-output]").textContent();
  for (const expected of [/warning: BUILD-COMPILER-WARNING/, /\nBUILT-IN-WASM\n/, /\nLIVE-BUILD-STDERR\n/, /\nLIVE-BUILD-OUTPUT\n/]) {
    assert.match(output, expected);
  }
  await state("ready");
  assert.equal(await building.done, 0);
  await run('test "$(cat /workspace/build-parent-proof)" = kept && test ! -e /usr/bin/hello');
  assert.equal(page.context().pages().length, pages, "building must not open a tab");
  const [result] = await Promise.all([page.context().waitForEvent("page"), panel.locator('[data-action="open"]').click()]);
  await result.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus), null, { timeout: 180_000 });
  await result.evaluate(() => __dolly.waitForInteractiveTerminal(/(?:^|\n)dolly:[^\n]*\$\s*$/, "result shell"));
  for (const [command, status] of [['test "$(hello)" = BUILT-IN-WASM', 0], ["test ! -f /workspace/build-parent-proof", 0]]) {
    assert.equal(await result.evaluate(command => __dolly.submit(command), command), status, command);
  }
  assert.notEqual(await result.evaluate(() => __dolly.submit("curl -fsS https://example.com/")), 0);
  assert.equal(await result.evaluate(() => window.opener), null);
  assert.equal(await result.evaluate(() => performance.getEntriesByType("resource").some(entry => entry.name.startsWith("https://example.com/"))), false);
  assert.match(await result.locator("#bootstrap-log").textContent(), /loading precompiled userspace snapshot/);
  await result.close();

  building = await build(recipe.replace("SLOP sleep 4", "FILE /tmp/proof/error.c\n    #error BUILD-COMPILER-ERROR\nSLOP cc /tmp/proof/error.c -o /tmp/proof/error"));
  await state("error");
  assert.notEqual(await building.done, 0);
  assert.match(await panel.locator("[data-output]").textContent(), /error: BUILD-COMPILER-ERROR/);
  building = await build(recipe.replace("SLOP sleep 4", "SLOP sleep 60"));
  await panel.locator('[data-action="cancel"]').click();
  assert.notEqual(await building.done, 0);
  await state("error");
  building = await build(recipe.replace("SLOP sleep 4", "SLOP sleep 60").replace("LIVE-BUILD-OUTPUT", "LIVE-CANCEL-OUTPUT"));
  await waitText(/\nLIVE-CANCEL-OUTPUT\r?\n/, 120_000);
  const stopped = Date.now();
  await page.keyboard.press("Control+c");
  assert.notEqual(await building.done, 0);
  await state("error");
  assert.ok(Date.now() - stopped < 5000, "build cancellation exceeded five seconds");
  await run('test "$(cat /workspace/build-parent-proof)" = kept && rm /workspace/Dollyfile-build-proof /workspace/build-parent-proof');
  assert.equal(page.context().pages().length, pages, "failed and cancelled builds must not open tabs");
});
