import { readFileSync } from "node:fs";
import { inspectDollyfile } from "./parser.mjs";

try {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0].startsWith("-")) {
    console.log("usage: dollyfile-build DOLLYFILE");
    process.exit(args[0] === "--help" ? 0 : 2);
  }
  let source;
  try { source = readFileSync(args[0], "utf8"); }
  catch (error) { throw new Error(`Cannot read recipe ${JSON.stringify(args[0])}: ${error.message}`); }
  if (inspectDollyfile(source).kind !== "image") throw new Error("Build an IMAGE recipe, not a MODULE");
  const response = await fetch("https://build.dolly.invalid/v1/builds", {
    method: "POST", body: source,
  });
  if (!response.body) throw new Error(`Build service returned HTTP ${response.status} without a body`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  let pending = "", completed = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      let newline;
      while ((newline = pending.indexOf("\n")) !== -1) {
        const event = JSON.parse(pending.slice(0, newline));
        pending = pending.slice(newline + 1);
        if (event.type === "error") throw new Error(event.message);
        if (event.type === "log") process.stdout.write(event.text);
        else if (event.type === "status") console.log(event.text);
        else if (event.type === "result") {
          completed = true;
          console.log(`Built ${event.image} (${event.sha256}). This session is unchanged; commands belong to the new image.`);
          console.log("Put tests in the recipe as SLOP lines. Use Open image in the browser to run it.");
        } else if (event.type !== "progress") throw new Error("Invalid build service event");
      }
      if (done) break;
    }
    if (pending || !completed || !response.ok) throw new Error(`Build did not complete (HTTP ${response.status})`);
  } finally { await reader.cancel(); reader.releaseLock(); }
} catch (error) {
  console.error(`dollyfile-build: ${error.message}`);
  process.exitCode = 1;
}
