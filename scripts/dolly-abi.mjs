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
const requiredInfrastructure = ["env.memory"];
const infrastructure = new Set([
  "memory",
  "__indirect_function_table",
  "__stack_pointer",
  ...relocationGlobals,
]);
const loaderBackedFunctions = new Set([
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
  return new Uint8Array(createHash("sha256").update(`${lines.join("\n")}\n`).digest());
}

function equalBytes(left, right) {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function hex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function requireContractStamp(module, digest) {
  const stamps = module.customSectionData.filter((section) => section.name === "dolly.abi");
  if (stamps.length !== 1) {
    throw new Error(`${module.label}: expected exactly one dolly.abi custom section`);
  }
  if (!equalBytes(stamps[0].data, digest)) {
    throw new Error(`${module.label}: dolly.abi does not match the selected contract`);
  }
}

function assertType(actual, expected, context, options) {
  if (!providerSatisfiesImport(actual, expected, options)) {
    throw new Error(
      `${context}: expected ${formatWasmType(expected)}, got ${formatWasmType(actual)}`,
    );
  }
}

function isMutableI64Global(entry) {
  return entry.type.kind === "global" && entry.type.value === "i64" && entry.type.mutable;
}

function isLoaderRelocation(entry, commandExports, allowedImports) {
  if (entry.module !== "GOT.func" && entry.module !== "GOT.mem") return false;
  if (!isMutableI64Global(entry)) return false;

  const selfExport = commandExports.get(entry.name);
  if (selfExport) {
    return entry.module === "GOT.func"
      ? selfExport.type.kind === "func"
      : selfExport.type.kind === "global";
  }

  if (entry.module === "GOT.func") {
    return allowedImports.get(`env.${entry.name}`)?.type.kind === "func";
  }

  return false;
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

export async function validateCommand(contractPath, commandPaths) {
  const contract = await readWasmInterface(contractPath);
  const digest = contractDigest(contract);
  const allowedImports = interfaceMap(contract.imports, importKey);
  const requiredExports = interfaceMap(contract.exports, (entry) => entry.name);

  for (const commandPath of commandPaths) {
    const command = await readWasmInterface(commandPath);
    const commandExports = interfaceMap(command.exports, (entry) => entry.name);

    if (command.sections[0] !== "custom:dylink.0") {
      throw new Error(`${commandPath}: dylink.0 must be the first section`);
    }
    requireContractStamp(command, digest);

    const commandImports = interfaceMap(command.imports, importKey);
    for (const name of requiredInfrastructure) {
      if (!commandImports.has(name)) throw new Error(`${commandPath}: missing required import ${name}`);
    }

    for (const entry of command.imports) {
      if (isLoaderRelocation(entry, commandExports, allowedImports)) continue;
      const allowed = allowedImports.get(importKey(entry));
      if (!allowed) throw new Error(`${commandPath}: import is outside dolly-0: ${describeImport(entry)}`);
      assertType(
        allowed.type,
        entry.type,
        `${commandPath}: incompatible import ${importKey(entry)}`,
        { dynamicTable: entry.type.kind === "table" },
      );
    }

    for (const [name, required] of requiredExports) {
      const actual = commandExports.get(name);
      if (!actual) throw new Error(`${commandPath}: missing required export ${name}`);
      if (!sameWasmType(actual.type, required.type)) {
        throw new Error(
          `${commandPath}: export ${name} must be ${formatWasmType(required.type)}, got ${formatWasmType(actual.type)}`,
        );
      }
    }

    console.log(`dolly-abi: ${commandPath} satisfies dolly-0`);
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
    if (!actual) throw new Error(`${runtimePath}: missing dolly-0 export ${entry.name}`);
    assertType(
      actual.type,
      entry.type,
      `${runtimePath}: incompatible dolly-0 export ${entry.name}`,
      { dynamicTable: entry.type.kind === "table" },
    );
  }

  console.log(`dolly-abi: ${runtimePath} implements dolly-0`);
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

export async function emitEmscriptenExports(contractPath, outputPath) {
  const contract = await readWasmInterface(contractPath);
  const exports = new Set([
    "_dolly_bootstrap",
    "_dolly_shell_run",
    "_main",
  ]);

  for (const entry of contract.imports) {
    if (infrastructure.has(entry.name)) continue;
    if (loaderBackedFunctions.has(entry.name)) continue;
    if (entry.module === "env" || entry.module === "GOT.mem") {
      exports.add(`_${entry.name}`);
    }
  }

  await writeFile(outputPath, `${JSON.stringify([...exports].sort(), null, 2)}\n`);
  console.log(`dolly-abi: wrote derived Emscripten exports to ${outputPath}`);
}

export async function emitDigestHeader(contractPath, outputPath) {
  const contract = await readWasmInterface(contractPath);
  const digest = contractDigest(contract);
  const bytes = [...digest].map((byte) => `0x${byte.toString(16).padStart(2, "0")}`);
  const header = `#ifndef DOLLY_ABI_DIGEST_H\n#define DOLLY_ABI_DIGEST_H\n\nstatic const unsigned char DOLLY_ABI_DIGEST[] = {\n  ${bytes.join(", ")}\n};\n\n#endif\n`;
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

function usage() {
  console.error(`usage:
  dolly-abi.mjs inspect MODULE.wasm
  dolly-abi.mjs stamp CONTRACT.wasm MODULE.wasm...
  dolly-abi.mjs validate-command CONTRACT.wasm COMMAND.wasm...
  dolly-abi.mjs validate-runtime CONTRACT.wasm RUNTIME.wasm
  dolly-abi.mjs emit-digest-header CONTRACT.wasm OUTPUT.h
  dolly-abi.mjs emit-emscripten-exports CONTRACT.wasm OUTPUT.json`);
  process.exitCode = 64;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  try {
    if (command === "inspect" && args.length === 1) {
      await inspect(args[0]);
    } else if (command === "stamp" && args.length >= 2) {
      await stampModules(args[0], args.slice(1));
    } else if (command === "validate-command" && args.length >= 2) {
      await validateCommand(args[0], args.slice(1));
    } else if (command === "validate-runtime" && args.length === 2) {
      await validateRuntime(args[0], args[1]);
    } else if (command === "emit-emscripten-exports" && args.length === 2) {
      await emitEmscriptenExports(args[0], args[1]);
    } else if (command === "emit-digest-header" && args.length === 2) {
      await emitDigestHeader(args[0], args[1]);
    } else {
      usage();
    }
  } catch (error) {
    console.error(`dolly-abi: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
