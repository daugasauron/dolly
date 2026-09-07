import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

export async function selectFile(send, selector, path) {
  const { result } = await send("Runtime.evaluate", { expression: `document.querySelector(${JSON.stringify(selector)})` });
  assert.equal(result.subtype, "node", selector);
  try { await send("DOM.setFileInputFiles", { objectId: result.objectId, files: [path] }); }
  finally { await send("Runtime.releaseObject", { objectId: result.objectId }); }
}

export async function runUploadProof({ send, evaluate, wait, submit, press }) {
  const scratch = await mkdtemp(resolve(tmpdir(), "dolly-upload-test-"));
  const bytes = Buffer.from(Uint8Array.from({ length: 150000 }, (_, index) => index & 255));
  const binary = resolve(scratch, "日本語.bin"), empty = resolve(scratch, "empty");
  await writeFile(binary, bytes);
  await writeFile(empty, "");
  const start = async command => {
    await evaluate(`globalThis.__uploadStatus = null;
      __dolly.submit(${JSON.stringify(command)}).then(status => { __uploadStatus = status; }); true`);
    await wait("!!document.querySelector('#file-upload[open]')", Boolean, "visible upload picker", 100);
  };
  const done = expected => wait("globalThis.__uploadStatus", value => value !== null, "upload result", 100)
    .then(status => assert.equal(status, expected));
  try {
    await start("upload /workspace/upload-test.bin");
    assert.equal(await evaluate("document.querySelector('#file-upload input').files.length"), 0);
    await selectFile(send, "#file-upload input", binary);
    await done(0);
    assert.equal(await evaluate("document.activeElement.id"), "keyboard", "upload returns keyboard focus to the terminal");
    const digest = createHash("sha256").update(bytes).digest("hex");
    assert.equal(await submit(`test "$(sha256sum /workspace/upload-test.bin | cut -d ' ' -f 1)" = ${digest}`), 0);
    assert.equal(await submit("upload /workspace/upload-test.bin"), 1, "must not overwrite or reopen picker");
    assert.equal(await evaluate("!!document.querySelector('#file-upload[open]')"), false);

    const race = `#include <dolly/runtime.h>
#include <stdio.h>
#include <unistd.h>
int main(void) {
  char *args[] = {"upload", "/workspace/upload-race", NULL};
  const int child = dolly_spawn("/bin/upload", 2, args, 0, 1, 2);
  if (child <= 0) return 2;
  sleep(1);
  FILE *file = fopen(args[1], "w");
  if (!file) return 2;
  fputs("created while selecting", file);
  fclose(file);
  puts("UPLOAD-RACE-READY");
  fflush(stdout);
  int status;
  return dolly_wait(child, &status) == 0 ? status : 2;
}`;
    const quote = text => "'" + text.replaceAll("'", "'\\''") + "'";
    assert.equal(await submit(`printf '%s\\n' ${race.split("\n").map(quote).join(" ")} > /tmp/upload-race.c && cc -O0 /tmp/upload-race.c -o /tmp/upload-race`), 0);
    await start("/tmp/upload-race");
    await wait("__dolly.visibleTerminalText()", text => /(?:^|\n)UPLOAD-RACE-READY(?:\n|$)/.test(text), "destination created during selection", 100);
    await selectFile(send, "#file-upload input", binary);
    await done(1);
    assert.equal(await submit("test \"$(cat /workspace/upload-race)\" = 'created while selecting'"), 0);

    await start("upload /workspace/upload-empty");
    await selectFile(send, "#file-upload input", empty);
    await done(0);
    assert.equal(await submit("test -f /workspace/upload-empty && test ! -s /workspace/upload-empty"), 0);

    await start("upload /workspace/upload-cancelled");
    await press({ key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await done(1);
    assert.equal(await submit("test ! -e /workspace/upload-cancelled"), 0);

    await start("upload /workspace/upload-interrupted");
    await press({ key: "c", code: "KeyC", modifiers: 2, windowsVirtualKeyCode: 67 });
    await done(130);
    await wait("!!document.querySelector('#file-upload[open]')", value => !value, "cancelled picker retirement", 100);
    assert.equal(await evaluate("document.activeElement.id"), "keyboard", "cancellation returns keyboard focus to the terminal");
    assert.equal(await submit("test ! -e /workspace/upload-interrupted"), 0);
    assert.equal(await submit("test -z \"$(find /tmp -name 'dolly-upload-*')\""), 0, "cancelled uploads own and clean scratch files");
    assert.equal(await submit("printf 'shell still works\\n'"), 0);
  } finally {
    try {
      if (await evaluate("!!document.querySelector('#file-upload[open]')")) {
        await press({ key: "c", code: "KeyC", modifiers: 2, windowsVirtualKeyCode: 67 });
        await wait("globalThis.__uploadStatus", value => value !== null, "upload cleanup", 100);
      }
      await submit("rm -f /workspace/upload-test.bin /workspace/upload-empty /workspace/upload-cancelled /workspace/upload-interrupted /workspace/upload-race /tmp/upload-race.c /tmp/upload-race");
    } finally { await rm(scratch, { recursive: true, force: true }); }
  }
}
