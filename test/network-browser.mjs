import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { browserTest } from "./browser.mjs";
import { createGitTransportFixture, runGitTransport } from "./fixtures/git-transport.mjs";

const fixtures = { "libcurl-contract.c": "test/fixtures/libcurl-contract.c" };
let contractRequests, cancelledRequests, git;
const overlapping = new Map();
async function handle(request, response, path, headers) {
  const url = new URL(request.url, "http://127.0.0.1");
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
  git = createGitTransportFixture();
  try {
    const { submit } = await open({ policy: { rules: [
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
    ], "protocol rejection must prevent HTTP, and authentication selection must change the actual request");
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.deepEqual(cancelledRequests, [
      { phase: "body", finished: false, closed: true },
      { phase: "header", finished: false, closed: true },
    ], "rejected callbacks must close the actual HTTP connections");

    await runGitTransport({ submit, origin: server.origin, fixture: git });
  } finally {
    git.dispose();
  }
});
