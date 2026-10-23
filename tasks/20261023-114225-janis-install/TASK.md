# One npm installer in Janis for pi, Claude Code and other packages; Pi's Dolly extension as its own package

- STATUS: CLOSED
- PRIORITY: 190
- TAGS: javascript,packages,0.1.4

Owner (2026-10-23): "I want to investigate breaking up pi-agent, claude etc into one
"generic" package handler in janis that then does "janis install pi/claude" (or
equivalent) meaning it can isntall and run generic npm packages. I also want teh pi
extension for dolly (that includes system prompt, extensions etc) to be a separate amy
package."

Today Pi is compiled from its pinned TypeScript sources inside Dolly (`demos/pi`,
`pi-build`); `pi-runtime` adds the Dolly prompt, settings, theme, tools and skill; Claude
Code is fetched from npm by its own launcher (`demos/closed-source-agent`).

Done when the investigation is in `investigation.md` here, read by the owner, and what he
accepts is tasks of its own.

## State (2026-10-24): steps 1 to 5 done (step 5 on branch `demo/opus-audit-2`, below); `pi-dolly` done

## State (2026-10-23, 15:00): steps 1 to 3 done; Pi from npm and `pi-dolly` wait, branch `demo/janis-install`

Integrator's brief: the command is `janis-install NAME[@VERSION]`, a package of its own (one
Janis script linked with the QuickJS runner as `tsc` is), not a `janis` subcommand and never
called `npm`. Done: 1 measured; 2 the package and its fixture-registry browser test; 3
`closed-source-agent` installs Claude Code with it. Left, after the `pi-local` agent reports
(the same Pi files): Pi from pinned npm tarballs (section 5, step 5 of the investigation),
with what step 2 found below (`enableCompileCache`, the `/v` regexes, the key mask), and
`pi-dolly`. Janis's two path gaps are [their own task](../20261023-145214-janis-node-paths/TASK.md).

## Step 5, Pi from npm (2026-10-23 night, branch `demo/opus-audit-2`)

Done and measured on the merged tree (`core/npm-packages` at `f2677945` merged in), all but
the final build, which needs `rust-build` on the new seed (the integrator's hugebuild):
- `janis-install --registry COPY` reads a copy of the registry's files instead of fetching:
  `COPY/NAME/metadata.json` and the tarballs where their URLs put them; a name the copy lacks
  is refused, so an optional one is skipped. A case of `janis-install-browser.mjs` installs
  from a copy written in the session with no request (Chromium 5.2 s, Firefox 5.8 s).
- `demos/pi/prepare-pi-npm.mjs` makes that copy from `package-lock.json`, which already pins
  Pi 1.0.3's tree with its integrity: 120 tarballs (checked with sha512, cached in
  `.cache/npm`) and 116 `metadata.json` written from the tarballs' own `package.json`, so
  nothing but the lock decides it; staged as `dist/static/default/pi-npm.tar` (24.4 MB).
- `Dollyfile-pi`: `FROM system`, `INSTALL janis-install`, `ripgrep`, `fd`; `janis-install
  --registry /tmp/pi-npm @earendil-works/pi-coding-agent@1.0.3`, then `pi.c` linked as
  before runs `dist/cli.js`. Gone: `pi-build` and its compile, `pi-tsconfig.dolly.json`,
  `pi-secret-input.patch`, `pi-runtime-packages.txt`, `build-pi-runtime-packages.mjs`,
  `pi-runtime-census.mjs`, the `PI_SOURCE` pin; the licences page reads the copy's metadata
  (the `npm packages` row now holds Pi itself too); `docs/licences.md` adds 0BSD.
- The key: Pi's own key prompt at `/login` is upstream's and is not used for keys: it shows
  what is typed. `pi-key VARIABLE` (pi-dolly) reads a key with `secretenv`, now a package of
  its own (`demos/closed-source-agent/Dollyfile-secretenv`, which Claude Code's launcher
  installs), and starts Pi with it in that one environment variable, as the Claude Code
  launcher does; Pi's notice says so. `pi-browser.mjs` checks that Pi lists no OpenRouter
  model without a key, that `pi-key OPENROUTER_API_KEY --list-models openrouter` lists them
  after a typed and a pasted half of a key, and that no screen and no file under
  `~/.pi` holds any 4 characters of it.

Measured:
- In `default` with `janis-install` and `cc` (`build/opus-evidence/r3/probe-npm.*.out`,
  Chromium and Firefox): 120 packages from the copy, 0 bytes fetched, 2.6 s / 3.3 s; esbuild's,
  `@google/genai`'s and protobufjs's scripts named and not run; 26 optional esbuild binaries
  skipped; `pi --version` 1.0.3; `--list-models openrouter` empty without a key and full with
  `OPENROUTER_API_KEY` set; `@earendil-works/pi-telemetry` imports.
- A trial pi-agent (this recipe without its two Rust rows, not committed, since `ripgrep`
  and `fd` need `rust-build` on the new seed) passes `pi-browser.mjs` with its ripgrep and fd
  steps left out: Chromium 47.4 s, Firefox 49.3 s. An Opus 5.5 session on it
  (`r3-npm-game/`, the key typed at `pi-key`'s prompt, never on screen) built a 1,065-line
  raylib game with no failed call, $1.170.
- Size: `pi` 113,970,985 bytes (62,357,079 compiled from source), `pi-agent` 294,103,107
  (229,729,700). The npm tree is 111 MB unpacked: 30.4 MB of source maps and 20.3 MB of
  TypeScript declarations ship as npm installs them (the old build left them out), 9.0 MB is
  Pi's own `dist/bundle`.

Decided by the integrator: janis-install keeps every file npm installs (a model compiling
TypeScript against a library needs its `.d.ts`); `pi`, an application nothing compiles
against, deletes `*.map`, `*.d.ts`, `*.d.mts` and `*.d.cts` from its tree after the install
(`52a0d425`). On the trial: `pi` 62,515,625 bytes (113,970,985 before, 62,357,079 compiled
from source), `pi-agent` without `rg` and `fd` 242,647,477 (294,103,107 before);
`pi-browser.mjs` passes on it (Chromium 57.2 s).

On the `559ad049` seed (after the `65736016` merge; `quickjs`, `janis`, `sbase`,
`janis-install`, `secretenv`, `typescript` rebuilt here, the base hard-linked from
`work/x11fix`): `janis-install-browser.mjs` passes in Chromium (5.5 s) and Firefox (10.6 s),
`javascript-browser.mjs` in Chromium (29.4 s) and Firefox (36.9 s).

Final (2026-10-24, `b675b30f`: `core/npm-packages` at `748eed22` merged, image inputs
`54c70100`): the base, `rust-sdk`, `rust-llvm`, `rust-build`, `ripgrep` and `fd` are
`work/x11fix`'s builds, hard-linked (every one plans as reuse); built here: `quickjs`,
`janis`, `tools-build`, `sbase`, `janis-install`, `secretenv`, `dolly-docs`,
`libdolly-gpu`, `closed-source-agent`, `pi`, `pi-dolly`, `pi-runtime`, `pi-agent`.
`demos/pi/test/pi-browser.mjs`, whole (ripgrep and fd included), passes in Chromium
(51.8 s) and Firefox (52.8 s); `closed-source-agent-browser.mjs` (its launcher on the
`secretenv` package) in Chromium (41.3 s) and Firefox (45.5 s). Sizes: `pi` 62,587,581
bytes, `pi-runtime` 253,993,877, `pi-agent` 254,111,272 (`system` is 173,462,872 on this
seed; the source-built `pi` was 62,357,079 and `pi-agent` 229,729,700 on the old seed).
Not rebuilt here: the images that install `pi` or `pi-dolly` besides these (`bhop`,
`slopyard`, `classicube`, `rts-arena`, `pi-phone`, `pi-local`, `dollyfile-studio`), for
the round.

Earlier plan, done above: build `rust-build`, `ripgrep` and `fd` on the integration branch's newest seed (the
integrator's, in `work/x11fix`: the Rust compiler seed is stamped with the process
contract, which execve changed), merge that seed here, then `pi` to `pi-agent`, run `pi-browser.mjs` whole in both
browsers, measure `pi-agent` with `rg` and `fd`, and the images on `pi`.

Build note: `f2677945` changed `host/input/input.h` and `input-abi.h` without repinning
`system-build`; these measurements ran with the two headers and `abi.mjs` of `f2677945~1` in
the working tree (not committed), on the `1ee15fc6` snapshots of `work/terminal`,
hard-linked. Since then the branch has `65736016` merged (seed `559ad049`) and repins
`Dollyfile-system-build`'s lines 16-17 (the two headers) as `work/x11fix` does (`d8a61e72`);
its base images are `work/x11fix`'s, hard-linked.

## Step 5's blockers (2026-10-23 evening, branch `demo/opus-audit-2`)

- **`enableCompileCache`**: Janis's `node:module` has it and `constants.compileCacheStatus`
  (Node's four values); it returns `{ status: FAILED, message: "Janis has no compile cache" }`,
  since Janis compiles each module as it loads it: an unimplemented operation does not report
  success. Pi 1.0.3's `dist/bundle/cli.js` imports it by name and calls it on its second
  line. A `node-oracle.mjs` case imports it (the whole oracle failed to link before) and a
  source test checks the status. Verified with the Janis chain rebuilt: the javascript test
  in Chromium and Firefox, `pi-browser.mjs` in both.
- **The `/v` regexes**: the published bundle builds six with `new RegExp(..., "v")`, not the
  literals `pi-quickjs-compat.mjs` lowers (`\p{Default_Ignorable_Code_Point}`, set
  subtraction, `\p{RGI_Emoji}`). Measured natively (`build/opus-evidence/qjs/`, `qjs`
  built with upstream's CMake; every code point and seven sequences against Node 22):
  QuickJS-ng 0.15.0, the pinned one, refuses one ("invalid class range") and matches nothing
  or almost nothing with the other five; **0.17.0 gives Node's answer for all six**.
  Done here: the `quickjs` pin is 0.17.0 (`6d46d07d`, same files as upstream's CMake
  builds), and `pi-build` no longer lowers Pi's TUI regexes (`pi-quickjs-compat.mjs` is
  gone), so Pi runs its six `/v` expressions as written. A `node-oracle.mjs` case builds
  six Unicode-set expressions (`\p{Mark}`, set subtraction, `\p{Default_Ignorable_Code_Point}`,
  `\p{RGI_Emoji}`): native 0.15.0 answers `[false, "invalid class range", "invalid class
  range", false, false, false]`, Node and 0.17.0 `[true, true, false, true, true, false]`.
  Rebuilt `quickjs`, `janis`, `typescript`, `pi-build`, `pi`, `pi-runtime`, `pi-agent` and
  `closed-source-agent`; passed: the javascript test (Chromium 30.1 s, Firefox 35.2 s),
  `pi-browser.mjs` (Chromium 60.3 s, Firefox 63.6 s) and `closed-source-agent-browser.mjs`
  (Chromium 44.7 s: Claude Code under Janis on 0.17). Stale until the round: `slopyard`,
  `bhop` and the other images on the Janis chain.
- **The key mask**: Pi 1.4.0 (npm `latest`, 2026-10-23) still has no `mask` or `secret` in
  `pi-tui`'s `input.js` or the login dialog, so with Pi as published a key typed at
  `/login` shows in clear. Decided by the integrator: no patch of published files; keys go in
  as `closed-source-agent` reads them (step 5, `pi-key`).
- **The entry to run is `dist/cli.js`, not the bundle.** Measured on this branch's Janis
  (QuickJS-ng 0.17, `enableCompileCache`) in pi-agent, Pi 1.0.3's tarball from the registry
  (`build/opus-evidence/r2/probe/probe5*.out`, Chromium): `janis package/dist/cli.js
  --version` prints `1.0.3` (it failed on the `/v` regexes before); `dist/bundle/cli.js`
  (`bin`) passes `enableCompileCache` and then needs Node 22's `require` of an ES module
  (`createRequire(import.meta.url)("./cli-runtime.js")`), and, tried with a trial
  implementation of that, stops at `Blob is not defined` inside the undici it bundles: the
  bundle carries the real undici, whose sockets cannot work here, where Janis's built-in
  `undici` stands in for `dist/cli.js`'s import. So the launcher runs `dist/cli.js` with the
  tree `janis-install` writes; the trial `require(esm)` was not kept (no other consumer).
- `janis-install` is on `core/npm-packages`, not on this branch (cut before the merge, on
  the old seed), so Pi from pinned tarballs is built after the round, on the merged tree.

## Step 1, measured (2026-10-23)

In a `default` session after `amy install janis sbase gzip`, tarballs fetched with `curl`
through the page's broker (no policy), `build/janis-evidence/scripts/measure-unpack.mjs`,
logs `measure-unpack-{chromium,firefox}.log` there. Milliseconds are wall time of the
command, Chromium / Firefox:

| | Pi 1.0.3 (`@earendil-works/pi-coding-agent`) | Claude Code 2.1.112 |
| --- | --- | --- |
| tarball | 7,474,225 B, 1,248 files, all type `0`, no directory entries, no pax header, longest path 77 | 18,679,326 B, 20 files, all regular |
| download | 1,441 / 1,393 | 2,541 / 2,419 |
| `gzip -dc > FILE` | 135 / 149 (23,693,824 B) | 306 / 347 (49,344,512 B) |
| `tar -xf FILE` | 1,180 / 1,776, 1,248 files | 2,419 / 4,349, 20 files |
| `gzip -dc \| tar -xf -` | 1,130 / 2,166, 1,248 files | 2,328 / 5,118, 20 files |
| `sha512sum` (sbase) | 168 / 210, equals npm's `dist.integrity` | 422 / 460, equals |
| SHA-512 in JavaScript under Janis | 13,663 / 14,221 | 24,566 / 24,055 |
| Janis's own `createHash("sha256")` | 9,883 / 9,687 | 23,104 / 23,923 |

Abbreviated metadata (`Accept: application/vnd.npm.install-v1+json`, which the broker
passes): Pi 100,102 B, Claude Code 518,912 B, `@img/sharp-linux-x64` 49,367 B, 241 to 343 ms
each; it carries `dependencies`, `optionalDependencies`, `peerDependencies`, `bin`, `os`,
`cpu`, `hasInstallScript` and `dist` (`integrity`, `shasum`, `tarball`), not `scripts`.

The core's `tar` (files and directories only, no pax) extracts both tarballs unchanged; the
`tar` package is not needed.

Pi 1.0.3's tree, from a native `npm install --omit=dev --ignore-scripts` (evidence only):
120 packages, 156 MB on disk, four nested (`@aws-sdk/token-providers`, `gaxios`'s
`agent-base` and `https-proxy-agent`, `proper-lockfile`'s `retry`), none optional, none
with `os`/`cpu`, two with install scripts (`@google/genai` preinstall `echo
'preinstall: no-op'`, `protobufjs` postinstall `node scripts/postinstall`), every peer
dependency either optional or already in the tree, no `binding.gyp`; `pi-tui` ships
`.node` prebuilds for win32, linux and darwin that it loads only on those platforms.

Decisions:

- **sha512 is checked by `sha512sum`, which the installer's package installs (`sbase`), not
  by Janis's `createHash`.** Measured: a JavaScript SHA-512 under QuickJS takes 13.7 s for
  Pi's 7.5 MB tarball and 24.6 s for Claude Code's, 80 and 58 times `sha512sum`'s 168 and
  422 ms; Pi's 120 tarballs would add about a minute of hashing to an install. The
  installer already spawns `gzip` and `tar`; a third tool is the same shape, and Janis
  (and the 14 images built on it) does not change. `createHash("sha512")` goes into Janis
  when a program run under it needs Node's API, with a `node-oracle` case. `dist.shasum`
  (sha1, `sha1sum` from the same package) is used only for a version that has no
  `integrity`.
- **Lifecycle scripts are not run and are named; a package that would compile a native
  addon (`binding.gyp`) is refused.** Refusing every package with an install script would
  refuse Pi (its two scripts are a no-op echo and a version notice). `.node` files are not
  refused at install time: Pi's own `pi-tui` carries them for other platforms; Janis fails
  by name when one is loaded.

## Step 2, the `janis-install` package (2026-10-23)

`demos/javascript/janis-install.mjs` (about 370 lines) linked as `/usr/bin/janis-install` by
`janis-install.c`; `Dollyfile-janis-install` is `FROM system-tools` and `INSTALL`s `janis`,
`gzip` and `sbase` (for `sha512sum`), so `amy install janis-install` brings all four
(measured in `default`, 550 to 760 ms). README section "janis-install" says what it does.

- Versions: node-semver's grammar and npm-pick-manifest's choice (a tag; for a range the
  `latest` tag when it satisfies, else the highest). Checked natively against node-semver on
  22,532 range/version pairs (every range in Pi's tree among them): 0 differ.
- Tree: breadth first; a version goes to the top unless another version of the name is on
  the dependent's path, then beside the dependent. Pi 1.0.3's tree natively: the same 120
  packages at the same versions and the same 15,140 files as `npm install`, two placed
  differently (`retry` 0.12/0.13 swapped between top and nested; `agent-base` nested one
  level deeper), and every one of 251 dependencies resolves, as Node resolves, to a version
  that satisfies it.
- **Unpacking is JavaScript in janis-install, not the session's `tar`.** Measured on Pi's
  120 tarballs: Dolly's `tar` refuses three (`buffer-equal-constant-time` has pax headers,
  `agent-base` and `https-proxy-agent` name `package/./dist/index.js`); sbase's (the `tar`
  package) refuses every npm tarball ("invalid checksum": node-tar writes the field as
  `NNNNNN \0`, sbase's `chktar` trims only trailing spaces). The reader does what pacote asks
  of node-tar: strip the first component (`@types/node`'s is `node/`, `retry`'s `retry/`),
  files and directories only, links skipped, pax `path` and GNU long names, `..` refused.
  `gzip -dc` still decompresses (Janis's `zlib` is a stub).
- Pi 1.0.3 from the registry in a `default` session (Chromium, default policy): 120
  packages, 24,664,071 bytes fetched, 15.2 s (Firefox 18.1 s); 110 MB in `/usr/lib/node_modules`. For the Pi
  step: `pi` (`dist/bundle/cli.js`) then fails `SyntaxError: Could not find export
  'enableCompileCache' in module 'node:module'` and `dist/cli.js` `SyntaxError: invalid class
  range` (the `/v` regexes); `build/janis-evidence/probe-install-pi-chromium.log`.
- Test: `demos/javascript/test/janis-install-browser.mjs` with
  `test/fixtures/npm-registry.mjs`, made-up packages in npm's tarball shapes served under
  `/npm/` by the test origin, the page's registry fetches redirected there after the broker
  admits them (policy: `registry.npmjs.org`, GET). Passed in Chromium (10.5 s) and Firefox
  (7.0 s). `test/amy-browser.mjs` has its `tools` row (after `sbase`, whose commands it
  brings); the whole of `test/amy-browser.mjs` passed in Chromium and Firefox with it
  (`amy install janis-install` 143 ms, its dependencies already there). Commit `d01154f6`.
- Janis gaps it met, not fixed here (each repins the Janis chain), filed as
  [their own task](../20261023-145214-janis-node-paths/TASK.md): `fs` takes a `URL` object
  as the string `file:///…`, and `require` of a directory ignores its `package.json` `main`.

## Step 3, `closed-source-agent` (2026-10-23)

The launcher's download, `sha256sum`, `gzip` and `tar` lines are one row, `janis-install
--integrity sha512-9FUg… @anthropic-ai/claude-code@2.1.112`; the recipe `INSTALL`s
`janis-install` (which brings `janis`) instead of `janis` and drops `REQUIRES TOOL curl cut
gzip sha256sum tar`. The package is now `/usr/lib/node_modules/@anthropic-ai/claude-code`,
and the session gets `/usr/bin/claude`. The pinned tarball is fetched without metadata; its
nine optional `@img/sharp-*` are skipped (for other platforms against the registry; refused
by the test's policy, which admits only the tarball). The notice, `anykey`, `secretenv` and
the flows are unchanged. Commit `bcbdf36b`.

- `closed-source-agent-browser.mjs` passes in Chromium (43.8 s) and Firefox (49.2 s); the
  only test edits are the package path and `/opt` leaving the key search.
  `closed-source-agent.artifacts.mjs` passes (no file of the package in the image).
- In a `default` session against the registry (Chromium): 4.6 s for the 18.7 MB install,
  nine metadata requests included, 20 files (`build/janis-evidence/probe-claude-chromium.log`).
- Building it here needed the source staging of `ripgrep`'s Rust chain, which this tree
  lacks (`build/rustc-port` is 16 GB in the integration tree): the images were built with
  `update-recipe-pins`, `generate-routes` and `build-system-snapshot.mjs`, all other images
  cache hits, `dist/static` unchanged.

## Decided (2026-10-23, 13:10): Pi comes from npm, for v0.1.4

Owner: "Can you make pi come from npm?" Option 4 of [the investigation](investigation.md),
section 3: one installer, a package of its own that runs under Janis (shape B), used by
recipes and sessions alike. Images install Pi at build time from pinned npm tarballs staged
by the site, as `typescript` is, so they open offline; a session installs any npm package
with it. `pi-build` and Pi's compile from TypeScript go. Claude Code's launcher uses the
installer. Measured first (step 1): Dolly's `tar` on Pi's tarball, Pi's six Unicode-set
regexes under QuickJS-ng, and the login dialog showing a key. The key mask is a Dolly patch
today; with Pi as published it must come back by another way (upstream, or keys read as
`closed-source-agent` reads them), not be dropped silently. [pi-dolly](../20261023-122320-pi-dolly/TASK.md)
is the extension's half.

## Investigation (2026-10-23, 12:40)

[investigation.md](investigation.md), by a read-only Fable agent. Spot-checked: Janis's
`zlib` is a stub (`janis.js:3039`), its `createHash` has sha256, sha1 and md5 only
(`janis.js:1966-1970`), `Dollyfile-pi:18-31` installs the five Dolly files under
`/home/dolly/.pi/agent/`, and registry.npmjs.org answers with
`access-control-allow-origin: *`.

In short: no npm client runs under Janis unchanged (no zlib, no socket `http`, no
sha512); an installer that spawns `gzip` and `tar` is new code, about 400 to 600 lines
(inferred), best as a package of its own rather than a `janis` subcommand. Claude Code's
launcher would use it with one image rebuilt. Pi from npm is the owner's decision (section
3: compiled inside today; four options), and it loses the key mask and needs the regex
lowering applied to published bytes. `pi-dolly`, the five files as an amy package, is
independent and cheap: `pi` and its dependents rebuild.
