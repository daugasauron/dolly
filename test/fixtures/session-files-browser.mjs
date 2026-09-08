import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { importSessionFile } from "../../src/session-file.mjs";

// Run on the session list after the harness creates the real browser-proof save.
export async function runSessionFilesProof({ evaluate, wait, selectFile, downloadDirectory }) {
  const button = (name, label) => `Array.from(document.querySelectorAll('#sessions li'))
    .find(li => li.firstChild.textContent === ${JSON.stringify(name)})
    ?.querySelectorAll('button')[${label === "Export" ? 0 : 1}].click()`;
  const count = "document.querySelectorAll('#sessions li').length";
  const idle = () => wait("!document.querySelector('#import-session').disabled", Boolean, "session operation completion", 200);
  await evaluate("window.__sessionDialogs = { prompt: window.prompt, confirm: window.confirm };");
  try {
    await evaluate(button("browser-proof", "Export"));
    await idle();
    assert.match(await evaluate("document.querySelector('#status').textContent"), /Exported browser-proof/);
    const path = resolve(downloadDirectory, "browser-proof.dolly-session");
    let bytes;
    for (let attempt = 0; attempt < 200; attempt++) {
      bytes = await readFile(path).catch(() => undefined);
      if (bytes) break;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.ok(bytes, "browser wrote the exported file");
    assert.equal((await importSessionFile(new Blob([bytes]))).name, "browser-proof");
    await evaluate("window.confirm = () => false;");
    await evaluate(button("browser-proof", "Delete"));
    await idle();
    assert.equal(await evaluate(count), 1, "cancelled deletion retains the save");
    await evaluate("window.confirm = () => true;");
    await evaluate(button("browser-proof", "Delete"));
    await idle();
    assert.equal(await evaluate(count), 0);
    const upload = async answer => {
      await evaluate(`window.prompt = () => ${JSON.stringify(answer)};`);
      await selectFile("#import-session", path);
      await idle();
    };
    await upload(null);
    assert.equal(await evaluate(count), 0, "cancelled import writes nothing");
    await upload("../invalid");
    assert.equal(await evaluate(count), 0);
    assert.match(await evaluate("document.querySelector('#status').textContent"), /Names use/);
    await upload("browser-proof");
    assert.equal(await evaluate(count), 1);
    await upload("browser-proof");
    assert.equal(await evaluate(count), 1);
    assert.match(await evaluate("document.querySelector('#status').textContent"), /already exists/);
    await upload("imported-copy");
    assert.equal(await evaluate(count), 2, "a different name imports separately");
    await evaluate(button("imported-copy", "Delete"));
    await idle();
    assert.equal(await evaluate(count), 1);
    // The next restore in the caller now uses bytes read from the downloaded file,
    // not the original IndexedDB record (which was deleted above).
    assert.equal(await evaluate("typeof window.__dolly"), "undefined");
    console.log("browser: real save exported to disk, deleted, imported without overwrite, ready for Wasm restore");
  } finally {
    await evaluate("Object.assign(window, window.__sessionDialogs); delete window.__sessionDialogs;");
  }
}
