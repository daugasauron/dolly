import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { chmod, lstat, mkdir, mkdtemp, open, readFile, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { stagedIncludeDirectory } from "../scripts/host-modules.mjs";
const includeDirectory = await stagedIncludeDirectory();

const project = resolve(import.meta.dirname, "..");
const scratch = await mkdtemp(join(tmpdir(), "dolly-commands-"));
test.after(() => rm(scratch, { recursive: true, force: true }));

function build(name) {
  const output = join(scratch, name);
  execFileSync("cc", ["-std=c17", "-Wall", "-Wextra", "-Werror", `-I${includeDirectory}`, `src/commands/${name}.c`,
    "test/fixtures/native-spawn.c", "-o", output, "-lm"], { cwd: project, stdio: "pipe" });
  return output;
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
  // POSIX's time and size primaries: a stamp file, whole days, 512-byte blocks.
  await writeFile(join(tree, "file-0"), "x".repeat(1000));
  await utimes(join(tree, "file-1"), 1000, 1000);
  await utimes(join(tree, "file-2"), 2000, 2000);
  const found = (...expression) => run(find, [tree, ...expression]).stdout.trim().split("\n").map(path => path.slice(tree.length + 1)).sort();
  assert.deepEqual(found("-newer", join(tree, "file-1"), "-name", "file-[12]"), ["file-2"]);
  assert.deepEqual(found("-mtime", "+30", "-name", "file-*"), ["file-1", "file-2"]);
  assert.deepEqual(found("-size", "2"), ["file-0"]);
  assert.deepEqual(found("-size", "+999c", "-size", "-1001c"), ["file-0"]);
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
  // POSIX's -L: a command per line, a trailing blank continues the line; -E ends the input.
  assert.equal(run(xargs, ["-L", "1", "echo"], { input: "a b\nc \nd\n\ne\n" }).stdout, "a b\nc d\ne\n");
  assert.equal(run(xargs, ["-E", "stop", "echo"], { input: "a stop b\n" }).stdout, "a\n");
  // -P runs commands at once: each waits until all three have started.
  const together = run(xargs, ["-P", "3", "-n", "1", "sh", "-c",
    ': > "started-$1"; until [ "$(ls started-* | wc -l)" -eq 3 ]; do sleep 0.01; done; test "$1" != b', "sh"],
    { input: "a b c", timeout: 10000 });
  assert.equal(together.status, 123, together.stderr);
});

test("timeout 0 disables the deadline", () => {
  const timeout = build("timeout");
  assert.equal(run(timeout, ["0", "sleep", "0.2"]).status, 0);
  assert.equal(run(timeout, ["0.05", "sleep", "5"]).status, 124);
});

test("Dolly's own core tools keep their no-permission and finite semantics", async () => {
  const testTool = build("test"), bracket = build("bracket");
  const status = (program, args) => run(program, args).status;
  assert.equal(status(testTool, ["-x", "."]), 0, "a directory can be searched");
  assert.equal(status(testTool, ["-x", testTool]), 0);
  assert.equal(status(bracket, ["(", "-n", "a", "-a", "-z", "", ")", "-o", "!", "-d", ".", "]"]), 0);
  assert.equal(status(bracket, ["!", "(", "a", "=", "a", ")", "-a", "-d", ".", "]"]), 1);
  assert.equal(status(bracket, ["-n", "a"]), 2);
  // Up to four arguments POSIX decides by their number, so an operand that
  // looks like an operator stays an operand, as in option loops: [ "$1" = -o ].
  for (const [args, expected] of [[["-n", "-o"], 0], [["-z", "-a"], 1], [["x", "=", "-a"], 1], [["!", "=", "x"], 1],
    [["x", "=", "-o", "-o", "y", "=", "y"], 0], [["-c", "/dev/null"], 0], [["-t", "0"], 1], [["b", ">", "a"], 0]]) {
    assert.equal(status(testTool, args), expected, args.join(" "));
  }
  assert.equal(run(build("cat"), ["-n"], { input: "a\nb\n" }).stdout, "     1\ta\n     2\tb\n");
  assert.equal(run(build("cat"), ["-u"], { input: "u" }).stdout, "u", "POSIX's one option");
  assert.equal(run(build("echo"), ["--"]).stdout, "--\n");
  assert.equal(run(build("echo"), ["--help"]).stdout, "--help\n");
  const ls = build("ls");
  assert.equal(status(ls, ["--color=never", "."]), 0);
  // The POSIX long format; a directory starts with its total, an empty one has nothing else.
  await mkdir(join(scratch, "listing/empty"), { recursive: true });
  await writeFile(join(scratch, "listing/file"), "twelve bytes");
  await symlink("file", join(scratch, "listing/link"));
  const columns = String.raw` +\d+ \d+ \d+ +\d+ [A-Z][a-z]{2} [ \d]\d \d\d:\d\d `;
  assert.match(run(ls, ["-l", "listing"]).stdout, new RegExp(`^total \\d+\nd[-rwx]{9}${columns}empty\n` +
    `-[-rwx]{9}${columns}file\nl[-rwx]{9}${columns}link -> file\n$`));
  assert.equal(run(ls, ["-l", "listing/empty"]).stdout, "total 0\n");
  assert.equal(run(ls, ["listing/file", "listing/link"]).stdout, "listing/file\nlisting/link\n");
  // Every configure asks for the working directory's serial number (ls -di .);
  // automake's sanity check: -t lists operands newest first, -L by what a link names.
  assert.match(run(ls, ["-di", "."]).stdout, /^[1-9]\d* \.\n$/);
  assert.equal(run(ls, ["-di", "."]).stdout, run(ls, ["-di", scratch]).stdout.replace(scratch, "."));
  await utimes(join(scratch, "listing/file"), 1000, 1000);
  await writeFile(join(scratch, "listing/newer"), "");
  assert.equal(run(ls, ["-t", "listing/file", "listing/newer"]).stdout, "listing/newer\nlisting/file\n");
  assert.equal(run(ls, ["-Lt", "listing/link", "listing/newer"]).stdout, "listing/newer\nlisting/link\n");
  assert.equal(run(ls, ["-rt", "listing/newer", "listing/file"]).stdout, "listing/file\nlisting/newer\n");
  await writeFile(join(scratch, "install-source"), "bytes");
  assert.equal(status(build("install"), ["-m", "755", "-o", "nobody", "-g", "nogroup",
    "install-source", "installed"]), 0);
  assert.equal(await readFile(join(scratch, "installed"), "utf8"), "bytes");
  await utimes(join(scratch, "install-source"), 1000, 2000);
  assert.equal(status(build("install"), ["-p", "install-source", "preserved"]), 0);
  assert.equal((await stat(join(scratch, "preserved"))).mtimeMs, 2000_000);
  // POSIX cp copies what a link operand names; -R copies links as links.
  const cp = build("cp");
  await symlink("install-source", join(scratch, "source-link"));
  assert.equal(status(cp, ["source-link", "copied-file"]), 0);
  assert.equal((await lstat(join(scratch, "copied-file"))).isFile(), true);
  assert.equal(status(cp, ["-R", "source-link", "copied-link"]), 0);
  assert.equal((await lstat(join(scratch, "copied-link"))).isSymbolicLink(), true);
  assert.equal(status(cp, ["-p", "install-source", "cp-preserved"]), 0);
  assert.equal((await stat(join(scratch, "cp-preserved"))).mtimeMs, 2000_000);
  // touch's POSIX options: a reference file, an ISO 8601 date, one of the two times.
  const touch = build("touch");
  assert.equal(status(touch, ["-r", "install-source", "touched"]), 0);
  assert.equal((await stat(join(scratch, "touched"))).mtimeMs, 2000_000);
  const accessed = (await stat(join(scratch, "touched"))).atimeMs;
  assert.equal(status(touch, ["-m", "-d", "1970-01-01T00:20:00Z", "touched"]), 0);
  const touched = await stat(join(scratch, "touched"));
  assert.deepEqual([touched.atimeMs, touched.mtimeMs], [accessed, 1200_000]);
  assert.equal(run(build("du"), ["-b", "install-source"]).stdout, "5\tinstall-source\n");
  assert.equal(run(build("rev"), [], { input: "aé✓b\n" }).stdout, "b✓éa\n");
});

// make 2>&1 | cat shows each line as Make prints it.
test("cat writes a pipe's bytes as they arrive", async () => {
  const cat = spawn(build("cat"), [], { stdio: ["pipe", "pipe", "inherit"] });
  cat.stdin.write("first\n");
  const first = await Promise.race([new Promise(resolve => cat.stdout.once("data", resolve)),
    new Promise(resolve => setTimeout(resolve, 5000, "nothing before the input ended"))]);
  cat.stdin.end();
  await new Promise(resolve => cat.once("exit", resolve));
  assert.equal(String(first), "first\n");
});

// A full disk (in Dolly, kernel memory) fails what writes to it.
test("commands whose output cannot be written fail", async () => {
  const full = await open("/dev/full", "w");
  try {
    for (const [name, args] of [["ls", ["."]], ["find", ["."]], ["du", ["."]], ["stat", ["."]], ["file", ["."]], ["pwd", []]]) {
      assert.equal(spawnSync(build(name), args, { cwd: scratch, stdio: ["ignore", full.fd, "ignore"] }).status, 1, name);
    }
  } finally { await full.close(); }
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
  const file = build("file");
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
  const stat = build("stat");
  await chmod(join(scratch, "ascii.txt"), 0o640);
  assert.equal(run(stat, ["-c", "%a %A %s", "ascii.txt"]).stdout, "640 -rw-r----- 6\n");
  const unknown = run(stat, ["-c", "%a %Q", "ascii.txt"]);
  assert.equal(unknown.status, 2);
  assert.equal(unknown.stdout, "");
});

test("Dolly's own commands answer --help with their usage and status 0; man reports a missing page", async () => {
  const core = ["cat", "cd", "clear", "cp", "file", "help", "ls", "man", "mkdir", "mv", "pwd", "rm", "stat", "touch"];
  const sources = ["command", "diff", "du", "env", "find", "hostname", "install", "nproc", "patch", "realpath", "rev",
    "time", "timeout", "tty", "xargs"];
  const programs = [...core.map(name => build(name)), ...sources.map(name => build(name))];
  for (const program of programs) {
    const help = run(program, ["--help"]);
    assert.equal(help.status, 0, program);
    assert.notEqual(help.stdout, "", program);
    assert.equal(help.stderr, "", program);
  }
  const man = programs[core.indexOf("man")];
  for (const wrong of [[], ["a", "b"], ["-k"], ["../etc/passwd"]]) {
    const result = run(man, wrong);
    assert.equal(result.status, 2, wrong.join(" "));
    assert.equal(result.stdout, "");
    assert.notEqual(result.stderr, "");
  }
  const missing = run(man, ["no-such-command"]);
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /no-such-command/);
  assert.equal(run(programs.at(-1), ["--no-such-option"]).status, 2);
});
