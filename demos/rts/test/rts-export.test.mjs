import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

test("live export preserves required files even when directory enumeration omits them", async () => {
  const match = "/workspace/rts-matches/match-test", agent = "/tmp/rts-live-agent";
  const files = new Map(), directories = new Set(["/tmp", agent, "/workspace/rts-matches", match]);
  const write = (path, bytes) => files.set(path, Buffer.from(bytes));
  write(`${agent}/auth.json`, "{}");
  write(`${agent}/models.json`, JSON.stringify({ providers: { fixture: { apiKey: "fixture-secret" } } }));
  write(`${match}/match.json`, "{}");
  write(`${match}/result.txt`, "Player 2 won at game frame 42");
  for (const player of [1, 2]) {
    directories.add(`${match}/player${player}-game`);
    write(`${match}/player${player}.events.jsonl`, JSON.stringify({ type: "tool_result", details: {
      actions: [{ type: "move", x: 1, y: 2 }], frame: 42 } }));
    write(`${match}/player${player}.jsonl`, '{"type":"image"}\n{"type":"image"}\n');
    write(`${match}/player${player}.txt`, "intent");
    write(`${match}/player${player}-game/NONAME.RPL`, `7KRP${player}`);
    write(`${match}/player${player}-game/inputs.log`, "input");
  }
  const fs = {
    readFileSync(path, encoding) {
      assert.ok(files.has(path), `missing ${path}`);
      return encoding ? files.get(path).toString(encoding) : files.get(path);
    },
    readdirSync: path => [...new Set([...directories, ...files.keys()].filter(name => name.startsWith(`${path}/`))
      .map(name => name.slice(path.length + 1).split("/")[0]))].filter(name => !/\.RPL$|\.txt$/.test(name)),
    statSync: path => ({ isDirectory: () => directories.has(path), size: files.get(path)?.length ?? 0 }),
    mkdirSync: path => directories.add(path), writeFileSync: write,
    copyFileSync: (source, target) => write(target, fs.readFileSync(source)),
  };
  const source = await readFile(new URL("./fixtures/rts-live.mjs", import.meta.url), "utf8");
  await runInNewContext(`(async () => { ${source} })()`, {
    __janisBuiltin: () => fs, Buffer, process: { argv: ["janis", "fixture", "inspect"] }, console: { log() {} },
  });
  const parts = JSON.parse(fs.readFileSync("/tmp/rts-live-export/parts.json", "utf8"));
  const archive = JSON.parse(Buffer.concat(parts.map(name => fs.readFileSync(`/tmp/rts-live-export/${name}`))));
  for (const [path, bytes] of files) if (path.startsWith(`${match}/`))
    assert.deepEqual(Buffer.from(archive.files[path.slice("/workspace/rts-matches/".length)] ?? "", "base64"), bytes, path);
  for (const player of [1, 2]) assert.deepEqual(fs.readFileSync(`/tmp/rts-live-export/player${player}.rpl`),
    fs.readFileSync(`${match}/player${player}-game/NONAME.RPL`));
});
