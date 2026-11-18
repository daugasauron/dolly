// This demo's packages, each installed alone into a default session and used (amy-cases.json).
import { amyCases, typing } from "../../../test/amy-sessions.mjs";

// The terminal has no line discipline: a program that reads lines there edits
// them itself. For each package, the command, what the screen shows and what
// is then typed (\n is Enter, \x1b Escape), and what the session then holds.
const typed = {
  sqlite: ["sqlite3 /tmp/amy.db", [[/amy\.db->\s*$/, "select count(*) * 14 from word;\n"], [/\D42\D[^>]*amy\.db->\s*$/, ".quit\n"]]],
  bc: ["dc", [[/>>>\s*$/, "6 7 * p\n"], [/\n42\n>>>\s*$/, "q\n"]]],
  // Its status line is up; Ctrl+S saves and Ctrl+Q quits.
  dte: ["dte /tmp/amy-dte", [[/INS +UTF-8/, "one\ntwo\x13\x11"]], "test \"$(tr '\\n' ' ' < /tmp/amy-dte)\" = 'one two '"],
};
await amyCases(new URL("./amy-cases.json", import.meta.url),
  Object.fromEntries(Object.entries(typed).map(([name, use]) => [name, typing(use)])));
