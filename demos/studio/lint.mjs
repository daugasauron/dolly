import { inspectDollyfile } from "./parser.mjs";

const args = globalThis.scriptArgs;
const stdin = args[0] === "--stdin";
const label = stdin ? args[1] ?? "Dollyfile" : args[0];
if (!label || args.length > (stdin ? 2 : 1)) {
  console.error("usage: dollyfile-lint FILE | dollyfile-lint --stdin [NAME]");
  Dolly.exit(2);
}
try {
  inspectDollyfile(Dolly.readFile(stdin ? "-" : label), label);
} catch (error) {
  const message = String(error.message);
  console.error(message.startsWith(label + ":")
    ? /:\d+: /.test(message) ? message : message.replace(label + ":", () => label + ":1:")
    : `${label}:1: ${message}`);
  Dolly.exit(1);
}
