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
