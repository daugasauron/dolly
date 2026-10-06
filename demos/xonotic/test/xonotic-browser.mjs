// The dedicated server built in the xonotic-build image runs Xonotic's own
// server benchmark (serverbench.cfg: bots only, benchmark clock) to the end of
// the match, from the release's pk3 archives fetched into the shared
// filesystem. Usage: node demos/xonotic/test/xonotic-browser.mjs
// DOLLY_BROWSER=firefox runs it in Firefox.
import assert from "node:assert/strict";
import { delay, demoTest } from "../../browser.mjs";

const archives = ["xonotic-20230620-data.pk3", "xonotic-20230620-maps.pk3"];
const fixtures = Object.fromEntries(archives.map(name => [name, `.cache/xonotic/release/Xonotic/data/${name}`]));
const basedir = "/home/dolly/xonotic";

await demoTest("xonotic", { image: "xonotic-build", timeout: 1_800_000, browser: process.env.DOLLY_BROWSER ?? "chromium",
  server: { fixtures } }, async ({ server, open }) => {
  const { page, run, start } = await open({ policy: { rules: [
    { origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"], maxResponseBytes: 1024 * 1024 * 1024 }] } });
  await run(`mkdir -p ${basedir}/data && cd ${basedir}/data && ` +
    archives.map(name => `curl -fsS ${server.origin}/fixture/${name} -o ${name}`).join(" && "));
  await run(`ls -l ${basedir}/data`);

  // sv_eventlog in serverbench.cfg writes :gamestart and :end; quit_and_redirect ends the process.
  const started = performance.now();
  const match = start(`cd ${basedir} && xonotic-dedicated -xonotic -basedir ${basedir} +exec serverbench.cfg ` +
    "+bot_number 8 +maxplayers 16 +timelimit_override 1 +log_file match.log");
  let peakBytes = 0;
  while (match.status === null) {
    await delay(2000);
    // The page's memory, Workers included; Firefox has no such measurement.
    const bytes = await page.evaluate(() => performance.measureUserAgentSpecificMemory?.().then(result => result.bytes)).catch(() => 0);
    peakBytes = Math.max(peakBytes, bytes ?? 0);
  }
  const seconds = (performance.now() - started) / 1000;
  assert.equal(match.status, 0, "the server must quit after the match");
  await run(`grep -q '^:gamestart:' ${basedir}/data/match.log`);
  await run(`grep -q '^:end' ${basedir}/data/match.log`);
  await run(`grep '^:scores:' ${basedir}/data/match.log`);
  console.log(`xonotic: serverbench with 8 bots ran to its end in ${seconds.toFixed(1)}s; page memory peak ${(peakBytes / 1048576).toFixed(0)} MiB`);

  // QuakeC: gmqcc rebuilds the three programs byte-identical to the release's.
  const compiled = performance.now();
  await run("make -f /usr/src/dolly/xonotic/Makefile qc");
  for (const [name, hash] of Object.entries({
    "progs.dat": "e6f5c70b8e0e5f329531ce53ac982eb698a12660a1b45622a900a7bc3bb87a62",
    "csprogs.dat": "7d7807166d38521aadb8109830b69580596be4c05924d1b1fd8b71c31d4def13",
    "menu.dat": "dc75076060bac00aacdcd58d6a216cfb33f7a4665a18a622ff970bc73869bbb8",
  })) {
    await run(`printf '%s  %s\\n' ${hash} /tmp/xonotic/build/qc/${name} | sha256sum -c`);
  }
  console.log(`xonotic: gmqcc rebuilt progs.dat, csprogs.dat and menu.dat in ${((performance.now() - compiled) / 1000).toFixed(1)}s`);
});
