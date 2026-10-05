// QuickJS, Janis and TypeScript in the javascript image: command behavior,
// Janis files, processes and HTTP, and UTF-8 streams.
// Usage: node demos/javascript/test/javascript-browser.mjs
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delay, demoTest, installProbe } from "../../browser.mjs";
import { observe } from "./fixtures/node-oracle.mjs";
import { decoderCases } from "./fixtures/utf8-cases.mjs";

const oracleRoot = await mkdtemp(`${tmpdir()}/janis-node-oracle-`);
const oracle = JSON.stringify(await observe(oracleRoot));
await rm(oracleRoot, { recursive: true });

const aborted = [];
let queuedRequestSent = false;
async function handle(request, response, path, headers) {
  if (path === "/fixture/never-requested") queuedRequestSent = true;
  if (path === "/fixture/bytes") {
    response.writeHead(200, { ...headers, "content-type": "application/octet-stream" });
    request.pipe(response);
  } else if (path.startsWith("/fixture/abort/")) {
    const record = { name: path.split("/").at(-1), finished: false, closed: false };
    aborted.push(record);
    response.writeHead(200, { ...headers, "content-type": "text/plain" });
    if (record.name !== "before") response.write("prefix");
    const timer = setTimeout(() => { record.finished = true; response.end("suffix"); }, 2000);
    response.once("close", () => { record.closed = true; clearTimeout(timer); });
  } else if (path === "/fixture/http-overlap") {
    // Pairs of requests in one group answer only once both have arrived.
    const group = new URL(request.url, "http://fixture").searchParams.get("group");
    const pair = overlapping.get(group) ?? { responses: [], timer: setTimeout(() => {
      overlapping.delete(group);
      for (const waiting of pair.responses) waiting.writeHead(504, headers).end("requests did not overlap");
    }, 3000) };
    overlapping.set(group, pair);
    pair.responses.push(response);
    if (pair.responses.length === 2) {
      clearTimeout(pair.timer);
      overlapping.delete(group);
      for (const waiting of pair.responses) waiting.writeHead(200, headers).end("OVERLAP-OK\n");
    }
  } else if (path === "/fixture/http-redirect") {
    response.writeHead(307, { ...headers, location: "/fixture/http.txt" }).end();
  } else if (path === "/fixture/node-oracle") {
    response.writeHead(200, { ...headers, "content-type": "application/json" }).end(oracle);
  } else if (path === "/fixture/utf8-reference") {
    response.writeHead(200, { ...headers, "content-type": "application/json" });
    response.end(JSON.stringify(decoderCases(TextDecoder)));
  } else if (path === "/fixture/utf8-stream") {
    response.writeHead(200, { ...headers, "content-type": "text/plain; charset=utf-8", "x-content-type-options": "nosniff" });
    response.flushHeaders();
    for (const byte of [...Buffer.from("日本語😀"), 0xe3]) {
      response.write(Buffer.from([byte]));
      await delay(50);
    }
    response.end();
  } else return false;
  return true;
}
const overlapping = new Map();

const fixtures = Object.fromEntries(["janis-files.mjs", "janis-process.mjs", "node-oracle.mjs", "utf8-browser.mjs", "utf8-cases.mjs", "utf8-writer.c"]
  .map(name => [name, `demos/javascript/test/fixtures/${name}`]));
await demoTest("javascript", { image: "javascript", timeout: 600_000, server: { handle, fixtures } }, async ({ server, open }) => {
  const { page, submit, run, start, waitText } = await open({ ...await installProbe("javascript"), policy: { maxRequests: 256,
    rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET", "POST"] }] } });
  const scratch = "/tmp/dolly-javascript-test";
  await run(`mkdir ${scratch} && cd ${scratch} && for name in ${Object.keys(fixtures).join(" ")}; do curl -fsS ${server.origin}/fixture/$name -o $name || exit 1; done`);
  for (const [command, status = 0] of [
    ["qjs --version"],
    [`qjs -e 'Dolly.httpStart("GET", "${server.origin}/fixture/http.txt", "", null)'`],
    ["qjs -e \"Dolly.writeFile('tty.txt', [process.stdin.isTTY, process.stdout.isTTY, process.stderr.isTTY].join(','))\" && grep -q '^true,true,true$' tty.txt"],
    ["qjs -e \"Dolly.writeFile('redirect.txt', String(process.stdout.isTTY))\" > discard.txt && grep -q '^false$' redirect.txt"],
    ["test \"$(qjs -e \"console.log('JS-' + (6 * 7))\")\" = JS-42"],
    ["echo \"console.log('ARGS-' + scriptArgs.join(':'))\" > args.js && test \"$(qjs args.js alpha beta)\" = ARGS-alpha:beta"],
    ["echo 'export const answer = 42' > value.mjs && echo \"import { answer } from './value.mjs'; console.log('ESM-' + answer)\" > main.mjs && test \"$(qjs main.mjs)\" = ESM-42"],
    ["test \"$(echo \"print([1,2,3].map(x => x * 2).join(','))\" | qjs -)\" = 2,4,6"],
    ["qjs -e \"throw new Error('JS-EXPECTED')\"", 1],
    ["qjs --unsupported", 64],
    // A noninteractive Dolly.shell gives stdin readers EOF and enforces its deadline.
    ["qjs -e \"const r = Dolly.shell('cat', ''); if (r.status !== 0) throw new Error(String(r.status))\""],
    ["echo 'int main(void) { volatile unsigned long n = 0; for (;;) n++; }' > loop.c && cc -O0 loop.c -o loop"],
    [`qjs -e "const r = Dolly.shell('${scratch}/loop', '', 50); if (r.status !== 124) throw new Error('status ' + r.status)"`],
    ["janis -e \"const c = process.getBuiltinModule('node:crypto'); if (c.createHash('sha256').update('abc').digest('hex') !== 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad') process.exit(1)\""],
    ["janis -e \"const h = process.getBuiltinModule('node:http'); const s = new h.Server(); s.on('error', e => process.exit(e.code === 'ENOSYS' ? 0 : 1)); s.listen(1455)\""],
    ["echo 'export const answer: number = 6 * 7;' > answer.ts && tsc --target ES2023 --module ES2022 --outDir ts answer.ts"],
    [`qjs -m -e "import { answer } from '${scratch}/ts/answer.js'; if (answer !== 42) throw new Error('bad TypeScript emit')"`],
  ]) await run(command, status);

  const loop = start("qjs -e 'console.log(\"LOOP-STARTED\"); for (;;) {}'");
  await waitText(/\nLOOP-STARTED/);
  await page.keyboard.press("Control+c");
  assert.equal(await loop.done, 130, "Ctrl-C did not interrupt a QuickJS bytecode loop");

  await run("mkdir files && echo target > files/target && ln -s target files/link && ln -s absent files/dangling && ln -s keep-dir files/directory-link");
  await run(`janis -m janis-files.mjs ${scratch}/files`);
  await run(`janis -m node-oracle.mjs ${scratch}/oracle ${server.origin}`);
  // Built-in and CommonJS modules imported from ESM leave nothing in /tmp.
  await run("janis -e \"if (require('node:fs').readdirSync('/tmp').some(name => name.startsWith('janis-'))) process.exit(1)\"");
  // The heap is bounded by the process's memory, not near 510 MB.
  await run("janis -e 'const kept = []; for (let i = 0; i < 48; i++) kept.push(new Uint8Array(16 << 20).fill(1))'");
  await run(`timeout 30 janis -m janis-process.mjs ${scratch} ${server.origin}`);
  await delay(100);
  assert.equal(queuedRequestSent, false, "a cancelled queued fetch reached HTTP");
  assert.deepEqual(aborted.map(({ name, finished, closed }) => [name, finished, closed]).sort(),
    [["before", false, true], ["body", false, true], ["cancel", false, true],
      ["child-one", false, true], ["child-two", false, true], ["peer", true, true]].sort(),
    "abort and exit must close only the owner's HTTP connections");
  await run(`cc utf8-writer.c -o writer && janis -m utf8-browser.mjs ${server.origin}`);
  await run("./writer stdin | janis -m utf8-browser.mjs stdin");
  assert.equal(await submit("janis -m -e 'await new Promise(() => {})'"), 1, "a stranded promise must fail, not spin");
  await run(`cd /workspace && rm -rf ${scratch}`);
});
