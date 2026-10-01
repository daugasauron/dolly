import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { inspectDollyfile } from "../src/dollyfile-view.mjs";
import { stagedIncludeDirectory } from "../scripts/host-modules.mjs";
const includeDirectory = await stagedIncludeDirectory();

const project = resolve(import.meta.dirname, "..");
const scratch = await mkdtemp(join(tmpdir(), "dolly-commands-"));
test.after(() => rm(scratch, { recursive: true, force: true }));

function build(name, source = `src/commands/${name}.c`) {
  const output = join(scratch, name);
  execFileSync("cc", ["-std=c17", "-Wall", "-Wextra", "-Werror", `-I${includeDirectory}`, source,
    "test/fixtures/native-spawn.c", "-o", output, "-lm"], { cwd: project, stdio: "pipe" });
  return output;
}

async function buildInline(name) {
  const recipe = inspectDollyfile(await readFile(join(project, "modules/core-tools.dm"), "utf8"));
  const source = join(scratch, `${name}.c`);
  await writeFile(source, recipe.files.find(({ path }) => path.endsWith(`/${name}.c`)).body);
  return build(name, source);
}

const run = (program, args, options = {}) =>
  spawnSync(program, args, { cwd: scratch, encoding: "utf8", ...options });

test("find -exec + runs every path even after a failed batch", async () => {
  const find = build("find");
  const tree = join(scratch, "find-tree");
  await mkdir(tree);
  for (let index = 0; index < 600; index++) await writeFile(join(tree, `file-${index}`), "");
  const log = join(scratch, "find.log");
  const result = run(find, [tree, "-type", "f", "-exec", "sh", "-c",
    `printf '%s\\n' "$@" >> ${log}; exit 1`, "sh", "{}", "+"]);
  assert.equal(result.status, 1, result.stderr);
  const recorded = (await readFile(log, "utf8")).trim().split("\n");
  assert.equal(new Set(recorded).size, 600);
  assert.equal(run(find, [tree, "-name", "file-1[0-9]", "-path", "*/file-*"]).stdout.split("\n").length - 1, 10);
});

test("xargs streams large input in size- and count-bounded batches", () => {
  const xargs = build("xargs");
  const words = Array.from({ length: 300000 }, (_, index) => String(index)).join("\n");
  const batches = run(xargs, ["sh", "-c", 'echo $#', "sh"], { input: words });
  assert.equal(batches.status, 0, batches.stderr);
  const sizes = batches.stdout.trim().split("\n").map(Number);
  assert.ok(sizes.length > 1);
  assert.equal(sizes.reduce((total, size) => total + size, 0), 300000);
  assert.equal(run(xargs, ["-n", "3", "sh", "-c", "echo $#", "sh"], { input: "1 2 3 4 5 6 7" }).stdout,
    "3\n3\n1\n");
  for (const line of run(xargs, ["-s", "20", "echo"], { input: words.slice(0, 200) }).stdout.trim().split("\n")) {
    assert.ok(`echo ${line}`.length + 1 <= 20, line);
  }
  assert.equal(run(xargs, ["-s", "8", "echo"], { input: "long-argument" }).status, 1);
  assert.equal(run(xargs, ["sh", "-c", "exit 3"], { input: "a" }).status, 123);
  assert.equal(run(xargs, ["missing-command"], { input: "a" }).status, 127);
  assert.equal(run(xargs, ["-I", "{}", "echo", "<{}>"], { input: "a b\nc\n" }).stdout, "<a b>\n<c>\n");
});

test("timeout 0 disables the deadline", () => {
  const timeout = build("timeout");
  assert.equal(run(timeout, ["0", "sleep", "0.2"]).status, 0);
  assert.equal(run(timeout, ["0.05", "sleep", "5"]).status, 124);
});

test("Dolly's own core tools keep their no-permission and finite semantics", async () => {
  const testTool = await buildInline("test"), bracket = await buildInline("bracket");
  const status = (program, args) => run(program, args).status;
  assert.equal(status(testTool, ["-x", "."]), 1, "a directory is not an executable candidate");
  assert.equal(status(testTool, ["-x", testTool]), 0);
  assert.equal(status(bracket, ["(", "-n", "a", "-a", "-z", "", ")", "-o", "!", "-d", ".", "]"]), 0);
  assert.equal(status(bracket, ["!", "(", "a", "=", "a", ")", "-a", "-d", ".", "]"]), 1);
  assert.equal(status(bracket, ["-n", "a"]), 2);
  assert.equal(run(await buildInline("cat"), ["-n"], { input: "a\nb\n" }).stdout, "     1\ta\n     2\tb\n");
  assert.equal(run(await buildInline("echo"), ["--"]).stdout, "--\n");
  assert.equal(status(await buildInline("ls"), ["--color=never", "."]), 0);
  const tail = build("tail");
  assert.equal(run(tail, ["-n", "1"], { input: "a\nb\n" }).stdout, "b\n");
  assert.equal(run(tail, ["-f"], { input: "a\n", timeout: 5000 }).status, 2);
  await writeFile(join(scratch, "install-source"), "bytes");
  assert.equal(status(build("install"), ["-m", "755", "-o", "nobody", "-g", "nogroup",
    "install-source", "installed"]), 0);
  assert.equal(await readFile(join(scratch, "installed"), "utf8"), "bytes");
  await utimes(join(scratch, "install-source"), 1000, 2000);
  assert.equal(status(build("install"), ["-p", "install-source", "preserved"]), 0);
  assert.equal((await stat(join(scratch, "preserved"))).mtimeMs, 2000_000);
  assert.equal(run(build("du"), ["-b", "install-source"]).stdout, "5\tinstall-source\n");
  assert.equal(run(build("rev"), [], { input: "aé✓b\n" }).stdout, "b✓éa\n");
});

test("env, command and time resolve programs on the resulting PATH", () => {
  const env = build("env");
  assert.equal(run(env, ["-i", "FOO=bar", env]).stdout, "FOO=bar\n");
  assert.equal(run(env, ["-u", "HOME", "sh", "-c", 'echo "${HOME-unset}"']).stdout, "unset\n");
  assert.equal(run(env, ["missing-command"]).status, 127);
  const command = build("command");
  assert.equal(run(command, ["sh", "-c", "exit 4"]).status, 4);
  assert.equal(run(command, ["cd", "/"]).status, 127);
  assert.equal(run(command, ["-v", "missing-command"]).status, 1);
  assert.equal(run(command, [`./command`, "-v", "sh"]).status, 0);
  const time = build("time");
  const timed = run(time, ["sh", "-c", "exit 5"]);
  assert.equal(timed.status, 5);
  assert.match(timed.stderr, /^real \d+\.\d{3}\n$/);
});

test("diff reports 0/1/2 and patch reads the patch, never a file operand", async () => {
  const diff = build("diff");
  const patch = build("patch");
  const work = join(scratch, "patch-work");
  await mkdir(join(work, "a"), { recursive: true });
  await mkdir(join(work, "b"));
  await writeFile(join(work, "a/file"), "one\ntwo\n");
  await writeFile(join(work, "b/file"), "one\nTWO\n");
  const options = { cwd: work };
  assert.equal(run(diff, ["a/file", "a/file"], options).status, 0);
  const unified = run(diff, ["-u", "a/file", "b/file"], options);
  assert.equal(unified.status, 1);
  assert.equal(run(diff, ["-q", "a/file", "b/file"], options).stdout, "Files a/file and b/file differ\n");
  assert.equal(run(diff, ["-r", "a", "b"], options).status, 1);
  assert.equal(run(diff, ["a/file", "missing"], options).status, 2);
  assert.equal(run(diff, ["-N", "a/file", "missing"], options).status, 1);
  assert.equal(run(diff, ["-s", "a/file", "b/file"], options).status, 2);
  await writeFile(join(work, "change.patch"), unified.stdout);
  const inside = { cwd: join(work, "a") };
  assert.equal(run(patch, ["file"], { ...inside, input: unified.stdout }).status, 2);
  assert.equal(await readFile(join(work, "a/file"), "utf8"), "one\ntwo\n");
  assert.equal(run(patch, ["-p1", "-i", "../change.patch"], inside).status, 0);
  assert.equal(await readFile(join(work, "a/file"), "utf8"), "one\nTWO\n");
  assert.equal(run(patch, ["-p1"], { ...inside, input: unified.stdout }).status, 1);
});

test("file recognizes UTF-8 text and stat reports modes or rejects unknown formats", async () => {
  const file = await buildInline("file");
  const samples = {
    "ascii.txt": ["plain\n", "ASCII text"],
    "utf8.txt": ["grüße ✓\n", "UTF-8 Unicode text"],
    "split.txt": ["a".repeat(511) + "é", "UTF-8 Unicode text"],
    "binary.bin": [Buffer.from([0x66, 0xff, 0x00]), "data"],
  };
  for (const [name, [contents, expected]] of Object.entries(samples)) {
    await writeFile(join(scratch, name), contents);
    assert.equal(run(file, ["-b", name]).stdout, `${expected}\n`, name);
  }
  const stat = await buildInline("stat");
  await chmod(join(scratch, "ascii.txt"), 0o640);
  assert.equal(run(stat, ["-c", "%a %A %s", "ascii.txt"]).stdout, "640 -rw-r----- 6\n");
  const unknown = run(stat, ["-c", "%a %Q", "ascii.txt"]);
  assert.equal(unknown.status, 2);
  assert.equal(unknown.stdout, "");
});
