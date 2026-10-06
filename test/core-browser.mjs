import assert from "node:assert/strict";
import { browserTest } from "./browser.mjs";
import { runProcessSmoke } from "./fixtures/process-smoke.mjs";

// Git, download and the rest of the toolchain image's tools are used below.
const image = process.env.DOLLY_IMAGE ?? "system";
await browserTest("core", { image }, async ({ server, open }) => {
  const { page, submit } = await open({ policy: { maxRequests: 256,
    rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] } });
  const starts = [];
  const recordRequest = request => { if (/^https?:/.test(request.url())) starts.push(request.url()); };
  page.context().on("request", recordRequest);
  // Routing disables the HTTP cache too; process creation must use retained
  // code bytes, including the first run of an executable such as Git.
  await page.context().route("**/*", route => route.abort());
  try {
    assert.equal(await submit("mkdir /tmp/core-offline && git -C /tmp/core-offline init && git -C /tmp/core-offline rev-parse --git-dir && echo fresh > /tmp/core-offline/value && cat /tmp/core-offline/value && rm -rf /tmp/core-offline"), 0);
    assert.deepEqual(starts, [], "process startup made HTTP requests");
  } finally {
    await page.context().unroute("**/*");
    page.context().off("request", recordRequest);
  }
  for (const fixture of ["process-wrong-call", "process-wrong-start", "process-wrong-memory"]) {
    assert.equal(await submit(`curl -fsS ${server.origin}/fixture/${fixture}.wasm -o /tmp/core-invalid`), 0);
    assert.equal(await submit("/tmp/core-invalid"), 126, fixture);
  }
  assert.equal(await submit("rm /tmp/core-invalid"), 0);
  await runProcessSmoke(submit, server.origin);
  const cancelledBefore = server.cancelledRequests;
  for (const command of [
    "sleep 30; echo bad > /tmp/core-interrupted",
    // A pipeline's programs start together; what follows the pipeline does not run.
    "sleep 30 | cat; echo bad > /tmp/core-interrupted",
    "(sleep 30) | /bin/slop -c 'echo bad > /tmp/core-interrupted'",
    'echo "$(sleep 30)" "$(echo bad > /tmp/core-interrupted)"',
    'for item in "$(sleep 30)" "$(echo bad > /tmp/core-interrupted)"; do echo bad > /tmp/core-interrupted; done',
    `curl -fsS ${server.origin}/fixture/slow; echo bad > /tmp/core-interrupted`,
    // /dev/stdin is the process's terminal descriptor, not a kernel read.
    "cat /dev/stdin; echo bad > /tmp/core-interrupted",
  ]) {
    await page.evaluate(text => {
      globalThis.interruptedStatus = null;
      void __dolly.submit(text).then(status => { globalThis.interruptedStatus = status; });
    }, command);
    await page.waitForFunction(() => __dolly.terminal.foregroundInterruptible());
    if (command.includes("/fixture/slow")) await page.waitForFunction(() => __dolly.httpActive);
    await page.locator("#keyboard").focus();
    await page.keyboard.press("Control+c");
    await page.waitForFunction(() => globalThis.interruptedStatus !== null, null, { timeout: 5000 });
    assert.equal(await page.evaluate(() => globalThis.interruptedStatus), 130, command);
    assert.equal(await submit("test ! -e /tmp/core-interrupted"), 0, command);
  }
  await page.waitForFunction(() => !__dolly.httpActive);
  assert.equal(server.cancelledRequests, cancelledBefore + 1, "cancelled HTTP response stayed open");
  assert.equal(await submit(`mkdir /tmp/core-tar; curl -fsS ${server.origin}/fixture/root.tar -o /tmp/core.tar && tar -xf /tmp/core.tar -C /tmp/core-tar && test "$(cat /tmp/core-tar/file)" = 'root preserved' && rm -rf /tmp/core-tar /tmp/core.tar`), 0);
  assert.equal(await submit("printf 'needle\\n' > /tmp/core-search; grep -q needle /tmp/core-search && test \"$(find /tmp -maxdepth 1 -name core-search)\" = /tmp/core-search && rm /tmp/core-search"), 0);
  assert.equal(await submit([
    "mkdir -p /tmp/core-commands/a /tmp/core-commands/b /tmp/core-commands/many && cd /tmp/core-commands",
    "test \"$(echo --)\" = -- && ! test -x /tmp && [ \\( -d / -a ! -f / \\) -o -z x ]",
    "printf 'gr\\303\\274\\303\\237e\\n' > utf8 && test \"$(file -b utf8)\" = 'UTF-8 Unicode text'",
    "printf abcdef > dd.txt && printf XY | dd of=dd.txt bs=1 seek=2 conv=notrunc && test \"$(cat dd.txt)\" = abXYef",
    "printf XY | dd of=dd.txt bs=1 seek=1 && test \"$(cat dd.txt)\" = aXY && test \"$(tail -c 2 dd.txt)\" = XY && test \"$(hostname)\" = dolly",
    "timeout 0 sleep 1",
    "timeout 60 sh -c 'echo x >&3' 3> fd3 && test \"$(cat fd3)\" = x",
    "printf 'one\\n' > a/file && printf 'two\\n' > b/file && { diff -u a/file b/file > change.patch; test $? -eq 1; }",
    "cd a && ! patch file < ../change.patch && test \"$(cat file)\" = one && patch -p1 < ../change.patch && test \"$(cat file)\" = two && cd ..",
    "cd many && seq 1 600 | xargs touch && cd ..",
    "! find many -type f -exec slop -c 'printf \"%s\\n\" \"$@\" >> exec.log; exit 1' slop {} +",
    "test \"$(sort -u exec.log | sed -n '$=')\" = 600",
    "test \"$(seq 1 100000 | xargs echo | sed -n '$=')\" -gt 1",
    "test \"$(seq 1 100000 | xargs echo | tr ' ' '\\n' | sed -n '$=')\" = 100000",
    "cd / && rm -rf /tmp/core-commands",
  ].join(" && ")), 0, "POSIX command behavior");
  assert.notEqual(await submit(`curl -fsS ${server.origin}/denied`), 0);
  assert.equal(server.requests.has("/denied"), false, "denied userspace HTTP reached the host server");
  // Only images declaring build@0 reach the page's build service.
  assert.notEqual(await submit("curl -fsS -d 'DOLLY 6' https://build.dolly.invalid/v1/builds"), 0);
  assert.equal(await page.locator("#image-build").count(), 0);
  // Wasm only offers downloads: each needs a click, and the queue is bounded.
  const automatic = page.waitForEvent("download", { timeout: 1000 }).then(() => true, () => false);
  assert.equal(await submit("download /etc/dolly/Dollyfile"), 0);
  assert.equal(await automatic, false, "download started without a click");
  const saved = page.waitForEvent("download");
  await page.click("#downloads button");
  assert.equal((await saved).suggestedFilename(), "Dollyfile");
  for (let index = 0; index < 4; index++) assert.equal(await submit("download /etc/dolly/Dollyfile"), 0);
  assert.notEqual(await submit("download /etc/dolly/Dollyfile"), 0, "download prompts are unbounded");
  for (let index = 0; index < 4; index++) await page.getByRole("button", { name: "Dismiss" }).first().click();
  assert.equal(await page.locator("#downloads").isHidden(), true);
  assert.deepEqual(await page.evaluate(async () => {
    const { saveImageArtifact, loadImageArtifactDescriptor, IMAGE_CACHE_MAX_ENTRIES } = await import("/src/image-artifact.mjs");
    const { DOLLY_IMAGE_BUILD_ID: buildId } = await import("/dist/dolly-image-build-id.mjs");
    const recipe = index => index.toString(16).padStart(64, "0"), kept = [];
    for (let index = 0; index <= IMAGE_CACHE_MAX_ENTRIES; index++) {
      await saveImageArtifact({ buildId, recipeSha256: recipe(index), sha256: "a".repeat(64), inputs: [],
        hostRequirements: [], byteLength: 16, bytes: new ArrayBuffer(16) }, `custom:bound-${index}`);
    }
    for (let index = 0; index <= IMAGE_CACHE_MAX_ENTRIES; index++) kept.push(!!await loadImageArtifactDescriptor(recipe(index)));
    return [kept[0], kept.filter(Boolean).length === IMAGE_CACHE_MAX_ENTRIES];
  }), [false, true], "image cache exceeded its entry bound");
  // Without an embedding policy every HTTP(S) destination is reachable,
  // the page's own origin included.
  const defaults = await open();
  assert.equal(await defaults.submit(`curl -fsS ${server.origin}/fixture/http.txt -o /dev/null`), 0);
  assert.equal(await defaults.submit(`curl -fsS ${server.origin}/Dollyfile${image === "default" ? "" : `-${image}`} -o /tmp/source && cmp /tmp/source /etc/dolly/Dollyfile`), 0);
});
