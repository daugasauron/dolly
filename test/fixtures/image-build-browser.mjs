import assert from "node:assert/strict";

export async function runImageBuildProof({ evaluate, wait, submit, click, press, openResult, pageCount }) {
  const quote = text => "'" + text.replaceAll("'", "'\\''") + "'";
  const waitState = state => wait("document.querySelector('#image-build')?.dataset.state", value => value === state, `build ${state}`);
  async function start(source) {
    assert.equal(await submit(`printf '%s\\n' ${source.trimEnd().split("\n").map(quote).join(" ")} > /workspace/Dollyfile-build-proof`), 0);
    await evaluate(`globalThis.__buildStatus = null;
      void __dolly.submit('dollyfile-build /workspace/Dollyfile-build-proof').then(status => { __buildStatus = status; }); true`);
    await waitState("building");
    assert.equal(await evaluate("__buildStatus"), null);
    assert.equal(await evaluate("document.querySelector('#image-build [data-action=approve]') === null"), true);
    assert.equal(await evaluate("document.querySelector('#image-build [data-action=open]').hidden"), true);
  }
  const base = await evaluate(`(async () => {
    const {DOLLY_IMAGES} = await import(new URL('../dist/dolly-images.mjs', document.baseURI));
    return DOLLY_IMAGES.find(image => image.image === 'system').sha256;
  })()`);
  const source = `DOLLY 3
IMAGE build-proof
FROM HOST /Dollyfile-system ${base}
FILE /tmp/proof/hello.c
    #include <stdio.h>
    int main(void) { puts("BUILT-IN-WASM"); return 0; }
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
SLOP printf 'LIVE-BUILD-OUTPUT\\n'
SLOP sleep 4
SLOP cc /tmp/proof/hello.c -o /usr/bin/hello
EXPORTS TOOL hello
SLOP rm -rf /tmp/proof
ENTRY /bin/foreground -i /bin/slop
`;
  try {
    assert.equal(await submit("dollyfile-build --help"), 0);
    assert.equal(await submit("dollyfile-build --version"), 2);
    assert.equal(await submit("dollyfile-build --open /workspace/Dollyfile"), 2);
    assert.equal(await submit("dollyfile-build /workspace/missing-Dollyfile"), 1);
    assert.match(await evaluate("__dolly.visibleTerminalText()"), /Cannot read recipe "\/workspace\/missing-Dollyfile"/);
    assert.equal(await submit("printf kept > /workspace/build-parent-proof"), 0);
    const pages = await pageCount();
    await start(source);
    assert.equal(await evaluate("document.querySelector('#image-build pre').textContent"), source);
    const progress = await wait("(async () => ({text: await __dolly.visibleTerminalText(), status: __buildStatus}))()",
      state => state.status !== null || /\nLIVE-BUILD-OUTPUT\r?\n/.test(state.text), "live build log before completion");
    assert.match(progress.text, /\nLIVE-BUILD-OUTPUT\r?\n/);
    assert.equal(progress.status, null);
    assert.equal(await pageCount(), pages, "building must not open a blank tab");
    await waitState("ready");
    assert.equal(await wait("__buildStatus", value => value !== null, "successful build status"), 0);
    assert.equal(await submit("test \"$(cat /workspace/build-parent-proof)\" = kept"), 0);
    assert.equal(await submit("test ! -e /usr/bin/hello"), 0, "built tools are not installed in the calling session");
    assert.equal(await pageCount(), pages, "completing a build must not open a tab");
    await click('#image-build [data-action="open"]');
    const result = await openResult();
    try {
      assert.equal(await result.wait("document.documentElement?.dataset.dollyStatus", value => ["ready", "failed"].includes(value), "result boot"), "ready");
      await result.evaluate("__dolly.waitForInteractiveTerminal(/(?:^|\\n)dolly:[^\\n]*\\$\\s*$/, 'result shell')");
      assert.equal(await result.evaluate("__dolly.submit(\"test \\\"$(hello)\\\" = BUILT-IN-WASM\")"), 0);
      assert.equal(await result.evaluate("__dolly.submit('test ! -f /workspace/build-parent-proof')"), 0);
      assert.equal(await result.evaluate("window.opener === null"), true);
      assert.notEqual(await result.evaluate("__dolly.submit('curl -fsS https://example.com/')"), 0);
      assert.equal(await result.evaluate("performance.getEntriesByType('resource').some(entry => entry.name.startsWith('https://example.com/'))"), false);
      const log = await result.evaluate("document.querySelector('#bootstrap-log').textContent");
      assert.match(log, /loading precompiled userspace snapshot/);
      assert.doesNotMatch(log, /building userspace from the Dollyfile/);
    } finally { await result.close(); }
    console.log("browser: HTTP build starts and streams without approval; only clicking Open image opens a completed result, without parent files or local build services");

    await start(source.replace("SLOP sleep 4", "SLOP false"));
    await waitState("error");
    assert.notEqual(await wait("__buildStatus", value => value !== null, "failed build status"), 0);
    assert.match(await evaluate("document.querySelector('#image-build [role=status]').textContent"), /bootstrap failed/);

    await start(source.replace("SLOP sleep 4", "SLOP sleep 60"));
    await click('#image-build [data-action="cancel"]');
    assert.notEqual(await wait("__buildStatus", value => value !== null, "UI-cancelled build status"), 0);
    await waitState("error");

    await start(source.replace("SLOP sleep 4", "SLOP sleep 60").replace("LIVE-BUILD-OUTPUT", "LIVE-CANCEL-OUTPUT"));
    await wait("__dolly.visibleTerminalText()", text => /\nLIVE-CANCEL-OUTPUT\r?\n/.test(text), "running build before Ctrl-C");
    const stoppedAt = Date.now();
    await press({ key: "c", code: "KeyC", modifiers: 2, windowsVirtualKeyCode: 67 });
    assert.notEqual(await wait("__buildStatus", value => value !== null, "cancelled build status"), 0);
    await waitState("error");
    assert.ok(Date.now() - stoppedAt < 5000, "build cancellation exceeded five seconds");
    assert.equal(await submit("test \"$(cat /workspace/build-parent-proof)\" = kept"), 0);
    assert.equal(await pageCount(), pages, "failure and cancellation must not open tabs");
    console.log("browser: failed/cancelled builds return nonzero; UI cancellation and Ctrl-C preserve Studio without opening tabs");
  } finally {
    await evaluate("document.querySelector('#image-build [data-action=cancel]').click(); true");
    await submit("rm -f /workspace/Dollyfile-build-proof /workspace/build-parent-proof");
  }
}
