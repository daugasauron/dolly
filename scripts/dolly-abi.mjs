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

const relocationGlobals = new Set(["__memory_base", "__table_base"]);
const infrastructure = new Set([
  "memory",
  "__indirect_function_table",
  "__stack_pointer",
  ...relocationGlobals,
]);
const loaderBackedFunctions = new Set([
  "invoke_v",
  "invoke_ijj",
  "invoke_ijji",
  "invoke_jj",
  "invoke_vjj",
]);

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

function contractDigest(contract) {
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

function requireProcessMemoryRequirements(module, memory) {
  const sections = module.customSectionData.filter(
    (section) => section.name === "dolly.process.memory",
  );
  if (sections.length !== 1 || sections[0].data.length !== 16) {
    throw new Error(`${module.label}: expected one 16-byte dolly.process.memory section`);
  }
  const view = new DataView(
    sections[0].data.buffer,
    sections[0].data.byteOffset,
    sections[0].data.byteLength,
  );
  const minimum = view.getBigUint64(0, true);
  const maximum = view.getBigUint64(8, true);
  if (minimum !== memory.type.minimum || maximum !== memory.type.maximum) {
    throw new Error(`${module.label}: dolly.process.memory does not match its memory import`);
  }
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

export async function validateRuntime(contractPath, runtimePath) {
  const contract = await readWasmInterface(contractPath);
  const digest = contractDigest(contract);
  const runtime = await readWasmInterface(runtimePath);
  const runtimeExports = interfaceMap(runtime.exports, (entry) => entry.name);
  const runtimeImports = interfaceMap(runtime.imports, importKey);
  const contractImports = interfaceMap(contract.imports, importKey);

  if (!runtime.customSections.includes("dylink.0")) {
    throw new Error(`${runtimePath}: runtime has no dylink.0 section`);
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

    if (entry.module === "GOT.mem") {
      if (!runtimeExports.has(entry.name)) {
        throw new Error(`${runtimePath}: missing symbol backing GOT.mem.${entry.name}`);
      }
      continue;
    }

    const actual = runtimeExports.get(entry.name);
    if (!actual && loaderBackedFunctions.has(entry.name)) {
      continue;
    }
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
  const digest = contractDigest(contract);
  const allowedImports = interfaceMap(contract.imports, importKey);
  const requiredExports = interfaceMap(contract.exports, (entry) => entry.name);

  if (allowedImports.size !== 2 ||
      !allowedImports.has("env.memory") ||
      !allowedImports.has("dolly_process_0.call")) {
    throw new Error(`${contractPath}: process contract must contain only memory and call`);
  }

  for (const processPath of processPaths) {
    const process = await readWasmInterface(processPath);
    if (process.customSections.includes("dylink.0")) {
      throw new Error(`${processPath}: a process executable must not be a side module`);
    }
    requireNamedContractStamp(process, digest, "dolly.process");
    const imports = interfaceMap(process.imports, importKey);
    if (imports.size !== allowedImports.size) {
      throw new Error(`${processPath}: expected exactly the two dolly-process-0 imports`);
    }
    for (const [name, expected] of allowedImports) {
      const actual = imports.get(name);
      if (!actual) throw new Error(`${processPath}: missing required import ${name}`);
      if (name === "env.memory") {
        if (actual.type.kind !== "memory" || expected.type.kind !== "memory" ||
            actual.type.address64 !== expected.type.address64 ||
            actual.type.shared !== expected.type.shared ||
            actual.type.minimum < expected.type.minimum ||
            actual.type.maximum === null || expected.type.maximum === null ||
            actual.type.maximum > expected.type.maximum ||
            actual.type.minimum > actual.type.maximum) {
          throw new Error(
            `${processPath}: process memory is outside ${formatWasmType(expected.type)}: ` +
            formatWasmType(actual.type),
          );
        }
        requireProcessMemoryRequirements(process, actual);
      } else if (!sameWasmType(actual.type, expected.type)) {
        throw new Error(
          `${processPath}: import ${name} must be ${formatWasmType(expected.type)}, ` +
          `got ${formatWasmType(actual.type)}`,
        );
      }
    }
    const exports = interfaceMap(process.exports, (entry) => entry.name);
    for (const [name, expected] of requiredExports) {
      const actual = exports.get(name);
      if (!actual || !sameWasmType(actual.type, expected.type)) {
        throw new Error(`${processPath}: missing or incompatible process export ${name}`);
      }
    }
    console.log(`dolly-abi: ${processPath} satisfies dolly-process-0`);
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

export async function bindProcessLayout(contractPath, layoutPath) {
  let bytes = new Uint8Array(await readFile(contractPath));
  const contract = parseWasmInterface(bytes, contractPath);
  const layoutDigest = new Uint8Array(
    createHash("sha256").update(await readFile(layoutPath)).digest(),
  );
  const sections = contract.customSectionData.filter(
    (section) => section.name === "dolly.process.layout",
  );
  if (sections.length > 1) {
    throw new Error(`${contractPath}: multiple dolly.process.layout sections`);
  }
  if (sections.length === 1) {
    if (!equalBytes(sections[0].data, layoutDigest)) {
      throw new Error(`${contractPath}: dolly.process.layout is stale for ${layoutPath}`);
    }
    console.log(`dolly-abi: process layout is current in ${contractPath}`);
    return;
  }
  bytes = appendCustomSection(bytes, "dolly.process.layout", layoutDigest);
  await writeFile(contractPath, bytes);
  console.log(`dolly-abi: bound ${layoutPath} to ${contractPath}`);
}

export async function emitEmscriptenExports(
  contractPath,
  outputPath,
  runtimeContractPaths = [],
) {
  const contract = await readWasmInterface(contractPath);
  const exports = new Set([
    "_main",
  ]);

  for (const entry of contract.imports) {
    if (infrastructure.has(entry.name)) continue;
    if (loaderBackedFunctions.has(entry.name)) continue;
    if (entry.module === "env" || entry.module === "GOT.mem") {
      exports.add(`_${entry.name}`);
    }
  }

  for (const runtimeContractPath of runtimeContractPaths) {
    const runtimeContract = await readWasmInterface(runtimeContractPath);
    for (const entry of runtimeContract.exports) exports.add(`_${entry.name}`);
  }

  await writeFile(outputPath, `${JSON.stringify([...exports].sort(), null, 2)}\n`);
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
  const source = `export const ${exportName} = "${digest}";\n`;
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
  dolly-abi.mjs bind-process-layout CONTRACT.wasm LAYOUT.h
  dolly-abi.mjs stamp CONTRACT.wasm MODULE.wasm...
  dolly-abi.mjs stamp-process CONTRACT.wasm PROCESS.wasm...
  dolly-abi.mjs validate-process CONTRACT.wasm PROCESS.wasm...
  dolly-abi.mjs validate-runtime CONTRACT.wasm RUNTIME.wasm
  dolly-abi.mjs emit-digest-header CONTRACT.wasm OUTPUT.h [SYMBOL]
  dolly-abi.mjs emit-digest-module CONTRACT.wasm OUTPUT.mjs EXPORT_NAME
  dolly-abi.mjs emit-emscripten-exports CONTRACT.wasm [RUNTIME-CONTRACT.wasm...] OUTPUT.json`);
  process.exitCode = 64;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  try {
    if (command === "inspect" && args.length === 1) {
      await inspect(args[0]);
    } else if (command === "bind-process-layout" && args.length === 2) {
      await bindProcessLayout(args[0], args[1]);
    } else if (command === "stamp" && args.length >= 2) {
      await stampModules(args[0], args.slice(1));
    } else if (command === "stamp-process" && args.length >= 2) {
      await stampProcesses(args[0], args.slice(1));
    } else if (command === "validate-process" && args.length >= 2) {
      await validateProcess(args[0], args.slice(1));
    } else if (command === "validate-runtime" && args.length === 2) {
      await validateRuntime(args[0], args[1]);
    } else if (command === "emit-emscripten-exports" && args.length >= 2) {
      await emitEmscriptenExports(
        args[0],
        args.at(-1),
        args.slice(1, -1),
      );
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
