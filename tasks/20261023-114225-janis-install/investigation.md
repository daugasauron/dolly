# Investigation: one npm installer in Janis; Pi's Dolly extension as its own amy package

Read-only, on `main` `33764f12`, 2026-10-23. Sizes are bytes of built snapshots in `work/x11fix/dist/` or registry answers, measured today unless marked *inferred*.

## Summary

- Nothing in Dolly fetches, verifies or unpacks an npm tree today except six Slop lines in the Claude Code launcher (`demos/closed-source-agent/Dollyfile-closed-source-agent:128-134`: `curl`, `sha256sum`, `gzip -dc`, `tar -xf`). A generic installer is new code; no existing npm client runs under Janis unchanged, because Janis has no `zlib` (`demos/javascript/janis.js:3039-3056`), no `http(s).request` (`janis.js:2976-2977`) and no `sha512` (`janis.js:1966-1970`). The registry's metadata and tarballs send `access-control-allow-origin: *` (measured), so the broker reaches them.
- The owner's own convention argues for the installer as a program in a package of its own (one Janis script linked as a command, as `tsc` is), not a `janis install` subcommand: Janis is "a finite Node-compatible surface" and Node has no `node install`.
- Pi's Dolly extension as an amy package is cheap, clearly within the packages rule, and independent of the npm question: five files that `Dollyfile-pi:18-31` already installs under `/home/dolly/.pi/agent/`, where Pi looks for them (resource-loader.ts:979-988, 1202-1207).
- Taking Pi from npm instead of compiling it from source is a thesis decision (section 3). It also loses two things the project added for a reason: the API-key mask (upstream `main` still has no `mask`; measured today) and the Unicode-set regex lowering (upstream `main` still has six `/v` regexes; measured) now applied to Dolly's own emit, which would have to be applied to published bytes instead.

## 0. Today

| Image | Snapshot bytes | Role |
| --- | ---: | --- |
| `pi-build` | 242,771,604 | compiles Pi 1.0.3 from `pi-source.tar` (11,071,488) with `tsc`; `pi-runtime-packages.tar` (42,409,984: 33 external npm packages' files from `npm ci`) |
| `pi` | 62,356,556 | `/usr/bin/pi`, `/usr/lib/node_modules`, `/usr/src/pi-source`, the five Dolly files, with `janis`, `ripgrep`, `fd` |
| `pi-runtime` | 229,324,974 | `system` + `janis` + `pi` |
| `pi-agent` | 229,645,088 | `pi-runtime` + `amy` + `dolly-docs` + `init.slop` |
| `closed-source-agent` | 161,951,639 | `system` + `amy` + `janis` + `ripgrep` + notice, `anykey`, `secretenv`, launcher |
| `janis` / `quickjs` / `typescript` | 1,779,585 / 2,989,398 / 25,120,855 | runtime, engine, compiler |

Dependents (recipes): `pi-runtime` ← `pi-agent` ← `pi-local` ← `dollyfile-studio`; `pi-runtime` ← `pi-phone`, `classicube`, `rts-arena`; `bhop` and `slopyard` `INSTALL janis` and `pi` (`demos/bhop/Dollyfile-bhop:13-14`, `demos/slopyard/Dollyfile-slopyard:15-16`). Programs that use Pi: the game agents spawn `pi --mode rpc` (`demos/game-agent/mission.mjs:112`); `demos/slopyard/src/pi.mjs:8-9,107` and `compaction.mjs:1` import `@earendil-works/pi-coding-agent`; `demos/rts/spectator/launcher.mjs:93` imports `pi-ai`, `picker.mjs:46` `pi-tui`; `demos/local-llm/local-model-provider.js:6-7` imports `pi-ai` and `pi-coding-agent`; `demos/pi/dolly-tools.js:7` imports `pi-coding-agent`. Janis resolves these from `/usr/lib/node_modules` (`janis.js:2688`).

## 1. A generic npm installer

### What `npm install` does, and what Janis has

| Requirement | npm | Janis / session today | Gap |
| --- | --- | --- | --- |
| Registry metadata | `GET registry.npmjs.org/NAME` (full doc; pi-coding-agent 298,466 B) or abbreviated (`Accept: application/vnd.npm.install-v1+json`; `semver` 101,435 B) | `fetch` (`dolly-node.js:698`), JSON | none; scoped names as `@scope%2fname` (200) |
| Semver resolution | ranges `^`, `~`, `x`, `||`, `-` against `versions` | nothing | a range matcher (small) or exact pins only; Pi 1.0.3 pins every external dep exactly and its own packages `^1.0.3` (manifest); Claude Code has `dependencies: {}` |
| Integrity | `dist.integrity` sha512; `dist.shasum` sha1 | `createHash`: sha256, sha1, md5 only (`janis.js:1966-1970`); `sha256sum` in `posix` | sha512 in Janis (Node behaviour), or sha1 shasum (weak), or a recipe-pinned sha256 as today |
| Unpack `.tgz` | zlib + tar in process | `zlib` stubs throw (`janis.js:3039-3056`); no tar in Janis; `gzip -dc | tar -xf -` works (`Dollyfile-typescript:25`, launcher) | spawn `gzip` and `tar` (`child_process`, `janis.js:1724`); `default` has `tar` (core) but not `gzip` (`Dollyfile:20-27`); `system-tools` has it (`:154`) |
| `package.json` `bin` | symlink into `node_modules/.bin`, shebang `#!/usr/bin/env node` | no `node`; `symlinkSync` exists (`janis.js:1431`) | write a two-line Slop launcher in `/usr/bin` (`janis FILE "$@"`), as `closed-source-agent` does |
| `exports`/`imports`/`main` | resolver | implemented (README "Supported") | none |
| Nested `node_modules` | hoist, nest on conflict | walks up `node_modules`, falls back to `/usr/lib/node_modules` (`janis.js:2683-2688`) | flat install at one root works until two versions of one package are needed; `build-pi-runtime-packages.mjs:29-31` handles that case for Pi today |
| Lifecycle scripts | `preinstall`/`install`/`postinstall` with `sh` and `node` on PATH | `sh` is Slop (`Dollyfile-posix:69`); no `node` | do not run them, name them (`--ignore-scripts` semantics); Claude Code 2.1.112 has only a publish-guard `prepare` (not run for dependencies); Pi 1.0.3 has none (manifests) |
| Native addons | `.node` files | none loadable | fail by name |
| Optional/platform packages | `os`/`cpu` filters | `process.platform` `"wasm"`, `arch` `"wasm64"` (`janis.js:724-725`) | apply npm's `os`/`cpu` rule: Claude Code's nine `@img/sharp-*` optional deps are skipped, nothing else is needed |
| `engines` | warning | Janis is not Node 22 | ignore |
| git/`file:`/workspaces/bundled deps | supported | nothing | fail by name |

### Existing clients (registry, measured)

| Client | Version | Unpacked bytes / files | Why not under Janis |
| --- | --- | ---: | --- |
| `npm` | 12.2.1 | 12,430,582 / 1,942 | `zlib`, node http agents, workers (*inferred* from its tree) |
| `yarn` (classic, one bundle) | 1.22.22 | 5,340,487 / 11 | `zlib`, `https.request` (*inferred*) |
| `pnpm` | 12.15.0 | 4,201,319 / 449 | same, plus workers (*inferred*) |
| `vlt` | 1.5.0 | 10,108,612 / 117 | same (*inferred*) |
| `pacote` (npm's fetcher) | 22.0.1 | 82,685 / 18, but 17 deps (`tar`, `ssri`, `cacache`, `sigstore`, `npm-registry-fetch`, …) | `tar` needs `zlib`; `npm-registry-fetch` uses node agents |
| `bun` | 1.4.4 | 20,196 (a downloader for a native binary) | native |

None was run; the inference is from their dependency lists and from Janis's measured gaps. Making one run means adding `zlib` and socket-shaped `http` to Janis, which is more code than an installer that spawns `gzip` and `tar`.

### The broker

Measured today with an `Origin` header: metadata (full and abbreviated) and tarballs of both packages answer 200 with `access-control-allow-origin: *`; `OPTIONS` preflight answers 404 without CORS headers, so only simple requests work (GET with safelisted headers; `Accept` is one; no `Authorization`, so no private packages). The public sites run the default policy (any HTTPS URL); an embedding with a policy needs a rule for `https://registry.npmjs.org`. Assumed, not measured: Dolly's `tar` on Pi's 1,248-file tarball (pax headers, long paths); it has handled TypeScript's and Claude Code's.

### Shape

Three ways to put it, with the owner's words:

| Shape | Fits | Against | Cost |
| --- | --- | --- | --- |
| A. `janis install NAME[@VERSION]` subcommand | his phrase | `quickjs-main.c:44` is `janis [-m] [-e CODE | FILE [ARG...]]`, Node's shape; README: "a finite Node-compatible surface"; his layering of 2026-10-13: "qjs is a library + tool and janis can be something on top" | changes `janis`, which repins 14 images (`typescript`, the Pi chain, the games, `closed-source-agent`), as the split did |
| B. A package whose command is the installer: one Janis script linked with `quickjs-runner.h` as `tsc` is (`demos/javascript/tsc.c`), `FROM system-tools`, `INSTALL janis` and `INSTALL gzip` ("a program package brings what its programs start", packages task) | the packages rule ("a program is a package when a person or an agent would run it by name"), amy's test pattern, no Janis change | one more name | one new image; nothing rebuilds |
| C. Generalise the Slop launcher lines | smallest | Slop has no JSON or semver; fine for one pinned tarball (today), not for a dependency tree | none |

B is the one his conventions point at. Its verbs: `install NAME[@VERSION]` with `--prefix DIR` (default `/usr/lib/node_modules`) and `--integrity sha512-…` for a recipe that pins; `bin` entries become `/usr/bin` launchers, so "run" is the command's name. Accepting npm's `install SPEC --prefix DIR --omit=dev --legacy-peer-deps` grammar lets Pi's own `pi install npm:…` use it through Pi's `npmCommand` setting (`docs/settings.md:141`; `package-manager.ts` `getNpmCommand` defaults to `npm`), closing a README limit ("installing Pi packages that need npm fails", `demos/pi/README.md:47`). Do not call the command `npm`: it is not npm, and the porting rule is not to claim what it is not. The name is his; amy, nena, slop, janis set the style. Size: *inferred* 400-600 lines of JavaScript (fetch, semver subset, tree walk, `os`/`cpu` filter, spawn `gzip`/`tar`, launchers, sha512 if not in Janis).

sha512: npm's integrity is sha512 and Janis has none. Putting it in `createHash` is general Node behaviour (the rule the Claude Code task set: gaps are fixed in Janis, never in the package) but repins `janis`; the installer could carry it and move it later, or the janis change can ride a round that rebuilds the Pi chain anyway (step 5). `dist.shasum` (sha1: `de643ce8…` for Pi 1.0.3, `318f4328…` for Claude Code 2.1.112, measured) exists and Janis has sha1, but npm itself no longer trusts it alone.

## 2. What `pi`, `pi-agent`, `closed-source-agent` and dependents become

### Claude Code (unchanged in substance)

`closed-source-agent` keeps its notice, `anykey`, `secretenv`, the `--bare`/`p`/Ctrl+C flow, `USE_BUILTIN_RIPGREP=0` and its tests; lines 128-134 (download, digest, unpack) become one installer line with the pinned integrity, and the recipe `INSTALL`s the installer package instead of `REQUIRES TOOL curl cut gzip sha256sum tar`. The owner's conditions hold as before (nothing of the package in repo, image or site; run as published; notice first; no relay, `131e2120`). The browser test's fixture must then also answer the metadata URL, or the installer takes an exact `NAME@VERSION` with `--integrity` straight to `NAME/-/BASE-VERSION.tgz` (the registry's URL shape, measured for both packages) without metadata. One image rebuilds.

### Pi, if it comes from npm

The published package is not what Dolly runs today: `bin` is `dist/bundle/cli.js`, an esbuild bundle of all workspace packages and externals except `@earendil-works/chord`, `jiti`, `@silvia-odwyer/photon-node`, `bufferutil`, `utf-8-validate`, `kerberos`, `supports-color` (`scripts/build-coding-agent-bundle.mjs` in the pinned checkout). `files` is `dist` (minus client/experimental), `docs`, `examples`; the unbundled `dist/cli.js` and `dist/index.js` are in it too (*inferred* from `files` and `build:unbundled`). 1.0.3: 22,742,391 B / 1,248 files and 23 dependencies, among them `quickjs-wasi` (nested WebAssembly: codemode, already failing here) and `photon-node` (nested WebAssembly: image resizing, already off). The library imports of the games and `local-model-provider.js` resolve if the installer puts `pi-ai`, `pi-tui`, `pi-coding-agent` under `/usr/lib/node_modules`.

| Today | From npm |
| --- | --- |
| `pi-secret-input.patch` (masks API keys; task `20261005-231730`: "a visitor's secret on a public demo screen is wrong in any case") | lost: upstream `main` `input.ts` and `login-dialog.ts` have no `mask`/`secret` (measured today). Replacement: upstream the patch first, or accept keys shown in clear |
| `pi-quickjs-compat.mjs` (lowers six `/v` regexes in Dolly's own emit, asserted) | still needed: upstream `main` `tui/src/utils.ts` has six `/v;` (measured). Options: QuickJS-ng 0.17.0 (released 2026-09-18; whether it fixes set subtraction and `\p{Mark}` under `v` is not in the release titles, must be measured), a fix upstream in QuickJS-ng's libregexp, or rewriting published bytes at install time (a patch to build output, worse than today's) |
| `pi-build`, `prepare-sources.sh:9-57`, `pi-runtime-packages.txt`, `build-pi-runtime-packages.mjs`, `pi-runtime-census.mjs`, `pi-tsconfig.dolly.json`, `pi.c`, `/usr/src/pi-source`, licences folder | removed; `pi` becomes a launcher recipe (installer + `pi` launcher) or `pi-agent`'s `init.slop` installs on first start as the Claude launcher does |
| `PI_PACKAGE_DIR`, `PI_SKIP_VERSION_CHECK=1` (`Dollyfile-pi:24-25`) | kept as environment of the package that installs Pi |
| Tests: `recipes.test.mjs` (whole second test: "Pi is compiled from pinned source by the typescript package"; first test's `pi-build` edges), `tools.artifacts.mjs` (licence paths), `pi-browser.mjs:86-89` (`dist/cli.js`, no `dist-dolly`, `pi-telemetry` import), `:99-100` (`pi install npm:` fails before network), `test/amy-browser.mjs:322` | rewritten; the browser tests must serve Pi's tarballs from the test origin as `closed-source-agent-browser.mjs` does (`fixtures/tarball.mjs`: downloaded once into `build/`, checked against npm's integrity, never committed), about 70 MB of fixtures per run |

Images built FROM Pi today: an application cannot install at run time and still open offline, start as fast, or be tested without a fixture registry. `pi-local` (1,636,732,412), `dollyfile-studio` (1,673,050,682), `pi-phone`, `classicube`, `rts-arena`, `bhop`, `slopyard` would have to install Pi at build time, which is the `typescript` shape (a pinned tarball `SOURCE`d from the site, `Dollyfile-typescript:21-25`), not a session install. Start cost of a session install, *inferred* from the Claude Code measurements (18.7 MB: 2.5-2.6 s download, 1.8-2.8 s unpack, one run of 54 s): Pi's tree is three to four times the bytes across some forty requests. A saved session then holds the tree (512 MiB per save).

## 3. The tension with the thesis

AGENTS.md: "run real programs in a browser tab as natively as possible, built from their upstream sources inside the sandbox itself". README: "the recipes build everything else in the tab from upstream source". The Pi plan of 2026-09-03 (`docs/pi-agent-plan.md` at `07a3cf1e`): "Pi is Dolly's primary agent workload. The objective is not to reproduce Node or Linux; it is to measure which filesystem, terminal, lifecycle, JavaScript, and network behavior a useful coding agent actually needs", "Pi itself is not forked", "There is no host application bundle, npm client, browser module loader, or resolution-time network path." The recipe says what is already taken as published: `Dollyfile-pi-build:11-13` "Only generated model data and the finite locked external dependency graph come from the matching published packages" (33 packages, `pi-runtime-packages.txt:7-40`), and `typescript` is "Microsoft's npm archive, unchanged" (`Dollyfile-typescript:7`). So the line today is: what Dolly ports is compiled inside; leaf dependencies and the compiler itself are published archives, pinned. Pi from npm moves Pi across that line; Claude Code is already across it by the owner's decision ("It should be ok licence wise to have an image that can download it and run it?", 2026-10-07) and by Anthropic's condition that it run unmodified.

Options, not a decision:

1. Keep `pi` compiled from source for images; add the installer for sessions and Claude Code. Two Pis exist (`amy install pi` and `X install @earendil-works/pi-coding-agent`), two test shapes; the mask and the regex lowering stay.
2. Pi from npm at build time, like TypeScript: pinned tarballs staged by the site, offline images, no `tsc` step, `pi-build` gone (242 MB builder), `/usr/src/pi-source` gone (the audit's item 10 wanted it dropped anyway). Loses the "compiled inside" demonstration and the two source changes.
3. Pi from npm at run time, the phrase as written: images hold nothing of Pi; every Pi session downloads it; the seven images built on Pi cannot do it, so they fall back to 2.
4. Both 2 and the installer: one Pi, published bytes, installed by the same code in recipes and sessions.

## 4. Pi's Dolly extension as an amy package

Name: `pi-dolly` (what the package adds to `pi`; the catalog convention names an application after what it adds, `docs/dollyfile.md`). Its description line goes in `demos/pi/README.md` for `amy-index.txt`.

| File | Installed at (`Dollyfile-pi:18-22`) | Where Pi looks |
| --- | --- | --- |
| `demos/pi/dolly-tools.js` (136 lines: Slop as `bash`, byte-preserving `edit`, `download`, the header) | `~/.pi/agent/extensions/dolly-tools.js` | `resource-loader.ts:982` `join(agentDir, "extensions")`; loaded by `jiti` (external in the bundle, a dependency) |
| `demos/pi/SYSTEM.md` | `~/.pi/agent/SYSTEM.md` | `resource-loader.ts:1207` (global; project `.pi/SYSTEM.md` at `:1202`) |
| `demos/pi/settings.json` (`shellPath`, `theme`, `tuiMode`, `autoResize`) | `~/.pi/agent/settings.json` | `config.ts` `getSettingsPath` = `agentDir/settings.json` |
| `demos/pi/dolly-theme.json` | `~/.pi/agent/themes/dolly.json` | `resource-loader.ts:981,1042` |
| `demos/pi/skills/dolly/SKILL.md` | `~/.pi/agent/skills/dolly/SKILL.md` | `resource-loader.ts:979` |

`agentDir` is `$PI_CODING_AGENT_DIR` or `~/.pi/agent` (`config.ts:585,606-611`). The package has no build: a recipe without `FROM` that `SOURCE`s the five staged files and retains them (`FILE` rows), `REQUIRES HOST runtime@0` only; `pi` loses its five `SOURCE`/`FILE` rows; `pi-runtime` adds `INSTALL pi-dolly`. Installed onto a Pi from npm it works the same: these are user-directory files, nothing of Pi's package. Two consumers write their own `settings.json` over it (`Dollyfile-pi-local` `FILE /home/dolly/.pi/agent/settings.json` with the WebGPU provider; Studio adds skills, prompts and an extension beside it): the row order decides, as today. `dolly-docs` is already a package `pi-agent` installs (`Dollyfile-pi-agent:20`); `SYSTEM.md` and the skill name `/usr/share/doc/dolly`, so `pi-dolly` could `INSTALL dolly-docs` ("a program package brings what its programs start") at 253,597 bytes. `pi-agent` becomes `FROM pi-runtime` as now, or, with Pi from npm, an application that `INSTALL`s the installer and `pi-dolly` and whose `init.slop` installs Pi before starting it.

## 5. Steps

The image inputs hash (`scripts/write-build-id.mjs:8-11`: `dolly.data`, the process, dso, kernel-plugin and image wasm) is untouched by all of this; nothing forces a catalog rebuild. Costs are recipe repins.

| # | Step | Verification (Chromium and Firefox) | Rebuilds |
| --- | --- | --- | --- |
| 1 | Measure, no code: in a `system` session with `janis`, `curl … | gzip -dc | tar -xf -` Pi 1.0.3's and Claude Code's tarballs (pax/long names), `janis dist/bundle/cli.js --version` and `dist/cli.js --version` with their externals absent, the six `/v` regexes on a `quickjs` built at 0.17.0 in a worktree, the dependency tree for version conflicts | the numbers go into the task | 0 (the 0.17.0 trial: `quickjs` alone, 14.9 s measured in the split) |
| 2 | `pi-dolly` package; `pi` drops the five rows; `pi-runtime` installs it | `pi-browser.mjs` unchanged (header, skill, `download`); new amy case: `pi-dolly` alone into `default` puts the five files in place; `recipes.test.mjs` names the package | `pi` and its 10 dependents |
| 3 | The installer package (B), fixture registry in its test (metadata + tarball of a dependency-free fixture package served by the test origin, as `redirectFetch` does for Claude Code); amy case: install into `default`, a `bin` launcher runs | `demos/javascript/test/` new browser test; `node-oracle.mjs` case for sha512 if it goes into Janis | 1 (plus the `janis` chain if sha512 goes into Janis: 14 images; defer to step 5's round) |
| 4 | `closed-source-agent` uses it | its existing browser test (one GET of the tarball, nothing before the key, `--bare` turn) | 1 |
| 5 | Only if the owner chooses option 2 or 4 of section 3: Pi from pinned npm tarballs; remove `pi-build` and the eight files in section 2; `pi-dolly` unchanged | `pi-browser.mjs` rewritten with Pi's tarballs served from the test origin; game tests (`bhop` 206.7 s, `classicube` 321.3 s, `rts` 370.7 s, `speech` 49 s, measured in the split), `local-llm`, `studio` | the Pi chain and games: 16 recipes (3 min 45 s + 4 min 11 s of builds measured in the split) |

Step 2 can land alone and first; steps 3-4 do not touch `pi`.

## 6. What I could not find out

- Whether QuickJS-ng 0.16/0.17 parses and matches Pi's six Unicode-set regexes correctly (release titles say nothing; needs the trial build).
- Whether Dolly's `tar` extracts Pi's 1,248-file tarball (pax headers, long scoped paths) and whether the bundle's lazy `require` of `jiti`, `photon-node`, `quickjs-wasi` fails at load or only on use under Janis.
- Whether Pi 1.0.3's resolved tree needs two versions of any package (nesting), and how long a full Pi install takes through the broker.
- What Pi's `runNpmCommandSync` ("package lookup") invokes, so the installer can answer it.
- Whether the owner wants "run" to mean `/usr/bin` launchers from `bin` or a `run` verb; and his answer to section 3.

### Critical Files for Implementation
- /home/daug/dev/dolly/demos/javascript/janis.js
- /home/daug/dev/dolly/demos/closed-source-agent/Dollyfile-closed-source-agent
- /home/daug/dev/dolly/demos/pi/Dollyfile-pi
- /home/daug/dev/dolly/demos/pi/Dollyfile-pi-build
- /home/daug/dev/dolly/demos/pi/test/recipes.test.mjs