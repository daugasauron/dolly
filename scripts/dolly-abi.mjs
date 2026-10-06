#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import {
  appendCustomSection,
  formatWasmType,
  parseWasmInterface,
  providerSatisfiesImport,
  readWasmInterface,
  sameWasmType,
} from "./wasm-interface.mjs";
import { validateProcessInterface } from "../src/process-abi.mjs";
import { validateDsoInterface } from "../host/dso/interface.mjs";

const relocationGlobals = new Set(["__memory_base", "__table_base"]);
function importKey(entry) {
  return `${entry.module}.${entry.name}`;
}

function describeImport(entry) {
  return `${importKey(entry)} ${formatWasmType(entry.type)}`;
}

function describeExport(entry) {
  return `${entry.name} ${formatWasmType(entry.type)}`;
}

function interfaceMap(entries, key) {
  const result = new Map();
  for (const entry of entries) {
    const name = key(entry);
    if (result.has(name)) throw new Error(`duplicate interface entry ${name}`);
    result.set(name, entry);
  }
  return result;
}

export function contractDigest(contract) {
  const lines = [
    "dolly-contract-v1",
    ...contract.imports.map(describeImport).sort().map((line) => `import ${line}`),
    ...contract.exports.map(describeExport).sort().map((line) => `export ${line}`),
  ];
  const processLayouts = contract.customSectionData.filter(
    (section) => section.name === "dolly.process.layout",
  );
  if (processLayouts.length > 1) {
    throw new Error(`${contract.label}: multiple dolly.process.layout sections`);
  }
  if (processLayouts.length === 1) {
    if (processLayouts[0].data.length !== 32) {
      throw new Error(`${contract.label}: dolly.process.layout must be a SHA-256 digest`);
    }
    lines.push(`layout dolly.process ${hex(processLayouts[0].data)}`);
  }
  return new Uint8Array(createHash("sha256").update(`${lines.join("\n")}\n`).digest());
}

function equalBytes(left, right) {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function processMemoryImport(module) {
  return module.imports.find(
    (entry) => entry.module === "env" && entry.name === "memory" &&
      entry.type.kind === "memory",
  );
}

function encodeProcessMemoryRequirements(memory) {
  if (memory.type.maximum === null) {
    throw new Error(`${memory.module}.${memory.name}: shared process memory needs a maximum`);
  }
  const bytes = new Uint8Array(16);
  const view = new DataView(bytes.buffer);
  view.setBigUint64(0, memory.type.minimum, true);
  view.setBigUint64(8, memory.type.maximum, true);
  return bytes;
}

function hex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function requireNamedContractStamp(module, digest, sectionName) {
  const stamps = module.customSectionData.filter((section) => section.name === sectionName);
  if (stamps.length !== 1) {
    throw new Error(`${module.label}: expected exactly one ${sectionName} custom section`);
  }
  if (!equalBytes(stamps[0].data, digest)) {
    throw new Error(`${module.label}: ${sectionName} does not match the selected contract`);
  }
}

function requireContractStamp(module, digest) {
  requireNamedContractStamp(module, digest, "dolly.abi");
}

function assertType(actual, expected, context, options) {
  if (!providerSatisfiesImport(actual, expected, options)) {
    throw new Error(
      `${context}: expected ${formatWasmType(expected)}, got ${formatWasmType(actual)}`,
    );
  }
}

export async function inspect(path) {
  const module = await readWasmInterface(path);
  console.log(`${path}`);
  console.log("imports:");
  for (const entry of module.imports) console.log(`  ${describeImport(entry)}`);
  console.log("exports:");
  for (const entry of module.exports) console.log(`  ${describeExport(entry)}`);
  console.log(`custom sections: ${module.customSections.join(", ") || "none"}`);
  console.log(`normalized interface sha256: ${hex(contractDigest(module))}`);
  for (const section of module.customSectionData.filter((item) => item.name === "dolly.abi")) {
    console.log(`dolly.abi: ${hex(section.data)}`);
  }
}

export function validateBrowserImports(expectedImports, actualImports) {
  const allowed = interfaceMap(expectedImports, importKey);
  const actual = interfaceMap(actualImports, importKey);
  if (allowed.size !== actual.size) throw new Error("browser import count changed");
  for (const [name, expected] of allowed) {
    if (!actual.has(name) || !sameWasmType(actual.get(name).type, expected.type)) {
      throw new Error(`browser import is missing or changed type: ${name}`);
    }
  }
}

export async function validateBrowser(contractPath, runtimePath) {
  const contract = await readWasmInterface(contractPath);
  const runtime = await readWasmInterface(runtimePath);
  validateBrowserImports(contract.imports, runtime.imports);
  console.log(`dolly-abi: ${runtimePath} has exactly the typed imports in ${contractPath}`);
}

export async function validateRuntime(contractPath, runtimePath) {
  const contract = await readWasmInterface(contractPath);
  const digest = contractDigest(contract);
  const runtime = await readWasmInterface(runtimePath);
  const runtimeExports = interfaceMap(runtime.exports, (entry) => entry.name);
  const runtimeImports = interfaceMap(runtime.imports, importKey);
  const contractImports = interfaceMap(contract.imports, importKey);

  if (runtime.customSections.includes("dylink.0")) {
    throw new Error(`${runtimePath}: the kernel must be statically linked, not a dynamic main module`);
  }
  requireContractStamp(runtime, digest);
  for (const entry of runtime.imports.filter((item) => item.type.kind !== "func")) {
    if (importKey(entry) !== "env.memory") {
      throw new Error(`${runtimePath}: browser must not provide runtime tables or globals`);
    }
    const expected = contractImports.get("env.memory");
    assertType(entry.type, expected.type, `${runtimePath}: incompatible shared runtime memory`);
  }

  for (const entry of contractImports.values()) {
    if (relocationGlobals.has(entry.name)) continue;
    if (importKey(entry) === "env.memory") {
      if (!runtimeImports.has("env.memory")) {
        throw new Error(`${runtimePath}: runtime does not import its shared memory`);
      }
      continue;
    }

    const actual = runtimeExports.get(entry.name);
    if (!actual) throw new Error(`${runtimePath}: missing contract export ${entry.name}`);
    assertType(
      actual.type,
      entry.type,
      `${runtimePath}: incompatible contract export ${entry.name}`,
      { dynamicTable: entry.type.kind === "table" },
    );
  }

  console.log(`dolly-abi: ${runtimePath} implements ${contractPath}`);
}

export async function validateProcess(contractPath, processPaths) {
  const contract = await readWasmInterface(contractPath);
  const digest = hex(contractDigest(contract));
  for (const processPath of processPaths) {
    validateProcessInterface(contract, await readWasmInterface(processPath), digest);
    console.log(`dolly-abi: ${processPath} satisfies dolly-process-0`);
  }
}

export async function validateProcessDso(processContractPath, dsoContractPath, paths) {
  const digest = hex(contractDigest(await readWasmInterface(processContractPath)));
  const contract = await readWasmInterface(dsoContractPath);
  for (const path of paths) {
    validateDsoInterface(contract, await readWasmInterface(path), digest);
    console.log(`dolly-abi: ${path} satisfies dolly-dso-0 (provider symbols checked at load)`);
  }
}

export async function stampModules(contractPath, modulePaths) {
  const contract = await readWasmInterface(contractPath);
  const digest = contractDigest(contract);

  for (const modulePath of modulePaths) {
    const bytes = new Uint8Array(await readFile(modulePath));
    const module = parseWasmInterface(bytes, modulePath);
    const stamps = module.customSectionData.filter((section) => section.name === "dolly.abi");
    if (stamps.length > 1) throw new Error(`${modulePath}: multiple dolly.abi custom sections`);
    if (stamps.length === 1) {
      if (!equalBytes(stamps[0].data, digest)) {
        throw new Error(`${modulePath}: existing dolly.abi stamp belongs to another contract`);
      }
    } else {
      await writeFile(modulePath, appendCustomSection(bytes, "dolly.abi", digest));
    }
    console.log(`dolly-abi: stamped ${modulePath}`);
  }
}

export async function stampProcesses(contractPath, processPaths) {
  const contract = await readWasmInterface(contractPath);
  const digest = contractDigest(contract);

  for (const processPath of processPaths) {
    let bytes = new Uint8Array(await readFile(processPath));
    let process = parseWasmInterface(bytes, processPath);
    const memory = processMemoryImport(process);
    if (!memory) throw new Error(`${processPath}: missing env.memory import`);
    const stamps = process.customSectionData.filter(
      (section) => section.name === "dolly.process",
    );
    if (stamps.length > 1) {
      throw new Error(`${processPath}: multiple dolly.process custom sections`);
    }
    if (stamps.length === 1) {
      if (!equalBytes(stamps[0].data, digest)) {
        throw new Error(`${processPath}: existing dolly.process stamp belongs to another contract`);
      }
    } else {
      bytes = appendCustomSection(bytes, "dolly.process", digest);
    }
    const memorySections = process.customSectionData.filter(
      (section) => section.name === "dolly.process.memory",
    );
    const requirements = encodeProcessMemoryRequirements(memory);
    if (memorySections.length > 1) {
      throw new Error(`${processPath}: multiple dolly.process.memory custom sections`);
    }
    if (memorySections.length === 1) {
      if (!equalBytes(memorySections[0].data, requirements)) {
        throw new Error(
          `${processPath}: existing dolly.process.memory does not match its memory import`,
        );
      }
    } else {
      bytes = appendCustomSection(bytes, "dolly.process.memory", requirements);
    }
    await writeFile(processPath, bytes);
    console.log(`dolly-abi: stamped process ${processPath}`);
  }
}

// The exact source bytes, so any change to them changes executable identity.
export async function layoutDigest(sourcePaths) {
  const hash = createHash("sha256");
  for (const path of sourcePaths) hash.update(await readFile(path));
  return new Uint8Array(hash.digest());
}

export async function bindProcessLayout(contractPath, sourcePaths) {
  let bytes = new Uint8Array(await readFile(contractPath));
  const contract = parseWasmInterface(bytes, contractPath);
  const digest = await layoutDigest(sourcePaths);
  const sections = contract.customSectionData.filter(
    (section) => section.name === "dolly.process.layout",
  );
  if (sections.length > 1) {
    throw new Error(`${contractPath}: multiple dolly.process.layout sections`);
  }
  if (sections.length === 1) {
    if (!equalBytes(sections[0].data, digest)) {
      throw new Error(`${contractPath}: dolly.process.layout is stale for ${sourcePaths.join(", ")}`);
    }
    console.log(`dolly-abi: process layout is current in ${contractPath}`);
    return;
  }
  bytes = appendCustomSection(bytes, "dolly.process.layout", digest);
  await writeFile(contractPath, bytes);
  console.log(`dolly-abi: bound ${sourcePaths.join(", ")} to ${contractPath}`);
}

// The kernel exports exactly the functions its resident plugin imports and
// its trusted host contracts declare; Emscripten adds only its own runtime.
export function emscriptenExports(pluginContract, hostContracts) {
  const names = [...pluginContract.imports, ...hostContracts.flatMap(contract => contract.exports)]
    .filter(entry => entry.type.kind === "func").map(entry => `_${entry.name}`);
  return [...new Set(names)].sort();
}

export async function emitEmscriptenExports(contractPath, outputPath, hostContractPaths) {
  const exports = emscriptenExports(
    await readWasmInterface(contractPath),
    await Promise.all(hostContractPaths.map(path => readWasmInterface(path))),
  );
  await writeFile(outputPath, `${JSON.stringify(exports, null, 2)}\n`);
  console.log(`dolly-abi: wrote derived Emscripten exports to ${outputPath}`);
}

export async function emitDigestHeader(
  contractPath,
  outputPath,
  symbol = "DOLLY_ABI_DIGEST",
) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(symbol)) {
    throw new Error(`invalid digest symbol ${symbol}`);
  }
  const contract = await readWasmInterface(contractPath);
  const digest = contractDigest(contract);
  const bytes = [...digest].map((byte) => `0x${byte.toString(16).padStart(2, "0")}`);
  const guard = `${symbol}_H`;
  const header = `#ifndef ${guard}\n#define ${guard}\n\nstatic const unsigned char ${symbol}[] = {\n  ${bytes.join(", ")}\n};\n\n#endif\n`;
  try {
    if (await readFile(outputPath, "utf8") === header) {
      console.log(`dolly-abi: contract digest header is current at ${outputPath}`);
      return;
    }
  } catch (error) {
    if (!(error instanceof Error) || error.code !== "ENOENT") throw error;
  }
  await writeFile(outputPath, header);
  console.log(`dolly-abi: wrote contract digest header to ${outputPath}`);
}

export async function emitDigestModule(contractPath, outputPath, exportName) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(exportName)) {
    throw new Error(`invalid digest export name ${exportName}`);
  }
  const contract = await readWasmInterface(contractPath);
  const digest = hex(contractDigest(contract));
  // A contract importing functions from env also names them for its loader.
  const functions = contract.imports.filter(entry => entry.module === "env" && entry.type.kind === "func")
    .map(entry => entry.name);
  const source = `export const ${exportName} = "${digest}";\n` + (functions.length === 0 ? "" :
    `export const ${exportName.replace(/_ABI_DIGEST$/, "")}_IMPORTS = Object.freeze(${JSON.stringify(functions)});\n`);
  try {
    if (await readFile(outputPath, "utf8") === source) {
      console.log(`dolly-abi: contract digest module is current at ${outputPath}`);
      return;
    }
  } catch (error) {
    if (!(error instanceof Error) || error.code !== "ENOENT") throw error;
  }
  await writeFile(outputPath, source);
  console.log(`dolly-abi: wrote contract digest module to ${outputPath}`);
}

function usage() {
  console.error(`usage:
  dolly-abi.mjs inspect MODULE.wasm
  dolly-abi.mjs bind-process-layout CONTRACT.wasm SOURCE...
  dolly-abi.mjs stamp CONTRACT.wasm MODULE.wasm...
  dolly-abi.mjs stamp-process CONTRACT.wasm PROCESS.wasm...
  dolly-abi.mjs validate-process CONTRACT.wasm PROCESS.wasm...
  dolly-abi.mjs validate-process-dso PROCESS-CONTRACT.wasm DSO-CONTRACT.wasm LIBRARY.wasm...
  dolly-abi.mjs validate-runtime CONTRACT.wasm RUNTIME.wasm
  dolly-abi.mjs validate-browser CONTRACT.wasm RUNTIME.wasm
  dolly-abi.mjs emit-digest-header CONTRACT.wasm OUTPUT.h [SYMBOL]
  dolly-abi.mjs emit-digest-module CONTRACT.wasm OUTPUT.mjs EXPORT_NAME
  dolly-abi.mjs emit-emscripten-exports PLUGIN-CONTRACT.wasm HOST-CONTRACT.wasm... OUTPUT.json`);
  process.exitCode = 64;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  try {
    if (command === "inspect" && args.length === 1) {
      await inspect(args[0]);
    } else if (command === "bind-process-layout" && args.length >= 2) {
      await bindProcessLayout(args[0], args.slice(1));
    } else if (command === "stamp" && args.length >= 2) {
      await stampModules(args[0], args.slice(1));
    } else if (command === "stamp-process" && args.length >= 2) {
      await stampProcesses(args[0], args.slice(1));
    } else if (command === "validate-process" && args.length >= 2) {
      await validateProcess(args[0], args.slice(1));
    } else if (command === "validate-process-dso" && args.length >= 3) {
      await validateProcessDso(args[0], args[1], args.slice(2));
    } else if (command === "validate-runtime" && args.length === 2) {
      await validateRuntime(args[0], args[1]);
    } else if (command === "emit-emscripten-exports" && args.length >= 3) {
      await emitEmscriptenExports(
        args[0],
        args.at(-1),
        args.slice(1, -1),
      );
    } else if (command === "validate-browser" && args.length === 2) {
      await validateBrowser(args[0], args[1]);
    } else if (command === "emit-digest-header" &&
               (args.length === 2 || args.length === 3)) {
      await emitDigestHeader(args[0], args[1], args[2]);
    } else if (command === "emit-digest-module" && args.length === 3) {
      await emitDigestModule(args[0], args[1], args[2]);
    } else {
      usage();
    }
  } catch (error) {
    console.error(`dolly-abi: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
