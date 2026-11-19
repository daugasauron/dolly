import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

// The browser APIs the trusted JavaScript calls, by where it lives: each host
// module's directory, the page's code and the site's. The review map
// (docs/browser-boundary.md, Authority) says what each grants; a call that is
// not in its row here fails, and so does a row nothing calls any more, so a
// change to either is a change to both.
const allowed = {
  audio: ["AudioContext", "navigator.userActivation"],
  build: ["fetch"],
  clipboard: ["navigator.clipboard", "navigator.userActivation"],
  display: ["navigator.clipboard", "OffscreenCanvas", "transferControlToOffscreen", "URL.createObjectURL"],
  download: ["URL.createObjectURL", "click()"],
  dso: ["fetch"],
  gpu: ["navigator.gpu", "Worker", "transferControlToOffscreen"],
  html: ["fetch"],
  http: ["fetch"],
  input: ["navigator.clipboard", "requestPointerLock"],
  microphone: ["navigator.mediaDevices", "AudioContext", "audioWorklet", "AudioWorkletNode"],
  packages: ["fetch", "URL.createObjectURL"],
  runtime: ["Worker"],
  snapshot: ["navigator.storage", "navigator.serviceWorker", "indexedDB", "caches", "fetch"],
  stack: ["fetch"],
  threads: ["fetch"],
  upload: ["file picker"],
  page: ["fetch", "Worker", "navigator.storage", "navigator.locks", "requestFullscreen", "URL.createObjectURL"],
  site: ["fetch", "Worker", "sessionStorage", "window.open", "URL.createObjectURL", "indexedDB", "click()",
    "navigator.serviceWorker", "navigator.storage"],
};

// What a browser global grants, as the code names it: a call or a constructor.
const capabilities = {
  "fetch": /(?<![\w.])fetch\s*\(|globalThis\.fetch\b/,
  "Worker": /\bnew\s+(?:Shared)?Worker\s*\(/,
  "XMLHttpRequest": /\bXMLHttpRequest\b/,
  "WebSocket": /\bWebSocket\b/,
  "RTCPeerConnection": /\bRTC\w+\b/,
  "EventSource": /\bEventSource\b/,
  "BroadcastChannel": /\bBroadcastChannel\b/,
  "indexedDB": /\bindexedDB\b/,
  "caches": /(?<![\w.])caches\./,
  "localStorage": /\blocalStorage\b/,
  "sessionStorage": /\bsessionStorage\b/,
  "AudioContext": /\bnew\s+(?:Offline)?AudioContext\b/,
  "audioWorklet": /\.audioWorklet\b/,
  "AudioWorkletNode": /\bnew\s+AudioWorkletNode\b/,
  "OffscreenCanvas": /\bnew\s+OffscreenCanvas\b/,
  "transferControlToOffscreen": /\.transferControlToOffscreen\s*\(/,
  "requestPointerLock": /\.requestPointerLock\s*\(/,
  "requestFullscreen": /\.requestFullscreen\s*\(/,
  "URL.createObjectURL": /\bURL\.createObjectURL\s*\(/,
  "window.open": /\bwindow\.open\s*\(|(?<![\w.])open\s*\(\s*["'`]/,
  "click()": /\.click\s*\(\s*\)/,
  "file picker": /type=["']?file\b|\bshow(?:Open|Save)FilePicker\b|\bshowDirectoryPicker\b/,
  "Notification": /\bNotification\b/,
  "navigator.sendBeacon": /\bnavigator\.sendBeacon\b/,
};
// Every member of navigator is one row of its own: navigator.gpu, navigator.clipboard, ...
const navigatorMember = /\bnavigator\.(\w+)/g;

const project = resolve(import.meta.dirname, "..");

// The file's code without its comments, which name APIs they do not call.
const code = text => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");

async function scripts(directory) {
  const entries = await readdir(resolve(project, directory), { withFileTypes: true });
  return entries.filter(entry => entry.isFile() && entry.name.endsWith(".mjs")).map(entry => `${directory}/${entry.name}`);
}

async function calls() {
  const places = new Map();
  const add = (place, file) => places.set(place, [...places.get(place) ?? [], file]);
  for (const entry of await readdir(resolve(project, "host"), { withFileTypes: true })) {
    if (entry.isDirectory()) for (const file of await scripts(`host/${entry.name}`)) add(entry.name, file);
    else if (entry.name.endsWith(".mjs")) add("host", `host/${entry.name}`);
  }
  for (const directory of ["page", "site"]) for (const file of await scripts(directory)) add(directory, file);
  const found = new Map();
  for (const [place, files] of places) {
    const used = new Map();
    for (const file of files) {
      const text = code(await readFile(resolve(project, file), "utf8"));
      for (const [capability, pattern] of Object.entries(capabilities)) if (pattern.test(text)) used.set(capability, file);
      for (const [, member] of text.matchAll(navigatorMember)) used.set(`navigator.${member}`, file);
    }
    found.set(place, used);
  }
  return found;
}

test("each module, the page and the site call only the browser APIs of their row", async () => {
  const found = await calls(), outside = [], unused = [];
  for (const [place, used] of found) {
    for (const [capability, file] of used) if (!(allowed[place] ?? []).includes(capability)) outside.push(`${file}: ${capability}`);
  }
  for (const [place, capabilities] of Object.entries(allowed)) {
    for (const capability of capabilities) if (!found.get(place)?.has(capability)) unused.push(`${place}: ${capability}`);
  }
  assert.deepEqual({ outside, unused }, { outside: [], unused: [] },
    "calls outside their row of the table (docs/browser-boundary.md says what each grants), and rows nothing calls");
});
