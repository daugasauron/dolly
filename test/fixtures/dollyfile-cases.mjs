import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { inspectDollyfile } from "../../src/dollyfile-view.mjs";
import { shellQuote } from "./slop-cases.mjs";

const scratch = "/workspace/dollyfile-parser-test";
const outputs = "/usr/share/dollyfile-parser-test";
const digest = value => createHash("sha256").update(value).digest("hex");
export const parserRecipes = new Map();
function module(name, rows) {
  const source = `DOLLY 2\nMODULE ${name}\n${rows}\n`;
  inspectDollyfile(source);
  const path = `/modules/${name}.dm`;
  parserRecipes.set(path, source);
  return `USE HOST ${path} ${digest(source)}\n`;
}
const seed = module("parser-seed", "EXPORTS TOOL slop");
const quoted = module("parser-quoted", `REQUIRES TOOL slop
SLOP "/bin/slop" -c 'printf %s "two words" > ${outputs}/quoted'
SLOP CWD "${scratch}/space dir" "slop" -c 'test "$PWD" = "$(pwd)" && pwd > ${outputs}/cwd'
EXPORTS ENV DOLLY_TEST_VALUE "APPEND literal"
SLOP slop -c 'test "$DOLLY_TEST_VALUE" = "APPEND literal"'
FILE ${outputs}/quoted
FILE ${outputs}/cwd`);
const order = module("parser-order", `REQUIRES TOOL slop
SOURCE HOST /fixture/parser-before.txt ${outputs}/order ${digest("before")}
SLOP slop -c 'test "$(cat ${outputs}/order)" = before'
SOURCE HOST /fixture/parser-after.txt ${outputs}/order ${digest("after")}
SLOP slop -c 'test "$(cat ${outputs}/order)" = after'
FILE ${outputs}/order`);
const first = module("parser-first", `FILE ${outputs}/owned
    first
EXPORTS FILE first ${outputs}/owned`);
const second = module("parser-second", `FILE ${outputs}/owned
    overwritten
EXPORTS FILE second ${outputs}/owned`);
const badLibrary = module("parser-library", `EXPORTS LIB bad ${outputs}/directory`);
const badFolder = module("parser-folder", `EXPORTS FOLDER bad ${outputs}/quoted`);
const bareFolder = module("parser-bare-folder", `FOLDER ${outputs}/quoted`);
const bareFile = module("parser-bare-file", `FILE ${outputs}/directory`);
const cases = [
  { name: "quoted", uses: quoted, check: `test "$(cat ${outputs}/quoted)" = 'two words' && test "$(cat ${outputs}/cwd)" = '${scratch}/space dir'` },
  { name: "order", uses: order, check: `test "$(cat ${outputs}/order)" = after` },
  { name: "duplicate", uses: first + second, error: "already written by", check: `test "$(cat ${outputs}/owned)" = first` },
  { name: "library", uses: badLibrary, error: "missing exported LIB" },
  { name: "folder", uses: badFolder, error: "missing exported FOLDER" },
  { name: "bare-folder", uses: bareFolder, error: "invalid FOLDER declaration" },
  { name: "bare-file", uses: bareFile, error: "invalid FILE declaration" },
];
for (const item of cases) {
  const source = `DOLLY 2\nIMAGE parser-test\n${seed}${item.uses}ENTRY /bin/slop ""\n`;
  inspectDollyfile(source);
  parserRecipes.set(`/fixture/parser-${item.name}.Dollyfile`, source);
}
parserRecipes.set("/fixture/parser-before.txt", "before");
parserRecipes.set("/fixture/parser-after.txt", "after");

export async function runDollyfileCases(submit, origin) {
  const run = async command => assert.equal(await submit(command), 0, command);
  await run(`mkdir -p '${scratch}/space dir' ${outputs}/directory`);
  try {
    for (const name of ["dollyfile.c", "fs-record.h", "sha256.h"]) {
      await run(`curl -fsS ${origin}/fixture/parser-${name} -o ${scratch}/${name}`);
    }
    await run(`cc -O0 ${scratch}/dollyfile.c -o ${scratch}/dollyfile`);
    for (const item of cases) {
      await run(`curl -fsS ${origin}/fixture/parser-${item.name}.Dollyfile -o ${scratch}/Dollyfile`);
      const status = await submit(`${scratch}/dollyfile FILE:${scratch}/Dollyfile ${origin} 2> ${scratch}/error`);
      if ((status === 0) !== !item.error) await submit(`cat ${scratch}/error`);
      assert.equal(status === 0, !item.error, `Dollyfile ${item.name}: status ${status}`);
      if (item.error) await run(`grep -q ${shellQuote(item.error)} ${scratch}/error`);
      if (item.check) await run(item.check);
    }
  } finally {
    await submit(`cd /workspace; rm -rf ${scratch} ${outputs}`);
  }
}
