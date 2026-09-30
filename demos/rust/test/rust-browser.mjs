// rustc, Patti and a Tokio HTTP client in the rust-tools image.
// Usage: node demos/rust/test/rust-browser.mjs (Tokio needs the Codex sources:
// python3 demos/codex/prepare-codex-sources.py)
import { execFileSync } from "node:child_process";
import { demoTest } from "../../browser.mjs";
import { rustToolSources, runRustTools } from "./fixtures/rust-tools.mjs";
import { createTokioFixture } from "./fixtures/tokio.mjs";

execFileSync("python3", ["demos/rust/test/fixtures/prepare-tokio.py"], { cwd: new URL("../../..", import.meta.url), stdio: "inherit" });
const tokio = createTokioFixture();
await demoTest("rust", { image: "rust-tools", timeout: 900_000, server: { fixtures: rustToolSources,
  handle: (request, response) => tokio.handle(request, response, new URL(request.url, "http://fixture")) } },
async ({ server, open }) => {
  const { submit, waitText } = await open({ policy: { maxRequests: 256, rules: [
    { origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] },
    ...["/tokio/stream", "/tokio/slow"].map(path => ({ origin: server.origin, path, methods: ["GET"] })),
  ] } });
  await runRustTools(submit, server.origin);
  await tokio.run(submit, server.origin, run => waitText(new RegExp(`TOKIO-HTTP-FIRST-${run}`)));
});
