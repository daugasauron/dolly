// CPython in the python image: its REPL, output streaming, children,
// cancellation, ctypes, termios and Bonnie's PEP 517 policy.
// Usage: node demos/python/test/python-browser.mjs
// DOLLY_PYTHON_PACKAGES=1 also source-builds Pandas from PyPI (network, long).
import assert from "node:assert/strict";
import { delay, demoTest } from "../../browser.mjs";

const packages = process.env.DOLLY_PYTHON_PACKAGES === "1";
const fixtures = {
  "python-process.py": "demos/python/test/fixtures/python-process.py",
  "bonnie-policy.py": "demos/python/test/fixtures/bonnie-policy.py",
  "python-termios.c": "demos/python/cpython-termios.c",
  "terminal-ui.c": "test/fixtures/terminal-ui.c",
};
await demoTest("python", { image: "python", timeout: packages ? 7_200_000 : 600_000, server: { fixtures } }, async ({ server, open }) => {
  const { page, submit, run, start, waitText, input } = await open({ policy: { maxRequests: 1024, rules: [
    { origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] },
    ...packages ? [
      { origin: "https://pypi.org", pathPrefix: "/pypi/", methods: ["GET"], maxResponseBytes: 32 * 1024 * 1024 },
      { origin: "https://files.pythonhosted.org", pathPrefix: "/packages/", methods: ["GET"], maxResponseBytes: 64 * 1024 * 1024 },
    ] : [],
  ] } });
  const scratch = "/tmp/dolly-python-test";
  await run(`mkdir ${scratch} && cd ${scratch} && for name in ${Object.keys(fixtures).join(" ")}; do curl -fsS ${server.origin}/fixture/$name -o $name || exit 1; done`);
  await run(`python python-process.py ${scratch}`);
  // Bonnie passes image-configured settings to a real PEP 517 backend and cleans up.
  await run(`python bonnie-policy.py /usr/lib/bonnie/bonnie.py ${scratch} --build`);
  await run("cc -Dtcgetattr=dolly_py_tcgetattr -Dtcsetattr=dolly_py_tcsetattr -Dioctl=dolly_py_ioctl terminal-ui.c python-termios.c -o termios-probe && ./termios-probe discipline");

  const repl = start("python");
  await waitText(/>>>/);
  await input('print("PYTHON-REPL-" + "LIVE")\r');
  await waitText(/PYTHON-REPL-LIVE/);
  assert.equal(repl.status, null, "Python exited instead of prompting again");
  await input("\x04");
  assert.equal(await repl.done, 0);

  const streaming = start("python -c 'import time; time.sleep(1); print(\"PYTHON-STREAM-\" + \"ONE\", flush=True); time.sleep(2); print(\"PYTHON-STREAM-\" + \"TWO\", flush=True)'");
  await waitText(/PYTHON-STREAM-ONE/);
  assert.equal(streaming.status, null, "Python output appeared only after exit");
  assert.equal(await streaming.done, 0);
  // A process-local DSO lookup, an FFI call and a closure.
  await run("python -c 'import ctypes; libc = ctypes.CDLL(None); libc.strlen.argtypes = [ctypes.c_char_p]; libc.strlen.restype = ctypes.c_size_t; assert libc.strlen(b\"dolly\") == 5; callback = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.c_int)(lambda value: value + 1); assert callback(41) == 42'");
  await run("python -c 'import socket; assert socket.socket'");
  await run("python -c 'import socket; socket.socket()'", 1);
  await run(`cd /workspace && rm -rf ${scratch}`);

  if (!packages) return;
  await run("python -c 'import importlib.util; assert all(importlib.util.find_spec(name) is None for name in (\"numpy\", \"pandas\", \"mesonbuild\"))'");
  const install = start("bonnie install pandas");
  let frame = 0, frames = 0;
  while (install.status === null) {
    const next = await page.evaluate(() => Number(document.documentElement.dataset.frameSequence));
    if (next !== frame) [frame, frames] = [next, frames + 1];
    await delay(1000);
  }
  assert.equal(install.status, 0, "Bonnie could not resolve and source-build Pandas");
  assert.ok(frames >= 3, "Bonnie showed no progress while building");
  for (const command of [
    "python -c 'import numpy as np, pandas as pd; assert int((np.array([1,2,3])**2).sum()) == 14; assert pd.DataFrame({\"kind\":[\"a\",\"b\",\"a\"],\"value\":[2,3,5]}).groupby(\"kind\")[\"value\"].sum().to_dict() == {\"a\":7,\"b\":3}'",
    "meson --version && python -c 'import mesonbuild.coredata as c; from importlib.metadata import version; assert c.version == version(\"meson\")'",
    "python -c 'import glob, os; assert not glob.glob(\"/tmp/bonnie-stage-*\") and not os.path.exists(\"/tmp/bonnie-last-build.log\")'",
  ]) assert.equal(await submit(command), 0, command);
});
