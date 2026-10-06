// SHELL is the image's to name: an image that carries Slop has it, and one
// that holds only a program has none.
import assert from "node:assert/strict";
import { browserTest } from "./browser.mjs";
import { CANONICAL_ORIGIN } from "../src/static-asset.mjs";

const { DOLLY_IMAGES } = await import("../dist/dolly-images.mjs");
const display = DOLLY_IMAGES.find(({ image }) => image === "display");
const recipe = ["DOLLY 6", "APPLICATION no-shell", "REQUIRES HOST runtime@0", "REQUIRES HOST display@0",
  `INSTALL ${CANONICAL_ORIGIN}/${display.dollyfile} ${display.sha256}`,
  "FILE /tmp/shell.c", "    #include <stdio.h>", "    #include <stdlib.h>",
  '    int main(void) { const char *shell = getenv("SHELL"); printf("SHELL=%s.\\n", shell ? shell : "unset"); getchar(); return 0; }',
  "RUN /usr/libexec/dolly/process-bin/compiler --dolly-toolchain-mode=c -O1 /tmp/shell.c -o /bin/shell-probe",
  "EXPORTS FILE shell-probe /bin/shell-probe", "ENTRY /bin/shell-probe", ""].join("\n");

await browserTest("shell environment", {}, async ({ open }) => {
  const shell = await open();
  assert.equal(await shell.submit('test "$SHELL" = /bin/slop'), 0, await shell.text());
  const bare = await open({ path: "/custom/rebuild/", prompt: null,
    setup: page => page.addInitScript(source => sessionStorage.setItem("dolly-custom-source", source), recipe) });
  await bare.waitForText(/SHELL=unset\./);
});
