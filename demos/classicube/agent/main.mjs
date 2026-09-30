// SPDX-License-Identifier: GPL-2.0-or-later
try {
  if (process.argv.length !== 2) throw Error("usage: classicube-agent");
  const { runWorld } = await import("./world.mjs"); await runWorld();
} catch (error) { console.error(`ClassiCube: ${error.message}`); process.exitCode = 1; }
