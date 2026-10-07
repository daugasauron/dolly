import assert from "node:assert/strict";
import { browserTest } from "./browser.mjs";

// sockets@0: local stream sockets between processes, with a program compiled
// in the image (test/fixtures/sockets.c names what each mode proves).
await browserTest("sockets", { image: "system", server: { fixtures: { "sockets.c": "test/fixtures/sockets.c" } } }, async ({ server, open }) => {
  const policy = { rules: [{ origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] };
  const { page, submit, text } = await open({ policy });
  const run = async command => assert.equal(await submit(command), 0, `${command}\n${await text()}`);
  const status = async (command, expected) => assert.equal(await submit(command), expected, `${command}\n${await text()}`);
  await run(`curl -fsS ${server.origin}/fixture/sockets.c -o /tmp/sockets.c && cc -O1 /tmp/sockets.c -o /tmp/sockets`);

  // A pair inherited through spawn carries bytes both ways; network families,
  // datagrams, abstract names and descriptor passing are refused by name.
  await run("/tmp/sockets pair");
  await run("/tmp/sockets refuse");

  // A peer that exits or is killed is end of file to a waiting reader and
  // EPIPE to a writer, whom SIGPIPE ends unless it is ignored.
  await run("/tmp/sockets peer");
  await status("/tmp/sockets sigpipe", 141);

  // Two programs the shell starts, sharing no pipe, meet at a path. The
  // server leaves its path behind: a dead listener refuses connections.
  await run("/tmp/sockets server /tmp/named.sock & /tmp/sockets client /tmp/named.sock && wait $!");
  await run("/tmp/sockets stale /tmp/named.sock && test ! -e /tmp/named.sock && test ! -e /tmp/named.sock.moved");
  await run("/tmp/sockets backlog /tmp/backlog.sock");

  // One process can take every socket the kernel holds. Exit, abort (its
  // Worker fails) and forced termination of a CPU loop each give them back.
  await run("/tmp/sockets quota exit");
  await status("/tmp/sockets quota abort 2> /dev/null", 126);
  await run("/tmp/sockets quota exit");
  await status("timeout 1 /tmp/sockets quota spin", 124);
  await run("/tmp/sockets quota exit");

  // The module adds no kernel import: http@0's dispatch stays the one network edge.
  assert.deepEqual(await page.evaluate(async () => WebAssembly.Module.imports(
    await WebAssembly.compileStreaming(fetch("/dist/dolly.wasm"))).map(entry => `${entry.module}.${entry.name}`).sort()),
  ["env.dolly_audio_dispatch", "env.dolly_bootstrap_write_bytes", "env.dolly_clock_monotonic", "env.dolly_clock_realtime",
    "env.dolly_download_dispatch", "env.dolly_entropy", "env.dolly_gpu_dispatch", "env.dolly_http_dispatch", "env.memory"]);
});
