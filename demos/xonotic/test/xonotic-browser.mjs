// The dedicated server built in the xonotic-build image runs Xonotic's own
// server benchmark (serverbench.cfg: bots only, benchmark clock) to the end of
// the match, from the release's pk3 archives fetched into the shared
// filesystem; then the client draws its menu and a live match, which it records
// and replays as a timedemo, and a SIGKILL ends it with the shell intact.
// Usage: node demos/xonotic/test/xonotic-browser.mjs
// With DISPLAY, Chrome runs in a window with the GPU's adapter and the client
// draws on gpu@0; headless, or with DOLLY_BROWSER=firefox, gpu@0 has no adapter
// and the client falls back to the engine's software rasterizer.
import assert from "node:assert/strict";
import { delay, demoTest, heardAudio, meterAudio, snapshotDisplay } from "../../browser.mjs";

const archives = ["xonotic-20230620-data.pk3", "xonotic-20230620-maps.pk3"];
const fonts = ["font-xolonium-20230620.pk3", "font-unifont-20230620.pk3"];
const fixtures = Object.fromEntries([...archives, ...fonts].map(name => [name, `.cache/xonotic/release/Xonotic/data/${name}`]));
const basedir = "/home/dolly/xonotic";
const userdir = "/home/dolly/.xonotic/data";
const browser = process.env.DOLLY_BROWSER ?? "chromium";
const gpu = browser === "chromium" && Boolean(process.env.DISPLAY);
const client = `cd ${basedir} && xonotic-sdl -xonotic -basedir ${basedir} +vid_soft 1 +vid_soft_threads 1 +vid_fullscreen 0 ` +
  "+vid_width 1024 +vid_height 768";

// The lit fraction, a checksum and the mean colour of each of 8x6 blocks (rows
// from the top) of the 1024x768 frame a person sees: on gpu@0 the GPU canvas over
// #display (from a screenshot), else #display; null before a 1024x768 one.
async function frame(page) {
  await page.evaluate(() => {
    globalThis.measureFrame = pixels => {
      let lit = 0, sum = 0;
      const blocks = Array.from({ length: 48 }, () => [0, 0, 0]);
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 48) lit++;
        sum = (sum * 31 + pixels[i]) >>> 0;
        const block = blocks[Math.floor(i / 4 / 1024 / 128) * 8 + Math.floor(i / 4 % 1024 / 128)];
        for (let c = 0; c < 3; c++) block[c] += pixels[i + c] / (128 * 128);
      }
      return { lit: lit / (pixels.length / 4), sum, blocks };
    };
  });
  if (gpu) {
    const size = await page.evaluate(() => __dolly.gpu.active && `${__dolly.gpu.width}x${__dolly.gpu.height}`);
    if (size !== "1024x768") return null;
    const png = (await page.screenshot({ clip: await page.locator("#display").boundingBox() })).toString("base64");
    return page.evaluate(async png => {
      const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(png), c => c.charCodeAt(0))], { type: "image/png" }));
      const canvas = new OffscreenCanvas(1024, 768), context = canvas.getContext("2d");
      context.drawImage(bitmap, 0, 0, 1024, 768);
      return measureFrame(context.getImageData(0, 0, 1024, 768).data);
    }, png);
  }
  await snapshotDisplay(page);
  return page.evaluate(() => displaySnapshot.width === 1024 && displaySnapshot.height === 768 ?
    measureFrame(displaySnapshot.getContext("2d").getImageData(0, 0, 1024, 768).data) : null);
}

await demoTest("xonotic", { image: "xonotic-build", timeout: 1_800_000, browser, webgpu: gpu ? "window" : false,
  server: { fixtures } }, async ({ server, open }) => {
  const { page, run, start, text } = await open({ policy: { rules: [
    { origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"], maxResponseBytes: 1024 * 1024 * 1024 }] },
    setup: page => page.addInitScript(meterAudio) });
  // The client's sound plays through audio@0, which may wait for a user interaction.
  await page.mouse.click(10, 10);
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

  // The SDL client draws its menu through the engine's software render path,
  // on gpu@0 (dpgpurast.c) or in the engine's software rasterizer (Wasm SIMD)
  // into the sdl2 package's window surface: a frame that is neither blank nor
  // flat, then it quits back to the shell.
  await run(`cd ${basedir}/data && ` +
    fonts.map(name => `curl -fsS ${server.origin}/fixture/${name} -o ${name}`).join(" && "));
  // The menu plays an Ogg Vorbis sound: decoded by Vorbis, mixed by the engine and
  // played through SDL's audio on audio@0. snd_mutewhenidle 0: the engine mutes a
  // window without input focus, and nobody types here. The engine's screenshot
  // reads the frame back (on gpu@0, from the presented surface); then a map
  // loads, its loading screen drawn over a copy of the last frame (on gpu@0, a
  // draw into a texture), its picture small so that the copy shows around it.
  const menu = start(`${client} +log_file menu.log +snd_mutewhenidle 0 +defer 10 \"play sound/menu/winner.ogg\" ` +
    "+defer 30 \"screenshot menu.tga\" +defer 32 \"scr_loadingscreen_background 1; scr_loadingscreen_scale 0.25; " +
    "scr_loadingscreen_scale_limit 0; map stormkeep\" +defer 33 quit");
  await page.waitForFunction(() => __dolly.transport.graphicsActive(), null, { timeout: 120_000 });
  const menuFrames = [];
  for (; menu.status === null; await delay(500)) {
    const digest = await frame(page);
    if (digest) menuFrames.push(digest);
  }
  const painted = menuFrames.find(digest => digest.lit > 0.02 && digest.lit < 0.98);
  assert.ok(painted, "a menu frame that is neither blank nor flat");
  console.log(`xonotic: client frame at 1024x768, lit fraction ${painted.lit.toFixed(3)}`);
  assert.equal(menu.status, 0, "the client must quit back to the shell");
  // The render path says which rasterizer drew.
  await run(`grep -q '${gpu ? "dpgpurast: drawing on gpu@0" : "dpgpurast: gpu@0 has no device"}' ${userdir}/menu.log`);
  console.log(`xonotic: the client drew ${gpu ? "on gpu@0" : "in software, gpu@0 having no device"}`);
  const heard = await heardAudio(page);
  assert.ok(heard[0] > .05 && heard[1] > .05, `the menu's sound was not heard: ${heard}`);
  console.log(`xonotic: the menu's Ogg Vorbis sound reached the page, loudest RMS ${heard.map(x => x.toFixed(3)).join(" and ")}`);
  // The screenshot: an uncompressed 24-bit TGA of the whole 1024x768 frame, bottom
  // row first, neither blank nor flat; the mean colours of its top row of blocks
  // and of the four central ones. od prints its bytes as 4-byte words (sbase's od
  // takes no size after -t u).
  const top = [0, 1, 2, 3, 4, 5, 6, 7], centre = [19, 20, 27, 28];
  await run(`test "$(wc -c < ${userdir}/menu.tga)" -eq ${18 + 1024 * 768 * 3} && tail -c +19 ${userdir}/menu.tga | od -A n -v -t u | ` +
    "awk '{ for (i = 1; i <= NF; i++) { w = $i; for (j = 0; j < 4; j++) { v[k % 3] = w % 256; w = int(w / 256); if (++k % 3 == 0) { " +
    "n = k / 3 - 1; b = int((767 - int(n / 1024)) / 128) * 8 + int(n % 1024 / 128); " +
    "r[b] += v[2]; g[b] += v[1]; u[b] += v[0]; lit += (v[0] + v[1] + v[2] > 48) } } } } " +
    "END { printf \"screenshot lit %.3f\\n\", lit / (k / 3); " +
    "for (b = 0; b < 48; b++) if (b < 8 || b == 19 || b == 20 || b == 27 || b == 28) " +
    "printf \"block %d %.1f %.1f %.1f\\n\", b, r[b] / 16384, g[b] / 16384, u[b] / 16384 }'");
  const terminal = await text(), shot = Number(terminal.match(/screenshot lit ([\d.]+)/)[1]);
  assert.ok(shot > 0.02 && shot < 0.98, `the screenshot is blank or flat: lit ${shot}`);
  console.log(`xonotic: the engine's screenshot of the menu, 1024x768, lit fraction ${shot.toFixed(3)}`);
  const shotBlocks = Object.fromEntries([...terminal.matchAll(/^block (\d+) ([\d.]+) ([\d.]+) ([\d.]+)\s*$/gm)]
    .map(([, b, ...rgb]) => [b, rgb.map(Number)]));
  // How far each of a frame's blocks is from the screenshot's, in mean colour difference.
  const distances = (digest, blocks) => blocks.map(b =>
    digest.blocks[b].reduce((sum, value, c) => sum + Math.abs(value - shotBlocks[b][c]), 0) / 3);
  const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
  const summary = digest => `${mean(distances(digest, top)).toFixed(1)}/${Math.max(...distances(digest, centre)).toFixed(1)}`;
  // The screenshot is a frame the page showed; the last such frame comes just
  // before the map loads.
  const shown = menuFrames.findLastIndex(digest => Math.max(...distances(digest, [...top, ...centre])) < 3);
  assert.ok(shown >= 0, `the screenshot is a frame the page showed; top and centre distances: ${menuFrames.map(summary).join(" ")}`);
  // After it, the loading screen: the screenshot's frame along the top (the
  // software rasterizer draws it a little darker), its picture over the centre.
  const loading = menuFrames.slice(shown + 1).find(digest => mean(distances(digest, top)) < 5 && Math.max(...distances(digest, centre)) > 6);
  assert.ok(loading, `a loading screen over the last frame; top and centre distances: ${menuFrames.slice(shown + 1).map(summary).join(" ")}`);
  console.log("xonotic: the screenshot is the frame the page showed, and the loading screen drew over a copy of it " +
    `(mean distance along the top / largest in the centre: ${summary(loading)})`);
  await page.waitForFunction(() => !__dolly.transport.graphicsActive()); // the display is released
  await run("echo SHELL-BACK");
  console.log("xonotic: the client drew a frame and quit back to the shell");

  await page.evaluate(() => { audioMeters.length = 0; });

  // A live bot match in the client, recorded from its connection to a stop
  // (record writes ~/.xonotic/data/live.dem). maxplayers 8 makes it a server
  // for more than one, which the menus do not pause: a local game for one
  // stops while a menu is up, as a recording made that way showed, one frame
  // throughout. Escape closes the first-run dialog and the game menu as a
  // player would; the game draws frames that change, and the client quits
  // back to the shell. cl_allow_uid2name 0 answers the first-join statistics
  // dialog in advance.
  const live = start(`${client} +sv_public 0 +maxplayers 8 +bot_number 4 +minplayers 0 +g_warmup 0 +cl_allow_uid2name 0 ` +
    "+cl_allow_uidtracking 0 +log_file live.log +record live stormkeep +defer 60 stop +defer 200 quit");
  // The menu hides the page's cursor and draws its own once the map has loaded.
  await page.waitForFunction(() => __dolly.transport.cursorStyle() === 4, null, { timeout: 180_000 });
  const cursorStyle = () => page.evaluate(() => __dolly.transport.cursorStyle());
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
    const digest = await frame(page);
    if (digest && digest.lit > 0.02 && frames.every(seen => seen.sum !== digest.sum)) frames.push(digest);
  }
  assert.ok(frames.length >= 1, "a lit frame of the match");
  assert.equal(await live.done, 0, "the client must quit back to the shell after the match");
  const liveLog = `${userdir}/live.log`;
  await run(`grep -q 'SpawnServer: stormkeep' ${liveLog} && grep -q 'CL_SignonReply: 3' ${liveLog} && test "$(grep -c '\\[BOT\\].* connected' ${liveLog})" -ge 4`);
  console.log(`xonotic: the live match's sound, loudest RMS ${(await heardAudio(page)).map(x => x.toFixed(3)).join(" and ")}`);
  console.log(`xonotic: a bot match on stormkeep spawned 4 bots, the client entered the game and drew it (${frames.length} sampled frame${frames.length > 1 ? "s, different" : ""}, lit ${frames.map(frame => frame.lit.toFixed(2)).join(", ")})`);

  // Frame rate at the page's size: the match's recording replayed as fast as it draws.
  const timedemo = start(`${client} +log_file timedemo.log -benchmark live`);
  assert.equal(await timedemo.done, 0, "-benchmark quits when the demo ends");
  await run(`ls -l ${userdir}/live.dem && grep ' frames ' ${userdir}/timedemo.log`);
  const rate = (await text()).match(/(?:\^7)?(\d+) frames ([\d.]+) seconds ([\d.]+) fps.*/);
  assert.ok(rate && Number(rate[1]) >= 100, `the live match's recording replays: ${rate?.[0]}`);
  console.log(`xonotic: timedemo of the live match's recording: ${rate[1]} frames in ${rate[2]} s, ${rate[3]} fps`);

  // Forced termination: SIGKILL ends the client while its menu is up; the
  // display is released, the shell carries on, and the next client draws
  // again on the same rasterizer.
  const forced = start(`cd ${basedir}; xonotic-sdl -xonotic -basedir ${basedir} +vid_soft 1 +vid_soft_threads 1 +vid_fullscreen 0 ` +
    "+vid_width 1024 +vid_height 768 & pid=$!; sleep 40; kill -9 $pid; wait $pid; echo \"client status $?\"");
  await page.waitForFunction(() => __dolly.transport.graphicsActive(), null, { timeout: 40_000 });
  assert.equal(await forced.done, 0);
  assert.match(await text(), /client status 137/);
  await page.waitForFunction(() => !__dolly.transport.graphicsActive()); // the display is released
  await run(`${client} +log_file after.log +defer 10 quit`);
  await run(`grep -q '${gpu ? "dpgpurast: drawing on gpu@0" : "dpgpurast: gpu@0 has no device"}' ${userdir}/after.log`);
  console.log("xonotic: SIGKILL ended the client in its menu; the shell carried on and the next client drew again");
});
