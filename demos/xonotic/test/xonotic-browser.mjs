// The dedicated server built in the xonotic-build image runs Xonotic's own
// server benchmark (serverbench.cfg: bots only, benchmark clock) to the end of
// the match, from the release's pk3 archives fetched into the shared
// filesystem. Usage: node demos/xonotic/test/xonotic-browser.mjs
// DOLLY_BROWSER=firefox runs it in Firefox.
import assert from "node:assert/strict";
import { delay, demoTest } from "../../browser.mjs";

const archives = ["xonotic-20230620-data.pk3", "xonotic-20230620-maps.pk3"];
const fonts = ["font-xolonium-20230620.pk3", "font-unifont-20230620.pk3"];
const fixtures = Object.fromEntries([...archives, ...fonts].map(name => [name, `.cache/xonotic/release/Xonotic/data/${name}`]));
const basedir = "/home/dolly/xonotic";

await demoTest("xonotic", { image: "xonotic-build", timeout: 1_800_000, browser: process.env.DOLLY_BROWSER ?? "chromium",
  server: { fixtures } }, async ({ server, open }) => {
  const { page, run, start, text } = await open({ policy: { rules: [
    { origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"], maxResponseBytes: 1024 * 1024 * 1024 }] } });
  await run(`mkdir -p ${basedir}/data && cd ${basedir}/data && ` +
    archives.map(name => `curl -fsS ${server.origin}/fixture/${name} -o ${name}`).join(" && "));
  await run(`ls -l ${basedir}/data`);

  // sv_eventlog in serverbench.cfg writes :gamestart and :end; quit_and_redirect ends the process.
  // log_file is relative to the user directory, ~/.xonotic/data.
  const started = performance.now();
  const match = start(`cd ${basedir} && xonotic-dedicated -xonotic -basedir ${basedir} +exec serverbench.cfg ` +
    "+bot_number 8 +maxplayers 16 +timelimit_override 1 +log_file match.log");
  const log = "/home/dolly/.xonotic/data/match.log";
  let peakBytes = 0;
  while (match.status === null) {
    await delay(2000);
    // The page's memory, Workers included; Firefox has no such measurement.
    const bytes = await page.evaluate(() => performance.measureUserAgentSpecificMemory?.().then(result => result.bytes)).catch(() => 0);
    peakBytes = Math.max(peakBytes, bytes ?? 0);
  }
  const seconds = (performance.now() - started) / 1000;
  assert.equal(match.status, 0, "the server must quit after the match");
  // Lines keep their colour code prefix (^7) in the file.
  await run(`grep -q ':gamestart:' ${log}`);
  await run(`grep -q ':end$' ${log}`);
  await run(`grep ':scores:' ${log}`);
  await run("ls -l /usr/bin/xonotic-dedicated /usr/bin/gmqcc");
  console.log((await text()).split("\n").filter(line => /:scores:|xonotic-dedicated$|gmqcc$/.test(line)).join("\n"));
  console.log(`xonotic: serverbench with 8 bots ran to its end in ${seconds.toFixed(1)}s; page memory peak ${(peakBytes / 1048576).toFixed(0)} MiB`);

  // QuakeC: gmqcc rebuilds the three programs; the rebuilt server logic, placed
  // as a loose file above the pk3, then runs a second match to its end.
  const compiled = performance.now();
  await run("make -f /usr/src/dolly/xonotic/Makefile qc");
  const qc = "/tmp/xonotic/build/qc";
  await run(`ls -l ${qc}/progs.dat ${qc}/csprogs.dat ${qc}/menu.dat && sha256sum ${qc}/progs.dat ${qc}/csprogs.dat ${qc}/menu.dat`);
  console.log((await text()).split("\n").filter(line => /\.dat$/.test(line)).join("\n"));
  console.log(`xonotic: gmqcc rebuilt progs.dat, csprogs.dat and menu.dat in ${((performance.now() - compiled) / 1000).toFixed(1)}s`);
  await run(`cp ${qc}/progs.dat ${basedir}/data/progs.dat && rm ${log}`);
  const rematch = start(`cd ${basedir} && xonotic-dedicated -xonotic -basedir ${basedir} +exec serverbench.cfg ` +
    "+bot_number 8 +maxplayers 16 +timelimit_override 1 +log_file match.log +which progs.dat");
  assert.equal(await rematch.done, 0, "the server must quit after the match on the rebuilt progs.dat");
  await run(`grep -q 'progs.dat is file ${basedir}/data/progs.dat' ${log} && grep -q ':end$' ${log}`);
  console.log("xonotic: the match ran to its end on the progs.dat built in Dolly");

  // The SDL client has no render path in Dolly yet (no OpenGL; the software
  // rasterizer needs SSE2): it loads the data, opens the display through the
  // sdl2 package, reports the missing video mode and returns to the shell
  // with the display released. A frame assertion replaces this when one exists.
  await run(`cd ${basedir}/data && ` +
    fonts.map(name => `curl -fsS ${server.origin}/fixture/${name} -o ${name}`).join(" && "));
  const client = start(`cd ${basedir} && xonotic-sdl -xonotic -basedir ${basedir} +vid_fullscreen 0 +vid_width 1024 +vid_height 768`);
  await page.waitForFunction(() => __dolly.transport.graphicsActive(), null, { timeout: 120_000 });
  assert.equal(await client.done, 1, "the client exits with status 1 without a video mode");
  assert.equal(await page.evaluate(() => __dolly.transport.graphicsActive()), false, "the display is released");
  await run("echo SHELL-BACK");
  console.log("xonotic: the client opened the display, found no video mode and returned to the shell");
});
