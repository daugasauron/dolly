import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { inspectDollyfile } from "../../src/dollyfile-view.mjs";
import { shellQuote } from "./slop-cases.mjs";

const scratch = "/workspace/dollyfile-parser-test";
const outputs = "/usr/share/dollyfile-parser-test";
const digest = value => createHash("sha256").update(value).digest("hex");
// Recipes the in-sandbox executor runs against the live filesystem; sources
// come from the test server's origin, which serves `recipes` by path.
export function dollyfileCases(origin) {
  const recipes = new Map();
  const cases = [
    { name: "quoted", rows: `SLOP "/bin/slop" -c 'printf %s "two words" > ${outputs}/quoted'
SLOP CWD "${scratch}/space dir" "slop" -c 'test "$PWD" = "$(pwd)" && pwd > ${outputs}/cwd'
EXPORTS ENV DOLLY_TEST_VALUE "APPEND literal"
SLOP slop -c 'test "$DOLLY_TEST_VALUE" = "APPEND literal"'
FILE ${outputs}/quoted
FILE ${outputs}/cwd`,
      check: `test "$(cat ${outputs}/quoted)" = 'two words' && test "$(cat ${outputs}/cwd)" = '${scratch}/space dir'` },
    { name: "run", rows: `RUN CWD ${scratch} /bin/slop -c 'pwd > ${outputs}/run; printf %s "$1" >> ${outputs}/run' literal 'a b'
FILE ${outputs}/run`,
      check: `test "$(sed -n 1p ${outputs}/run)" = '${scratch}' && test "$(sed -n 2p ${outputs}/run)" = 'a b'` },
    { name: "order", rows: `SOURCE ${origin}/fixture/parser-before.txt ${digest("before")} ${outputs}/order
SLOP slop -c 'test "$(cat ${outputs}/order)" = before'
SOURCE ${origin}/fixture/parser-after.txt ${digest("after")} ${outputs}/order
SLOP slop -c 'test "$(cat ${outputs}/order)" = after'
FILE ${outputs}/order`, check: `test "$(cat ${outputs}/order)" = after` },
    // Exports are captured when the recipe finishes, so an export may precede its files.
    { name: "deferred", rows: `EXPORTS FOLDER all ${outputs}/captured
SLOP mkdir -p ${outputs}/captured
SLOP printf a > ${outputs}/captured/a
SLOP printf b > ${outputs}/captured/b`,
      check: `grep -q ${outputs}/captured/a /etc/dolly/image.manifest && grep -q ${outputs}/captured/b /etc/dolly/image.manifest` },
    { name: "replaced", rows: `EXPORTS FILE value ${outputs}/owned
FILE ${outputs}/owned
    first
FILE ${outputs}/owned
    overwritten`, check: `test "$(cat ${outputs}/owned)" = overwritten` },
    { name: "environment", rows: `EXPORTS ENV DOLLY_V3_ENV first
EXPORTS ENV DOLLY_V3_ENV APPEND second
SLOP test "$DOLLY_V3_ENV" = first:second` },
    { name: "deletion", rows: `FILE ${outputs}/deleted
    old
SLOP rm ${outputs}/deleted`,
      check: `test ! -f ${outputs}/deleted && ! grep -q ${outputs}/deleted /etc/dolly/image.manifest` },
    // Sealing refuses an ENTRY the image would open without: the program
    // /bin/foreground starts, and an argument naming a file that is not kept.
    { name: "entry-program", rows: `EXPORTS TOOL foreground\nSLOP cp /bin/echo ${outputs}/greet`,
      entry: `/bin/foreground -i ${outputs}/greet hello`, error: `add FILE ${outputs}/greet` },
    { name: "entry-argument", rows: `SLOP printf true > ${outputs}/start.slop`,
      entry: `/bin/slop ${outputs}/start.slop`, error: `add FILE ${outputs}/start.slop` },
    { name: "entry-kept", rows: `EXPORTS TOOL foreground\nSLOP cp /bin/echo ${outputs}/greet\nFILE ${outputs}/greet`,
      entry: `/bin/foreground -i ${outputs}/greet ${outputs}/absent /workspace` },
    { name: "library", rows: `EXPORTS LIB bad ${outputs}/directory`, error: "missing exported LIB" },
    { name: "folder", rows: `EXPORTS FOLDER bad ${outputs}/quoted`, error: "missing exported FOLDER" },
    { name: "bare-folder", rows: `FOLDER ${outputs}/quoted`, error: "FOLDER failed" },
    { name: "bare-file", rows: `FILE ${outputs}/directory`, error: "FILE failed" },
    { name: "required", rows: "REQUIRES TOOL absent-tool", error: "required TOOL absent-tool is unavailable" },
    // Sealing refuses a retained executable stamped with an undeclared module.
    { name: "undeclared-host", rows: `SLOP cp /usr/bin/curl ${outputs}/stamped\nFILE ${outputs}/stamped`,
      error: "add REQUIRES HOST http@0" },
  ];
  for (const item of cases) {
    const source = `DOLLY 6\nAPPLICATION parser-test\nEXPORTS TOOL slop\n${item.rows}\nENTRY ${item.entry ?? '/bin/slop ""'}\n`;
    inspectDollyfile(source);
    recipes.set(`/fixture/parser-${item.name}.Dollyfile`, source);
  }
  recipes.set("/fixture/parser-before.txt", "before");
  recipes.set("/fixture/parser-after.txt", "after");
  cases.push({ name: "nul", error: "could not load recipe", check: `test ! -e ${outputs}/nul` });
  recipes.set("/fixture/parser-nul.Dollyfile",
    `DOLLY 6\nAPPLICATION parser-test\nSLOP printf changed > ${outputs}/nul\n# comment\0ignored\nENTRY /bin/slop\n`);
  return { recipes, run: submit => runDollyfileCases(submit, origin, cases) };
}

async function runDollyfileCases(submit, origin, cases) {
  const run = async command => assert.equal(await submit(command), 0, command);
  await run(`mkdir -p '${scratch}/space dir' ${outputs}/directory`);
  try {
    for (const name of ["dollyfile.c", "fs-record.h", "sha256.h"]) {
      await run(`curl -fsS ${origin}/fixture/parser-${name} -o ${scratch}/${name}`);
    }
    await run(`cc -O0 ${scratch}/dollyfile.c -o ${scratch}/dollyfile`);
    for (const item of cases) {
      await run(`curl -fsS ${origin}/fixture/parser-${item.name}.Dollyfile -o ${scratch}/Dollyfile`);
      const status = await submit(`${scratch}/dollyfile FILE:${scratch}/Dollyfile 2> ${scratch}/error`);
      if ((status === 0) !== !item.error) await submit(`cat ${scratch}/error`);
      assert.equal(status === 0, !item.error, `Dollyfile ${item.name}: status ${status}`);
      if (item.error) await run(`grep -q ${shellQuote(item.error)} ${scratch}/error`);
      if (item.check) await run(item.check);
    }
  } finally {
    await submit(`cd /workspace; rm -rf ${scratch} ${outputs}`);
  }
}
