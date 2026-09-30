import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { browserTest } from "./browser.mjs";

// Everyday shell and tool behavior of the default image, typed input included.
const recorded = {};
async function handle(request, response, path, headers) {
  if (path === "/fixture/curl-options" && request.method === "POST") {
    let body = "";
    for await (const chunk of request) body += chunk;
    recorded.curl = { header: request.headers["x-dolly-cli"], body };
    response.writeHead(201, { ...headers, "content-type": "text/plain; charset=utf-8", "x-dolly-response": "yes",
      "access-control-expose-headers": "x-dolly-response" });
    response.end("CURL-CLI-OK\n");
  } else if (path === "/fixture/git/info/refs") {
    recorded.git = { method: request.method, protocol: request.headers["git-protocol"],
      service: new URL(request.url, "http://x").searchParams.get("service") };
    response.writeHead(200, { ...headers, "content-type": "application/x-git-upload-pack-advertisement" });
    response.end("000eversion 2\n0015agent=git/2.55.0\n0013ls-refs=unborn\n0020fetch=shallow wait-for-done\n" +
      "0012server-option\n0017object-format=sha1\n0010object-info\n0000");
  } else return false;
  return true;
}

await browserTest("shell", { server: { handle } }, async ({ server, open }) => {
  const { page, submit, result } = await open({ policy: { maxRequests: 256,
    rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET", "POST"] }] } });
  // Input mailbox: ESC [A with empty history, then help with a deleted typo.
  assert.equal(await result(() => page.evaluate(() => __dolly.input("\x1b[Ahelx\x7fp\r"))), 0);
  const cases = [
    ["mkdir /tmp/shell && cd /tmp/shell"],
    ["printf 'alpha\\nBeta\\n' > corpus.txt && echo first > append.txt && echo second >> append.txt"],
    ["test \"$(cat append.txt)\" = \"$(printf 'first\\nsecond')\""],
    ["test \"$(slop -c 'echo SLOP-C')\" = SLOP-C"],
    ["slop -c 'cat <<EOF'", 2],
    ["slop -c 'exit nope'", 2],
    ["grep -q Beta corpus.txt && grep missing corpus.txt || ! grep missing corpus.txt"],
    ["test \"$(VALUE=42 slop -c 'echo SLOP-VAR-$VALUE')\" = SLOP-VAR-42 && test \"$(echo SUB-$(pwd))\" = SUB-/tmp/shell"],
    ["test \"$(slop -e -c 'grep missing corpus.txt && echo WRONG; echo ERREXIT-AND')\" = ERREXIT-AND"],
    ["test \"$(grep -n -i beta corpus.txt)\" = 2:Beta && test \"$(grep -c a corpus.txt)\" = 2 && test \"$(grep -v alpha corpus.txt)\" = Beta"],
    ["grep missing corpus.txt", 1],
    ["grep -Z", 2],
    ["test \"$(echo PIPE-GREP | grep PIPE)\" = PIPE-GREP"],
    ["test \"$(sed s/Beta/Gamma/ corpus.txt | sed -n 2p)\" = Gamma && test \"$(echo SED-PIPE | sed s/SED/DOLLY/)\" = DOLLY-PIPE"],
    ["test \"$(head -n 1 corpus.txt)\" = alpha && test \"$(head -1 corpus.txt)\" = alpha"],
    ["test \"$(wc -l < corpus.txt)\" -eq 2 && test \"$(echo one two | wc -w)\" -eq 2"],
    ["echo 'key:value' > colon.txt && test \"$(awk -F: '{print $2}' colon.txt)\" = value"],
    ["echo 'one 2' > awk-one.txt && echo 'three 4' > awk-two.txt && test \"$(echo awk-*.txt)\" = 'awk-one.txt awk-two.txt'"],
    ["test \"$(cat awk-*.txt | awk '{sum += $2} END {print sum}')\" = 6 && test \"$(awk -v prefix=V '{print prefix $1}' awk-one.txt)\" = Vone"],
    ["echo '{print toupper($1)}' > upper.awk && test \"$(awk -f upper.awk awk-two.txt)\" = THREE && test \"$(echo 'pipe 7' | awk '{print $2 * 6}')\" = 42"],
    ["echo 'a,\"b,c\"' > csv.txt && test \"$(awk --csv '{print NF \":\" $2}' csv.txt)\" = 2:b,c"],
    ["test \"$(awk 'BEGIN {print system(\"echo SYSTEM\")}')\" = \"$(printf 'SYSTEM\\n0')\""],
    ["awk 'BEGIN {status = (\"printf AWK-PIPE\" | getline value); exit status == 1 && value == \"AWK-PIPE\" ? 0 : 1}'"],
    ["awk -f", 2],
    [`curl -fsSL ${server.origin}/fixture/http.txt -o fetched.txt && grep -q FETCHED-THROUGH-BROWSER fetched.txt`],
    ["curl -sS -X POST -H 'X-Dolly-Cli: yes' -d one=1 -d two=2 -D headers.txt -o body.txt " +
      `-w '%{http_code} %{content_type}\\n' ${server.origin}/fixture/curl-options > meta.txt`],
    ["grep -q '^CURL-CLI-OK$' body.txt && grep -qi '^x-dolly-response: yes' headers.txt && grep -q '^201 text/plain; charset=utf-8$' meta.txt"],
    [`curl -f ${server.origin}/fixture/missing`, 22],
    ["git --version && git config --global --get user.name && git config --global user.email asdf && test \"$(git config --global --get user.email)\" = asdf"],
    ["mkdir repo && cd repo && git init && echo tracked > tracked.txt && git add tracked.txt && git commit -m initial && test \"$(git log --format=%s)\" = initial"],
    [`printf 'list\\n\\n' | /usr/libexec/dolly/git-remote-http origin ${server.origin}/fixture/git`],
    ["cd .. && test \"$(pwd)\" = /tmp/shell && test \"$(pwd -P)\" = /tmp/shell"],
    ["mkdir -p flags/deep && mkdir -p flags/deep && touch flags/.hidden && echo visible > flags/visible"],
    ["test \"$(ls flags)\" = \"$(printf 'deep\\nvisible')\" && ls -a flags | grep -q '^.hidden$'"],
    ["echo file > not-a-directory && mkdir -p not-a-directory", 1],
    ["rm -f flags/missing && rm -rf flags && ls -la"],
    ["ls flags", 1],
    ["echo shell-created > shell.txt && test \"$(stat -c '%F %s' shell.txt)\" = 'regular file 14' && file shell.txt"],
    ["[ -f shell.txt ] && [ ! -d shell.txt ]"],
    ["test -d shell.txt", 1],
    ["echo MOVED > move-source && mv move-source move-target && test ! -e move-source && grep -q MOVED move-target"],
    ["test \"$(printf 'PRINTF-%s' OK)\" = PRINTF-OK && touch -c absent && echo -n tight > tight.txt && test \"$(wc -c < tight.txt)\" -eq 5"],
    ["ls absent", 1],
    ["ls /bin /usr/bin > /dev/null && test \"$(echo /b*)\" = /bin && ls /usr/lib/libdisplay.so && test ! -e /usr/bin/ghostty-vt"],
    ["cc --version && c++ --version && ld --help > /dev/null && ar --version && make --version"],
    ["cc --definitely-unsupported", 64],
    ["cat /bin/echo > invalid-module && echo invalid >> invalid-module"],
    ["./invalid-module", 126],
    ["echo 'int main(void) { volatile unsigned long n = 0; for (;;) n++; }' > loop.c && cc -O0 loop.c -o loop"],
    ["timeout 0.05 ./loop", 124],
    ["mkdir -p copy/nested && echo FILE > copy/file && echo NESTED > copy/nested/file && cp -R copy copied && grep -q FILE copied/file && grep -q NESTED copied/nested/file"],
  ];
  for (const [command, expected = 0] of cases) assert.equal(await submit(command), expected, command);
  assert.deepEqual(recorded.curl, { header: "yes", body: "one=1&two=2" });
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

  // Ctrl-C stops an uncooperative CPU loop; the shell and its files survive.
  const looping = submit("./loop");
  await page.waitForFunction(() => __dolly.transport.foregroundInterruptible());
  await page.locator("#keyboard").focus();
  await page.keyboard.press("Control+c");
  assert.equal(await looping, 130);
  assert.equal(await submit("grep -q NESTED /tmp/shell/copied/nested/file && cd / && rm -rf /tmp/shell"), 0);
});
