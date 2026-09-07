import assert from "node:assert/strict";

export async function runImageBuildProof({ evaluate, wait, submit, click, press, openResult }) {
  const quote = text => "'" + text.replaceAll("'", "'\\''") + "'";
  const waitState = state => wait("document.querySelector('#image-build')?.dataset.state", value => value === state, `build ${state}`);
  async function start(source, open = false) {
    assert.equal(await submit(`printf '%s\\n' ${source.trimEnd().split("\n").map(quote).join(" ")} > /workspace/Dollyfile-build-proof`), 0);
    await evaluate(`globalThis.__buildStatus = null;
      void __dolly.submit(${JSON.stringify(`dollyfile-build ${open ? "--open " : ""}/workspace/Dollyfile-build-proof`)}).then(status => { __buildStatus = status; }); true`);
    await waitState("pending");
    assert.equal(await evaluate("__buildStatus"), null);
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
    assert.equal(await submit("dollyfile-build /workspace/missing-Dollyfile"), 1);
    assert.match(await evaluate("__dolly.visibleTerminalText()"), /Cannot read recipe "\/workspace\/missing-Dollyfile"/);
    assert.equal(await submit("printf kept > /workspace/build-parent-proof"), 0);
    await start(source, true);
    assert.equal(await evaluate("document.querySelector('#image-build pre').textContent"), source);
    await click('#image-build [data-action="approve"]');
    await wait("__dolly.visibleTerminalText()", text => /\nLIVE-BUILD-OUTPUT\r?\n/.test(text), "live build log before completion");
    assert.equal(await evaluate("__buildStatus"), null);
    await waitState("ready");
    assert.equal(await wait("__buildStatus", value => value !== null, "successful build status"), 0);
    assert.equal(await submit("test \"$(cat /workspace/build-parent-proof)\" = kept"), 0);
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
    console.log("browser: approved HTTP build streamed before completion; source-compiled C runs in a new cached-result tab, without parent files or local build services");

    await start(source.replace("SLOP sleep 4", "SLOP false"));
    await click('#image-build [data-action="approve"]');
    await waitState("error");
    assert.notEqual(await wait("__buildStatus", value => value !== null, "failed build status"), 0);
    assert.match(await evaluate("document.querySelector('#image-build [role=status]').textContent"), /bootstrap failed/);

    await start(source);
    await click('#image-build [data-action="cancel"]');
    assert.notEqual(await wait("__buildStatus", value => value !== null, "denied build status"), 0);

    await start(source.replace("SLOP sleep 4", "SLOP sleep 60").replace("LIVE-BUILD-OUTPUT", "LIVE-CANCEL-OUTPUT"));
    await click('#image-build [data-action="approve"]');
    await wait("__dolly.visibleTerminalText()", text => /\nLIVE-CANCEL-OUTPUT\r?\n/.test(text), "running build before Ctrl-C");
    const stoppedAt = Date.now();
    await press({ key: "c", code: "KeyC", modifiers: 2, windowsVirtualKeyCode: 67 });
    assert.notEqual(await wait("__buildStatus", value => value !== null, "cancelled build status"), 0);
    await waitState("error");
    assert.ok(Date.now() - stoppedAt < 5000, "build cancellation exceeded five seconds");
    assert.equal(await submit("test \"$(cat /workspace/build-parent-proof)\" = kept"), 0);
    console.log("browser: failing/denied builds return nonzero; Ctrl-C stops an active build and preserves the Studio session");
  } finally {
    await evaluate("document.querySelector('#image-build [data-action=cancel]').click(); true");
    await submit("rm -f /workspace/Dollyfile-build-proof /workspace/build-parent-proof");
  }
}
