import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { browserTest } from "./browser.mjs";
import { createGitTransportFixture, runGitTransport } from "./fixtures/git-transport.mjs";

const fixtures = { "libcurl-contract.c": "test/fixtures/libcurl-contract.c" };
let contractRequests, cancelledRequests, git, relayed;
const overlapping = new Map();
// A relay as an embedding would run one: same origin as the page, an exact
// upstream allowlist, the request passed on and the response returned.
async function relay(request, response, url, headers) {
  const [, host, rest] = /^\/fixture\/relay\/([^/]+)(\/.*)$/.exec(url.pathname);
  const self = `http://${request.headers.host}`;
  if (host !== new URL(self).host.replace("127.0.0.1", "forge.localhost")) return response.writeHead(403, headers).end();
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  relayed.push({ method: request.method, path: rest, authorization: request.headers.authorization ?? null });
  const forwarded = Object.fromEntries(["accept", "authorization", "content-type", "git-protocol"]
    .filter(name => request.headers[name] !== undefined).map(name => [name, request.headers[name]]));
  const upstream = await fetch(`${self}${rest}${url.search}`, { method: request.method, headers: forwarded,
    body: chunks.length ? Buffer.concat(chunks) : undefined, redirect: "error" });
  response.writeHead(upstream.status, { ...headers, "content-type": upstream.headers.get("content-type") ?? "application/octet-stream" });
  response.end(Buffer.from(await upstream.arrayBuffer()));
}
async function handle(request, response, path, headers) {
  const url = new URL(request.url, "http://127.0.0.1");
  if (path.startsWith("/fixture/relay/")) { await relay(request, response, url, headers); return true; }
  if (path === "/fixture/libcurl-contract" && url.searchParams.has("cancel")) {
    // The probe rejects this response in a callback; its connection must close.
    const record = { phase: url.searchParams.get("cancel"), finished: false, closed: false };
    cancelledRequests.push(record);
    response.writeHead(200, { ...headers, "content-type": "text/plain" });
    response.write("prefix");
    const timer = setTimeout(() => { record.finished = true; response.end("suffix"); }, 2000);
    response.once("close", () => { record.closed = true; clearTimeout(timer); });
  } else if (path === "/fixture/libcurl-contract") {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    contractRequests.push({ authorization: request.headers.authorization ?? null, body: Buffer.concat(chunks).toString() });
    response.writeHead(200, { ...headers, "content-type": "text/plain" }).end("libcurl contract response\n");
  } else if (path === "/fixture/http-overlap") {
    // Each response waits for its peer: only overlapping transfers succeed.
    const group = url.searchParams.get("group");
    const waiting = overlapping.get(group) ?? [];
    overlapping.set(group, [...waiting, response]);
    if (waiting.length) {
      overlapping.delete(group);
      for (const peer of [...waiting, response]) peer.writeHead(200, headers).end("OVERLAP-OK\n");
    } else setTimeout(() => {
      if (overlapping.get(group)?.includes(response)) { overlapping.delete(group); response.writeHead(504, headers).end(); }
    }, 3000);
  } else return git.serve(request, response, url);
  return true;
}

// /fixture/large serves 65 MiB + 17 bytes of a repeating 0..255 pattern.
const pattern = Buffer.from(Uint8Array.from({ length: 65536 }, (_, index) => index & 255)), large = createHash("sha256");
for (let index = 0; index < 1040; index++) large.update(pattern);
large.update(pattern.subarray(0, 17));
const largeDigest = large.digest("hex");

await browserTest("network", { server: { fixtures, handle } }, async ({ server, open }) => {
  contractRequests = [];
  cancelledRequests = [];
  relayed = [];
  git = createGitTransportFixture();
  try {
    // The same server under another origin name sends no CORS headers.
    const blocked = server.origin.replace("127.0.0.1", "localhost");
    // A third name stands for a forge the embedding relays: the browser never
    // contacts it, only the relay does.
    const forge = server.origin.replace("127.0.0.1", "forge.localhost");
    const relays = [{ origin: forge, through: `${server.origin}/fixture/relay/` }];
    const { submit } = await open({ setup: page => page.addInitScript(relays => { globalThis.DOLLY_HTTP_RELAYS = relays; }, relays),
      policy: { rules: [
      { origin: forge, pathPrefix: "/fixture/", methods: ["GET", "POST"], credentialHeaders: ["authorization"] },
      { origin: blocked, pathPrefix: "/fixture/", methods: ["GET"] },
      { origin: server.origin, path: "/fixture/http.txt", methods: ["GET"], maxResponseBytes: 8 },
      { origin: server.origin, path: "/fixture/libcurl-contract", methods: ["GET", "POST"], credentialHeaders: ["authorization"] },
      { origin: server.origin, pathPrefix: "/fixture/", methods: ["GET", "POST"] },
    ] } });
    const run = async command => assert.equal(await submit(command), 0, command);
    await run(`curl -fsS ${server.origin}/fixture/large -o /tmp/large && test "$(wc -c < /tmp/large)" = 68157457`);
    await run(`test "$(sha256sum /tmp/large | cut -d ' ' -f 1)" = ${largeDigest} && rm /tmp/large`);
    assert.notEqual(await submit(`curl -fsS ${server.origin}/fixture/http.txt -o /tmp/limited`), 0, "maxResponseBytes");
    // Streams a 3 MiB request body through the echo fixture; 9 MiB is refused.
    await run(`curl -fsS ${server.origin}/fixture/http-check.c -o /tmp/http-check.c && cc /tmp/http-check.c -o /tmp/http-check`);
    await run(`DOLLY_PROCESS_HTTP_POST_URL=${server.origin}/fixture/echo /tmp/http-check`);

    await run(`curl -fsS ${server.origin}/fixture/libcurl-contract.c -o /tmp/libcurl-contract.c`);
    await run(`cc -O0 /tmp/libcurl-contract.c -lcurl -o /tmp/libcurl-contract && timeout 20 /tmp/libcurl-contract ${server.origin}/fixture/libcurl-contract`);
    assert.deepEqual(contractRequests, [
      { authorization: null, body: "payload" },
      { authorization: "Basic dXNlcjpwYXNz", body: "payload" },
      { authorization: null, body: "abc" },
      { authorization: null, body: "" },
      { authorization: null, body: "ab" },
      { authorization: null, body: "payload" },
      { authorization: null, body: "" },
      { authorization: "Basic dXJsIHVzZXI6cEBzcw==", body: "" },
      { authorization: null, body: "" },
    ], "protocol rejection must prevent HTTP, and authentication selection and a reset must change the actual request");
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.deepEqual(cancelledRequests, [
      { phase: "deadline", finished: false, closed: true },
      { phase: "progress", finished: false, closed: true },
      { phase: "body", finished: false, closed: true },
      { phase: "header", finished: false, closed: true },
    ], "a deadline, a progress callback and rejected callbacks must close the actual HTTP connections");

    // curl and git name the class the broker knows: a response the browser
    // blocked or could not reach (curl status 7), or a policy refusal (9).
    assert.equal(await submit(`curl -sS ${blocked}/fixture/http.txt 2> /tmp/blocked.err`), 7);
    assert.ok(server.requests.get("/fixture/http.txt") >= 1, "the blocked host was reached");
    assert.equal(await submit(`curl -sS ${server.origin}/not-allowed 2> /tmp/refused.err`), 9);
    assert.notEqual(await submit(`git ls-remote ${blocked}/fixture/blocked.git 2> /tmp/git-blocked.err`), 0);
    assert.notEqual(await submit(`git ls-remote ${server.origin}/not-allowed.git 2> /tmp/git-refused.err`), 0);
    await run(`grep -qF "$(sed 's/^curl: ([0-9]*) //' /tmp/blocked.err)" /tmp/git-blocked.err`);
    await run(`grep -qF "$(sed 's/^curl: ([0-9]*) //' /tmp/refused.err)" /tmp/git-refused.err`);
    await run("! grep -qF \"$(sed 's/^curl: ([0-9]*) //' /tmp/refused.err)\" /tmp/git-blocked.err");

    // Unchanged Git, addressed at the forge's own URL, clones through the
    // embedding's relay; the policy still judges the forge's URL, the relay
    // gets no credentials it was not named for, and nothing redirects.
    const remote = `${forge}/fixture/git-transport/repo`;
    await run(`timeout 30 git clone ${remote} /tmp/relayed && test "$(git -C /tmp/relayed rev-parse HEAD)" = ${git.second} && git -C /tmp/relayed fsck --full`);
    await run(`test "$(git -C /tmp/relayed config remote.origin.url)" = ${remote} && timeout 30 git -C /tmp/relayed fetch origin`);
    await run(`timeout 30 git clone --depth=1 ${remote} /tmp/relayed-shallow && test "$(git -C /tmp/relayed-shallow rev-list --count HEAD)" = 1`);
    assert.ok(relayed.some(request => request.method === "POST" && request.path.endsWith("/git-upload-pack")), "the pack came through the relay");
    await run(`test "$(curl -sS -u user:pass -w '%{url_effective}' -o /tmp/relayed.txt ${forge}/fixture/http.txt)" = ${forge}/fixture/http.txt && grep -q FETCHED-THROUGH-BROWSER /tmp/relayed.txt`);
    assert.deepEqual(relayed.map(request => request.authorization).filter(Boolean), [], "the relay received credentials");
    assert.equal(await submit(`curl -sS ${forge}/outside-the-policy`), 9, "a relay admits nothing the policy refuses");
    assert.equal(relayed.some(request => request.path === "/outside-the-policy"), false);
    await run("rm -rf /tmp/relayed /tmp/relayed-shallow /tmp/relayed.txt");

    await runGitTransport({ submit, origin: server.origin, fixture: git });
  } finally {
    git.dispose();
  }
});
