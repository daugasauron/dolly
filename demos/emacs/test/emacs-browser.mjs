// GNU Emacs in the gnu-emacs image, in Chrome and Firefox: the editor entry,
// editing and saving a file, M-! running Slop and C-x C-c back to Slop. Then,
// in Chrome, the emacs package installed into a default-based session.
// Usage: node demos/emacs/test/emacs-browser.mjs [chromium|firefox ...]
import assert from "node:assert/strict";
import { demoTest, recoveryPrompt, shellPrompt } from "../../browser.mjs";
import { CANONICAL_ORIGIN } from "../../../src/static-asset.mjs";

const browsers = process.argv.length > 2 ? process.argv.slice(2) : ["chromium", "firefox"];
const file = "/tmp/dolly-emacs-test.txt";

for (const browser of browsers) {
  await demoTest("emacs", { image: "gnu-emacs", timeout: 600_000, browser }, async ({ open }) => {
    const { page, run, prompt, waitText, input } = await open({ prompt: null });
    const keys = async (...sequence) => { for (const key of sequence) await page.keyboard.press(key); };
    await waitText(/GNU Emacs inside Dolly/);
    await keys("Control+x", "Control+f");
    await waitText(/Find file:/);
    await input(`${file}\r`);
    await waitText(/dolly-emacs-test\.txt/);
    await input("Dolly Emacs 日本語");
    await keys("Control+x", "Control+s");
    await waitText(/Wrote \/tmp\/dolly-emacs-test\.txt/);
    await input("\x1b!");
    await waitText(/Shell command:/);
    await input("printf EMACS-SLOP-$((6 * 7))\r");
    await waitText(/EMACS-SLOP-42/);
    await keys("Control+x", "Control+c");
    await prompt(recoveryPrompt);
    await run(`test "$(cat ${file})" = 'Dolly Emacs 日本語' && rm ${file}`);
  });
}

if (browsers.includes("chromium")) {
  const { DOLLY_IMAGES } = await import("../../../dist/dolly-images.mjs");
  const pin = name => {
    const { dollyfile, sha256 } = DOLLY_IMAGES.find(definition => definition.image === name);
    return `${CANONICAL_ORIGIN}/${dollyfile} ${sha256}`;
  };
  // Host requirements are never inherited: the probe restates default's.
  const hosts = DOLLY_IMAGES.find(definition => definition.image === "default").hostRequirements;
  const recipe = ["DOLLY 6", "APPLICATION emacs-probe", ...hosts.map(host => `REQUIRES HOST ${host}`),
    `FROM ${pin("default")}`, `INSTALL ${pin("emacs")}`,
    "ENTRY /bin/foreground -i /bin/slop", ""].join("\n");
  await demoTest("emacs package", { image: "default", timeout: 600_000 }, async ({ open }) => {
    const { run } = await open({ path: "/custom/rebuild/", prompt: shellPrompt,
      setup: page => page.addInitScript(recipe => sessionStorage.setItem("dolly-custom-source", recipe), recipe) });
    await run("test \"$(emacs --batch --eval '(princ (shell-command-to-string \"printf PACKAGE-$((6 * 7))\"))')\" = PACKAGE-42");
    await run(`emacs --batch --eval '(with-temp-file "${file}" (insert "saved"))' && test "$(cat ${file})" = saved`);
  });
}
