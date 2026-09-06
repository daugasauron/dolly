#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { discoverImageDefinitions } from "./image-definitions.mjs";
import { parseGeneratedConstant } from "./site-release.mjs";
import { sha256 } from "./snapshot-identity.mjs";
import { decodeSystemSnapshot } from "./system-snapshot-format.mjs";
import { formatWasmType, parseWasmInterface, readWasmInterface } from "./wasm-interface.mjs";
import { validateProcessInterface } from "../src/process-abi.mjs";

export function censusProcessImports(files, contract, digest) {
  const executables = [];
  for (const [path, bytes] of files) {
    if (bytes.length < 8 || bytes.subarray(0, 4).toString("hex") !== "0061736d") continue;
    const wasm = parseWasmInterface(bytes, path);
    if (!wasm.customSections.includes("dolly.process")) continue;
    validateProcessInterface(contract, wasm, digest);
    executables.push({
      path,
      imports: wasm.imports.filter(entry => entry.type.kind === "func")
        .map(entry => `${entry.module}.${entry.name} ${formatWasmType(entry.type)}`).sort(),
    });
  }
  if (!executables.length) throw new Error("sealed image contains no valid Dolly process executables");
  return executables.sort((left, right) => left.path.localeCompare(right.path));
}

async function main() {
  const project = resolve(import.meta.dirname, "..");
  const image = process.argv[2];
  const definitions = await discoverImageDefinitions(project);
  if (!definitions.some(definition => definition.image === image)) {
    throw new Error("usage: npm run census -- IMAGE");
  }
  const bytes = await readFile(resolve(project, `dist/dolly-${image}-system.snapshot`));
  const metadata = parseGeneratedConstant(
    await readFile(resolve(project, `dist/dolly-${image}-system-snapshot.mjs`), "utf8"), "DOLLY_SYSTEM_SNAPSHOT");
  const buildId = parseGeneratedConstant(
    await readFile(resolve(project, "dist/dolly-build-id.mjs"), "utf8"), "DOLLY_BUILD_ID");
  if (metadata.image !== image || metadata.buildId !== buildId ||
      metadata.byteLength !== bytes.length || metadata.sha256 !== sha256(bytes)) {
    throw new Error("snapshot does not match its sealed runtime metadata");
  }
  const contract = await readWasmInterface(resolve(project, "dist/dolly-process-0.wasm"));
  const digest = parseGeneratedConstant(
    await readFile(resolve(project, "dist/dolly-process-abi.mjs"), "utf8"), "DOLLY_PROCESS_ABI_DIGEST");
  const executables = censusProcessImports(decodeSystemSnapshot(bytes).files, contract, digest);
  const consumers = new Map();
  for (const executable of executables) for (const imported of executable.imports) {
    const paths = consumers.get(imported) ?? [];
    paths.push(executable.path);
    consumers.set(imported, paths);
  }
  const code = value => `\`${String(value).replaceAll("\`", "\\\`")}\``;
  const lines = [
    `# Dolly static process census: ${image}`, "",
    `Snapshot: ${code(metadata.sha256)}`, "",
    `Runtime build: ${code(buildId)}`, "",
    `${executables.length} validated process executables, ${consumers.size} distinct callable imports.`, "",
    "The process ABI multiplexes platform operations through one typed packet-call gate.",
    "Static imports do not identify which packet operations a program actually uses.",
    "Private memory is omitted; resident plugins and process-local DSOs are not executables.", "",
    "## Callable import to executables", "",
    "| Typed import | Executables |", "| --- | --- |",
    ...[...consumers].sort(([left], [right]) => left.localeCompare(right))
      .map(([imported, paths]) => `| ${code(imported)} | ${paths.map(code).join(", ")} |`),
    "", "## Executable to callable imports", "",
    "| Executable | Callable imports |", "| --- | ---: |",
    ...executables.map(executable => `| ${code(executable.path)} | ${executable.imports.length} |`),
    "",
  ];
  await mkdir(resolve(project, "build"), { recursive: true });
  const output = resolve(project, `build/platform-census-${image}.md`);
  await writeFile(output, lines.join("\n"));
  console.log(`dolly: wrote ${image} census for ${executables.length} executables and ${consumers.size} callable imports to ${output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
