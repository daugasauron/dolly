import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { browserTest, runSteps } from "./browser.mjs";

// The packages a step's script installs.
export const installs = script => [...script.matchAll(/amy install ([a-z0-9.-]+)/g)].map(([, name]) => name);

// Each package of a case file in a page of its own, four at once: a `fresh`
// step begins a new default session, which installs the package alone (then
// cc and pkgconf where its use compiles), so that a package missing what it
// needs fails. after[NAME](session, name) is what the page then does in the
// session that installs NAME, given the browser's name. Every failing session is reported.
export async function eachSession(open, { directory, steps }, after = {}, browser = "") {
  const sessions = steps.reduce((groups, step) => (step.fresh ? groups.push([step]) : groups.at(-1).push(step), groups), []);
  const failures = [];
  const run = async () => {
    for (let steps; (steps = sessions.shift());) {
      const name = installs(steps.map(({ script }) => script).join("\n"))[0];
      const session = await open();
      try {
        await runSteps(session.submit, { directory, steps });
        await after[name]?.(session, browser);
      } catch (error) {
        console.error(`${name}: ${error.message}`);
        failures.push(name);
      } finally {
        await session.page.context().close();
      }
    }
  };
  await Promise.all([1, 2, 3, 4].map(run));
  assert.deepEqual(failures, []);
}

// The terminal has no line discipline: a program that reads lines there edits
// them itself. COMMAND, then for each of STEPS what the screen shows and what is
// typed (\n is Enter, \x1b Escape, \x11 and \x13 Ctrl+Q and Ctrl+S), and what the
// session then holds.
export const typing = ([command, steps, holds = "true"]) => async session => {
  const running = session.submit(command);
  await session.page.locator("#keyboard").focus();
  for (const [shown, keys] of steps) {
    await session.waitForText(shown);
    for (const [index, text] of keys.split("\x1b").entries()) {
      if (index) await session.page.keyboard.press("Escape");
      for (const [control, part] of text.split(/([\x11\x13])/).entries()) {
        if (control % 2) await session.page.keyboard.press(`Control+${String.fromCharCode(part.charCodeAt(0) + 96)}`);
        else await session.page.keyboard.type(part);
      }
    }
  }
  assert.equal(await running, 0, `${command}\n${await session.text()}`);
  assert.equal(await session.submit(holds), 0, holds);
};

// A demo's packages (its test/amy-cases.json, at CASES), each installed alone
// into a session of the file's image and used.
export async function amyCases(cases, after = {}) {
  const file = JSON.parse(await readFile(cases, "utf8"));
  const demo = new URL("..", new URL(".", cases)).pathname.split("/").filter(Boolean).at(-1);
  await browserTest(`amy ${demo}`, { image: file.image, timeout: 900_000 }, ({ name, open }) =>
    eachSession(open, file, after, name));
}
