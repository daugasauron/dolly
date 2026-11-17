import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { browserTest, runSteps } from "./browser.mjs";
import shell from "./cases/shell.json" with { type: "json" };

// Everyday shell and tool behavior with the toolchain's tools, typed input included.
const recorded = {};
async function handle(request, response, path, headers) {
  if (path === "/fixture/curl-options" && request.method === "POST") {
    let body = "";
    for await (const chunk of request) body += chunk;
    (recorded.curl ??= []).push({ header: request.headers["x-dolly-cli"], body });
    response.writeHead(201, { ...headers, "content-type": "text/plain; charset=utf-8", "x-dolly-response": "yes",
      "access-control-expose-headers": "x-dolly-response" });
    response.end("CURL-CLI-OK\n");
  } else if (path === "/fixture/held") {
    // Headers and one byte, then nothing until the reader goes: a live transfer.
    recorded.held = (recorded.held ?? 0) + 1;
    response.writeHead(200, { ...headers, "content-type": "text/plain" });
    response.write("x");
  } else if (path === "/fixture/git/info/refs") {
    recorded.git = { method: request.method, protocol: request.headers["git-protocol"],
      service: new URL(request.url, "http://x").searchParams.get("service") };
    response.writeHead(200, { ...headers, "content-type": "application/x-git-upload-pack-advertisement" });
    response.end("000eversion 2\n0015agent=git/2.55.0\n0013ls-refs=unborn\n0020fetch=shallow wait-for-done\n" +
      "0012server-option\n0017object-format=sha1\n0010object-info\n0000");
  } else return false;
  return true;
}

await browserTest("shell", { image: "system", server: { fixtures: shell.fixtures, handle } }, async ({ server, open }) => {
  recorded.curl = []; // each browser's run, one after the other on one server
  const { page, submit, result } = await open({ policy: { maxRequests: 256,
    // A hardened rule names the headers beyond an ordinary request's that leave: curl's and git's below.
    rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET", "POST"], credentialHeaders: ["x-dolly-cli", "git-protocol"] }] } });
  // Input mailbox: ESC [A with empty history, then help with a deleted typo.
  assert.equal(await result(() => page.evaluate(() => __dolly.input("\x1b[Ahelx\x7fp\r"))), 0);
  // Everyday commands (test/cases/shell.json), then those that reach the test server.
  await runSteps(submit, shell);
  const cases = [
    [`curl -fsSL ${server.origin}/fixture/http.txt -o fetched.txt && grep -q FETCHED-THROUGH-BROWSER fetched.txt`],
    // A cluster may end with a letter that takes a value, as agents write curl -fsSLo FILE.
    [`curl -fsSLo clustered.txt ${server.origin}/fixture/http.txt && grep -q FETCHED-THROUGH-BROWSER clustered.txt`],
    ["curl -sS -X POST -H 'X-Dolly-Cli: yes' -d one=1 -d two=2 -D headers.txt -o body.txt " +
      `-w '%{http_code} %{content_type}\\n' ${server.origin}/fixture/curl-options > meta.txt`],
    ["grep -q '^CURL-CLI-OK$' body.txt && grep -qi '^x-dolly-response: yes' headers.txt && grep -q '^201 text/plain; charset=utf-8$' meta.txt"],
    // A data value of @FILE is the file: -d without its newlines, --data-binary as it is.
    ["printf 'three=3\\r\\nfour\\n' > data.txt && " + ["-d @data.txt -d five=5", "--data-binary @data.txt", "--data-raw @data.txt"]
      .map(data => `curl -sS -o /dev/null ${data} ${server.origin}/fixture/curl-options`).join(" && ")],
    [`curl -f ${server.origin}/fixture/missing`, 22],
    // curl exits with curl's own status for each class of failure.
    [`curl -sS -m 0.3 ${server.origin}/fixture/slow -o slow.txt`, 28],
    // A cancelled transfer frees its slot: more cancellations than the kernel has
    // slots (16), by a timeout and by a closed pipe, then a request that completes.
    [`i=0; while [ $i -lt 17 ]; do curl -sS -m 0.3 ${server.origin}/fixture/slow -o /dev/null; ` +
      `curl -sS ${server.origin}/fixture/large | head -c 1 > /dev/null; i=$((i + 1)); done; ` +
      `curl -fsS ${server.origin}/fixture/http.txt | grep -q FETCHED-THROUGH-BROWSER`],
    [`curl -sS ${server.origin}/outside-the-policy`, 9],
    [`curl -sS --retry 2 ${server.origin}/fixture/http.txt`, 2],
    [`printf 'list\\n\\n' | /usr/libexec/dolly/git-remote-http origin ${server.origin}/fixture/git`],
    [`printf 'list\\n\\n' | /usr/libexec/dolly/git-remote-https origin ${server.origin}/fixture/git`],
  ];
  for (const [command, expected = 0] of cases) assert.equal(await submit(command), expected, command);
  assert.deepEqual(recorded.curl.map(({ body }) => body), ["one=1&two=2", "three=3four&five=5", "three=3\r\nfour\n", "@data.txt"]);
  assert.equal(recorded.curl[0].header, "yes");
  assert.deepEqual(recorded.git, { method: "GET", protocol: "version=2", service: "git-upload-pack" });

  // An IME composition that straddles the 88-byte input packet boundary.
  const prefix = "printf '%s' '";
  const composed = "a".repeat(88 - prefix.length) + "\uFEFFあ😀";
  assert.equal(await result(async () => {
    await page.evaluate(data => document.querySelector("#keyboard").dispatchEvent(new CompositionEvent("compositionend", { data })),
      `${prefix}${composed}' > composed.txt`);
    await page.keyboard.press("Enter");
  }), 0);
  assert.equal(await submit(`test "$(wc -c < composed.txt)" -eq ${Buffer.byteLength(composed)}`), 0);

  // Raw keys, line editing, Tab completion, history and reverse search.
  await page.locator("#keyboard").focus();
  const typed = keys => result(async () => { for (const key of keys) await page.keyboard.press(key); });
  assert.equal(await typed(["h", "e", "l", "x", "Backspace", "p", "Enter"]), 0);
  assert.equal(await typed(["p", "w", "Tab", "Enter"]), 0);
  assert.equal(await typed(["ArrowUp", "Enter"]), 0);
  assert.equal(await typed(["h", "e", "l", "Control+r", "Enter"]), 0);
  assert.equal(await submit("grep -q '^help$' \"$HISTFILE\""), 0);
  // Tab completes under ~ and in a dot directory as it does under /.
  assert.equal(await submit("mkdir -p ~/.tab-probe/inside"), 0);
  assert.equal(await result(async () => {
    await page.keyboard.type("cd ~/.tab-pr");
    await page.keyboard.press("Tab");
    await page.keyboard.type("ins");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
  }), 0);
  assert.equal(await submit('test "$PWD" = "$HOME/.tab-probe/inside" && cd /tmp/shell && rm -r ~/.tab-probe'), 0);
  // Backspace and the arrows step over a whole UTF-8 character: type x=aé日,
  // Left, Backspace, b, Enter.
  assert.equal(await result(() => page.evaluate(() => __dolly.input("x=a\u00e9\u65e5\x1b[D\x7fb\r"))), 0);
  assert.equal(await submit('test "$x" = "ab日"'), 0);

  // Wasm offers downloads under their literal names.
  for (const name of ["browser-download.txt", "\uFEFFbrowser-download.txt"]) {
    assert.equal(await submit(`echo DOWNLOAD > '${name}' && download '${name}'`), 0);
    assert.equal(await page.locator("#downloads li").getAttribute("data-name"), name);
    const saved = page.waitForEvent("download");
    await page.click("#downloads li button");
    const download = await saved;
    if (!name.startsWith("\uFEFF")) assert.equal(download.suggestedFilename(), name);
    assert.equal(await readFile(await download.path(), "utf8"), "DOWNLOAD\n");
  }
  // A bidi override could disguise the saved name's extension.
  assert.notEqual(await submit("echo DOWNLOAD > 'a\u202Etxt.exe' && download 'a\u202Etxt.exe'"), 0);
  assert.equal(await page.locator("#downloads li").count(), 0);

  // Ctrl-C ends an uncooperative CPU loop by terminating its Worker; the
  // kernel, the shell and its files survive.
  const looping = submit("./loop");
  await page.waitForFunction(() => __dolly.terminal.foregroundInterruptible());
  await page.locator("#keyboard").focus();
  await page.keyboard.press("Control+c");
  assert.equal(await looping, 130);
  // Ctrl-C cancels a live transfer too: after 17, a slot more than the
  // kernel has, a request still completes.
  for (let cancelled = 0; cancelled < 17; cancelled++) {
    const arrived = recorded.held ?? 0;
    const fetching = submit(`curl -sS ${server.origin}/fixture/held -o /dev/null`);
    while ((recorded.held ?? 0) === arrived) await new Promise(resolve => setTimeout(resolve, 20));
    await page.keyboard.press("Control+c");
    assert.equal(await fetching, 130);
  }
  assert.equal(await submit(`curl -fsS ${server.origin}/fixture/http.txt | grep -q FETCHED-THROUGH-BROWSER`), 0);
  assert.equal(await submit("grep -q NESTED /tmp/shell/copied/nested/file && cd / && rm -rf /tmp/shell"), 0);
});
