// Runs in Dolly under janis: Pi's shell and edit tools over real Slop processes.
// argv: scratch directory containing ./writer (utf8-writer.c).
import fs from "node:fs";

function equal(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label}: ${JSON.stringify(actual)}`);
}

const root = process.argv[2];
// Pi loads extensions after its own module graph, as here.
await import("/usr/lib/node_modules/@earendil-works/pi-coding-agent/dist/main.js");
const { default: dollyTools, slop } = await import("/home/dolly/.pi/agent/extensions/dolly-tools.js");
const tools = new Map();
dollyTools({ on() {}, registerTool(tool) { tools.set(tool.name, tool); } });
const context = { cwd: root, sessionManager: { getSessionId: () => "probe", getSessionFile() {} } };

const chunks = [];
await slop.exec("./writer", root, { onData: data => chunks.push(data.toString()) });
equal(chunks, ["あ", "😀", "�", "�"], "Pi interleaved pipes stream complete scalars and flush both");

const command = "printf prefix; /bin/sleep 5";
const started = Date.now();
let error;
try { await tools.get("bash").execute("probe", { command }, AbortSignal.timeout(1000), undefined, context); }
catch (value) { error = value; }
equal([error?.message, Date.now() - started < 4000], ["prefix\n\nCommand aborted", true], "Pi shell tool cancels");
let output = "";
error = undefined;
try { await slop.exec(command, root, { signal: AbortSignal.timeout(1000), onData: data => { output += data; } }); }
catch (value) { error = value; }
equal([output, error?.message], ["prefix", "aborted"], "Pi user shell streams and cancels");

const edit = (oldText, newText) => tools.get("edit").execute("edit",
  { path: "edit.txt", edits: [{ oldText, newText }] }, undefined, undefined, context);
const latin1 = Uint8Array.of(0x63, 0x61, 0x66, 0xe9, 0x20, 0x6f, 0x6c, 0x64);
fs.writeFileSync(`${root}/edit.txt`, latin1);
error = undefined;
try { await edit("old", "new"); } catch (failure) { error = failure; }
if (!/UTF-8/.test(error?.message)) throw new Error(`Pi edit did not refuse non-UTF-8 bytes: ${error}`);
equal([...fs.readFileSync(`${root}/edit.txt`)], [...latin1], "refused edit preserves bytes");
fs.writeFileSync(`${root}/edit.txt`, "﻿α\r\nold\r\n😀\r\n");
await edit("old", "$& new");
equal(fs.readFileSync(`${root}/edit.txt`, "utf8"), "﻿α\r\n$& new\r\n😀\r\n", "literal Pi edit preserves BOM/CRLF/Unicode");
console.log("PI-TOOLS-OK");
