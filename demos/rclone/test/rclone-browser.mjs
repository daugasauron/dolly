// A folder this machine serves, kept in step with a default session's folder:
// upstream's rclone serves it over WebDAV as the README says, on a loopback
// port with a token in its path; amy installs the rclone package; bisync
// copies what each side wrote, changed and removed to the other, a 16 MiB
// file among them, with the modification times, under a policy of only the
// README's rule and amy's index; and the README's loop carries new files both
// ways.
// Usage: node demos/rclone/test/rclone-browser.mjs
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { delay, demoTest } from "../../browser.mjs";

const root = new URL("../../..", import.meta.url).pathname;
const scratch = mkdtempSync(join(tmpdir(), "dolly-rclone-"));
const rclone = join(scratch, "rclone");
const zip = execFileSync("bash", ["scripts/fetch-pinned-archive.sh", "rclone_host"], { cwd: root, encoding: "utf8" }).trim();
writeFileSync(rclone, execFileSync("unzip", ["-p", zip, "*/rclone"], { maxBuffer: 1 << 28 }), { mode: 0o755 });
const freePort = () => new Promise(resolve => {
  const probe = createServer().listen(0, "127.0.0.1", () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});
const until = async (check, what) => {
  for (const deadline = Date.now() + 60_000; !await check();) {
    if (Date.now() > deadline) throw new Error(`never: ${what}`);
    await delay(250);
  }
};
const listing = directory => readdirSync(directory, { recursive: true }).sort();

try {
  for (const browser of ["chromium", "firefox"]) {
    await demoTest("rclone", { image: "default", browser, timeout: 600_000 }, async ({ server, open }) => {
      const folder = mkdtempSync(join(scratch, "share-"));
      for (const name of ["a", "b", "c"]) writeFileSync(join(folder, `${name}.txt`), `${name} from the host\n`);
      const port = await freePort(), token = randomBytes(16).toString("hex"), url = `http://127.0.0.1:${port}/${token}`;
      const serve = spawn(rclone, ["serve", "webdav", folder, "--addr", `127.0.0.1:${port}`, "--baseurl", token,
        "--dir-cache-time", "0s",
        "--response-header", `Access-Control-Allow-Origin: ${server.origin}`,
        "--response-header", "Access-Control-Allow-Methods: GET, HEAD, PUT, DELETE, PROPFIND, MKCOL, MOVE, COPY",
        "--response-header", "Access-Control-Allow-Headers: Content-Type, Depth, Destination, Overwrite, X-OC-Mtime"],
      { stdio: "ignore" });
      try {
        await until(() => fetch(`${url}/`, { method: "OPTIONS" }).then(response => response.ok, () => false), "rclone serves");
        const policy = { maxRequests: 4096, rules: [{ origin: `http://127.0.0.1:${port}`, pathPrefix: `/${token}`,
            methods: ["GET", "HEAD", "PUT", "DELETE", "PROPFIND", "MKCOL", "MOVE", "COPY"],
            credentialHeaders: ["depth", "destination", "overwrite", "x-oc-mtime"] }] };
        const { run } = await open({ policy });
        await run("amy install rclone && man rclone > /dev/null");
        await run(`rclone config create host webdav url=${url} vendor=rclone`);
        await run("mkdir -p /workspace/host && echo d from dolly > /workspace/host/d.txt");
        await run("rclone bisync /workspace/host host: --resync");
        assert.deepEqual(listing(folder), ["a.txt", "b.txt", "c.txt", "d.txt"]);
        await run("test \"$(cat /workspace/host/a.txt)\" = 'a from the host'");

        // Changes on both sides, and a file each removes, go both ways.
        writeFileSync(join(folder, "a.txt"), "a changed on the host\n");
        writeFileSync(join(folder, "e.txt"), "e from the host\n");
        unlinkSync(join(folder, "b.txt"));
        await run("echo c changed in dolly > /workspace/host/c.txt && rm /workspace/host/d.txt && " +
          "mkdir -p /workspace/host/dir/sub && echo f from dolly > /workspace/host/dir/sub/f.txt");
        // 16 MiB, above the 8 MiB Go's transport once held a request body to.
        await run("cd /workspace/host && printf '%s\\n' 0123456789abcde > big.bin && for i in " +
          `${[...Array(20).keys()].join(" ")}; do cat big.bin big.bin > double.bin && mv double.bin big.bin; done && cd /workspace`);
        await run("rclone bisync /workspace/host host:");
        assert.deepEqual(listing(folder), ["a.txt", "big.bin", "c.txt", "dir", "dir/sub", "dir/sub/f.txt", "e.txt"]);
        assert.equal(statSync(join(folder, "big.bin")).size, 16 << 20);
        assert.equal(readFileSync(join(folder, "c.txt"), "utf8"), "c changed in dolly\n");
        await run("test \"$(cat /workspace/host/a.txt)\" = 'a changed on the host' && " +
          "test \"$(cat /workspace/host/e.txt)\" = 'e from the host' && test ! -e /workspace/host/b.txt");
        // Both sides keep each file's modification time.
        await run(["a", "c", "e", "dir/sub/f"].map(file => `test "$(rclone lsf --format t /workspace/host/${file}.txt)" = ` +
          `"$(rclone lsf --format t host:${file}.txt)"`).join(" && "));

        // The README's loop keeps the folders in step without a command.
        await run("slop -c 'while :; do rclone bisync /workspace/host host: --resilient --recover --max-lock 2m -q; " +
          "sleep 1; done' &");
        writeFileSync(join(folder, "g.txt"), "g from the host\n");
        await run("echo h from dolly > /workspace/host/h.txt");
        await until(() => existsSync(join(folder, "h.txt")), "h.txt reaches the host");
        await run("until test -f /workspace/host/g.txt; do sleep 0.25; done; kill $!");
        assert.equal(readFileSync(join(folder, "h.txt"), "utf8"), "h from dolly\n");
      } finally {
        serve.kill();
      }
    });
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
