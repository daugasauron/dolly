// Neovim in the neovim image: the editor entry, keys, :w, :! and :q recovery,
// then a Unicode paste, resize and terminal modes after normal exit and Ctrl-C.
// Usage: node demos/neovim/test/neovim-browser.mjs
import assert from "node:assert/strict";
import { delay, demoTest, recoveryPrompt, writeCommand } from "../../browser.mjs";

await demoTest("neovim", { image: "neovim", timeout: 600_000 }, async ({ open }) => {
  const { page, submit, run, start, prompt, waitText, input } = await open({ prompt: null });
  const ex = async command => {
    await page.keyboard.type(":");
    await input(command);
    await page.keyboard.press("Enter");
  };
  let marker = 0;
  const shell = async command => {
    const label = `DOLLY-SHELL-${++marker}:`;
    await ex(`lua vim.fn.system(${JSON.stringify(command)}); print('${label}' .. vim.v.shell_error)`);
    return Number((await waitText(new RegExp(`${label}\\d+`))).match(new RegExp(`${label}(\\d+)`))[1]);
  };
  await page.keyboard.press("Escape");
  await waitText(/Neovim inside Dolly/);
  await ex("edit /tmp/dolly-neovim-entry.txt");
  await page.keyboard.type("iA:?_");
  await waitText(/A:\?_/);
  await page.keyboard.press("Escape");
  await delay(300);
  await ex("w");
  await waitText(/written/);
  assert.equal(await shell("test ! -e /usr/bin/cmake && test \"$(cat /tmp/dolly-neovim-entry.txt)\" = 'A:?_' && rm /tmp/dolly-neovim-entry.txt"), 0);
  await ex("!printf NVIM-SLOP-COMMAND");
  await waitText(/NVIM-SLOP-COMMAND[\s\S]*Press ENTER/);
  await page.keyboard.press("Enter");
  await ex("q");
  await prompt(recoveryPrompt);

  const scratch = "/tmp/dolly-neovim-test";
  const mode = "#include <dolly/runtime.h>\nint main(void) { return dolly_terminal_mode_get(0); }\n";
  await run(`mkdir ${scratch} && ${writeCommand(`${scratch}/mode.c`, mode)} && cc ${scratch}/mode.c -o ${scratch}/mode`);
  const terminalMode = await submit(`${scratch}/mode`);
  assert.ok(terminalMode >= 0 && terminalMode <= 15);
  await run(`printf 'DOLLY-NVIM-READY\\n' > ${scratch}/edit.txt && clear`);
  let editor = start(`nvim --clean ${scratch}/edit.txt`);
  await waitText(/DOLLY-NVIM-READY/);
  await page.keyboard.type("ggi");
  assert.equal(await page.evaluate(() => __dolly.paste("Dolly 日本語\n")), true);
  await waitText(/Dolly 日本語/);
  // The mode line shows Insert mode until Escape, without another key or resize.
  const modeLine = () => page.evaluate(() => {
    const { paddingX, paddingY, cellWidth, cellHeight } = __dolly.transport.geometry();
    const pixels = document.querySelector("#display").getContext("2d").getImageData(
      paddingX, paddingY + (__dolly.transport.dimensions().rows - 1) * cellHeight, cellWidth * 12, cellHeight).data;
    let lit = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] > 100 && pixels[i + 1] > 100 && pixels[i + 2] > 100) lit++;
    return lit;
  });
  const modeShown = async (shown, label) => {
    for (const deadline = Date.now() + 4000; (await modeLine() > 0) !== shown; await delay(100)) assert.ok(Date.now() < deadline, label);
  };
  await modeShown(true, "Insert mode is not visible");
  await page.keyboard.press("Escape");
  await modeShown(false, "Escape did not leave Insert mode");
  const before = await page.evaluate(() => __dolly.transport.dimensions());
  await page.setViewportSize({ width: 1000, height: 750 });
  await page.waitForFunction(({ cols, rows }) => __dolly.transport.dimensions().cols !== cols &&
    __dolly.transport.dimensions().rows !== rows, before);
  const dimensions = await page.evaluate(() => __dolly.transport.dimensions());
  await delay(500); // Neovim handles SIGWINCH on its next loop.
  await ex(`lua vim.fn.writefile({vim.o.columns .. 'x' .. vim.o.lines}, '${scratch}/size')`);
  await ex("wq");
  assert.equal(await editor.done, 0);
  await run(`test "$(cat ${scratch}/size)" = '${dimensions.cols}x${dimensions.rows}' && grep -q '^Dolly 日本語$' ${scratch}/edit.txt`);
  await run(`timeout 30 nvim --clean --headless ${scratch}/edit.txt -c 'lua assert(vim.api.nvim_get_current_line() == "Dolly 日本語")' -c quit`);
  assert.equal(await submit(`${scratch}/mode`), terminalMode, "normal exit restores terminal discipline");
  await run(`timeout 30 nvim --headless -c 'lua assert(vim.o.shell == "/bin/slop"); assert(vim.fn.system("printf SLOP-NVIM") == "SLOP-NVIM")' -c quit`);
  await run("clear");
  editor = start(`nvim --clean ${scratch}/edit.txt`);
  await waitText(/Dolly 日本語/);
  await ex("sleep 30");
  await delay(100);
  await page.keyboard.press("Control+c");
  assert.notEqual(await editor.done, 0, "Ctrl-C must interrupt Neovim's thirty-second sleep");
  assert.equal(await submit(`${scratch}/mode`), terminalMode, "SIGINT exit restores terminal discipline");
  await run(`grep -q '^Dolly 日本語$' ${scratch}/edit.txt && rm -rf ${scratch}`);
});
