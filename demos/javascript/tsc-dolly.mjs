// Bootstrap the unchanged CommonJS compiler shipped in Microsoft's pinned
// TypeScript npm archive inside Janis. All filesystem and process-shaped
// operations remain in Wasm through Janis's finite node:* compatibility layer.
const compiler = "/usr/lib/typescript/package/lib/_tsc.js";
globalThis.__filename = compiler;
globalThis.__dirname = "/usr/lib/typescript/package/lib";
globalThis.module = { exports: {} };
globalThis.exports = module.exports;
globalThis.require = process.getBuiltinModule("node:module").createRequire(compiler);
process.argv = ["/usr/bin/janis", compiler, ...scriptArgs];
(0, eval)(Dolly.readFile(compiler));
