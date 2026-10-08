// CPython in the python image: its REPL, output streaming, children, signals,
// termios, shutil, ctypes, and pip, urllib.request and requests over the
// HTTP broker against pinned PyPI files served from the test server.
// Usage: node demos/python/test/python-browser.mjs
// DOLLY_PYTHON_PACKAGES=1 also source-builds NumPy and Pandas with pip (long).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { basename } from "node:path";
import { gzipSync } from "node:zlib";
import { delay, demoTest, installProbe } from "../../browser.mjs";

const packages = process.env.DOLLY_PYTHON_PACKAGES === "1";
const projectDir = new URL("../../..", import.meta.url).pathname;
const wheelhouse = new Map([
  ["a0/f4/c67b0b3f1b9245e8d266f0f112c500d50e5b4e83cb6f3b71b6528104182a/requests-2.34.2-py3-none-any.whl", "2a0d60c172f83ac6ab31e4554906c0f3b3588d37b5cb939b1c061f4907e278e0"],
  ["fc/ad/d07d7862a62ffa6d79d68074d14823243dd235a77c45262acbf6adeb28bf/charset_normalizer-3.5.2-py3-none-any.whl", "b6b751274acb69d77b3323d6b7dbaa3c7fdfc1eb829b7eb61d262f32e1af9685"],
  ["58/a2/bb081bab032533a855d44de1d56f8e8426114ff1ba5d1f07a438a0a654f8/idna-3.20-py3-none-any.whl", "ab7ae7122974553370f0bdb919e1a960b2cd1bc1ef0276416d896db81c14582c"],
  ["92/9d/c4e665119135114480843e7ab388fa94d8480650450e6f8e26b70d323a4c/urllib3-2.8.0-py3-none-any.whl", "0cf3cae568d36aa9576b28dfb35f11328f1cb974ca7647d9475ebb86c75ac6e3"],
  ["0b/a7/71ac2cff56fec219ed242bb11b8efb69fcc4bec75db06fb7bfe35de520e6/certifi-2026.7.22-py3-none-any.whl", "62f22742b58a1a33014a2b6b706588a8d7e2a88ae7bd1a6ebe8c992928483775"],
  ...packages ? [
    ["9a/80/db0b4559e57ec36362bedbb05530a87fafbcb6067708c946967a41d449e7/numpy-2.5.2.tar.gz", "d482d171c406ae88c5b19cad3b6a1c4c5209f886ab74bc44c2c865c23f52d860"],
    ["be/4f/5f3422a2afec5ffc46308b79e53291365a93748b498ac2e58bead0197916/pandas-3.0.5.tar.gz", "dca3734d6ab7c906e6730f0788b0a1dbb9f2467731f9711f77995c8e9d62d712"],
    ["37/35/26a6c96ed91fa3baacd64da82f279bc282eade45003c00d99293332b45e1/meson_python-0.22.0-py3-none-any.whl", "0ce9fa40bb8bfaecccba97347063970e1a18cca2730d6e68a341dc0b73b284a4"],
    ["57/99/36cd25f9598eef70db97577440a70a360af505f6f01c2338a18d1556079c/meson-1.12.1-py3-none-any.whl", "930bc7542cbd9f57009e182fd014eba48cf1a0180a7b9006d2d32d8f168d8b02"],
    ["b9/8e/d883718e872abc214ba053f60f7e6edc2abd5ffbd1544beb01a9c92ddd3c/pyproject_metadata-0.12.1-py3-none-any.whl", "f7162d580a96386a8eb096da06215f981f547d1490f03055ef99e323bc2da427"],
    ["63/34/ba1c580383c9eada3711951fef0795c80b829a078d72188184bcab9dd527/packaging-26.3-py3-none-any.whl", "d7193f7c8e4e93f444fde0262bf90af30e16fa0ad0ad44cb553c87339b23cd1c"],
    ["2e/29/69cfbb602cd91690c55d38ba9fe53e6a7e76a6fa647bf38f19c138d25449/wheel-0.48.0-py3-none-any.whl", "3217dcc807155e45db462d7ef2431f5ddda0d7273b700d05a67b271ceb1287ab"],
    ["bf/77/67b0b24e45073a699610e50f00c18474ff9b09ea29ecc95083bdf5e60acd/cython-3.3.0-py3-none-any.whl", "9b24b5c8cd536946b62086fcafee6d5509d3f549f72d553d2336af87ffbe0da1"],
    ["b0/79/f0f1ca286b78f6f33c521a36b5cbd5bd697c0d66217d8856f443aeb9dd77/versioneer-0.29-py3-none-any.whl", "0f1a137bb5d6811e96a79bb0486798aeae9b9c6efc24b389659cebb0ee396cb9"],
    ["ec/57/56b9bcc3c9c6a792fcbaf139543cee77261f3651ca9da0c93f5c1221264b/python_dateutil-2.9.0.post0-py2.py3-none-any.whl", "a8b2bc7bffae282281c8140a97d3aa9c14da0b136dfe83f850eea9a5f7470427"],
    ["b7/ce/149a00dd41f10bc29e5921b496af8b574d8413afcd5e30dfa0ed46c2cc5e/six-1.17.0-py2.py3-none-any.whl", "4721f391ed90541fddacab5acf947aa0d3dc7d27b2e1e8eda2be8970586c3274"],
  ] : [],
].map(([path, sha256]) => [basename(path), execFileSync("bash", ["scripts/fetch-verified-file.sh",
  `https://files.pythonhosted.org/packages/${path}`, sha256, `.cache/python-wheelhouse/${basename(path)}`],
{ cwd: projectDir, encoding: "utf8" }).trim()]));
const gzipText = gzipSync("DECODED-BY-THE-BROWSER\n".repeat(64));
// A pip --find-links page and its files, and a gzip response which, read
// cross-origin, hides its Content-Encoding but not the encoded Content-Length.
function handle(request, response, path, headers) {
  const file = wheelhouse.get(path.slice("/fixture/wheels/".length));
  if (path === "/fixture/gzip") {
    response.writeHead(200, { ...headers, "access-control-allow-origin": "*", "content-encoding": "gzip",
      "content-length": gzipText.length, "content-type": "text/plain" });
    response.end(gzipText);
  } else if (path === "/fixture/wheels") {
    response.writeHead(200, { ...headers, "content-type": "text/html" });
    response.end([...wheelhouse.keys()].map(name => `<a href="/fixture/wheels/${name}">${name}</a>`).join("\n"));
  } else if (path.startsWith("/fixture/wheels/") && file) {
    response.writeHead(200, { ...headers, "content-type": "application/octet-stream" });
    createReadStream(projectDir + file).pipe(response);
  } else return false;
  return true;
}

const fixtures = {
  "python-process.py": "demos/python/test/fixtures/python-process.py",
  "python-http.py": "demos/python/test/fixtures/python-http.py",
  "python-shutil.py": "demos/python/test/fixtures/python-shutil.py",
  "python-sockets.py": "demos/python/test/fixtures/python-sockets.py",
};
await demoTest("python", { image: "python", timeout: packages ? 7_200_000 : 600_000, server: { fixtures, handle } }, async ({ server, open }) => {
  const { page, submit, run, start, waitText, input } = await open({ ...await installProbe("python"), policy: { maxRequests: 1024, rules: [
    { origin: server.origin, pathPrefix: "/fixture/", methods: ["GET", "POST"] },
    { origin: server.origin.replace("127.0.0.1", "localhost"), path: "/fixture/gzip" },
  ] } });
  const scratch = "/tmp/dolly-python-test";
  await run(`mkdir ${scratch} && cd ${scratch} && for name in ${Object.keys(fixtures).join(" ")}; do curl -fsS ${server.origin}/fixture/$name -o $name || exit 1; done`);
  await run(`python python-process.py ${scratch}`);
  await run(`python python-shutil.py ${scratch}`);

  const repl = start("python");
  await waitText(/>>>/);
  await input('print("PYTHON-REPL-" + "LIVE")\r');
  await waitText(/PYTHON-REPL-LIVE/);
  assert.equal(repl.status, null, "Python exited instead of prompting again");
  await input("\x04");
  assert.equal(await repl.done, 0);

  // Ctrl+C's SIGINT ends signal.pause() with KeyboardInterrupt.
  const paused = start("python -c 'import signal; print(\"PYTHON-\" + \"PAUSED\", flush=True); signal.pause()'");
  await waitText(/PYTHON-PAUSED/);
  await page.waitForFunction(() => __dolly.terminal.foregroundInterruptible());
  await page.locator("#keyboard").focus();
  await page.keyboard.press("Control+c");
  assert.equal(await paused.done, 130);
  await waitText(/KeyboardInterrupt/);

  const streaming = start("python -c 'import time; time.sleep(1); print(\"PYTHON-STREAM-\" + \"ONE\", flush=True); time.sleep(2); print(\"PYTHON-STREAM-\" + \"TWO\", flush=True)'");
  await waitText(/PYTHON-STREAM-ONE/);
  assert.equal(streaming.status, null, "Python output appeared only after exit");
  assert.equal(await streaming.done, 0);
  // A process-local DSO lookup, an FFI call and a closure.
  await run("python -c 'import ctypes; libc = ctypes.CDLL(None); libc.strlen.argtypes = [ctypes.c_char_p]; libc.strlen.restype = ctypes.c_size_t; assert libc.strlen(b\"dolly\") == 5; callback = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.c_int)(lambda value: value + 1); assert callback(41) == 42'");
  await run("python -c 'import socket; socket.socket()'", 1);
  await run("python python-sockets.py");

  // Stock pip resolves and installs a package with dependencies over the broker.
  const pip = `pip install --no-index --find-links ${server.origin}/fixture/wheels/`;
  await run(`${pip} requests`);
  await run(`python python-http.py ${server.origin}`);
  await run(`python -m venv venv && venv/bin/${pip} idna`);
  await run(`cd /workspace && rm -rf ${scratch}`);

  if (!packages) return;
  // NumPy comes as Pandas' dependency; naming it too would build it twice
  // (once more inside Pandas' isolated build environment).
  const install = start(`${pip} pandas`);
  let frame = 0, frames = 0;
  while (install.status === null) {
    const next = await page.evaluate(() => Number(document.documentElement.dataset.frameSequence));
    if (next !== frame) [frame, frames] = [next, frames + 1];
    await delay(1000);
  }
  assert.equal(install.status, 0, "pip could not source-build NumPy and Pandas");
  assert.ok(frames >= 3, "pip showed no progress while building");
  await run("python -c 'import numpy as np, pandas as pd; assert int((np.array([1,2,3])**2).sum()) == 14; assert pd.DataFrame({\"kind\":[\"a\",\"b\",\"a\"],\"value\":[2,3,5]}).groupby(\"kind\")[\"value\"].sum().to_dict() == {\"a\":7,\"b\":3}'");
});
