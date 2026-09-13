import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { importSessionFile } from "../../src/session-file.mjs";

// Run on the session list after the harness creates the real browser-proof save.
export async function runSessionFilesProof({ evaluate, wait, selectFile, downloadDirectory }) {
  const button = (name, label) => `(() => {
    const item = [...document.querySelectorAll('#sessions li')]
      .find(li => li.firstChild.textContent === ${JSON.stringify(name)});
    [...item.querySelectorAll('button')].find(button => button.textContent === ${JSON.stringify(label)}).click();
  })()`;
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

export async function runSessionRecoveryProof({ evaluate, wait, navigate, assets, sessionBase }) {
  const store = JSON.stringify(new URL("src/session-store.mjs", assets).href);
  const fingerprint = () => evaluate(`(async () => {
    const record = await (await import(${store})).loadStoredSession('wrong-base');
    return { ...record, bytes: [...new Uint8Array(await crypto.subtle.digest('SHA-256', record.bytes))] };
  })()`);
  const before = await fingerprint();
  await evaluate(`(() => {
    const item = [...document.querySelectorAll('#sessions li')].find(li => li.firstChild.textContent === 'wrong-base');
    [...item.querySelectorAll('button')].find(button => button.textContent === 'Recover files').click();
  })()`);
  const boot = async () => {
    assert.equal(await wait("document.documentElement.dataset.dollyStatus",
      value => ["ready", "failed"].includes(value), "session file recovery", 1200), "ready",
    await evaluate("document.querySelector('#bootstrap-log').textContent"));
    await evaluate("__dolly.waitForInteractiveTerminal(/dolly:[^\\n]*\\$\\s*$/, 'recovered shell')");
  };
  await boot();
  assert.equal(await evaluate("document.documentElement.dataset.image"), "system");
  assert.equal(await evaluate("document.documentElement.dataset.sessionStatus"), "recovered");
  assert.equal(await evaluate("__dolly.sessionName"), null);
  const submit = command => evaluate(`__dolly.submit(${JSON.stringify(command)})`);
  const destination = "/workspace/recovered-wrong-base";
  for (const command of [
    `grep -q SECOND-SAVE ${destination}/workspace/session-proof.txt`,
    `grep -q SESSION-CREDENTIAL ${destination}/home/dolly/session-credential`,
    `test -d ${destination}/workspace/session-empty`,
    `test ! -e ${destination}/workspace/session-link`,
    `test ! -e ${destination}/workspace/session-large`,
    `test ! -e ${destination}/etc`,
    `test ! -e ${destination}/usr`,
    "test ! -e /home/dolly/session-credential",
    "test -f /usr/include/zconf.h",
    "test -f /usr/share/licenses/zlib/LICENSE",
    "! grep -q SESSION-BASE-EDIT /etc/gitconfig",
    "test ! -e /tmp/dolly-session-recovery.delta",
  ]) assert.equal(await submit(command), 0, command);
  assert.equal(await submit(`session-recover /tmp/missing ${destination}`), 1);
  assert.equal(await submit(`grep -q SECOND-SAVE ${destination}/workspace/session-proof.txt`), 0);
  assert.deepEqual(await fingerprint(), before, "recovery modified the original checkpoint");
  assert.deepEqual(await evaluate(`(async () => {
    let prompts = 0;
    window.prompt = () => { prompts++; return 'recovered-copy'; };
    return { name: await __dolly.saveSession(), prompts };
  })()`), { name: "recovered-copy", prompts: 1 });
  assert.deepEqual(await fingerprint(), before, "saving recovered files replaced the original checkpoint");
  await navigate(`${sessionBase}recovered-copy`);
  await boot();
  assert.equal(await submit(`grep -q SECOND-SAVE ${destination}/workspace/session-proof.txt`), 0);
  await navigate(`${sessionBase}broken-data?recover=1`);
  assert.equal(await wait("document.documentElement.dataset.dollyStatus",
    value => ["ready", "failed"].includes(value), "corrupt recovery", 1200), "failed");
  assert.ok(await evaluate(`(async () => (await (await import(${store})).loadStoredSession('broken-data')) !== null)()`));
  assert.deepEqual(await fingerprint(), before);
  console.log("browser: incompatible save recovered into a fresh shell; original, system, conflicts and independent resave verified");
}
