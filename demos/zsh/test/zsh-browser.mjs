// zsh in default, as a person installs it: amy installs the package; zsh
// runs functions in a pipeline and in command substitution by spawn, with the
// shell's parameters and functions (README.md); at the terminal its editor
// takes a line and Tab completes a path, by zsh's own completion and by its
// completion system.
// Usage: node demos/zsh/test/zsh-browser.mjs [chromium|firefox ...]
import { demoTest, shellPrompt } from "../../browser.mjs";

const browsers = process.argv.length > 2 ? process.argv.slice(2) : ["chromium", "firefox"];

for (const browser of browsers) {
  await demoTest("zsh", { image: "default", timeout: 300_000, browser }, async ({ open }) => {
    const { page, run, input, waitText } = await open();
    await run("amy install zsh");
    await run("zsh -fc 'x=$(print inside); f() { print -r -- $1-$x }; g() { local y=$(f arg); print -r -- $y }; " +
      "g | tr a-z A-Z' | grep -qx ARG-INSIDE");
    await run("mkdir -p /tmp/zsh-tab/completed");

    await input("zsh -f\r");
    await waitText(/^dolly# ?$/m);
    await page.keyboard.type("ls -d /tmp/zsh-tab/co");
    await page.keyboard.press("Tab");
    await waitText(/ls -d \/tmp\/zsh-tab\/completed\//);
    await page.keyboard.press("Enter");
    await waitText(/^\/tmp\/zsh-tab\/completed\/?$/m);

    await input("autoload -Uz compinit && compinit -D && print COMPSYS-${#_comps}\r");
    await waitText(/^COMPSYS-\d{4,}$/m);
    await page.keyboard.type("cd /tmp/zsh-t");
    await page.keyboard.press("Tab");
    await waitText(/cd \/tmp\/zsh-tab\//);
    await page.keyboard.press("Enter");
    await input("print -r -- IN-$PWD; exit\r");
    await waitText(/^IN-\/tmp\/zsh-tab$/m);
    await waitText(shellPrompt);
  });
}
