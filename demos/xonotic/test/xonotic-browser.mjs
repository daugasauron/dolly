// The dedicated server built in the xonotic-build image runs Xonotic's own
// server benchmark (serverbench.cfg: bots only, benchmark clock) to the end of
// the match, from the release's pk3 archives fetched into the shared
// filesystem. Usage: node demos/xonotic/test/xonotic-browser.mjs
// DOLLY_BROWSER=firefox runs it in Firefox.
import assert from "node:assert/strict";
import { delay, demoTest } from "../../browser.mjs";

const archives = ["xonotic-20230620-data.pk3", "xonotic-20230620-maps.pk3"];
const fonts = ["font-xolonium-20230620.pk3", "font-unifont-20230620.pk3"];
const fixtures = Object.fromEntries([...archives, ...fonts, "short.dem"].map(name => [name, `.cache/xonotic/release/Xonotic/data/${name}`]));
const basedir = "/home/dolly/xonotic";
const timedemoLog = "/home/dolly/.xonotic/data/timedemo.log";

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

  // The SDL client draws its menu through the engine's software rasterizer
  // (Wasm SIMD) into the sdl2 package's window surface: a frame that is
  // neither blank nor flat, then it quits back to the shell.
  await run(`cd ${basedir}/data && ` +
    fonts.map(name => `curl -fsS ${server.origin}/fixture/${name} -o ${name}`).join(" && "));
  const client = start(`cd ${basedir} && xonotic-sdl -xonotic -basedir ${basedir} ` +
    "+vid_soft 1 +vid_soft_threads 1 +vid_fullscreen 0 +vid_width 1024 +vid_height 768 +defer 40 quit");
  await page.waitForFunction(() => __dolly.transport.graphicsActive(), null, { timeout: 120_000 });
  const painted = await page.waitForFunction(() => {
    const canvas = document.querySelector("#display");
    if (canvas.width !== 1024 || canvas.height !== 768) return false;
    const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 48) lit++;
    const fraction = lit / (canvas.width * canvas.height);
    return fraction > 0.02 && fraction < 0.98 ? { fraction } : false;
  }, null, { timeout: 120_000, polling: 500 });
  console.log(`xonotic: client frame at 1024x768, lit fraction ${(await painted.jsonValue()).fraction.toFixed(3)}`);
  assert.equal(await client.done, 0, "the client must quit back to the shell");
  assert.equal(await page.evaluate(() => __dolly.transport.graphicsActive()), false, "the display is released");
  await run("echo SHELL-BACK");
  console.log("xonotic: the client drew a frame and quit back to the shell");

  // Frame rate of the software path at the page's size: timedemo of a 22 s
  // bot-match recording on stormkeep (short.dem, recorded natively).
  await run(`cd ${basedir}/data && curl -fsS ${server.origin}/fixture/short.dem -o short.dem && rm -f ${timedemoLog}`);
  const timedemo = start(`cd ${basedir} && xonotic-sdl -xonotic -basedir ${basedir} ` +
    "+vid_soft 1 +vid_soft_threads 1 +vid_fullscreen 0 +vid_width 1024 +vid_height 768 +log_file timedemo.log -benchmark short");
  assert.equal(await timedemo.done, 0, "-benchmark quits when the demo ends");
  await run(`grep ' frames ' ${timedemoLog}`);
  console.log((await text()).split("\n").filter(line => / frames .* fps/.test(line)).map(line => `xonotic: timedemo ${line.replace(/^\^7/, "")}`).join("\n"));

  // A live bot match in the client. A local game pauses while the menu is
  // up, so Escape closes the first-run dialog and the menu as a player would;
  // then the map loads, the game draws frames that change, and the client
  // quits back to the shell.
  // cl_allow_uid2name 0 answers the first-join statistics dialog in advance.
  const live = start(`cd ${basedir} && xonotic-sdl -xonotic -basedir ${basedir} ` +
    "+vid_soft 1 +vid_soft_threads 1 +vid_fullscreen 0 +vid_width 1024 +vid_height 768 " +
    "+sv_public 0 +bot_number 4 +minplayers 0 +g_warmup 0 +cl_allow_uid2name 0 +cl_allow_uidtracking 0 " +
    "+log_file live.log +map stormkeep +defer 200 quit");
  await page.waitForFunction(() => __dolly.transport.graphicsActive(), null, { timeout: 120_000 });
  await delay(20_000);
  const cursorStyle = () => page.evaluate(() => __dolly.transport.cursorStyle());
  assert.equal(await cursorStyle(), 4, "the menu hides the page's cursor and draws its own");
  // What a person sees before any click or key: the element under the mouse
  // across the game area, and its computed cursor, not the canvas's own style.
  const area = await page.locator("#display").boundingBox();
  for (const [fx, fy] of [[0.1, 0.1], [0.5, 0.1], [0.9, 0.1], [0.1, 0.5], [0.5, 0.5], [0.9, 0.5], [0.1, 0.9], [0.5, 0.9], [0.9, 0.9]]) {
    await page.mouse.move(area.x + area.width * fx, area.y + area.height * fy);
    const under = await page.evaluate(([x, y]) => {
      const element = document.elementFromPoint(x, y);
      return `${element?.id ?? element?.tagName} ${element ? getComputedStyle(element).cursor : ""}`;
    }, [area.x + area.width * fx, area.y + area.height * fy]);
    assert.equal(under, "display none", `the page's cursor over the menu at ${fx},${fy}`);
  }
  // Escape closes the first-run dialog, the main menu, and the game menu the
  // map opens into; once the game has the keys the engine asks for relative
  // motion, and the capture takes a click, as bhop's does.
  for (let attempt = 0; attempt < 70 && !await page.evaluate(() => __dolly.inputTransport.relativePointerRequested()); attempt++) {
    if (await cursorStyle() === 4) await page.keyboard.press("Escape");
    await delay(3000);
  }
  assert.ok(await page.evaluate(() => __dolly.inputTransport.relativePointerRequested()), "the match asks for relative motion");
  // Only a person's click (a trusted event) may capture; a page script's cannot.
  const box = await page.locator("#display").boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(() => document.pointerLockElement?.id === "display", null, { timeout: 10_000 });
  console.log("xonotic: the match captured the pointer on a click");
  // A lit frame after the capture (the world is often brighter than the
  // loading plaque's 87%, so no upper bound); a second, different one is
  // noted when it comes (the scripted observer's view can stay still).
  const frames = [];
  for (let attempt = 0; attempt < 20 && frames.length < 2; attempt++, await delay(2000)) {
    const digest = await page.evaluate(() => {
      const canvas = document.querySelector("#display");
      if (canvas.width !== 1024 || canvas.height !== 768) return null;
      const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
      let lit = 0, sum = 0;
      for (let i = 0; i < pixels.length; i += 4) { if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 48) lit++; sum = (sum * 31 + pixels[i]) >>> 0; }
      return { lit: lit / (canvas.width * canvas.height), sum };
    });
    if (digest && digest.lit > 0.02 && frames.every(frame => frame.sum !== digest.sum)) frames.push(digest);
  }
  assert.ok(frames.length >= 1, "a lit frame of the match");
  assert.equal(await live.done, 0, "the client must quit back to the shell after the match");
  const liveLog = "/home/dolly/.xonotic/data/live.log";
  await run(`grep -q 'SpawnServer: stormkeep' ${liveLog} && grep -q 'CL_SignonReply: 3' ${liveLog} && test "$(grep -c '\\[BOT\\].* connected' ${liveLog})" -ge 4`);
  console.log(`xonotic: a bot match on stormkeep spawned 4 bots, the client entered the game and drew it (${frames.length} sampled frame${frames.length > 1 ? "s, different" : ""}, lit ${frames.map(frame => frame.lit.toFixed(2)).join(", ")})`);
});
