import { spawn } from "node:child_process";

// Runs test files as `node FILE ARGUMENT...`: `limit` of them side by side,
// then those of `alone` one after another. What a file writes, on both
// streams in the order it wrote, is printed whole when the file ends.
// Resolves to each file's exit status, in the order of `files`.
export async function runSideBySide(files, { limit, alone = [], arguments: passed = [], env = process.env }) {
  const statuses = new Map();
  const run = file => new Promise(resolve => {
    const output = [];
    // The shell gives the file one pipe for both of its streams.
    const child = spawn("sh", ["-c", 'exec "$@" 2>&1', "sh", process.execPath, file, ...passed],
      { env, stdio: ["ignore", "pipe", "inherit"] });
    child.stdout.on("data", chunk => output.push(chunk));
    child.once("close", status => {
      process.stdout.write(Buffer.concat(output));
      statuses.set(file, status);
      resolve();
    });
  });
  const together = files.filter(file => !alone.includes(file));
  await Promise.all(Array.from({ length: limit }, async () => { while (together.length) await run(together.shift()); }));
  for (const file of files.filter(file => alone.includes(file))) await run(file);
  return files.map(file => statuses.get(file));
}
