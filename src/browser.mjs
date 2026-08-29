const mount = document.querySelector("#terminal");
const canvas = document.querySelector("#display");
const keyboard = document.querySelector("#keyboard");
const bootstrapLog = document.querySelector("#bootstrap-log");

const defaultFontSizeMilli = 15000;

const encoder = new TextEncoder();
const textDecoder = new TextDecoder();
const bootstrapDecoder = new TextDecoder();
const commandResults = [];

let runtimeWorker;
let transport;
let networkTransport;
let presenter;
let resizeObserver;

class DisplayTransport {
  static headerSize = 128;
  static eventRead = 0;
  static eventWrite = 1;
  static eventWake = 2;
  static eventDropped = 3;
  static resultSequence = 4;
  static resultStatus = 5;
  static foregroundPid = 6;
  static frameSequence = 8;
  static frameIndex = 9;
  static frameWidth = 10;
  static frameHeight = 11;
  static frameStride = 12;
  static terminalCols = 13;
  static terminalRows = 14;
  static fontSizeMilli = 15;

  static keyEvent = 1;
  static textEvent = 2;
  static resizeEvent = 3;
  static focusEvent = 4;

  constructor(buffer, address, eventSize, eventCapacity) {
    if (!(buffer instanceof SharedArrayBuffer)) {
      throw new Error("Dolly display transport requires shared Wasm memory");
    }
    if (address % 4 !== 0 || eventSize !== 128 ||
        (eventCapacity & (eventCapacity - 1)) !== 0) {
      throw new Error("Dolly supplied an invalid display mailbox");
    }
    this.bytes = new Uint8Array(buffer);
    this.words = new Int32Array(buffer);
    this.address = address;
    this.word = address / 4;
    this.eventSize = eventSize;
    this.eventCapacity = eventCapacity;
  }

  pushRecord({
    type,
    action = 0,
    modifiers = 0,
    flags = 0,
    width = 0,
    height = 0,
    scaleMilli = 0,
    fontSizeMilli = 0,
    key = "",
    code = "",
    text = "",
  }) {
    const keyBytes = encoder.encode(key);
    const codeBytes = encoder.encode(code);
    const textBytes = encoder.encode(text);
    if (keyBytes.length + codeBytes.length + textBytes.length > 88) return false;
    const read = Atomics.load(this.words, this.word + DisplayTransport.eventRead) >>> 0;
    const write = Atomics.load(this.words, this.word + DisplayTransport.eventWrite) >>> 0;
    if (((write - read) >>> 0) >= this.eventCapacity) {
      Atomics.add(this.words, this.word + DisplayTransport.eventDropped, 1);
      return false;
    }

    const offset = this.address + DisplayTransport.headerSize +
      (write & (this.eventCapacity - 1)) * this.eventSize;
    const view = new DataView(this.bytes.buffer, offset, this.eventSize);
    view.setUint32(0, type, true);
    view.setUint32(4, action, true);
    view.setUint32(8, modifiers, true);
    view.setUint32(12, flags, true);
    view.setUint32(16, width, true);
    view.setUint32(20, height, true);
    view.setUint32(24, scaleMilli, true);
    view.setUint32(28, fontSizeMilli, true);
    view.setUint16(32, keyBytes.length, true);
    view.setUint16(34, codeBytes.length, true);
    view.setUint16(36, textBytes.length, true);
    view.setUint16(38, 0, true);
    this.bytes.fill(0, offset + 40, offset + this.eventSize);
    this.bytes.set(keyBytes, offset + 40);
    this.bytes.set(codeBytes, offset + 40 + keyBytes.length);
    this.bytes.set(textBytes, offset + 40 + keyBytes.length + codeBytes.length);

    Atomics.store(this.words, this.word + DisplayTransport.eventWrite, (write + 1) | 0);
    Atomics.add(this.words, this.word + DisplayTransport.eventWake, 1);
    Atomics.notify(this.words, this.word + DisplayTransport.eventWake);
    return true;
  }

  pushKey(event) {
    let modifiers = 0;
    if (event.shiftKey) modifiers |= 1;
    if (event.ctrlKey) modifiers |= 2;
    if (event.altKey) modifiers |= 4;
    if (event.metaKey) modifiers |= 8;
    if (event.getModifierState?.("CapsLock")) modifiers |= 16;
    if (event.getModifierState?.("NumLock")) modifiers |= 32;
    return this.pushRecord({
      type: DisplayTransport.keyEvent,
      action: event.type === "keyup" ? 0 : event.repeat ? 2 : 1,
      modifiers,
      flags: event.isComposing ? 1 : 0,
      key: event.key,
      code: event.code,
    });
  }

  pushSyntheticKey(key, code, modifiers = 0, action = 1) {
    return this.pushRecord({
      type: DisplayTransport.keyEvent,
      action,
      modifiers,
      key,
      code,
    });
  }

  pushText(text) {
    const bytes = encoder.encode(text);
    let offset = 0;
    while (offset < bytes.length) {
      let end = Math.min(offset + 88, bytes.length);
      while (end > offset && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
      if (end === offset) return false;
      const chunk = textDecoder.decode(bytes.subarray(offset, end));
      if (!this.pushRecord({ type: DisplayTransport.textEvent, text: chunk })) return false;
      offset = end;
    }
    return true;
  }

  pushResize(width, height, devicePixelRatio) {
    const currentFont = Atomics.load(
      this.words,
      this.word + DisplayTransport.fontSizeMilli,
    ) >>> 0;
    return this.pushRecord({
      type: DisplayTransport.resizeEvent,
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
      scaleMilli: Math.max(500, Math.min(4000, Math.round(devicePixelRatio * 1000))),
      fontSizeMilli: currentFont || defaultFontSizeMilli,
    });
  }

  currentResultSequence() {
    return Atomics.load(this.words, this.word + DisplayTransport.resultSequence);
  }

  async waitForResult(sequence) {
    const index = this.word + DisplayTransport.resultSequence;
    while (Atomics.load(this.words, index) === sequence) {
      const waiting = Atomics.waitAsync(this.words, index, sequence);
      if (waiting.async) await waiting.value;
    }
    return Atomics.load(this.words, this.word + DisplayTransport.resultStatus);
  }

  foregroundPid() {
    return Atomics.load(this.words, this.word + DisplayTransport.foregroundPid);
  }

  fontSize() {
    return Atomics.load(this.words, this.word + DisplayTransport.fontSizeMilli) / 1000;
  }

  dimensions() {
    return {
      cols: Atomics.load(this.words, this.word + DisplayTransport.terminalCols),
      rows: Atomics.load(this.words, this.word + DisplayTransport.terminalRows),
    };
  }
}

class FramebufferPresenter {
  constructor(canvasElement, buffer, frameAddresses, capacity, displayTransport) {
    this.canvas = canvasElement;
    this.context = canvasElement.getContext("2d", { alpha: false });
    if (!this.context) throw new Error("Dolly requires a 2D canvas context");
    this.buffer = buffer;
    this.frameAddresses = frameAddresses;
    this.capacity = capacity;
    this.transport = displayTransport;
    this.sequence = -1;
    this.running = true;
  }

  start() {
    const paint = () => {
      if (!this.running) return;
      this.paint();
      requestAnimationFrame(paint);
    };
    requestAnimationFrame(paint);
  }

  paint() {
    const { words, word } = this.transport;
    const sequence = Atomics.load(words, word + DisplayTransport.frameSequence) >>> 0;
    if (sequence === this.sequence) return;
    for (let attempt = 0; attempt < 3; attempt++) {
      const before = Atomics.load(words, word + DisplayTransport.frameSequence) >>> 0;
      const index = Atomics.load(words, word + DisplayTransport.frameIndex) >>> 0;
      const width = Atomics.load(words, word + DisplayTransport.frameWidth) >>> 0;
      const height = Atomics.load(words, word + DisplayTransport.frameHeight) >>> 0;
      const stride = Atomics.load(words, word + DisplayTransport.frameStride) >>> 0;
      const length = stride * height;
      const address = this.frameAddresses[index];
      if (index > 1 || width === 0 || height === 0 || stride !== width * 4 ||
          length > this.capacity || address + length > this.buffer.byteLength) {
        throw new Error("Dolly published an invalid framebuffer");
      }
      const pixels = new Uint8ClampedArray(
        new Uint8ClampedArray(this.buffer, address, length),
      );
      const after = Atomics.load(words, word + DisplayTransport.frameSequence) >>> 0;
      if (before !== after) continue;
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width;
        this.canvas.height = height;
      }
      this.context.putImageData(new ImageData(pixels, width, height), 0, 0);
      this.sequence = after;
      document.documentElement.dataset.frameSequence = String(after);
      const dimensions = this.transport.dimensions();
      document.documentElement.dataset.terminalCols = String(dimensions.cols);
      document.documentElement.dataset.terminalRows = String(dimensions.rows);
      return;
    }
  }
}

class NetworkTransport {
  static headerSize = 64;
  static state = 0;
  static sequence = 1;
  static status = 2;
  static length = 3;
  static eof = 4;
  static error = 5;
  static kind = 6;

  constructor(buffer, address, capacity) {
    this.bytes = new Uint8Array(buffer);
    this.words = new Int32Array(buffer);
    this.address = address;
    this.word = address / 4;
    this.capacity = capacity;
    this.active = false;
  }

  async waitForWritable() {
    const index = this.word + NetworkTransport.state;
    for (;;) {
      const current = Atomics.load(this.words, index);
      if (current === 1) return;
      const waiting = Atomics.waitAsync(this.words, index, current);
      if (waiting.async) await waiting.value;
    }
  }

  async publish(bytes, status, eof, error, kind) {
    await this.waitForWritable();
    if (bytes.length > this.capacity) throw new Error("HTTP chunk exceeds mailbox capacity");
    this.bytes.set(bytes, this.address + NetworkTransport.headerSize);
    Atomics.store(this.words, this.word + NetworkTransport.status, status);
    Atomics.store(this.words, this.word + NetworkTransport.length, bytes.length);
    Atomics.store(this.words, this.word + NetworkTransport.eof, eof ? 1 : 0);
    Atomics.store(this.words, this.word + NetworkTransport.error, error);
    Atomics.store(this.words, this.word + NetworkTransport.kind, kind);
    Atomics.store(this.words, this.word + NetworkTransport.state, 2);
    Atomics.notify(this.words, this.word + NetworkTransport.state);
  }

  async request({ method, url, headers: headerBlock, body, flags, sequence }) {
    if (this.active) throw new Error("concurrent HTTP requests are not supported");
    const observedSequence = Atomics.load(
      this.words,
      this.word + NetworkTransport.sequence,
    ) >>> 0;
    if (observedSequence !== sequence) {
      // A dispatched request must always receive a terminal mailbox record.
      // Silently dropping it strands the synchronous Wasm caller forever and
      // turns a broker contract violation into an undiagnosable shell hang.
      if (Atomics.load(this.words, this.word + NetworkTransport.state) === 1) {
        await this.publish(new Uint8Array(), 0, true, 1, 0);
      }
      throw new Error(
        `HTTP mailbox sequence mismatch (runtime ${sequence}, browser ${observedSequence})`,
      );
    }
    this.active = true;
    let status = 0;
    try {
      const target = new URL(url, location.href);
      if (target.protocol !== "http:" && target.protocol !== "https:") {
        await this.publish(new Uint8Array(), status, true, 3, 0);
        return;
      }
      if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(method)) {
        throw new Error("invalid HTTP method");
      }
      const headers = new Headers();
      for (const line of headerBlock.split(/\r?\n/)) {
        if (line === "") continue;
        const colon = line.indexOf(":");
        if (colon <= 0) throw new Error("invalid HTTP request header");
        headers.append(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
      }
      const upperMethod = method.toUpperCase();
      const response = await fetch(target, {
        method: upperMethod,
        headers,
        body: body === null || upperMethod === "GET" || upperMethod === "HEAD"
          ? undefined
          : body,
        credentials: "omit",
        redirect: (flags & 2) !== 0 ? "follow" : "manual",
      });
      status = response.status;
      await this.publish(encoder.encode(response.url), status, false, 0, 1);
      await this.publish(
        encoder.encode(`HTTP/1.1 ${status} ${response.statusText}\r\n`),
        status,
        false,
        0,
        2,
      );
      for (const [name, value] of response.headers) {
        await this.publish(encoder.encode(`${name}: ${value}\r\n`), status, false, 0, 2);
      }
      await this.publish(encoder.encode("\r\n"), status, false, 0, 2);
      if (response.body === null) {
        const body = new Uint8Array(await response.arrayBuffer());
        for (let offset = 0; offset < body.length; offset += this.capacity) {
          await this.publish(body.subarray(offset, offset + this.capacity), status, false, 0, 3);
        }
      } else {
        const reader = response.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          for (let offset = 0; offset < value.length; offset += this.capacity) {
            await this.publish(value.subarray(offset, offset + this.capacity), status, false, 0, 3);
          }
        }
      }
      await this.publish(new Uint8Array(), status, true, 0, 3);
    } catch {
      await this.publish(new Uint8Array(), status, true, 1, 0);
    } finally {
      this.active = false;
    }
  }
}

function appendBootstrap(text) {
  if (text === "") return;
  bootstrapLog.textContent += text.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
  bootstrapLog.scrollTop = bootstrapLog.scrollHeight;
}

async function toggleFullscreen(event) {
  if (event.key !== "F11") return;
  event.preventDefault();
  event.stopImmediatePropagation();
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    }
  } catch {
    document.documentElement.dataset.fullscreen = "failed";
  }
}

function sendResize() {
  if (!transport) return;
  if (!transport.pushResize(mount.clientWidth, mount.clientHeight, devicePixelRatio)) {
    requestAnimationFrame(sendResize);
  }
}

function handleKeyboardEvent(event) {
  if (!transport) return;
  if (event.type === "keydown" && event.key === "F11") void toggleFullscreen(event);
  if (!transport.pushKey(event)) {
    document.documentElement.dataset.inputOverflow = "true";
  }
  event.preventDefault();
  event.stopImmediatePropagation();
}

window.addEventListener("keydown", handleKeyboardEvent, { capture: true });
window.addEventListener("keyup", handleKeyboardEvent, { capture: true });
document.addEventListener("fullscreenchange", () => {
  document.documentElement.dataset.fullscreen = document.fullscreenElement ? "on" : "off";
  requestAnimationFrame(sendResize);
  keyboard.focus({ preventScroll: true });
});

async function submitInput(command, input = `${command}\r`) {
  const sequence = transport.currentResultSequence();
  document.documentElement.dataset.dollyCommand = command;
  if (!transport.pushText(input)) throw new Error("Dolly input mailbox is full");
  let timeout;
  const commandStatus = await Promise.race([
    transport.waitForResult(sequence),
    new Promise((_resolve, reject) => {
      timeout = setTimeout(
        () => reject(new Error(`timed out waiting for command: ${command}`)),
        60_000,
      );
    }),
  ]).finally(() => clearTimeout(timeout));
  commandResults.push({ command, status: commandStatus });
  return commandStatus;
}

async function waitFor(predicate, description) {
  for (let attempt = 0; attempt < 500; attempt++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`timed out waiting for ${description}`);
}

async function runBrowserProof() {
  const libcurlCheckBody =
    `int main(int argc, char **argv) { (void)argc; (void)argv; CURL *curl = curl_easy_init(); struct curl_slist *headers = 0; headers = curl_slist_append(headers, "X-Dolly-Test: yes"); curl_easy_setopt(curl, CURLOPT_URL, "${location.origin}/fixture/libcurl-post"); curl_easy_setopt(curl, CURLOPT_POSTFIELDS, "payload"); curl_easy_setopt(curl, CURLOPT_POSTFIELDSIZE, 7L); curl_easy_setopt(curl, CURLOPT_HTTPHEADER, headers); CURLcode result = curl_easy_perform(curl); curl_slist_free_all(headers); curl_easy_cleanup(curl); return result; }`;
  const libcurlSourceCommand =
    `awk 'BEGIN { print "#include <curl/curl.h>"; print "${libcurlCheckBody.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}" }' > libcurl-check.c`;
  const makefileCommand =
    `awk 'BEGIN { print "WHERE := $(shell pwd)"; print "all: make-demo"; print "make-demo: make-main.o make-value.o"; print "\\t$(CC) make-main.o make-value.o -o $@"; print "make-main.o: make-main.c"; print "\\t$(CC) -std=c17 -c $< -o $@"; print "make-value.o: make-value.c"; print "\\t$(CC) -std=c17 -c $< -o $@"; print "report:"; print "\\t@echo MAKE-SHELL=$(SHELL)"; print "\\t@echo MAKE-WHERE=$(WHERE)" }' > Makefile`;
  const beforeInteractive = [
    ["help", "\x1b[Ahelx\x7fp\r"],
    ["echo shell-created > shell.txt"],
    ["cat shell.txt"],
    ["echo alpha > alpha.txt"],
    ["echo Beta > beta.txt"],
    ["cat alpha.txt beta.txt > corpus.txt"],
    ["slop -c 'echo SLOP-C'"],
    ["grep -q Beta corpus.txt && echo SLOP-AND"],
    ["grep missing corpus.txt || echo SLOP-OR"],
    ["! grep missing corpus.txt && echo SLOP-NOT"],
    ["VALUE=42 slop -c 'echo SLOP-VAR-$VALUE'"],
    ["echo SLOP-SUB-$(pwd)"],
    ["echo first > append.txt"],
    ["echo second >> append.txt"],
    ["cat append.txt"],
    ["grep -n -i beta corpus.txt"],
    ["grep -c a corpus.txt"],
    ["grep -v alpha corpus.txt"],
    ["grep -q Beta corpus.txt"],
    ["grep missing corpus.txt", undefined, 1],
    ["echo PIPE-GREP | grep PIPE"],
    ["grep -Z", undefined, 2],
    ["echo grep-runtime-survived"],
    ["sed s/Beta/Gamma/ corpus.txt"],
    ["sed -n 2p corpus.txt"],
    ["echo SED-PIPE | sed s/SED/DOLLY/"],
    ["head -n 1 corpus.txt"],
    ["head -1 beta.txt"],
    ["wc -l corpus.txt"],
    ["echo one | wc -w"],
    ["awk --version"],
    ["echo \"key:value\" > colon.txt"],
    ["awk -F: '{print $2}' colon.txt"],
    ["echo \"one 2\" > awk-one.txt"],
    ["echo \"three 4\" > awk-two.txt"],
    ["cat awk-one.txt awk-two.txt > awk-data.txt"],
    ["echo awk-*.txt"],
    ["awk '{sum += $2} END {print sum}' awk-data.txt"],
    ["awk -v prefix=V '{print prefix $1}' awk-one.txt"],
    ["echo '{print toupper($1)}' > upper.awk"],
    ["awk -f upper.awk awk-two.txt"],
    ["echo \"pipe 7\" | awk '{print $2 * 6}'"],
    ["echo 'a,\"b,c\"' > csv.txt"],
    ["awk --csv '{print NF \":\" $2}' csv.txt"],
    ["awk 'BEGIN {print system(\"echo HOST-ESCAPE\")}'"],
    ["awk 'BEGIN {status = (\"denied\" | getline value); print status; exit status == -1 ? 0 : 1}'"],
    ["awk -f", undefined, 2],
    ["curl -fsSL /fixture/http.txt -o fetched.txt"],
    ["cat fetched.txt"],
    ["curl -f /fixture/missing", undefined, 22],
    [libcurlSourceCommand],
    ["cc libcurl-check.c -lcurl -o libcurl-check"],
    ["./libcurl-check"],
    ["git --version"],
    ["git config --global --get user.name"],
    ["git config --global --get user.email"],
    ["git config --global user.email asdf"],
    ["git config --global --get user.email"],
    ["mkdir git-repo"],
    ["cd git-repo"],
    ["git init"],
    ["echo tracked > tracked.txt"],
    ["git add tracked.txt"],
    ["git commit -m initial"],
    ["git --no-pager log --oneline"],
    [`awk 'BEGIN {print "list"; print ""}' | /usr/libexec/git-core/git-remote-http origin ${location.origin}/fixture/git`],
    ["cd .."],
    ["pwd"],
    ["mkdir path-test"],
    ["cd path-test"],
    ["pwd"],
    ["cd .."],
    ["mkdir -p flags/deep"],
    ["mkdir -p flags/deep"],
    ["touch flags/.hidden"],
    ["echo visible > flags/visible"],
    ["ls flags"],
    ["echo LS-ALL-BEGIN"],
    ["ls -a flags"],
    ["echo LS-ALL-END"],
    ["cat -n shell.txt"],
    ["pwd -P"],
    ["rm -f flags/missing"],
    ["rm -rf flags"],
    ["ls flags", undefined, 1],
    ["ls -l", undefined, 2],
    ["touch -c absent"],
    ["ls absent", undefined, 1],
    ["echo -n tight > tight.txt"],
    ["cat tight.txt"],
    ["ls /bin"],
    ["echo BIN-LIST-END"],
    ["ls /usr/bin"],
    ["echo USR-BIN-LIST-END"],
    ["zig version"],
    ["ls /usr/lib/libghostty-vt.a"],
    ["ghostty-vt"],
    ["cc --version"],
    ["c++ --version"],
    ["echo \"int answer(void) { return 42; }\" > answer.c"],
    ["cc -Wall -Wextra -O2 -c answer.c -o answer.o"],
    ["echo \"int answer(void); int main(int argc, char **argv) { (void)argc; (void)argv; return answer() == 42 ? 0 : 1; }\" > use.c"],
    ["cc -std=c17 use.c answer.o -o c-multi"],
    ["./c-multi"],
    ["ld --help"],
    ["cc -c use.c -o use.o"],
    ["ld use.o answer.o -o c-linked"],
    ["./c-linked"],
    ["ld use.c -o rejected", undefined, 64],
    ["ar --version"],
    ["ar rcs libanswer.a answer.o"],
    ["cc use.c libanswer.a -o archive-direct"],
    ["./archive-direct"],
    ["cc use.c -L. -lanswer -o archive-library"],
    ["./archive-library"],
    ["echo \"int main() { constexpr int value = 6 * 7; return value == 42 ? 0 : 1; }\" > cli.cpp"],
    ["c++ -std=c++23 cli.cpp -o cpp-cli"],
    ["./cpp-cli"],
    ["echo \"void exit(int); int main(int argc, char **argv) { (void)argc; (void)argv; exit(23); }\" > exit23.c"],
    ["cc exit23.c -o exit23"],
    ["./exit23", undefined, 23],
    ["echo command-local-exit-survived"],
    ["cc --definitely-unsupported", undefined, 64],
    ["make --version"],
    ["echo \"int value(void) { return 42; }\" > make-value.c"],
    ["echo \"#include <stdio.h>\" > make-main.c"],
    ["echo \"int value(void); int main(void) { printf(\\\"MAKE-%d\\\\n\\\", value()); return value() == 42 ? 0 : 1; }\" >> make-main.c"],
    [makefileCommand],
    ["make -j8 report"],
    ["make -j8"],
    ["./make-demo"],
    ["make -j8"],
    ["qjs --version"],
    ["qjs -e \"console.log('JS-' + (6 * 7))\""],
    ["echo \"console.log('ARGS-' + scriptArgs.join(':'))\" > args.js"],
    ["qjs args.js alpha beta"],
    ["echo \"export const answer = 42\" > esm-value.mjs"],
    ["echo \"import { answer } from './esm-value.mjs'; console.log('ESM-' + answer)\" > esm-main.mjs"],
    ["qjs esm-main.mjs"],
    ["qjs -e \"Dolly.writeFile('/workspace/qjs-persist.txt', 'QJS-PERSIST')\""],
    ["cat qjs-persist.txt"],
    ["echo \"print([1,2,3].map(x => x * 2).join(','))\" | qjs -"],
    ["qjs -e \"throw new Error('JS-EXPECTED')\"", undefined, 1],
    ["qjs --unsupported", undefined, 64],
    ["pi --version"],
    ["pi --self-test"],
    ["cat pi-self-test.txt"],
    [`DOLLY_PI_BASE_URL=${location.origin}/fixture/pi/v1 pi --http-self-test`],
    ["cat pi-http-test.txt"],
    ["lua -e \"print('lua from slop')\""],
  ];
  const afterInteractive = [
    ["lua -e \"error('expected status')\"", undefined, 1],
    ["echo \"print('PIPE-' .. (6 * 7))\" | lua"],
    ["demo"],
    ["demo"],
  ];

  for (const [command, input] of beforeInteractive) {
    await submitInput(command, input ?? `${command}\r`);
  }

  const luaResult = submitInput("lua");
  await waitFor(() => transport.foregroundPid() !== 0, "Lua foreground pid");
  transport.pushText("print('RESULT-' .. (7 * 6))\r");
  await new Promise((resolve) => setTimeout(resolve, 100));
  transport.pushSyntheticKey("c", "KeyC", 2);
  transport.pushSyntheticKey("c", "KeyC", 2, 0);
  await new Promise((resolve) => setTimeout(resolve, 50));
  transport.pushSyntheticKey("d", "KeyD", 2);
  transport.pushSyntheticKey("d", "KeyD", 2, 0);
  await luaResult;
  document.documentElement.dataset.luaInteractive = "passed";

  for (const [command, input] of afterInteractive) {
    await submitInput(command, input ?? `${command}\r`);
  }

  const count = beforeInteractive.length + 1 + afterInteractive.length;
  const proofResults = commandResults.slice(-count);
  const expectedStatuses = [
    ...beforeInteractive.map((entry) => entry[2] ?? 0),
    0,
    ...afterInteractive.map((entry) => entry[2] ?? 0),
  ];
  const passed = proofResults.length === count
    && proofResults.every((result, index) => result.status === expectedStatuses[index]);
  document.documentElement.dataset.dollyStatus = passed ? "passed" : "failed";
}

async function boot() {
  document.documentElement.dataset.dollyStatus = "loading";
  if (!crossOriginIsolated) {
    throw new Error("Dolly requires cross-origin isolation for shared Wasm memory");
  }
  appendBootstrap("DOLLY / SOURCE BOOTSTRAP\n\n");
  mount.addEventListener("pointerdown", () => keyboard.focus({ preventScroll: true }));
  keyboard.addEventListener("compositionend", (event) => {
    if (!transport?.pushText(event.data)) {
      document.documentElement.dataset.inputOverflow = "true";
    }
    keyboard.value = "";
  });
  keyboard.addEventListener("paste", (event) => {
    event.preventDefault();
    const text = event.clipboardData?.getData("text/plain") ?? "";
    if (text && !transport?.pushText(text)) {
      document.documentElement.dataset.inputOverflow = "true";
    }
  });

  runtimeWorker = new Worker(new URL("./runtime-worker.mjs", import.meta.url), {
    type: "module",
    name: "dolly-runtime",
  });
  runtimeWorker.addEventListener("message", (event) => {
    const message = event.data;
    if (message.type === "bootstrap") {
      appendBootstrap(message.text);
    } else if (message.type === "bootstrap-bytes") {
      appendBootstrap(bootstrapDecoder.decode(message.bytes, { stream: true }));
    } else if (message.type === "exited") {
      document.documentElement.dataset.dollyStatus = "exited";
    } else if (message.type === "http-request") {
      void networkTransport?.request(message).catch((error) => {
        document.documentElement.dataset.networkError = error.message;
      });
    } else if (message.type === "error") {
      canvas.hidden = true;
      bootstrapLog.hidden = false;
      appendBootstrap(`\nFATAL\n${message.message}\n`);
      document.documentElement.dataset.dollyStatus = "failed";
    }
  });

  const ready = await new Promise((resolve, reject) => {
    runtimeWorker.addEventListener("message", function onMessage(event) {
      if (event.data.type === "ready") {
        runtimeWorker.removeEventListener("message", onMessage);
        resolve(event.data);
      } else if (event.data.type === "error") {
        runtimeWorker.removeEventListener("message", onMessage);
        reject(new Error(event.data.message));
      }
    });
    runtimeWorker.addEventListener("error", reject, { once: true });
  });
  if (ready.version !== 1) throw new Error(`unsupported display mailbox ${ready.version}`);
  if (ready.httpVersion !== 2) throw new Error(`unsupported HTTP mailbox ${ready.httpVersion}`);
  if (ready.frameAddresses.length !== 2 || ready.frameAddresses.some((address) => !address)) {
    throw new Error("Dolly did not publish both framebuffer addresses");
  }
  transport = new DisplayTransport(
    ready.memory,
    ready.address,
    ready.eventSize,
    ready.eventCapacity,
  );
  networkTransport = new NetworkTransport(
    ready.memory,
    ready.httpAddress,
    ready.httpCapacity,
  );
  presenter = new FramebufferPresenter(
    canvas,
    ready.memory,
    ready.frameAddresses,
    ready.frameCapacity,
    transport,
  );
  presenter.start();
  bootstrapLog.hidden = true;
  canvas.hidden = false;
  document.documentElement.dataset.terminal = "ghostty-rgba-wasm";
  resizeObserver = new ResizeObserver(sendResize);
  resizeObserver.observe(mount);
  sendResize();

  keyboard.focus({ preventScroll: true });
  document.documentElement.dataset.dollyStatus = "ready";

  window.__dolly = {
    worker: runtimeWorker,
    display: presenter,
    transport,
    commandResults,
    get foregroundPid() {
      return transport.foregroundPid();
    },
    submit(command) {
      return submitInput(command);
    },
    input(data) {
      return transport.pushText(data);
    },
    key(key, code, modifiers = 0) {
      return transport.pushSyntheticKey(key, code, modifiers);
    },
    get fontSize() {
      return transport.fontSize();
    },
  };

  if (new URLSearchParams(location.search).get("autorun") === "shell") {
    await runBrowserProof();
  }
}

boot().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  canvas.hidden = true;
  bootstrapLog.hidden = false;
  appendBootstrap(`\nFATAL\n${message}\n`);
  document.documentElement.dataset.dollyStatus = "failed";
});
