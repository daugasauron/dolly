# Eight toolchains that their READMEs call build-only have an ENTRY, so each has a page that opens

- STATUS: CLOSED
- PRIORITY: 140
- TAGS: catalog,dollyfile,owner

Found by [the investigation of the roles](../20261013-144241-roles/investigation.md)
(2026-10-14), checked by the integrator against the recipes. Not acted on.

Done when: the owner has said which of the two is meant, and the recipe and
the README of each say the same: either the `ENTRY` goes (the image then
only builds, as `system-build` and `zig-build` do since Dollyfile 6), or the
README stops saying "build-only".

## Closed (2026-10-14)

Owner (2026-10-14), on the tasks that waited for him: "I'm not gonna go
through 35 tasks, I'm sure some are not relevant anymore and some are
confirmed actual good fixes. If your investigation confirms they are fixes
that improve things and aligh with the main goal of the project go ahead. If
you're uncertain, give me a short description".

The `ENTRY` rows stay and the READMEs stop saying "build-only": they call the
eight "a build stage". Two things the task did not know decide it. Tests
open one of them: `demos/zero-ad/test/0ad-engine-browser.mjs:26` goes to
`/zero-ad-engine/`, and the multiplayer test starts the engine there. And a
shell in a build stage is how its result is looked at, as `rust-tools` and
`typescript-build` were kept "inspectable" by Dollyfile 6. Taking the row
out would rebuild LLVM, Mojo, 0 A.D. and the 22 packages on `tools-build`
to remove eight pages no visitor meets. READMEs are no image input: the
plan builds nothing.

## As filed (2026-10-14, `integrate/round-1013` `6d659acf`)

- The eight: `llvm-build`, `llvm-tablegen`, `mojo-build`, `mojo-llvm`,
  `tools-build`, `zero-ad-deps`, `zero-ad-engine`, `zero-ad-spidermonkey`.
  Each has `ENTRY /bin/foreground -i /bin/slop` and `REQUIRES HOST
  display@0`, so `scripts/generate-routes.mjs` writes `/NAME/index.html`
  for it. Each is "build-only" in its demo's README.
- None is on a published list (`config/domain-pages-images.txt`), so a
  visitor of the site does not meet the pages; a checkout serves them.
- Dollyfile 6 took the `ENTRY` from the two toolchains that only build:
  "a toolchain with ENTRY can be opened; one without only builds.
  `system-build` and `zig-build` lose their dead ENTRY"
  ([the design](../20261001-214000-dollyfile-v6/TASK.md)). The same design
  kept `system`, `rust-tools` and `typescript-build` openable to "stay
  inspectable". No task or commit says which of the two these eight are:
  `zero-ad-deps` and `zero-ad-engine` have their `ENTRY` from DOLLY 5, where
  every image needed one; the other six were written with one.
- An open shell in a build image is how a failed build is looked at; that
  may be the reason. Not recorded anywhere.
- Either way it is the recipe's last line: a change repins each of the
  eight and everything built on it (0 A.D., LLVM, Mojo, the 22 packages on
  `tools-build`), so it rides a catalog round.
