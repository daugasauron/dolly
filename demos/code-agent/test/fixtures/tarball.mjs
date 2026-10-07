// The pinned Claude Code tarball for the tests, obtained at test time from
// the npm registry into an untracked cache and checked against npm's
// integrity; it is never committed. A test that cannot obtain it fails.
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export const registry = "https://registry.npmjs.org";
export const tarballPath = "/@anthropic-ai/claude-code/-/claude-code-2.1.112.tgz";
const integrity = "sha512-9FUgJ0EOvILyhIqxFKNVliebiUjL68dwpEW3eGSSe0vkVDJ1c5qMDNWc22gW3zkD7zRAqtfQPSGv0t4vMM2DPA==";
const cache = resolve(import.meta.dirname, "../../../../build/claude-code-cache");
const file = resolve(cache, "claude-code-2.1.112.tgz");

const matches = bytes => `sha512-${createHash("sha512").update(bytes).digest("base64")}` === integrity;

// Returns the cached file's path, downloading it first when it is missing or wrong.
export async function claudeCodeTarball() {
  const cached = await readFile(file).catch(() => null);
  if (cached && matches(cached)) return file;
  const response = await fetch(registry + tarballPath);
  if (!response.ok) throw new Error(`${registry}${tarballPath}: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!matches(bytes)) throw new Error(`${registry}${tarballPath} does not match ${integrity}`);
  await mkdir(cache, { recursive: true });
  await writeFile(`${file}.part`, bytes);
  await rename(`${file}.part`, file);
  return file;
}
