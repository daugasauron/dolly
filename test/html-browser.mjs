// html@0: `html FILE` shows a document in a popup of the page and prints the
// fields of the form the user submits. A document that tries every way HTML
// has to load, navigate, run script or style itself reaches no server, runs
// nothing and is drawn in the page's style; closing it, Escape and Ctrl+C
// each end it, and the program learns which.
// Usage: node test/html-browser.mjs [chromium|firefox ...]
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { browserTest, composed } from "./browser.mjs";

// Every request and every connection reaching this server comes from the popup.
const requests = [], connections = [];
const recorder = createServer((request, response) => {
  requests.push(`${request.method} ${request.url}`);
  response.writeHead(200, { "content-type": "text/html", "access-control-allow-origin": "*",
    "cross-origin-resource-policy": "cross-origin" }).end("<p>reached</p>");
});
recorder.on("connection", () => connections.push(Date.now()));
await new Promise(resolve => recorder.listen(0, "127.0.0.1", resolve));
const R = `http://127.0.0.1:${recorder.address().port}`;

const hostile = `<!doctype html>
<html><head><base href="${R}/base/" target="_top"><meta http-equiv="refresh" content="0;url=${R}/refresh">
<link rel="preconnect" href="${R}"><link rel="dns-prefetch" href="${R}"><link rel="prefetch" href="${R}/prefetch">
<link rel="preload" as="image" href="${R}/preload"><link rel="modulepreload" href="${R}/modulepreload">
<link rel="stylesheet" href="${R}/stylesheet"><link rel="icon" href="${R}/icon"><link rel="manifest" href="${R}/manifest">
<style>@import url(${R}/import); @font-face { font-family: away; src: url(${R}/font); }
h1 { color: rgb(0, 255, 0) !important; font-family: away; } body { background: url(${R}/background); }</style>
<script src="${R}/script"></script></head>
<body background="${R}/body-background" onload="fetch('${R}/onload')">
<h1 style="color: rgb(255, 0, 0); background-image: url(${R}/inline-style)" class="title">Quarterly report</h1>
<p id="ran">No script ran.</p>
<script>document.querySelector("#ran").textContent = "A script ran."; fetch("${R}/inline-script");</script>
<img src="${R}/img" onerror="fetch('${R}/onerror')"><img srcset="${R}/srcset 1x" alt="srcset">
<picture><source srcset="${R}/picture"><img alt="picture"></picture>
<video src="${R}/video" poster="${R}/poster"><track src="${R}/track"></video><audio src="${R}/audio"></audio>
<object data="${R}/object"></object><embed src="${R}/embed"><iframe src="${R}/iframe"></iframe>
<iframe srcdoc="<img src=${R}/srcdoc>"></iframe>
<svg><image href="${R}/svg-image"></image><use href="${R}/svg-use#x"></use><a href="${R}/svg-link"><text>svg</text></a></svg>
<math href="${R}/math"><mi>x</mi></math>
<table background="${R}/table-background"><tr><th>Region</th><td>North</td></tr></table>
<p><a id="link" href="${R}/link" ping="${R}/ping">a link</a> <a id="top" href="${R}/top" target="_top">to the top</a>
<a id="blank" href="${R}/blank" target="_blank">a window</a> <a id="fragment" href="#here">a fragment</a>
<a id="javascript" href="javascript:fetch('${R}/javascript')">javascript</a></p>
<form action="${R}/form" method="post" target="_blank">
  <label for="name">Name</label> <input id="name" name="name" required>
  <input type="password" name="password"> <input type="file" name="file"> <input type="image" src="${R}/input-image" name="image">
  <select name="lang" multiple><option selected>c</option><option value="rust" selected>Rust</option><option>go</option></select>
  <textarea name="note">first &lt;line&gt; &amp; more</textarea>
  <input type="checkbox" name="agree" checked>
  <button id="yes" name="choice" value="yes" formaction="${R}/formaction" formtarget="_top">Yes</button>
  <button name="choice" value="no">No</button>
</form></body></html>`;
const question = "<h1>One question</h1><form><input name=answer required><button>Send</button></form>";

await browserTest("html", { image: "system", timeout: 300_000 }, async ({ name, open }) => {
  requests.length = 0;
  connections.length = 0;
  // boot()'s element is a part of the window, as an embedding's would be.
  const { page, submit, text } = await open(await composed(["html"], ["html"], { base: "system",
    files: { "/home/dolly/hostile.html": hostile, "/home/dolly/question.html": question },
    setup: page => page.addInitScript(() => document.addEventListener("DOMContentLoaded", () =>
      document.head.append(Object.assign(document.createElement("style"), {
        textContent: "#terminal { position: absolute; left: 40px; top: 60px; width: 800px; height: 520px; }" })))) }));
  const popup = page.locator("#html-popup");
  const frame = page.frameLocator("#html-popup iframe");
  const run = async command => assert.equal(await submit(command), 0, await text());
  // Resolves once the popup shows, to the command's pending status.
  const show = async command => {
    const status = submit(command);
    status.catch(() => {}); // A failing test closes the page under it.
    await frame.locator("body").waitFor();
    return [status];
  };
  const colour = selector => frame.locator(selector).evaluate(element => getComputedStyle(element).color);

  // The embedding's theme, set on boot()'s element, is the popup's.
  await page.evaluate(() => document.querySelector("#terminal").style.setProperty("--dolly-accent", "rgb(1, 2, 3)"));
  let [status] = await show("html /home/dolly/hostile.html > /tmp/fields");
  assert.ok(await popup.evaluate(element => {
    const box = document.querySelector("#terminal").getBoundingClientRect(), { left, top, right, bottom } = element.getBoundingClientRect();
    return left >= box.left && top >= box.top && right <= box.right && bottom <= box.bottom;
  }), "the popup lies inside boot()'s element");
  assert.equal(await frame.locator("body").evaluate(() => origin), "null", "the popup's origin is opaque");
  await frame.getByText("No script ran.").waitFor();
  assert.equal(await colour("h1"), "rgb(1, 2, 3)", "the page's style, not the program's");
  assert.equal(await frame.locator("body").evaluate(body => getComputedStyle(body.parentElement).backgroundColor),
    "rgb(38, 38, 38)");
  assert.ok(await frame.locator("body").evaluate(() => [...document.fonts].some(face =>
    face.family.replaceAll('"', "") === "Dolly IosevkaTerm SemiBold" && face.status === "loaded")), "the site's font, given by the page");
  // A link's text stays; clicking it goes nowhere.
  for (const words of ["a link", "to the top", "a window", "a fragment", "javascript"]) await frame.getByText(words).click();
  assert.equal(page.context().pages().length, 1, "no window opened");
  assert.match(page.url(), /\/custom\/rebuild\/$/, "the page was not navigated");
  await frame.locator("#name").fill("Ada <Lovelace> & co");
  await frame.getByRole("button", { name: "Yes" }).click();
  assert.equal(await status, 0);
  assert.equal(await popup.count(), 0);
  await run(`test "$(cat /tmp/fields)" = 'name=Ada+%3CLovelace%3E+%26+co&lang=c&lang=rust&note=first+%3Cline%3E+%26+more&agree=on&choice=yes'`);
  assert.equal(await page.evaluate(() => document.activeElement.id), "keyboard", "the terminal has the keyboard again");

  // Closing is the program's status 1; for two seconds after it no popup shows.
  [status] = await show("html /home/dolly/question.html");
  await popup.getByRole("button", { name: "Close" }).click();
  assert.equal(await status, 1);
  assert.equal(await submit("html /home/dolly/question.html"), 1);
  await page.waitForTimeout(2000);
  [status] = await show("html /home/dolly/question.html");
  // Its keydown removes the frame, so the keyup goes to the page: Chromium never
  // acknowledges a keyup sent to the removed frame, and a press would wait for it.
  await frame.locator("input").focus();
  await page.keyboard.down("Escape");
  await popup.waitFor({ state: "detached" });
  await page.keyboard.up("Escape");
  assert.equal(await status, 1);
  await page.waitForTimeout(2000);
  // A form's own constraints hold: an empty required field is not sent.
  [status] = await show("html < /home/dolly/question.html > /tmp/fields");
  await frame.getByRole("button", { name: "Send" }).click();
  await frame.locator("input").fill("forty two");
  await frame.getByRole("button", { name: "Send" }).click();
  assert.equal(await status, 0);
  await run(`test "$(cat /tmp/fields)" = 'answer=forty+two'`);
  // Ctrl+C on the popup's own button interrupts the program, and its popup goes with it.
  [status] = await show("html /home/dolly/question.html");
  await popup.getByRole("button", { name: "Close" }).focus();
  await page.keyboard.press("Control+C");
  assert.equal(await status, 130);
  assert.equal(await popup.count(), 0);

  // What is not a document of at most 1 MiB of UTF-8 is refused before it shows.
  assert.equal(await submit("printf '\\377' | html"), 2);
  assert.equal(await submit("awk 'BEGIN { s = \"x\"; while (length(s) <= 1048576) s = s s; printf \"%s\", s }' | html"), 2);
  assert.equal(await submit("html < /dev/null"), 2);
  assert.equal(await popup.count(), 0);

  assert.deepEqual(requests, [], `${name}: the popup reached the recorder`);
  assert.deepEqual(connections, [], `${name}: the popup connected to the recorder`);
});
recorder.close();
