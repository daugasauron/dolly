import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

export function createTokioFixture() {
  let streams = 0, cancelled = 0, denied = 0;
  let waitForFirstChunk;
  return {
    async handle(request, response, url) {
      if (url.pathname === "/fixture/tokio.tar") {
        response.writeHead(200, { "Access-Control-Allow-Origin": "*" });
        response.end(await readFile(new URL("../../build/fixtures/tokio.tar", import.meta.url)));
        return true;
      }
      if (url.pathname === "/tokio/denied") {
        denied++;
        response.writeHead(500).end();
        return true;
      }
      if (!["/tokio/stream", "/tokio/slow"].includes(url.pathname)) return false;
      response.writeHead(200, { "Access-Control-Allow-Origin": "*", "Content-Type": "text/plain" });
      response.write("first\n");
      const slow = url.pathname.endsWith("/slow");
      if (!slow) streams++;
      if (!slow && streams % 2) await waitForFirstChunk(Math.floor(streams / 2));
      const timer = setTimeout(() => response.end("second\n"), slow ? 10000 : 250);
      response.on("close", () => {
        clearTimeout(timer);
        if (slow && !response.writableFinished) cancelled++;
      });
      return true;
    },
    async run(submit, origin, observeFirstChunk) {
      waitForFirstChunk = observeFirstChunk;
      const run = async command => assert.equal(await submit(command), 0, command);
      try {
        await run(`curl -fsS ${origin}/fixture/tokio.tar -o /tmp/tokio.tar`);
        await run("tar -xf /tmp/tokio.tar -C /");
        await run("patti build --offline --manifest-path /tmp/tokio/probe/Cargo.toml --target-dir /tmp/tokio/build --cache /tmp/tokio/cache --patch libc=/opt/rust-sdk/src/libc --patch mio=/tmp/tokio/mio-1.2.0 --patch tokio=/tmp/tokio/tokio-1.52.3 --patch socket2=/tmp/tokio/socket2-0.6.3 --patch zlib-rs@0.5.5=/tmp/tokio/zlib-rs-0.5.5");
        for (let i = 0; i < 2; i++) {
          await run(`TOKIO_HTTP_ORIGIN=${origin}/tokio TOKIO_HTTP_RUN=${i} /tmp/tokio/build/dolly-tokio-probe`);
        }
        assert.deepEqual({ streams, cancelled, denied }, { streams: 4, cancelled: 2, denied: 0 });
      } finally {
        await submit("rm -rf /tmp/tokio /tmp/tokio.tar /tmp/tokio-files");
      }
    },
  };
}
