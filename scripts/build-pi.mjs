import { copyFile, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { build } from "esbuild";

const expectedPiVersion = process.env.DOLLY_PI_VERSION;
const expectedEsbuildVersion = process.env.DOLLY_ESBUILD_VERSION;
if (!expectedPiVersion || !expectedEsbuildVersion) {
  throw new Error("Dolly Pi/esbuild source pins were not supplied");
}

async function packageVersion(name) {
  const packageFile = new URL(`../node_modules/${name}/package.json`, import.meta.url);
  return JSON.parse(await readFile(packageFile, "utf8")).version;
}

for (const name of [
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-ai",
  "@earendil-works/pi-coding-agent",
]) {
  const version = await packageVersion(name);
  if (version !== expectedPiVersion) {
    throw new Error(`${name} ${version} does not match pinned Pi ${expectedPiVersion}`);
  }
}
const esbuildVersion = await packageVersion("esbuild");
if (esbuildVersion !== expectedEsbuildVersion) {
  throw new Error(
    `esbuild ${esbuildVersion} does not match pin ${expectedEsbuildVersion}`,
  );
}

const generatedDirectory = new URL("../build/generated/", import.meta.url);
const generatedPackageDirectory = new URL("pi-package/", generatedDirectory);
await rm(generatedPackageDirectory, { recursive: true, force: true });
await mkdir(generatedPackageDirectory, { recursive: true });
const janisBuiltinNames = new Set([
  "assert", "assert/strict", "async_hooks", "buffer", "child_process",
  "console", "constants", "crypto", "diagnostics_channel", "dns", "events",
  "fs", "fs/promises", "http", "http2", "https", "module", "net", "os",
  "path", "perf_hooks", "process", "querystring", "readline", "sqlite",
  "stream", "stream/promises", "stream/web", "string_decoder", "timers",
  "timers/promises", "tls", "tty", "url", "util", "util/types", "v8",
  "vm", "worker_threads", "zlib", "undici",
]);
const nodeBuiltin = {
  name: "janis-node-builtins",
  setup(build) {
    build.onResolve({
      filter: /^(?:node:)?[a-z][a-z0-9_/]*$/,
    }, (args) => {
      const name = args.path.replace(/^node:/, "");
      return janisBuiltinNames.has(name)
        ? { path: name, namespace: "janis-builtin" }
        : undefined;
    });
    build.onLoad({ filter: /.*/, namespace: "janis-builtin" }, (args) => ({
      contents: `module.exports = globalThis.__janisBuiltin(${JSON.stringify(args.path)});`,
      loader: "js",
    }));
  },
};
const upstreamCliPath = new URL(
  "../node_modules/@earendil-works/pi-coding-agent/dist/cli.js",
  import.meta.url,
);
let upstreamCli = await readFile(upstreamCliPath, "utf8");
const upstreamMainPattern = /^main\(process\.argv\.slice\(2\)\);$/m;
if ((upstreamCli.match(new RegExp(upstreamMainPattern.source, "gm")) ?? []).length !== 1) {
  throw new Error("Pi's upstream CLI main invocation changed");
}
upstreamCli = upstreamCli
  .replace(/^#![^\n]*\n/, "")
  .replace(upstreamMainPattern, "await main(process.argv.slice(2));");
await build({
  // Pi intentionally keeps OAuth implementations behind variable dynamic
  // imports so browser-oriented bundles do not pull in Node callback-server
  // code. Janis implements that small Node surface inside Dolly, so register
  // Pi's own standalone-runtime loader table before starting the normal CLI.
  // This keeps the upstream flows static in /usr/lib/pi/pi.js instead of
  // inventing a Dolly-specific copy of their relative module graph.
  stdin: {
    contents: [
      'import { registerBunOAuthFlows } from "@earendil-works/pi-ai/bun-oauth";',
      "registerBunOAuthFlows();",
      upstreamCli,
    ].join("\n"),
    resolveDir: new URL(
      "../node_modules/@earendil-works/pi-coding-agent/dist/",
      import.meta.url,
    ).pathname,
    sourcefile: "pi-janis-entry.js",
    loader: "js",
  },
  outfile: new URL("pi.js", generatedPackageDirectory).pathname,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2023",
  treeShaking: true,
  legalComments: "eof",
  plugins: [nodeBuiltin],
  banner: {
    js: `// Pi ${expectedPiVersion}, unmodified upstream CLI packaged for Janis.\nglobalThis.PI_BUNDLED_NODE = true;\nprocess.argv = ["janis", "/usr/lib/pi/pi.js", ...scriptArgs];\nprocess.title = "pi";`,
  },
});

// QuickJS-ng does not yet implement ECMAScript's Unicode-set (`v`) regular
// expression flag. Pi's current TUI emits exactly these six expressions. Lower
// them at packaging time to equivalent `u` expressions so the upstream source
// remains untouched and this compatibility boundary stays explicit/auditable.
const generatedPiPath = new URL("pi.js", generatedPackageDirectory);
let generatedPi = await readFile(generatedPiPath, "utf8");
const loweredUnicodeSets = new Map([
  ["zeroWidthRegex", String.raw`/^(?:\p{Cf}|\p{Cc}|\p{Mark}|\p{Cs})+$/u`],
  ["leadingNonPrintingRegex", String.raw`/^[\p{Cf}\p{Cc}\p{Mark}\p{Cs}]+/u`],
  ["nonPrintingCharRegex", String.raw`/^(?:\p{Cf}|\p{Cc}|\p{Mark}|\p{Cs})$/u`],
  ["markCharRegex", String.raw`/^\p{Mark}$/u`],
  ["terminalSpacingMarkRegex", String.raw`/^(?:(?![\u1734\u302E\u302F])\p{Mc}|[\u065F\u0F7F\u102B\u102C\u1031\u1033-\u1035\u1038\u103A-\u103E])+$/u`],
  ["rgiEmojiRegex", String.raw`/^(?:[0-9#*]\uFE0F?\u20E3|[\u{1F1E6}-\u{1F1FF}]{2}|[\u2600-\u27BF\u{1F000}-\u{1FAFF}](?:\uFE0F|[\u{1F3FB}-\u{1F3FF}])?(?:\u200D[\u2600-\u27BF\u{1F000}-\u{1FAFF}](?:\uFE0F|[\u{1F3FB}-\u{1F3FF}])?)*)$/u`],
]);
for (const [name, replacement] of loweredUnicodeSets) {
  const declaration = new RegExp(`^var ${name.replaceAll("$", "\\$")} = .+;$`, "m");
  const matches = generatedPi.match(new RegExp(declaration.source, "gm")) ?? [];
  if (matches.length !== 1 || !matches[0].endsWith('", "v");')) {
    throw new Error(`Pi's ${name} Unicode-set expression changed upstream`);
  }
  generatedPi = generatedPi.replace(declaration, `var ${name} = ${replacement};`);
}
if (/new RegExp\([^\n]+, "v"\)/.test(generatedPi)) {
  throw new Error("Pi contains an unlowered Unicode-set expression");
}

// The prebundled provider catalog retains one variable dynamic-import helper
// for optional Node filesystem probes. Route node:* probes to Janis's builtin
// table while leaving relative lazy provider imports as real ES modules.
const dynamicImportPattern =
  /^var dynamicImport = \(specifier\) => import\((__rewriteRelativeImportExtension\d*)\(specifier\)\);$/gm;
const dynamicImportMatches = [...generatedPi.matchAll(dynamicImportPattern)];
if (dynamicImportMatches.length !== 1) {
  throw new Error("Pi's optional Node dynamic-import helper changed upstream");
}
generatedPi = generatedPi.replace(
  dynamicImportPattern,
  'var dynamicImport = (specifier) => specifier.startsWith("node:") ? Promise.resolve(globalThis.__janisBuiltin(specifier)) : import($1(specifier));',
);

// Node keeps the process alive while Pi's async main() owns the terminal.
// The staged upstream entry was changed to await that one call before bundling
// so Janis can drive its event loop for exactly the same lifetime.
if ((generatedPi.match(/^await main\(process\.argv\.slice\(2\)\);$/gm) ?? []).length !== 1) {
  throw new Error("Pi's bundled top-level main invocation changed");
}
await writeFile(generatedPiPath, generatedPi);

// Emscripten's preload syntax is `source@destination`; a scoped npm path has
// an `@` in the source name and is therefore ambiguous. Stage Pi's package
// resources under a scope-free path. The JavaScript implementation is bundled
// above, while these files preserve the normal upstream package layout used by
// Pi's TUI, HTML exporter, system prompt, and extension documentation.
const codingAgentDirectory = new URL(
  "../node_modules/@earendil-works/pi-coding-agent/",
  import.meta.url,
);
await Promise.all([
  copyFile(
    new URL("package.json", codingAgentDirectory),
    new URL("package.json", generatedPackageDirectory),
  ),
  copyFile(
    new URL("README.md", codingAgentDirectory),
    new URL("README.md", generatedPackageDirectory),
  ),
  copyFile(
    new URL("CHANGELOG.md", codingAgentDirectory),
    new URL("CHANGELOG.md", generatedPackageDirectory),
  ),
  cp(
    new URL("docs/", codingAgentDirectory),
    new URL("docs/", generatedPackageDirectory),
    { recursive: true },
  ),
  cp(
    new URL("examples/", codingAgentDirectory),
    new URL("examples/", generatedPackageDirectory),
    { recursive: true },
  ),
  cp(
    new URL("dist/modes/interactive/theme/", codingAgentDirectory),
    new URL("dist/modes/interactive/theme/", generatedPackageDirectory),
    { recursive: true },
  ),
  cp(
    new URL("dist/modes/interactive/assets/", codingAgentDirectory),
    new URL("dist/modes/interactive/assets/", generatedPackageDirectory),
    { recursive: true },
  ),
  cp(
    new URL("dist/core/export-html/", codingAgentDirectory),
    new URL("dist/core/export-html/", generatedPackageDirectory),
    { recursive: true },
  ),
]);
