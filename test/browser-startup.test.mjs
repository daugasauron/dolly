import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import test from "node:test";
import { waitForDebugger } from "../scripts/browser-startup.mjs";

test("debugger startup uses its own process output and settles exits, errors and timeouts", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const outcome of ["ready", "exit", "signal", "error", "timeout", "already-exited"]) {
    const chrome = Object.assign(new EventEmitter(), { stderr: new EventEmitter(),
      exitCode: outcome === "already-exited" ? 1 : null, signalCode: null });
    const pending = waitForDebugger(chrome);
    if (outcome === "ready") {
      chrome.stderr.emit("data", Buffer.from("Chrome startup\nDevTools listening on ws://127.0.0.1:4"));
      chrome.stderr.emit("data", Buffer.from("321/devtools/browser/test\n"));
      assert.equal(await pending, 4321);
    } else {
      const rejected = assert.rejects(pending, /Chrome exited|spawn failed|timed out/);
      if (outcome === "exit") chrome.emit("exit", 21, null);
      if (outcome === "signal") chrome.emit("exit", null, "SIGTERM");
      if (outcome === "error") chrome.emit("error", new Error("spawn failed"));
      if (outcome === "timeout") t.mock.timers.tick(10_000);
      await rejected;
    }
    assert.equal(chrome.stderr.listenerCount("data"), 0);
    assert.equal(chrome.listenerCount("exit"), 0);
    assert.equal(chrome.listenerCount("error"), 0);
    t.mock.timers.tick(10_000);
  }
});

test("browser preparation never removes another process's profile locks or debugger identity", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "dolly-profile-proof-"));
  try {
    const profile = resolve(root, "profile");
    await mkdir(profile);
    const names = ["DevToolsActivePort", "SingletonCookie", "SingletonLock", "SingletonSocket"];
    for (const name of names) await writeFile(resolve(profile, name), `owned by another browser: ${name}`);
    const source = await readFile(new URL("../scripts/browser-harness.mjs", import.meta.url), "utf8");
    const preparation = source.slice(source.indexOf("const requestedProfile = "), source.indexOf("chrome = spawn(chromeBinary, ["));
    assert.ok(preparation.includes("requestedProfile"));
    for (const rtsLiveMode of [false, true]) await runInNewContext(`(async () => {
      let persistentProfile, browserDownloadDirectory, userDataDir, ephemeralProfileRoot;
      ${preparation}
      assert.equal(persistentProfile, rtsLiveMode ? null : process.env.DOLLY_BROWSER_PROFILE);
    })()`, { process: { env: { DOLLY_BROWSER_PROFILE: profile } }, realOpenRouterMode: false, rtsLiveMode,
      assert, mkdir, mkdtemp, rm, resolve, tmpdir: () => root });
    for (const name of names) {
      assert.equal(await readFile(resolve(profile, name), "utf8"), `owned by another browser: ${name}`);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
