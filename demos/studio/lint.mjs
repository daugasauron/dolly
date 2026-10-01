import { readFileSync } from "node:fs";
import { inspectDollyfile } from "./src/dollyfile-view.mjs";

const args = process.argv.slice(2);
const stdin = args[0] === "--stdin";
const label = stdin ? args[1] ?? "Dollyfile" : args[0];
if (!label || args.length > (stdin ? 2 : 1)) {
  console.error("usage: dollyfile-lint FILE | dollyfile-lint --stdin [NAME]");
  process.exit(2);
}
try {
  inspectDollyfile(readFileSync(stdin ? 0 : label, "utf8"), label);
} catch (error) {
  const message = String(error.message);
  console.error(message.startsWith(label + ":")
    ? /:\d+: /.test(message) ? message : message.replace(label + ":", () => label + ":1:")
    : `${label}:1: ${message}`);
  process.exit(1);
}
