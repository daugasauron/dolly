// Wine in the wine image. The image's ENTRY starts the desktop: a taskbar
// with a Start menu, from which Paint, an x86-64 program under x86emu, then
// Notepad and WineMine side by side, are started. The test reads the frame's
// pixels and, after Shut Down, the list of windows the desktop printed whenever
// it changed. Then, from the shell, a console program that uses files, a thread
// and an event through wineserver, and the x86-64 TinyCC compiling and running C.
// In a second session NetSurf, started from the Start menu, fetches pages of this
// test's server through libcurl and an HTTP policy of explicit rules; the test
// reads the colours it lays out and the server's log of its requests. In a third,
// under the page's default policy, site:/ is the site's own landing page and a
// redirect is followed. (NetSurf's home page is an outside site, which the test
// does not wait for.)
// Usage: node demos/wine/test/wine-browser.mjs [firefox]
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { delay, demoTest, shellPrompt } from "../../browser.mjs";

const evidence = new URL("../../../build/wine-evidence/", import.meta.url).pathname;
const desktop = [58, 110, 165], face = [212, 208, 200], white = [255, 255, 255], black = [0, 0, 0];

const frameSize = page => page.evaluate(() => [document.querySelector("#display").width, document.querySelector("#display").height]);
// Waits until the frame pixel (x, y) has (or, with `not`, no longer has) a colour.
const pixelIs = (page, x, y, colour, not = false) => page.waitForFunction(([x, y, colour, not]) => {
  if (!__dolly.transport.graphicsActive()) return false;
  const data = document.querySelector("#display").getContext("2d").getImageData(x, y, 1, 1).data;
  return ([...data].slice(0, 3).join() === colour.join()) !== not;
}, [x, y, colour, not], { timeout: 60_000, polling: 200 });
const dark = (page, x, y, width, height) => page.evaluate(([x, y, width, height]) => {
  const data = document.querySelector("#display").getContext("2d").getImageData(x, y, width, height).data;
  let count = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] < 200) count++;
  return count;
}, [x, y, width, height]);
// Page coordinates of a frame pixel: the canvas may be shown at another size than the frame.
async function at(page, x, y) {
  const box = await page.locator("#display").boundingBox();
  const [width, height] = await frameSize(page);
  return [box.x + (x + 0.5) * box.width / width, box.y + (y + 0.5) * box.height / height];
}
const click = async (page, x, y) => page.mouse.click(...await at(page, x, y));

// NetSurf's pages: demos/wine/test/fixtures/netsurf, each request for them noted, and one address
// that redirects to the second page from a directory below.
const requests = [];
const fixture = name => readFile(new URL(`fixtures/netsurf/${name}`, import.meta.url));
const fixtureType = name => ({ html: "text/html", css: "text/css", png: "image/png", jpg: "image/jpeg" })[name.split(".").pop()];
async function serveNetsurfFixtures(request, response, path, headers) {
  if (!path.startsWith("/fixture/netsurf/")) return false;
  requests.push(`${request.method} ${path.slice("/fixture/netsurf/".length)}`);
  if (path === "/fixture/netsurf/moved/page.html") {
    response.writeHead(302, { ...headers, location: "../second.html" }).end();
    return true;
  }
  const [, name] = path.match(/^\/fixture\/netsurf\/([a-z]+\.(html|css|png|jpg))$/) ?? [];
  if (!name) return false;
  response.writeHead(200, { ...headers, "content-type": fixtureType(name) });
  response.end(await fixture(name));
  return true;
}
// The pixels of the frame near a colour: how many, and the box around them.
const coloured = (page, colour, tolerance = 0) => page.evaluate(([colour, tolerance]) => {
  const canvas = document.querySelector("#display"), { width, height } = canvas;
  const data = canvas.getContext("2d").getImageData(0, 0, width, height).data;
  const found = { count: 0, left: width, top: height, right: -1, bottom: -1 };
  for (let y = 0, i = 0; y < height; y++) for (let x = 0; x < width; x++, i += 4) {
    if (Math.abs(data[i] - colour[0]) > tolerance || Math.abs(data[i + 1] - colour[1]) > tolerance ||
        Math.abs(data[i + 2] - colour[2]) > tolerance) continue;
    found.count++;
    found.left = Math.min(found.left, x); found.right = Math.max(found.right, x);
    found.top = Math.min(found.top, y); found.bottom = Math.max(found.bottom, y);
  }
  return found;
}, [colour, tolerance]);
// The rows of text in a strip of the frame: runs of lines with dark pixels.
const textRows = (page, x, y, width, height) => page.evaluate(([x, y, width, height]) => {
  const data = document.querySelector("#display").getContext("2d").getImageData(x, y, width, height).data;
  let rows = 0, blank = 3;
  for (let line = 0; line < height; line++) {
    let ink = false;
    for (let i = line * width * 4; i < (line + 1) * width * 4 && !ink; i += 4) ink = data[i] + data[i + 1] + data[i + 2] < 200;
    if (ink && blank >= 3) rows++;
    blank = ink ? 0 : blank + 1;
  }
  return rows;
}, [x, y, width, height]);
async function until(check, what, timeout = 60_000) {
  for (const deadline = Date.now() + timeout; Date.now() < deadline; await delay(200)) {
    const result = await check();
    if (result) return result;
  }
  throw new Error(`timed out waiting for ${what}`);
}

// Another origin that behaves as a static host does: it answers GET with Access-Control-Allow-Origin
// and gives no leave to a preflight. One address there carries no CORS header at all. What it is
// asked, and with which headers, is noted.
const elsewhereAsked = [], elsewhereHeaders = new Set();
const elsewhere = createServer(async (request, response) => {
  elsewhereAsked.push(`${request.method} ${request.url}`);
  const name = request.url.slice(1);
  if (request.method !== "GET") response.writeHead(405).end();
  else if (name === "nocors.html") response.writeHead(200, { "content-type": "text/html" }).end("<title>never shown</title>");
  else if (/^[a-z]+\.(html|css|png|jpg)$/.test(name)) {
    for (const header of Object.keys(request.headers)) elsewhereHeaders.add(header);
    response.writeHead(200, { "content-type": fixtureType(name), "access-control-allow-origin": "*" }).end(await fixture(name));
  } else response.writeHead(404, { "access-control-allow-origin": "*" }).end();
});
await new Promise(listening => elsewhere.listen(0, "127.0.0.1", listening));
const elsewhereOrigin = `http://127.0.0.1:${elsewhere.address().port}`;

await demoTest("wine", { image: "wine", timeout: 600_000, server: { handle: serveNetsurfFixtures },
  browser: process.argv[2] }, async ({ server, open }) => {
  await mkdir(evidence, { recursive: true });
  for (const [name, session, options] of [["desktop", run, {}], ["netsurf", netsurf, { policy: { rules: [
    { origin: server.origin, pathPrefix: "/fixture/netsurf/", methods: ["GET"] },
    { origin: elsewhereOrigin, pathPrefix: "/", methods: ["GET"] }] } }], ["site", site, {}]]) {
    const { page, prompt, start, waitText } = await open({ prompt: null, ...options });
    try { await session(page, prompt, start, waitText, server); }
    catch (error) { await page.screenshot({ path: `${evidence}failure-${name}.png` }); throw error; }
    await page.close();
  }
}).finally(() => elsewhere.close());

// NetSurf: the address bar, a page with a style sheet, a PNG and a JPEG, a link, back and forward.
async function netsurf(page, prompt, start, waitText, server) {
  const blue = [0x20, 0x40, 0xc0], orange = [0xf0, 0x80, 0x20], green = [0x00, 0xa0, 0x40], red = [0xd0, 0x20, 0x20];
  const yellow = [0xff, 0xe0, 0x60], purple = [0x60, 0x20, 0x80];
  await page.waitForFunction(() => __dolly.transport.graphicsActive(), null, { timeout: 120_000 });
  const [, height] = await frameSize(page);
  await pixelIs(page, 640, height - 6, face);
  await click(page, 30, height - 14);
  await delay(700);
  await page.keyboard.press("s");
  await pixelIs(page, 600, 58, white);        // its address bar, in the toolbar of a window at 0,0
  await delay(1500);                          // (its home page is the site's, which these rules do not admit)

  await click(page, 600, 58);
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await page.keyboard.type(`${server.origin}/fixture/netsurf/page.html`, { delay: 10 });
  const entered = performance.now();
  await page.keyboard.press("Enter");
  // The style sheet's two floated boxes, side by side: 200 by 60 each.
  const box = await until(async () => { const found = await coloured(page, blue); return found.count === 12000 && found; }, "the page's blue box");
  const rendered = performance.now() - entered;
  assert.deepEqual([box.right - box.left + 1, box.bottom - box.top + 1], [200, 60]);
  const beside = await coloured(page, orange);
  assert.deepEqual([beside.count, beside.left, beside.top], [12000, box.right + 1, box.top]);
  // The images, 120 by 80 each: the PNG exactly its colour, the JPEG near its.
  await until(async () => (await coloured(page, green)).count === 9600, "the PNG");
  const jpeg = await until(async () => { const found = await coloured(page, red, 12); return found.count >= 9600 && found; }, "the JPEG");
  assert.ok(jpeg.count < 9700, `the JPEG covers ${jpeg.count} pixels`);
  await page.screenshot({ path: `${evidence}netsurf.png` });
  assert.deepEqual([...new Set(requests)].sort(), ["GET green.png", "GET page.html", "GET red.jpg", "GET style.css"]);
  // The address is written clear of the page info button at the left of its bar.
  assert.equal(await dark(page, 187, 50, 3, 16), 0, "no ink between the button and the address");
  assert.ok(await dark(page, 190, 50, 300, 16) > 100, "the address is drawn");

  // The link, then the toolbar's back and forward.
  const link = await coloured(page, yellow);
  await click(page, (link.left + link.right) >> 1, link.bottom - 5);
  await until(async () => (await coloured(page, purple)).count > 100_000, "the second page");
  assert.ok(requests.includes("GET second.html"));
  await click(page, 18, 58);
  await until(async () => (await coloured(page, blue)).count === 12000, "the first page after Back");
  await click(page, 49, 58);
  await until(async () => (await coloured(page, purple)).count > 100_000, "the second page after Forward");
  console.log(`wine: NetSurf fetched a page, its style sheet, a PNG and a JPEG through libcurl and drew them ${Math.round(rendered)} ms after Enter; link, Back and Forward work`);

  // An explicit rule follows no redirect: the address that redirects ends in NetSurf's error page.
  await click(page, 600, 58);
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await page.keyboard.type(`${server.origin}/fixture/netsurf/moved/page.html`, { delay: 10 });
  await page.keyboard.press("Enter");
  await until(async () => (await coloured(page, purple)).count === 0, "the second page to go");
  await until(() => requests.includes("GET moved/page.html"), "the request that is redirected");
  await delay(1000);
  await click(page, 18, 58);
  await until(async () => (await coloured(page, purple)).count > 100_000, "the second page after Back");

  // The other origin, a static host: NetSurf's requests carry only headers a browser sends without
  // asking that site's leave first, so the page, its style sheet and its images arrive and are drawn.
  await click(page, 600, 58);
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await page.keyboard.type(`${elsewhereOrigin}/page.html`, { delay: 10 });
  await page.keyboard.press("Enter");
  await until(async () => (await coloured(page, blue)).count === 12000, "the other origin's page");
  await until(async () => (await coloured(page, green)).count === 9600, "the other origin's PNG");
  assert.deepEqual(elsewhereAsked.filter(asked => !asked.startsWith("GET ")), [], "no preflight was sent");
  const unsafe = [...elsewhereHeaders].filter(header => !/^(accept|accept-encoding|accept-language|connection|host|origin|priority|referer|user-agent|sec-.*)$/.test(header));
  assert.deepEqual(unsafe, [], "only headers the browser sets itself, and safelisted ones");

  // An address there that the browser's CORS rules refuse: NetSurf's own error page, as its window title says.
  await click(page, 600, 58);
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await page.keyboard.type(`${elsewhereOrigin}/nocors.html`, { delay: 10 });
  await page.keyboard.press("Enter");
  await until(async () => (await coloured(page, blue)).count === 0, "the other origin's page to go");
  await until(() => elsewhereAsked.includes("GET /nocors.html"), "the request for the address without CORS headers");
  await delay(1500);
  await page.screenshot({ path: `${evidence}netsurf-refused.png` });
  // What the page says, read off it: Select All, Edit > Copy, then into Notepad by its Edit > Paste
  // and from there into a file.
  await click(page, 500, 450);
  await page.keyboard.press("Control+a");
  await delay(500);
  await click(page, 46, 34);
  await delay(700);
  await page.keyboard.press("c");
  await delay(700);
  await click(page, 30, height - 14);
  await delay(700);
  await page.keyboard.press("n");
  await pixelIs(page, 100, 300, white);
  await click(page, 100, 300);
  await click(page, 46, 34);
  await delay(700);
  await page.keyboard.press("p");
  await until(async () => await dark(page, 8, 46, 600, 120) > 300, "the copied text in Notepad");
  await page.keyboard.press("Control+s");
  await delay(1500);
  await page.keyboard.type("C:\\refused.txt", { delay: 20 });
  await page.keyboard.press("Enter");
  await delay(1500);
  await page.keyboard.press("Alt+F4");
  await delay(1000);
  await click(page, 500, 450);

  await page.keyboard.press("Alt+F4");
  await delay(1000);
  await click(page, 30, height - 14);
  await delay(700);
  await page.keyboard.press("u");
  await prompt(shellPrompt);
  const log = await waitText(/the Wine desktop was shut down/);
  // The error page for the home page these rules do not admit, for the redirect, and for the other origin.
  assert.match(log, /"Error occurred fetching page  -  NetSurf"[\s\S]*"Fixture one  -  NetSurf"[\s\S]*"Fixture two  -  NetSurf"[\s\S]*"Error occurred fetching page  -  NetSurf"[\s\S]*"Fixture two  -  NetSurf"[\s\S]*"Fixture one  -  NetSurf"[\s\S]*"Error occurred fetching page  -  NetSurf"/);
  assert.equal(elsewhereAsked.filter(asked => asked === "GET /nocors.html").length, 1);
  const read = start("cat /home/dolly/.wine/drive_c/refused.txt");
  await waitText(/Browser could not fetch the URL: blocked \(no CORS headers, or a redirect\)/);
  assert.equal(await read.done, 0);
  console.log("wine: NetSurf drew a page of another origin without a preflight; a redirect under an explicit rule and an address without CORS headers end in its error page");
}

// NetSurf under the page's default policy: site:/ is the landing page of the site this release is
// served from, whose links load; a redirect is followed to its last address.
async function site(page, prompt, start, waitText, server) {
  const dark = [0x26, 0x26, 0x26], purple = [0x60, 0x20, 0x80];
  await page.waitForFunction(() => __dolly.transport.graphicsActive(), null, { timeout: 120_000 });
  const [, height] = await frameSize(page);
  const startMenu = async key => { await click(page, 30, height - 14); await delay(700); await page.keyboard.press(key); };
  // No run of this test asks an outside site: NetSurf's home page, the owner's choice of one, is set to
  // site:/ in its Choices file before it starts, from the shell the desktop leaves.
  await pixelIs(page, 640, height - 6, face);
  await startMenu("u");
  await prompt(shellPrompt);
  assert.equal(await start("mkdir -p /home/dolly/.wine/drive_c/NetSurf").done, 0);
  assert.equal(await start("echo homepage_url:site:/ > /home/dolly/.wine/drive_c/NetSurf/Choices").done, 0);
  const session = start("wine desktop");
  await page.waitForFunction(() => __dolly.transport.graphicsActive(), null, { timeout: 60_000 });
  await pixelIs(page, 640, height - 6, face);
  await startMenu("s");
  await until(async () => (await coloured(page, dark)).count > 200_000, "the site's landing page as the home page");
  await page.screenshot({ path: `${evidence}netsurf-home.png` });
  await click(page, 495, 293);                // "Licences and sources", in the row of links under IMAGES
  await delay(2500);
  await click(page, 18, 58);                  // Back
  await delay(2000);

  await click(page, 600, 58);
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await page.keyboard.type(`${server.origin}/fixture/netsurf/moved/page.html`, { delay: 10 });
  await page.keyboard.press("Enter");
  // Its style sheet is asked for beside the page it was redirected to, not beside the address typed.
  await until(async () => (await coloured(page, purple)).count > 100_000, "the page the redirect leads to");
  assert.ok(!requests.includes("GET moved/style.css"));
  await delay(1000);
  await click(page, 81, 58);                  // Home, in the toolbar
  await until(async () => (await coloured(page, dark)).count > 200_000, "the home page after Home");
  await delay(1000);

  await page.keyboard.press("Alt+F4");
  await delay(1000);
  await startMenu("u");
  assert.equal(await session.done, 0);
  const log = await waitText(/"Fixture two  -  NetSurf"[\s\S]*"Dolly  -  NetSurf"/);
  assert.match(log, /"Dolly  -  NetSurf"[\s\S]*"Licences and sources . Dolly  -  NetSurf"[\s\S]*"Dolly  -  NetSurf"[\s\S]*"Fixture two  -  NetSurf"[\s\S]*"Dolly  -  NetSurf"/);
  console.log("wine: NetSurf's home page, set to site:/, is the site's own landing page; a link on it loads, a redirect is followed to its last address, Home returns");
  await fileManager(page, start, waitText);
}

// Wine's file manager, from the shell the desktop left: a directory made here, its subdirectory and
// back, a file deleted, a text file opened into Notepad.
async function fileManager(page, start, waitText) {
  for (const command of ["mkdir -p /0test/inner", "echo Opened from the file manager > /0test/notes.txt",
    "echo deep > /0test/inner/deep.txt", "echo 0123456789 > /0test/ten.dat"]) assert.equal(await start(command).done, 0);
  const session = start("wine desktop");
  await page.waitForFunction(() => __dolly.transport.graphicsActive(), null, { timeout: 60_000 });
  const [, height] = await frameSize(page);
  await pixelIs(page, 640, height - 6, face);
  await click(page, 30, height - 14);
  await delay(700);
  await page.keyboard.press("f");
  // Its window at 0,0 shows drive Z:, the Dolly filesystem: the tree on the left, the entries with their
  // sizes and dates from x 310. 0test sorts first. Inside a directory the first two entries are . and ..
  const names = () => textRows(page, 334, 112, 46, 440);
  const open = async row => page.mouse.dblclick(...await at(page, 342, 119 + 16 * row));
  await until(async () => await names() >= 6, "the entries of Z:\\");
  await open(0);
  await until(async () => await names() === 5, "the five entries of 0test");
  await page.screenshot({ path: `${evidence}winefile.png` });
  await open(2);
  await until(async () => await names() === 3, "the three entries of 0test\\inner");
  await delay(800);                           // long enough for the desktop to list the title
  await open(1);
  await until(async () => await names() === 5, "0test again");
  await click(page, 342, 119 + 16 * 4);       // ten.dat: Delete, and Yes in shell32's question
  await page.keyboard.press("Delete");
  await delay(1500);
  await page.keyboard.press("Enter");
  await until(async () => await names() === 4, "0test without ten.dat");
  await open(3);                              // notes.txt, into Notepad, which opens over it at 0,0
  await until(async () => await dark(page, 8, 46, 400, 20) > 150, "the text of notes.txt in Notepad");
  console.log(`wine: the file manager listed a directory, entered and left a subdirectory, deleted a file, and opened a text file into Notepad (${await dark(page, 8, 46, 400, 20)} dark pixels of its text)`);
  await page.keyboard.press("Alt+F4");
  await delay(1000);
  await click(page, 600, 300);
  await page.keyboard.press("Alt+F4");
  await delay(1000);
  await click(page, 30, height - 14);
  await delay(700);
  await page.keyboard.press("u");
  assert.equal(await session.done, 0);
  const log = await waitText(/"notes\.txt - Notepad"/);
  assert.match(log, /"Wine File Manager - \[Z:\\0test\]"[\s\S]*"Wine File Manager - \[Z:\\0test\\inner\]"[\s\S]*"Wine File Manager - \[Z:\\0test\]"/);
  assert.notEqual(await start("ls /0test/ten.dat").done, 0, "the deleted file is gone from the Dolly filesystem");
}

async function run(page, prompt, start, waitText) {
  await page.waitForFunction(() => __dolly.transport.graphicsActive(), null, { timeout: 120_000 });
  const [width, height] = await frameSize(page);
  // Start menu: the key of a program's name starts it.
  const startMenu = async key => { await click(page, 30, height - 14); await delay(700); await page.keyboard.press(key); };

  // The desktop: its colour, and the taskbar along the bottom.
  await pixelIs(page, width >> 1, height >> 1, desktop);
  await pixelIs(page, width >> 1, height - 6, face);

  // Its shortcuts: a column of icons with their names from the top left, 75 pixels apart, in the Start
  // menu's order (Notepad, File Manager, Winemine, Paint, NetSurf, the x86-64 sample).
  const highlight = [10, 36, 106];
  const inCell = (index, counted) => page.evaluate(([top, colour, same]) => {
    const data = document.querySelector("#display").getContext("2d").getImageData(0, top, 75, 75).data;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) if ((data[i] === colour[0] && data[i + 1] === colour[1] && data[i + 2] === colour[2]) === same) count++;
    return count;
  }, [75 * index, counted ?? desktop, counted !== undefined]);
  const selected = async () => { const cells = []; for (let index = 0; index < 6; index++) cells.push(await inCell(index, highlight) > 30); return cells.map(Number).join(""); };
  for (let index = 0; index < 6; index++) assert.ok(await inCell(index) > 300, `shortcut ${index} is drawn`);
  await page.screenshot({ path: `${evidence}shortcuts.png` });
  await click(page, 36, 20);                  // a click selects one
  await until(async () => await selected() === "100000", "the first shortcut selected");
  await click(page, 500, 400);                // a click on the empty desktop, none
  await until(async () => await selected() === "000000", "no shortcut selected");
  await page.mouse.move(...await at(page, 300, 200));   // a rubber band from the empty desktop over three
  await page.mouse.down();
  await page.mouse.move(...await at(page, 5, 5), { steps: 12 });
  await page.screenshot({ path: `${evidence}shortcuts-band.png` });
  await page.mouse.up();
  await until(async () => await selected() === "111000", "the three shortcuts the rubber band touched");
  await page.keyboard.down("Control");        // Ctrl and a click add a fourth
  await click(page, 36, 245);
  await page.keyboard.up("Control");
  await until(async () => await selected() === "111100", "a fourth shortcut selected with Ctrl");
  await click(page, 500, 400);
  await until(async () => await selected() === "000000", "no shortcut selected");
  await page.mouse.dblclick(...await at(page, 36, 20));   // a double click starts Notepad
  await pixelIs(page, 100, 100, white);
  await page.keyboard.press("Alt+F4");
  await pixelIs(page, 100, 100, desktop);
  await click(page, 36, 170);                 // Enter on the selected one starts WineMine
  await until(async () => await selected() === "001000", "WineMine's shortcut selected");
  await page.keyboard.press("Enter");
  await pixelIs(page, 60, 50, black);
  await page.keyboard.press("Alt+F4");
  await pixelIs(page, 60, 50, black, true);
  await click(page, 500, 400);
  console.log("wine: six shortcuts on the desktop; one selected by a click, three by a rubber band, a fourth with Ctrl; a double click and Enter each started a program");

  // Paint (ReactOS's): a pencil line dragged across its image, saved through the file dialog, closed.
  await startMenu("p");
  await pixelIs(page, 364, 350, white);       // the window opens at 100,100 with a white 400x300 image
  await page.mouse.move(...await at(page, 200, 230));
  await page.mouse.down();
  await page.mouse.move(...await at(page, 500, 450), { steps: 15 });
  await page.mouse.up();
  await page.waitForFunction(() => {
    const data = document.querySelector("#display").getContext("2d").getImageData(170, 200, 390, 290).data;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] < 200) count++;
    return count > 150;
  }, null, { timeout: 30_000, polling: 250 });
  console.log(`wine: Paint drew ${await dark(page, 170, 200, 390, 290)} dark pixels along a dragged pencil line`);
  await delay(1000);
  await page.keyboard.press("Control+s");
  await delay(1500);
  await page.keyboard.type("C:\\dolly.bmp", { delay: 20 });
  await page.keyboard.press("Enter");
  await delay(1500);
  await page.keyboard.press("Alt+F4");
  await pixelIs(page, 364, 350, desktop);

  // An x86-64 program under x86emu: TinyCC's hello_win.exe, which TinyCC's own x86-64 compiler built
  // under x86emu when the image was made. It centres its window, paints yellow text on black from its
  // window procedure, and destroys the window on Escape.
  const left = (width - 360) >> 1, top = (height - 240) >> 1;
  await startMenu("h");
  await pixelIs(page, left + 40, top + 60, black);
  await page.waitForFunction(([x, y]) => {
    const data = document.querySelector("#display").getContext("2d").getImageData(x, y, 360, 240).data;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] > 200 && data[i + 1] > 200 && data[i + 2] < 150) count++;
    return count > 40;
  }, [left, top], { timeout: 30_000, polling: 250 });
  await page.screenshot({ path: `${evidence}x86.png` });
  await page.keyboard.press("Escape");
  await pixelIs(page, left + 40, top + 60, desktop);
  console.log("wine: an x86-64 program opened a window from the Start menu, painted it and closed on Escape");

  // Notepad, typed into.
  await startMenu("n");
  await pixelIs(page, 100, 100, white);
  await click(page, 100, 100);
  await page.keyboard.type("Dolly runs Wine: (4.0.4) [wasm64]", { delay: 20 });
  await page.waitForFunction(() => {
    const data = document.querySelector("#display").getContext("2d").getImageData(12, 49, 400, 30).data;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] < 200) count++;
    return count > 300;
  }, null, { timeout: 30_000, polling: 250 });
  console.log(`wine: Notepad started from the Start menu and drew ${await dark(page, 12, 49, 400, 30)} dark pixels of typed text`);
  // What the user pastes with Ctrl+V is the page's clipboard, which the page hands on as text: a second line.
  const typed = await dark(page, 12, 49, 400, 60);
  await page.evaluate(() => __dolly.inputTransport.pushPaste("\npasted from the page's clipboard"));
  await until(async () => await dark(page, 12, 49, 400, 60) > typed + 200, "the pasted line in Notepad");

  // The page's cursor says what the pointer is over: Notepad's edges and corner, its text, the desktop.
  const cursorAt = async (x, y) => {
    await page.mouse.move(...await at(page, x, y));
    await delay(120);
    return page.evaluate(() => document.querySelector("#display").style.cursor);
  };
  const along = async points => { const seen = new Set(); for (const [x, y] of points) seen.add(await cursorAt(x, y)); return seen; };
  const steps = [...Array(24).keys()].map(step => step * 2);
  const [, , right, bottom] = await page.evaluate(() => {
    // Notepad's window is the face-coloured frame from the top left corner: down its left border, then along its bottom one.
    const canvas = document.querySelector("#display"), context = canvas.getContext("2d");
    const face = (x, y) => context.getImageData(x, y, 1, 1).data.slice(0, 3).join() === "212,208,200";
    let right = 2, bottom = 0;
    for (let y = 0; y < canvas.height - 40; y++) if (face(2, y)) bottom = y; else if (y > bottom + 40) break;
    while (right + 1 < canvas.width && face(right + 1, bottom)) right++;
    return [0, 0, right, bottom];
  });
  assert.ok((await along(steps.map(step => [right - 24 + step, 300]))).has("ew-resize"), "no resize arrow over Notepad's right edge");
  assert.ok((await along(steps.map(step => [300, bottom - 24 + step]))).has("ns-resize"), "no resize arrow over Notepad's bottom edge");
  const corner = await along(steps.map(step => [right - 24 + step, bottom - 24 + step]));
  assert.ok(corner.has("nwse-resize"), `no resize arrow over Notepad's corner at ${right},${bottom}: ${[...corner]}`);
  assert.equal(await cursorAt(100, 100), "text", "the pointer over Notepad's text");
  assert.equal(await cursorAt(right + 200, bottom + 100), "default", "the pointer over the desktop");
  console.log("wine: the page's cursor is a resize arrow over Notepad's right edge, bottom edge and corner, an I-beam over its text and an arrow over the desktop");

  // WineMine beside it: it opens over Notepad's corner and is dragged away by its caption.
  await startMenu("w");
  await pixelIs(page, 60, 50, black);
  await delay(800);                           // long enough for the desktop to list it where it opened
  await page.screenshot({ path: `${evidence}desktop.png` });
  await page.mouse.move(...await at(page, 60, 12));
  await page.mouse.down();
  await page.mouse.move(...await at(page, 860, 312), { steps: 12 });
  await page.mouse.up();
  await pixelIs(page, 860, 350, black);       // its counters, 800 to the right and 300 down, clear of Notepad
  await pixelIs(page, 60, 50, black, true);   // and Notepad's text area is back at the corner

  // Notepad's taskbar button: brings it to the front, minimizes it, restores it.
  await click(page, 140, height - 14);
  await delay(800);
  await click(page, 140, height - 14);
  await pixelIs(page, 100, 100, desktop);
  await delay(800);  // long enough for the desktop to list it as minimized
  await click(page, 140, height - 14);
  await pixelIs(page, 100, 100, white);

  // WineMine: a click on its field, closed with Alt+F4, started again.
  await click(page, 880, 430);
  await delay(500);
  await page.keyboard.press("Alt+F4");
  await pixelIs(page, 660, 350, black, true);
  await startMenu("w");
  await pixelIs(page, 860, 350, black);       // it comes back where it was closed
  await page.screenshot({ path: `${evidence}desktop-2.png` });

  await startMenu("u");
  await prompt(shellPrompt);
  assert.equal(await page.evaluate(() => __dolly.transport.graphicsActive()), false, "the display is released");
  const log = await waitText(/the Wine desktop was shut down/);
  for (const pattern of [
    /desktop: started mspaint\.exe/,
    /"Unnamed\.bmp - Paint" at 100,100 foreground/,
    /"dolly\.bmp - Paint"/,
    /desktop: started x86emu\.exe/,
    new RegExp(`"HELLO_WIN" at ${left},${top} foreground`),
    /desktop: started notepad\.exe/,
    /2 windows; "Untitled - Notepad" at 0,0; "WineMine" at 0,0 foreground/,
    /"WineMine" at 800,300/,
    /"Untitled - Notepad" at -32000,-32000 minimized/,
    /1 windows; "Untitled - Notepad" at 0,0/,
    /started winemine\.exe[\s\S]*started winemine\.exe/,
  ]) assert.match(log, pattern);
  console.log("wine: two programs at once; a window dragged, minimized, restored, closed and started again; shut down");

  // What Paint saved: a 400x300 bitmap of 32 bits a pixel is 480,054 bytes.
  const size = start("wc -c /home/dolly/.wine/drive_c/dolly.bmp");
  await waitText(/480054 \/home\/dolly\/\.wine\/drive_c\/dolly\.bmp/);
  assert.equal(await size.done, 0);
  console.log("wine: Paint saved its image through the file dialog as a 480,054-byte bitmap");

  const hello = start("wine hello");
  await waitText(/Hello from C:\\windows\\system32\\hello\.exe, Windows \d+\.\d+, page size 65536, \d+ processors\s+file: written through wineserver \(26 bytes\)\s+thread: wait 0, exit code 7\s+VirtualAlloc: ok, CreateProcess: refused/);
  assert.equal(await hello.done, 0);
  console.log("wine: a console program used a file, a thread and an event through wineserver; CreateProcess is refused");

  // The x86-64 emulator in the terminal: TinyCC's compiler, x86-64 code built by its maintainers, compiles
  // its own example into an x86-64 program, which then runs.
  const tcc = "Z:\\usr\\share\\wine\\x86\\tcc";
  const compiled = start(`wine x86emu '${tcc}\\tcc.exe' -o 'C:\\fib.exe' '${tcc}\\examples\\fib.c'`);
  assert.equal(await compiled.done, 0);
  const fib = start("wine x86emu 'C:\\fib.exe' 24");
  await waitText(/fib\(24\) = 46368/);
  assert.equal(await fib.done, 0);
  const bench = start("wine x86emu --bench");
  const speed = (await waitText(/x86emu: 200000003 instructions in \d+ ms: [\d.]+ million a second/, 120_000))
    .match(/200000003 instructions in (\d+) ms: ([\d.]+) million a second/);
  assert.equal(await bench.done, 0);
  console.log(`wine: x86emu ran the x86-64 TinyCC and the program it compiled; its interpreter does ${speed[2]} million instructions a second`);
}
