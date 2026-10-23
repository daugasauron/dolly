# One npm installer in Janis for pi, Claude Code and other packages; Pi's Dolly extension as its own package

- STATUS: OPEN
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

## State (2026-10-23, 14:30): building `janis-install`, branch `demo/janis-install`

Integrator's brief: the command is `janis-install NAME[@VERSION]`, a package of its own (one
Janis script linked with the QuickJS runner as `tsc` is), not a `janis` subcommand and never
called `npm`. Steps: 1 measure (done, below); 2 the package with a fixture-registry browser
test; 3 `closed-source-agent` installs Claude Code with it; then stop: Pi from npm and
`pi-dolly` wait for the `pi-local` agent, because they touch the same Pi files.

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

## State (2026-10-23, 12:40): investigated, the owner's to read

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
