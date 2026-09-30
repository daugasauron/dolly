import assert from "node:assert/strict";

export async function buildLogProof() {
  const {buildLog} = await import(new URL("../src/build-log.mjs", document.baseURI));
  const element = document.createElement("pre"), log = buildLog(element);
  log.append("\x1b[1;3");
  log.append("2mbuilding 日本語\x1b[0m\r");
  log.append("\n\x1b[38:2:1:2:3mdone");
  log.append("\x1b[m <script>text</script>");
  if (element.textContent !== "building 日本語\ndone <script>text</script>" || element.children.length) {
    throw new Error("Split compiler output lost text or created HTML");
  }
  log.append("x".repeat(1024 * 1024));
  log.append("tail");
  if (element.textContent.length !== 1024 * 1024 || !element.textContent.endsWith("tail")) {
    throw new Error("Build output exceeded its bound or lost the tail");
  }
  log.clear(); log.append("retry");
  if (element.textContent !== "retry") throw new Error("Build retry retained old output");
  return true;
}

export async function buildBufferReuse() {
  const base = new URL("../", document.baseURI);
  const [registry, policy, transport, builder, graph, artifactStore] = await Promise.all([
    "dist/dolly-images.mjs", "host/http/policy.mjs", "host/build/local-services.mjs",
    "src/image-builder.mjs", "src/image-build.mjs", "src/image-artifact.mjs",
  ].map(path => import(new URL(path, base).href)));
  const definition = registry.DOLLY_IMAGES.find(image => image.image === "system-build");
  const source = `DOLLY 4\nIMAGE buffer-proof\nFROM HOST /${definition.dollyfile} ${definition.sha256}\nENTRY /bin/slop\n`;
  const sources = [...registry.DOLLY_IMAGES.map(image => ({ path: `/${image.dollyfile}`, byteLength: image.byteLength })),
    ...registry.DOLLY_STATIC_SOURCES];
  const network = transport.localServicesTransport(policy.consumeDollyHttpPolicy({}, sources, base));
  const build = (image, inputs, customSource) => builder.buildImage(image, inputs, network, () => {}, { customSource });
  const inputs = await graph.prepareImageArtifacts("custom", source, build, () => {});
  let digest;
  for (const text of [source, source.replace("ENTRY", "SLOP false\nENTRY"), source]) {
    let result, failure;
    try { result = await build("custom", inputs, text); }
    catch (error) { failure = error.message; }
    for (const input of inputs) {
      if (input.bytes.byteLength !== input.byteLength || await artifactStore.sha256(input.bytes) !== input.sha256) {
        throw new Error("Build did not return its input buffers intact");
      }
    }
    if (text !== source) {
      if (!failure?.includes("bootstrap failed")) throw new Error("Invalid recipe did not fail its build");
    } else {
      if (failure) throw new Error(failure);
      const actual = await artifactStore.sha256(result.bytes);
      if (digest && actual !== digest) throw new Error("Reusing build buffers changed output");
      digest = actual;
    }
  }
  return digest;
}

export async function runImageBuildProof({ evaluate, wait, submit, click, press, openResult, pageCount }) {
  assert.equal(await evaluate(`(${buildLogProof.toString()})()`), true);
  assert.match(await evaluate(`(${buildBufferReuse.toString()})()`), /^[0-9a-f]{64}$/);
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
  const source = `DOLLY 4
IMAGE build-proof
FROM HOST /Dollyfile-system ${base}
FILE /tmp/proof/hello.c
    #include <stdio.h>
    #warning BUILD-COMPILER-WARNING
    int main(void) { puts("BUILT-IN-WASM"); fputs("LIVE-BUILD-STDERR\\n", stderr); return 0; }
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
SLOP cc /tmp/proof/hello.c -o /usr/bin/hello
SLOP /usr/bin/hello
SLOP printf 'LIVE-BUILD-OUTPUT\\n'
SLOP sleep 4
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
    assert.equal(await evaluate("document.querySelector('#image-build [data-recipe]').textContent"), source);
    const progress = await wait("(async () => ({text: await __dolly.visibleTerminalText(), status: __buildStatus}))()",
      state => state.status !== null || /\nLIVE-BUILD-OUTPUT\r?\n/.test(state.text), "live build log before completion");
    assert.match(progress.text, /\nLIVE-BUILD-OUTPUT\r?\n/);
    assert.equal(progress.status, null);
    const output = await evaluate("document.querySelector('#image-build [data-output]').textContent");
    assert.match(output, /warning: BUILD-COMPILER-WARNING/);
    assert.match(output, /\nBUILT-IN-WASM\n/);
    assert.match(output, /\nLIVE-BUILD-STDERR\n/);
    assert.match(output, /\nLIVE-BUILD-OUTPUT\n/);
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

    await start(source.replace("SLOP sleep 4", `FILE /tmp/proof/error.c
    #error BUILD-COMPILER-ERROR
SLOP cc /tmp/proof/error.c -o /tmp/proof/error`));
    await waitState("error");
    assert.notEqual(await wait("__buildStatus", value => value !== null, "failed build status"), 0);
    assert.match(await evaluate("document.querySelector('#image-build [role=status]').textContent"), /bootstrap failed/);

    assert.match(await evaluate("document.querySelector('#image-build [data-output]').textContent"), /error: BUILD-COMPILER-ERROR/);

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
