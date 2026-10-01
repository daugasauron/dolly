import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { inspectDollyfile } from "../src/dollyfile-view.mjs";
import { loadRecipeGraph } from "../src/dollyfile-graph.mjs";
import { resolvePins, syntaxCases } from "./fixtures/dollyfile-syntax.mjs";
import { stagedIncludeDirectory } from "../scripts/host-modules.mjs";
import { canonicalPath } from "../src/static-asset.mjs";
const includeDirectory = await stagedIncludeDirectory();

const project = resolve(import.meta.dirname, "..");

async function withParser(body) {
  const scratch = await mkdtemp(resolve(tmpdir(), "dolly-parser-"));
  try {
    const program = resolve(scratch, "parser");
    execFileSync("cc", ["-std=c11", "-O1", "-I", includeDirectory,
      resolve(project, "test/fixtures/dollyfile-parser.c"), "-o", program]);
    await body(scratch, (...args) => spawnSync(program, args, { encoding: "utf8" }));
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

// Writes one case and checks it with /bin/dollyfile's parser and the JavaScript graph.
async function checkBoth(scratch, run, files, name = "case") {
  const directory = resolve(scratch, name);
  await rm(directory, { recursive: true, force: true });
  for (const [path, text] of Object.entries(resolvePins(files))) {
    await mkdir(dirname(resolve(directory, path.slice(1))), { recursive: true });
    await writeFile(resolve(directory, path.slice(1)), text);
  }
  const native = run("check", directory);
  let javascript = null;
  try {
    await loadRecipeGraph(url => readFile(resolve(directory, url === "Dollyfile" ? url : canonicalPath(url).slice(1))), "Dollyfile");
  } catch (error) { javascript = error; }
  return { native, nativeAccepted: native.status === 0, javascriptAccepted: javascript === null, javascript };
}

test("the C executor and the JavaScript recipe graph accept exactly the same recipes", async () => {
  await withParser(async (scratch, run) => {
    for (const [expected, files] of syntaxCases) {
      const label = JSON.stringify(files).slice(0, 300);
      const result = await checkBoth(scratch, run, files);
      assert.equal(result.nativeAccepted, expected, `C: ${label}\n${result.native.stderr}`);
      assert.equal(result.javascriptAccepted, expected, `JS: ${label}\n${result.javascript?.message}`);
    }
  });
});

test("the C and JavaScript parsers decode the same words and values", async () => {
  await withParser(async (scratch, run) => {
    const prefix = "DOLLY 5\nMODULE probe\n";
    for (const raw of ['cc "" "a b" c\\ d', "'cc' 'a\\b' \"東京\"", "cc input name.c",
      '"a\\$b" "a\\xb" "a\\\\b" "a\\"b"', "a\\#b 'a#b' \"#\""]) {
      const expected = inspectDollyfile(prefix + "SLOP " + raw + "\n").slops[0].command;
      assert.deepEqual(run("words", raw).stdout.split("\0").slice(0, -1), expected, raw);
    }
    for (const url of ["https://daugasauron.com/Dollyfile", "http://127.0.0.1:8080/Dollyfile-pi",
      "https://daugasauron.com/a/Dollyfile-pi-local", "https://daugasauron.com/Dollyfile-",
      "https://daugasauron.com/Dollyfile-/bad", `https://daugasauron.com/Dollyfile-${"a".repeat(32)}`,
      `https://daugasauron.com/Dollyfile-${"a".repeat(33)}`, "https://daugasauron.com/Dollyfile?x=1",
      "https://Dollyfile", "https:///Dollyfile", "/Dollyfile", "ftp://daugasauron.com/Dollyfile"]) {
      let accepted = true;
      try { inspectDollyfile(`DOLLY 5\nIMAGE check\nFROM ${url} ${"0".repeat(64)}\nENTRY /bin/slop\n`); }
      catch { accepted = false; }
      assert.equal(run("image-url", url).status === 0, accepted, url);
    }
    const image = rows => `DOLLY 5\nIMAGE default\n${rows}ENTRY /bin/slop\n`;
    const values = async (files) => (await checkBoth(scratch, run, files)).native.stdout;
    assert.match(await values({ "/Dollyfile": image('EXPORTS ENV DOLLY_TEST_VALUE "APPEND literal"\n') }),
      /ENV-VALUE:APPEND literal\n/);
    assert.match(await values({ "/Dollyfile": image('EXPORTS ENV DOLLY_TEST_VALUE "a\\nb"\n') }), /ENV-VALUE:a\\nb\n/);
    const child = "DOLLY 5\nMODULE child\nEXPORTS ENV DOLLY_TEST_VALUE new\n";
    assert.equal(await values({
      "/Dollyfile": image("EXPORTS ENV DOLLY_TEST_VALUE old\nUSE https://daugasauron.com/modules/child.dm PIN(/modules/child.dm)\n"),
      "/modules/child.dm": child,
    }), "ENV-VALUE:new\nENV-EXPORT:new\n");
    const nul = await checkBoth(scratch, run, { "/Dollyfile": image("EXPORTS ENV DOLLY_TEST_VALUE changed\n# \0\n") });
    assert.equal(nul.native.stdout, "", "NUL bytes are rejected before executing any declaration");
  });
});

test("the C executor keeps paths, kinds, commands and recipe names exact", async () => {
  await withParser(async (scratch, run) => {
    for (const path of ["/", "/usr", "/usr/bin", "/usr/bin/tool", "/explicit"]) {
      assert.equal(run("artifact-path", path).status, 0, path);
    }
    for (const path of ["/u", "/usr/bin/tools", "/absent"]) assert.equal(run("artifact-path", path).status, 1, path);
    const directory = resolve(scratch, "space dir");
    await mkdir(directory);
    for (const command of ['"cc" "a b.c"', "cc 'a b.c' ; cc second.c"]) {
      const result = spawnSync(resolve(scratch, "parser"), ["slop", `CWD "${directory}" ${command}`],
        { encoding: "utf8", input: "caller input must not reach recipe commands" });
      assert.equal(result.status, 0, result.stderr);
      assert.ok(result.stdout.includes(`RAW-CWD:${directory}\nRAW-COMMAND:${command}\n`));
    }
    const file = resolve(scratch, "file");
    await writeFile(file, "data");
    await symlink("file", resolve(scratch, "link"));
    for (const type of ["FILE", "LIB", "HEADER", "FOLDER"]) {
      assert.equal(run("kind", type, file).status === 0, type !== "FOLDER", type);
      assert.equal(run("kind", type, directory).status === 0, ["FOLDER", "HEADER"].includes(type), type);
      assert.equal(run("kind", type, resolve(scratch, "link")).status === 0, type !== "FOLDER", type);
    }
    assert.equal(run("recipe-names", "custom", "FILE:/etc/dolly/upload.Dollyfile").status, 0);
    assert.equal(run("recipe-names", "base", "https://daugasauron.com/Dollyfile-base").status, 0,
      "the same recipe is recorded once");
    assert.equal(run("recipe-names", "base", "FILE:/etc/dolly/upload.Dollyfile").status, 1,
      "a custom image cannot take its base's retained recipe name");
    assert.equal(run("artifact-reuse", "unused").status, 0,
      "decoded COPY input is reused only until a different input or non-COPY declaration");
  });
});
