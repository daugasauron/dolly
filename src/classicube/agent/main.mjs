// SPDX-License-Identifier: GPL-2.0-or-later
try {
  if (process.argv.length === 2) {
    const { launcher } = await import("./launcher.mjs"); await launcher();
  } else if (process.argv.length === 3) {
    const { runTask } = await import("./mission.mjs");
    await runTask(JSON.parse(globalThis.__janisBuiltin("fs").readFileSync(process.argv[2], "utf8")));
  } else throw Error("usage: classicube-agent [TASK.json]");
} catch (error) { console.error(`ClassiCube: ${error.message}`); process.exitCode = 1; }
