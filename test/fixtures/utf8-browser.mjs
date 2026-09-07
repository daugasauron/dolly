import { decoderCases } from "./utf8-cases.mjs";
import { StringDecoder } from "node:string_decoder";
import { Readable } from "node:stream";
import { execFile } from "node:child_process";
import dollyTools from "/home/dolly/.pi/agent/extensions/dolly-tools.js";

function equal(actual, expected, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`UTF8: ${label}`);
}

if (process.argv.includes("stdin")) {
  let text = "";
  process.stdin.setEncoding("utf8").on("data", chunk => { text += chunk; });
  process.stdin.on("end", () => {
    equal(text, "a".repeat(4095) + "あ😀�", "stdin chunk boundary and final flush");
    console.log("UTF8-STDIN-OK");
  });
  process.stdin.resume();
} else {
  equal(await new Promise(resolve => setTimeout(() => resolve(42), 0)), 42,
    "last timer may queue a top-level await continuation");
  const base = process.argv[2];
  const expected = await (await fetch(`${base}/fixture/utf8-reference`)).json();
  equal(decoderCases(TextDecoder), expected, "TextDecoder reference cases");
  const large = "日本語😀a".repeat(16384);
  equal(new TextDecoder().decode(new TextEncoder().encode(large)), large, "large chunk output batching");
  const decoder = new StringDecoder();
  equal(decoder.write(Uint8Array.of(0xe3)), "", "StringDecoder pending byte");
  equal(decoder.end(Uint8Array.of(0x81, 0x82)), "あ", "StringDecoder completion");
  const readable = new Readable().setEncoding("utf8");
  let decoded = "";
  readable.on("data", chunk => { decoded += chunk; });
  readable.push(Uint8Array.of(0xf0, 0x9f));
  readable.push(Uint8Array.of(0x98, 0x80, 0xe3));
  readable.push(null);
  equal(decoded, "😀�", "encoded readable");

  const response = await fetch(`${base}/fixture/utf8-stream`);
  const reader = response.body.getReader();
  const bodyDecoder = new TextDecoder();
  const chunks = [];
  let text = "";
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    chunks.push(chunk.value.length);
    text += bodyDecoder.decode(chunk.value, { stream: true });
  }
  text += bodyDecoder.decode();
  equal(text, "日本語😀�", "streamed HTTP body");
  // HTTP may coalesce writes; require actual splits inside both a Japanese
  // scalar and the emoji, without assuming a particular network chunk size.
  let offset = 0;
  const boundaries = new Set(chunks.map(length => offset += length));
  if (![1, 2, 4, 5, 7, 8].some(value => boundaries.has(value)) ||
      ![10, 11, 12].some(value => boundaries.has(value))) {
    throw new Error(`UTF8: HTTP fixture did not split Japanese and emoji scalars: ${chunks}`);
  }
  equal(await (await fetch(`${base}/fixture/utf8-stream`)).text(), "日本語😀�", "Response.text");

  const run = (command, args) => new Promise((resolve, reject) => {
    execFile(command, args, (error, stdout, stderr) => error ? reject(error) : resolve([stdout, stderr]));
  });
  equal(await run("./writer", []), ["あ�", "😀�"], "execFile streams");
  equal(await run("janis", ["-e", "process.stdout.write(Buffer.alloc(0)); process.stdout.write(Buffer.from([0,255,0xe3])); process.stdout.write(Buffer.from([0x81,0x82]));"]),
    ["\0�あ", ""], "binary stdout writes");
  const registered = new Map();
  dollyTools({ on() {}, registerCommand() {}, registerTool(tool) { registered.set(tool.name, tool); } });
  const updates = [];
  const result = await registered.get("bash").execute("utf8", { command: "./writer" }, undefined,
    value => updates.push(value.content[0].text), { cwd: Dolly.cwd() });
  equal(result.content[0].text, "あ😀��", "Pi interleaved pipes and both EOF flushes");
  if (!updates.includes("あ") || !updates.includes("あ😀")) throw new Error("UTF8: Pi did not stream completed characters");
  const edit = (old_text, new_text) => registered.get("edit").execute("edit",
    { path: "edit.txt", old_text, new_text }, undefined, undefined, { cwd: Dolly.cwd() });
  for (const [original, old, replacement, expected] of [
    ["same", "same", "same", "No changes"],
    ["", "", "insert", "old_text must not be empty"],
    ["aaa", "aa", "b", "more than once"],
  ]) {
    Dolly.writeFile("edit.txt", original);
    let error = "";
    try { await edit(old, replacement); } catch (failure) { error = failure.message; }
    if (!error.includes(expected)) throw new Error(`Pi edit did not reject ${expected}: ${error}`);
    equal(Dolly.readFile("edit.txt"), original, "rejected edit preserves bytes");
  }
  Dolly.writeFile("edit.txt", "\uFEFFα\r\nold\r\n😀\r\n");
  await edit("old", "$& new");
  equal(Dolly.readFile("edit.txt"), "\uFEFFα\r\n$& new\r\n😀\r\n", "literal Pi edit preserves BOM/CRLF/Unicode");
  console.log(`UTF8-OK: ${expected.length} decoder cases, HTTP, Node streams, Pi pipes, binary writes`);
  process.exitCode = 1;
  setTimeout(() => Promise.resolve().then(() => { process.exitCode = 0; }), 0);
}
