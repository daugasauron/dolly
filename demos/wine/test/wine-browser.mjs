// Wine in the wine image. The image's ENTRY starts the desktop: a taskbar
// with a Start menu, from which Paint, an x86-64 program under x86emu, then
// Notepad and WineMine side by side, are started. The test reads the frame's
// pixels and, after Shut Down, the list of windows the desktop printed whenever
// it changed. Then, from the shell, a console program that uses files, a thread
// and an event through wineserver, and the x86-64 TinyCC compiling and running C.
// In a second session NetSurf, started from the Start menu, fetches pages of this
// test's server through libcurl and an HTTP policy of explicit rules; the test
// reads the colours it lays out and the server's log of its requests. In a third,
// under the page's default policy, its home page is the site's own landing page
// and a redirect is followed.
// Usage: node demos/wine/test/wine-browser.mjs
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

await demoTest("wine", { image: "wine", timeout: 600_000, server: { handle: serveNetsurfFixtures } }, async ({ server, open }) => {
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
  const unsafe = [...elsewhereHeaders].filter(header => !/^(accept|accept-encoding|accept-language|connection|host|origin|referer|user-agent|sec-.*)$/.test(header));
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

  await page.keyboard.press("Alt+F4");
  await delay(1000);
  await click(page, 30, height - 14);
  await delay(700);
  await page.keyboard.press("u");
  await prompt(shellPrompt);
  const log = await waitText(/the Wine desktop was shut down/);
  for (const title of ["Fixture one  -  NetSurf", "Fixture two  -  NetSurf"]) {
    assert.ok(log.includes(`"${title}"`), `the desktop listed a window titled ${title}`);
  }
  // The error page three times: the home page these rules do not admit, the redirect, the other origin.
  assert.equal(log.split('"Error occurred fetching page  -  NetSurf"').length - 1, 3);
  assert.equal(elsewhereAsked.filter(asked => asked === "GET /nocors.html").length, 1);
  // What that page says is libcurl's message for the address, which curl prints for the same address.
  const told = start(`curl ${elsewhereOrigin}/nocors.html`);
  await waitText(/Browser could not fetch the URL: blocked \(no CORS headers, or a redirect\)/);
  assert.notEqual(await told.done, 0);
  console.log("wine: NetSurf drew a page of another origin without a preflight; a redirect under an explicit rule and an address without CORS headers end in its error page");
}

// NetSurf under the page's default policy: its home page is the landing page of the site this
// release is served from (site:/), whose links load; a redirect is followed to its last address.
async function site(page, prompt, start, waitText, server) {
  const dark = [0x26, 0x26, 0x26], purple = [0x60, 0x20, 0x80];
  await page.waitForFunction(() => __dolly.transport.graphicsActive(), null, { timeout: 120_000 });
  const [, height] = await frameSize(page);
  await pixelIs(page, 640, height - 6, face);
  await click(page, 30, height - 14);
  await delay(700);
  await page.keyboard.press("s");
  await until(async () => (await coloured(page, dark)).count > 200_000, "the site's landing page");
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
  await click(page, 81, 58);                  // Home
  await until(async () => (await coloured(page, dark)).count > 200_000, "the landing page after Home");
  await delay(1000);

  await page.keyboard.press("Alt+F4");
  await delay(1000);
  await click(page, 30, height - 14);
  await delay(700);
  await page.keyboard.press("u");
  await prompt(shellPrompt);
  const log = await waitText(/the Wine desktop was shut down/);
  assert.match(log, /"Dolly  -  NetSurf"[\s\S]*"Licences and sources . Dolly  -  NetSurf"[\s\S]*"Dolly  -  NetSurf"[\s\S]*"Fixture two  -  NetSurf"[\s\S]*"Dolly  -  NetSurf"/);
  console.log("wine: NetSurf's home page is the site's own landing page; a link on it loads, a redirect is followed to its last address, Home returns");
}

async function run(page, prompt, start, waitText) {
  await page.waitForFunction(() => __dolly.transport.graphicsActive(), null, { timeout: 120_000 });
  const [width, height] = await frameSize(page);
  // Start menu: the key of a program's name starts it.
  const startMenu = async key => { await click(page, 30, height - 14); await delay(700); await page.keyboard.press(key); };

  // The desktop: its colour, and the taskbar along the bottom.
  await pixelIs(page, width >> 1, height >> 1, desktop);
  await pixelIs(page, width >> 1, height - 6, face);

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
  await page.screenshot({ path: `${evidence}paint.png` });
  console.log(`wine: Paint drew ${await dark(page, 170, 200, 390, 290)} dark pixels along a dragged pencil line`);
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

  // WineMine beside it: it opens over Notepad's corner and is dragged away by its caption.
  await startMenu("w");
  await pixelIs(page, 60, 50, black);
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
