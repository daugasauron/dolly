import { readdir } from "node:fs/promises";
import { processSmokeSources } from "./fixtures/process-smoke.mjs";
import { tarArchive } from "./fixtures/tar.mjs";
import { startCheckoutServer } from "../scripts/serve-checkout.mjs";

// The checkout server (scripts/serve-checkout.mjs, same arguments) plus test
// fixtures: the modules in test/fixtures/, sources under /fixture/ (fixtures:
// name -> checkout path) and the /fixture/ HTTP endpoints below.
export async function startBrowserServer(projectDir, image = "default", { fixtures = {}, handle, ...options } = {}) {
  const files = new Map();
  for (const name of await readdir(new URL("fixtures/", import.meta.url))) {
    if (name.endsWith(".mjs")) files.set(`/test/fixtures/${name}`, `test/fixtures/${name}`);
  }
  for (const [name, path] of Object.entries({ ...processSmokeSources, ...fixtures })) files.set(`/fixture/${name}`, path);
  for (const name of ["process-wrong-call", "process-wrong-start", "process-wrong-memory", "process-wrong-import"]) {
    files.set(`/fixture/${name}.wasm`, `build/${name}.wasm`);
  }
  let cancelledRequests = 0;
  async function handleFixture(request, response, path, headers) {
    if (await handle?.(request, response, path, headers)) return true;
    if (path === "/fixture/echo" && request.method === "POST") {
      response.writeHead(200, { ...headers, "content-type": "application/octet-stream" });
      request.pipe(response);
    } else if (!["GET", "HEAD"].includes(request.method)) {
      return false;
    } else if (path === "/fixture/http.txt") {
      response.writeHead(200, { ...headers, "content-type": "text/plain" });
      response.end(request.method === "HEAD" ? undefined : "FETCHED-THROUGH-BROWSER\n");
    } else if (path === "/fixture/large") {
      response.writeHead(200, { ...headers, "content-type": "application/octet-stream" });
      let remaining = 65 * 1024 * 1024 + 17;
      const chunk = Buffer.from(Uint8Array.from({ length: 65536 }, (_, i) => i & 255));
      const send = () => {
        while (remaining > 0 && !response.destroyed) {
          const length = Math.min(remaining, chunk.length);
          remaining -= length;
          if (!response.write(chunk.subarray(0, length))) { response.once("drain", send); return; }
        }
        if (!response.destroyed) response.end();
      };
      if (request.method === "HEAD") response.end(); else send();
    } else if (path === "/fixture/slow") {
      response.writeHead(200, { ...headers, "content-type": "text/plain" });
      response.write("waiting for cancellation\n");
      response.once("close", () => { cancelledRequests++; });
    } else if (path === "/fixture/root.tar") {
      response.writeHead(200, { ...headers, "content-type": "application/octet-stream" });
      response.end(request.method === "HEAD" ? undefined : Buffer.concat([
        tarArchive("./", Buffer.alloc(0), "5").subarray(0, 512),
        tarArchive("./file", Buffer.from("root preserved")),
      ]));
    } else return false;
    return true;
  }
  const server = await startCheckoutServer(projectDir, image, { ...options, files, handle: handleFixture });
  return { ...server, get cancelledRequests() { return cancelledRequests; } };
}
