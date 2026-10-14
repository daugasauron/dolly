import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { browserTest } from "./browser.mjs";
import { DOLLY_AUDIO_SLOTS } from "../host/audio/abi.mjs";
import { hostManifests } from "../host/manifests.mjs";
import { encodeSnapshotRecords } from "../src/snapshot-records.mjs";
import { siteReference } from "../src/static-asset.mjs";
import { DOLLY_IMAGES } from "../dist/dolly-images.mjs";

// A sealed package that needs audio@0, as the engine would build it: the
// retained recipe plus its receipt (recipe chain, host requirements, exports).
const encoder = new TextEncoder();
const u32 = value => { const bytes = new Uint8Array(4); new DataView(bytes.buffer).setUint32(0, value, true); return bytes; };
const text = value => [u32(encoder.encode(value).length), encoder.encode(value)];
const audible = { url: siteReference("Dollyfile-audible"),
  source: "DOLLY 7\nPACKAGE audible\nREQUIRES HOST runtime@0\nREQUIRES HOST audio@0\nFILE /usr/share/audible\n    needs audio\n" };
audible.sha256 = createHash("sha256").update(audible.source).digest("hex");
const receipt = Buffer.concat([encoder.encode("DOLLYART"), u32(5), u32(1),
  ...["PACKAGE", "audible", audible.url, audible.sha256, audible.source].flatMap(text),
  u32(1), ...text("audio@0"), u32(1), ...text("FILE"), ...text("audible"), ...text("/usr/share/audible"), u32(1),
  ...text("/usr/share/audible")]);
const file = data => ({ kind: 2, data: encoder.encode(data) });
const scratch = await mkdtemp(join(tmpdir(), "dolly-nena-"));
await writeFile(join(scratch, "audible.snapshot"), encodeSnapshotRecords(new Map([["/etc/dolly/Dollyfile", file(audible.source)],
  ["/etc/dolly/artifact", { kind: 2, data: new Uint8Array(receipt) }], ["/usr/share/audible", file("needs audio\n")]])));
const artifact = `/etc/dolly/artifacts/${audible.sha256}.snapshot`;
const install = `dollyfile install ${audible.url} ${audible.sha256}`;

// Programs of the session: one per module it switches, and three that link no
// client and call an operation directly, as a compromised program could.
const direct = (header, operation, packet) => `#include <dolly/process.h>\n#include <dolly/${header}-abi.h>\n#include <stdint.h>\n` +
  `#include <errno.h>\nint main(void) { ${packet}; char reply[512]; ` +
  `return dolly_process_call(${operation}, packet, sizeof packet, reply, sizeof reply) != -ENOSYS; }`;
const programs = {
  sound: ["#include <dolly/audio.h>\nint main(void) { static dolly_audio audio; return dolly_audio_open(&audio) != 0 || dolly_audio_close(&audio) != 0; }", ""],
  threaded: ["#include <pthread.h>\nstatic void *run(void *value) { return value; }\n" +
    "int main(void) { pthread_t thread; void *result; return pthread_create(&thread, 0, run, &thread) != 0 || pthread_join(thread, &result) != 0 || result != &thread; }", "-pthread"],
  // Calls audio@0 without pause while nena disables it: the call the switch
  // finds waiting for the page and every call after it fail with ENOSYS.
  holder: ["#include <dolly/audio.h>\n#include <dolly/runtime.h>\n#include <errno.h>\nint main(void) { static dolly_audio audio; dolly_audio_status status; " +
    "char *arguments[] = { \"/bin/nena\", \"disable\", \"audio\", 0 }; int ended = 1; if (dolly_audio_open(&audio) != 0) return 2; " +
    "const int pid = dolly_spawn(arguments[0], 3, arguments, 0, 2, 2); if (pid < 0) return 3; " +
    "while (dolly_audio_get_status(&audio, &status) == 0) {} if (errno != ENOSYS) return 4; " +
    "return dolly_wait(pid, &ended) < 0 || ended != 0 ? 5 : 0; }", ""],
  // The same with the microphone, once the browser has given it.
  capture: ["#include <dolly/microphone.h>\n#include <dolly/runtime.h>\n#include <errno.h>\n#include <unistd.h>\n" +
    "int main(void) { static dolly_microphone microphone; dolly_microphone_status status; int ended = 1; " +
    "char *arguments[] = { \"/bin/nena\", \"disable\", \"microphone\", 0 }; if (dolly_microphone_open(&microphone) != 0) return 2; " +
    "for (int tries = 0; ; ++tries) { if (dolly_microphone_get_status(&microphone, &status) != 0) return 3; " +
    "if (status.state == DOLLY_MICROPHONE_CAPTURING) break; if (status.state != DOLLY_MICROPHONE_WAITING || tries == 1000) return 4; usleep(10000); } " +
    "const int pid = dolly_spawn(arguments[0], 3, arguments, 0, 2, 2); if (pid < 0) return 5; " +
    "while (dolly_microphone_get_status(&microphone, &status) == 0) {} if (errno != ENOSYS) return 6; " +
    "return dolly_wait(pid, &ended) < 0 || ended != 0 ? 7 : 0; }", ""],
  // Runs a thread while nena disables threads@0: the program ends with its Workers.
  spinner: ["#include <pthread.h>\n#include <dolly/runtime.h>\n#include <unistd.h>\nstatic void *idle(void *value) { for (;;) sleep(1); return value; }\n" +
    "int main(void) { pthread_t thread; int ended; char *arguments[] = { \"/bin/nena\", \"disable\", \"threads\", 0 }; " +
    "if (pthread_create(&thread, 0, idle, 0) != 0) return 2; const int pid = dolly_spawn(arguments[0], 3, arguments, 0, 2, 2); " +
    "return pid < 0 || dolly_wait(pid, &ended) < 0 ? 3 : 4; }", "-pthread"],
  "direct-audio": [direct("audio", "DOLLY_AUDIO_PROCESS_OP", "uint32_t packet[8] = { DOLLY_AUDIO_VERSION, DOLLY_AUDIO_OPEN, 0, 0, 1 }"), ""],
  "direct-nena": [direct("nena", "DOLLY_NENA_PROCESS_OP", "uint32_t packet[8] = { DOLLY_NENA_VERSION, DOLLY_NENA_OPEN, 0, 0, 1 }"), ""],
  "direct-microphone": [direct("microphone", "DOLLY_MICROPHONE_PROCESS_OP", "uint32_t packet[8] = { DOLLY_MICROPHONE_VERSION, DOLLY_MICROPHONE_OPEN, 0, 0, 1 }"), ""],
};
// Records each AudioContext the page makes.
function recordAudioContexts() {
  globalThis.audioContexts = [];
  globalThis.AudioContext = class extends AudioContext {
    constructor(...options) { super(...options); audioContexts.push(this); }
  };
}
const fixtures = { "audible.snapshot": join(scratch, "audible.snapshot") };
for (const [name, [code]] of Object.entries(programs)) {
  await writeFile(fixtures[`${name}.c`] = join(scratch, `${name}.c`), code);
}

try {
// default declares nena@0: its session lists the page's modules, enables one,
// uses it, disables it, keeps what it enabled across a save, and can give the
// privilege up.
await browserTest("nena", { image: "default", timeout: 300_000, server: { fixtures },
  // The browsers' fake microphone, given without a prompt.
  launch: { chromium: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
    firefox: { "media.navigator.streams.fake": true, "media.navigator.permission.disabled": true } } }, async ({ server, open }) => {
  const session = await open({ policy: { maxRequests: 256, rules: [{ origin: server.origin, path: "/amy-index.txt", methods: ["GET"] },
    { origin: server.origin, pathPrefix: "/fixture/", methods: ["GET"] }] },
    // Every stream the page is given, to count its live tracks after the
    // provider is gone, and every AudioContext, to see each closed.
    setup: async page => {
      await page.addInitScript(recordAudioContexts);
      await page.addInitScript(() => {
        const ask = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        globalThis.givenStreams = [];
        navigator.mediaDevices.getUserMedia = async constraints => { const stream = await ask(constraints); givenStreams.push(stream); return stream; };
      });
    } });
  const { page, submit } = session;
  const run = async command => assert.equal(await submit(command), 0, `${command}\n${await session.text()}`);
  // A refused program exits 126 and its one line names the command that enables the module.
  const refused = async (program, module) => {
    assert.equal(await submit(`${program} 2> /tmp/refused`), 126, program);
    await run(`grep -q 'nena enable ${module}' /tmp/refused`);
  };
  const enabled = () => page.evaluate(() => __dolly.hostModules);
  const state = async (module, expected) => run(`nena | grep -q '^${module}@0  *${expected} '`);

  // The list is every module of the page, in the state the page holds.
  await run(`test "$(nena | wc -l)" -eq ${hostManifests.length}`);
  for (const { name, version, fixed } of hostManifests) {
    const here = (await enabled()).includes(`${name}@${version}`);
    await state(name, here ? "declared" : fixed ? "-" : "available");
  }
  await run("man nena > /dev/null && ! nena frobnicate 2> /dev/null");

  await run("amy install cc > /dev/null && amy install libdolly-audio > /dev/null && amy install libdolly-microphone > /dev/null");
  for (const [name, [, flags]] of Object.entries(programs)) {
    await run(`curl -fsS ${server.origin}/fixture/${name}.c -o /tmp/${name}.c && cc ${flags} /tmp/${name}.c -o $HOME/${name}`);
  }
  // audio@0 is not default's: its program is refused, the operation itself is
  // ENOSYS, and a package that needs it is not installed. Each refusal names the command.
  await refused("$HOME/sound", "audio");
  await run("$HOME/direct-audio");
  await run(`mkdir -p /etc/dolly/artifacts && curl -fsS ${server.origin}/fixture/audible.snapshot -o ${artifact}`);
  assert.notEqual(await submit(`${install} 2> /tmp/needs`), 0);
  await run("grep -q 'nena enable audio' /tmp/needs && test ! -e /usr/share/audible");
  // Enabled, the page has its provider, the program runs and the package installs.
  await run("nena enable audio && test \"$(cat /etc/dolly/enabled)\" = audio@0");
  assert.ok((await enabled()).includes("audio@0"));
  await state("audio", "enabled");
  await run(`$HOME/sound && ${install} && rm ${artifact} && test "$(cat /usr/share/audible)" = 'needs audio'`);
  assert.equal(await page.evaluate(() => __dolly.audio.activeScopes), 0);
  // audio@0 gives playback and no capture: the microphone's operation stays ENOSYS beside it.
  await run("$HOME/direct-microphone");
  // Disabled, it is gone for programs that record it and for those that do not.
  await run("nena disable audio && test ! -e /etc/dolly/enabled");
  assert.ok(!(await enabled()).includes("audio@0"));
  assert.equal(await page.evaluate(() => "audio" in __dolly), false);
  await refused("$HOME/sound", "audio");
  await run("$HOME/direct-audio");
  // A program calling the module while it is disabled loses it: the call in
  // flight, when the switch finds one, and the next. Several times, since the
  // switch does not always find one, and more often than the module has
  // slots: the page side that is disabled lets go of what it held, each
  // time's AudioContext is closed and audio still opens.
  const rounds = Math.max(8, DOLLY_AUDIO_SLOTS + 1);
  for (let enabling = 0; enabling < rounds; ++enabling) {
    await page.waitForFunction(() => audioContexts.every(context => context.state === "closed"));
    await run("nena enable audio && $HOME/holder");
  }
  await page.waitForFunction(count => audioContexts.length === count && audioContexts.every(context => context.state === "closed"),
    rounds + 1);
  await state("audio", "available");
  assert.equal(await page.evaluate(() => "audio" in __dolly), false);
  // The microphone a program is recording from is let go: no track of the
  // stream the browser gave stays live, and the page's mark is gone.
  await run("nena enable microphone && $HOME/capture");
  assert.deepEqual(await page.evaluate(() => [givenStreams.length, givenStreams.flatMap(stream => stream.getTracks()).filter(track => track.readyState === "live").length,
    document.querySelector("#microphone-status").hidden]), [1, 0, true]);
  // A module the image declares is switched the same way.
  await run("$HOME/threaded && nena disable threads");
  await refused("$HOME/threaded", "threads");
  await state("threads", "available");
  await run("nena enable threads && $HOME/threaded");
  await state("threads", "declared");
  // A threaded program running when the module is disabled ends, told why.
  assert.equal(await submit("$HOME/spinner 2> /tmp/withdrawn"), 126);
  await run("grep -q 'threads@0' /tmp/withdrawn && nena enable threads && $HOME/threaded");
  // A module that is a local service of the page goes and comes back with its service.
  await run("nena disable packages");
  assert.notEqual(await submit("amy install gzip 2> /dev/null"), 0);
  await run("nena enable packages && amy install gzip > /dev/null && gzip --help > /dev/null");
  // upload@0 starts with the image, and starts again when it is enabled later.
  await run("nena disable upload");
  await refused("upload /tmp/sent", "upload");
  await run("nena enable upload");
  const sending = submit("upload /tmp/sent");
  await page.setInputFiles("#file-upload[open] input[type=file]", { name: "sent.txt", mimeType: "text/plain", buffer: Buffer.from("sent late\n") });
  assert.equal(await sending, 0);
  await run("test \"$(cat /tmp/sent)\" = 'sent late'");
  // A fixed module is neither enabled nor disabled, and a name the page lacks is refused.
  for (const command of ["disable runtime", "disable http", "disable display", "disable input", "disable snapshot", "enable build", "enable nosuch"]) {
    assert.equal(await submit(`nena ${command} 2> /tmp/fixed`), 1, command);
    await run("test -s /tmp/fixed");
  }
  assert.deepEqual((await enabled()).filter(module => /^(runtime|http|display|input|snapshot|build)@/.test(module)).sort(),
    ["display@0", "http@0", "input@0", "runtime@0", "snapshot@0"]);
  // gpu@0 is enabled where the browser has WebGPU and refused with the reason
  // where it has not. The page's indicator is there, naming an adapter, only
  // while the session has the module: not before, not once it is disabled,
  // and not when it is refused.
  const indicated = () => page.evaluate(() => document.querySelector("#gpu-status")?.dataset.gpu ?? null);
  assert.equal(await indicated(), null);
  const gpu = await submit("nena enable gpu 2> /tmp/gpu");
  assert.equal((await enabled()).includes("gpu@0"), gpu === 0, await session.text());
  if (gpu === 0) assert.match(await indicated(), /^(software|hardware)$/);
  else {
    await run("test -s /tmp/gpu");
    assert.equal(await indicated(), null);
  }
  await run("nena disable gpu");
  assert.equal(await indicated(), null);
  // An adapter that answers after the switch was refused changes nothing on the page.
  await page.evaluate(() => Object.defineProperty(Navigator.prototype, "gpu", { configurable: true, value: {
    requestAdapter: () => new Promise(resolve => setTimeout(resolve, 6000, { info: { vendor: "late" }, features: new Set() })) } }));
  assert.equal(await submit("nena enable gpu 2> /dev/null"), 1);
  await page.waitForTimeout(2000);
  assert.deepEqual([await indicated(), (await enabled()).includes("gpu@0")], [null, false]);

  // A saved session has the modules it enabled again when it is loaded, and
  // the page says which in one line. One the browser does not give in time
  // (here its adapter request never answers) is left out and named with the
  // command; the session loads without waiting for it.
  await run("nena enable audio && echo gpu@0 >> /etc/dolly/enabled");
  assert.equal(await page.evaluate(() => __dolly.saveSession("nena-proof")), "nena-proof");
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "gpu",
    { configurable: true, value: { requestAdapter: () => new Promise(() => {}) } }));
  await page.goto(`${server.origin}/session/?name=nena-proof`);
  await page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus));
  assert.equal(await page.evaluate(() => document.documentElement.dataset.dollyStatus), "ready",
    await page.locator("#bootstrap-log").textContent());
  await page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "session shell"));
  assert.deepEqual((await enabled()).filter(module => /^(audio|gpu)@/.test(module)), ["audio@0"]);
  await run("$HOME/sound");
  const said = shown => shown.evaluate(() => { const status = document.querySelector("#session-status"); return status.hidden ? "" : status.textContent; });
  await page.waitForFunction(() => /nena enable gpu/.test(document.querySelector("#session-status").textContent), null, { timeout: 15_000 });
  assert.match(await said(page), /audio@0.*nena enable gpu/);
  await run("test \"$(cat /etc/dolly/enabled)\" = audio@0");

  // nena disable nena gives the privilege up: the command and the operation
  // are refused, nothing more can be enabled, and what is enabled stays.
  await run("nena disable nena");
  assert.ok(!(await enabled()).includes("nena@0"));
  assert.notEqual(await submit("nena 2> /dev/null"), 0);
  assert.notEqual(await submit("nena enable gpu 2> /dev/null"), 0);
  await run("$HOME/direct-nena && $HOME/sound");
  assert.ok(!(await enabled()).includes("gpu@0"));

  // A provider standing in for audio@0's, slower to start in the Worker than
  // boot waits for any provider. A session whose record lists it loads all
  // the same and the page says so once the module is there; and the stand-in
  // was handed none of the registry's switches, which are nena's alone.
  const standIn = 'export { DOLLY_AUDIO_ABI_DIGEST as digest } from "./abi.mjs";\n' +
    "export function browser(given) { globalThis.audioGiven = given.modules !== undefined; return {}; }\n" +
    "export function worker() { return { start: () => new Promise(resolve => setTimeout(resolve, 12_000)) }; }\n";
  const slow = await open({ setup: page => page.route("**/host/audio/audio.mjs",
    route => route.fulfill({ contentType: "text/javascript", body: standIn })) });
  assert.equal(await slow.submit("echo audio@0 > /etc/dolly/enabled"), 0);
  assert.equal(await slow.page.evaluate(() => __dolly.saveSession("nena-slow")), "nena-slow");
  await slow.page.goto(`${server.origin}/session/?name=nena-slow`);
  await slow.page.waitForFunction(() => ["ready", "failed"].includes(document.documentElement.dataset.dollyStatus));
  assert.equal(await slow.page.evaluate(() => document.documentElement.dataset.dollyStatus), "ready",
    await slow.page.locator("#bootstrap-log").textContent());
  await slow.page.evaluate(() => __dolly.waitForInteractiveTerminal(/dolly:[^\n]*\$\s*$/, "session shell"));
  assert.deepEqual([await slow.page.evaluate(() => globalThis.audioGiven), await said(slow.page)], [false, ""]);
  await slow.page.waitForFunction(() => /audio@0/.test(document.querySelector("#session-status").textContent), null, { timeout: 20_000 });
  assert.equal(await slow.submit("test \"$(cat /etc/dolly/enabled)\" = audio@0"), 0);

  // An embedding that names the page's modules bounds what nena enables.
  const bounded = await open({ setup: page => page.addInitScript(modules => { globalThis.DOLLY_HOST_MODULES = modules; },
    DOLLY_IMAGES.find(({ image }) => image === "default").hostRequirements) });
  assert.equal(await bounded.submit("nena enable audio 2> /dev/null"), 1);
  assert.equal(await bounded.submit("nena disable threads && nena enable threads"), 0);
  assert.ok(!(await bounded.page.evaluate(() => __dolly.hostModules)).includes("audio@0"));
});
} finally { await rm(scratch, { recursive: true, force: true }); }
