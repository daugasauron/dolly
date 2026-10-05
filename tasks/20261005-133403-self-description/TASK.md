# Images carry no description of their own interface

- STATUS: OPEN
- PRIORITY: 290
- TAGS: core,userspace,docs,agent

From the big-picture review (`20261005-131642-big-picture`). The secondary
goal is to "define the API an agent operates against". That API is defined in
the repository (`abi/`, `include/dolly/`, `docs/`) and enforced by loaders,
but an agent inside an image can read almost none of it. `AGENTS.md` layer 4
says agent-facing behaviour "emerges from ordinary commands and files"; no
file in any image describes the platform.

## Evidence

- `~/Downloads/AUDIT-sandbox-painpoints.md` §10: the agent could read the
  process model, Slop's language, the HTTP rules and the display records only
  by fetching `raw.githubusercontent.com`. Many of its findings (§1-§12)
  are facts `docs/` already states precisely: 256 descriptors and 32 processes
  (`docs/process-model.md`), serial pipelines and the unsupported expansions
  (`docs/slop.md`), CORS and the single failure message (`docs/http.md`), the
  126 status, `-pthread` needing `threads@0`.
- No recipe retains documentation: `grep -rn "share/doc" Dollyfile* demos/*/Dollyfile*`
  finds nothing. Images hold headers in `/usr/include/dolly/` and their own
  recipes in `/etc/dolly/recipes/`, which describe contents, not the interface.
- The same facts are hand-copied three times and the copies rot:
  `docs/slop.md` (the language table), the `help` command's fixed text
  (`Dollyfile-system-build:356`, `help.c`) and the Pi skill
  (`demos/pi/skills/dolly/SKILL.md`), whose "Repository map" (line 30) and
  `npm run` steps (lines 43-58) describe a checkout the agent is not in.
- The eight documents that describe what a program inside can observe
  (`process-model`, `slop`, `http`, `display`, `dollyfile`, `sessions`, `gpu`,
  `audio`) are 928 lines and are already published with each release
  (`scripts/package-pages.sh:59`).

## Work

No new prose. One source, shipped where the agent is:

- A core `PACKAGE` that retains those documents (and the WAT contracts of
  `abi/` and `host/*/`) under `/usr/share/doc/dolly/`, each a `SOURCE` row
  pinned to the release's bytes. Applications that host an agent `INSTALL`
  it; any session gets it with `amy install`. As a leaf install, a document
  edit rebuilds only those applications, not the toolchains.
- `help` names that directory instead of repeating the language table; the Pi
  skill points there and loses its copy (`20261005-130240-pi-skills`).

The other two halves of the same gap are tracked where the code is: refusals
that say their cause to the program that asked (`20261005-131643-silent-126`),
and limits readable through `sysconf`/`getconf`
(`20261005-131650-userspace-gaps`).

## Done when

- In `default` and `pi`, `/usr/share/doc/dolly/` holds the release's documents
  byte for byte (the recipe pins prove it).
- With HTTP denied by policy, a Pi session answers from files in the image:
  the descriptor and process limits, why `seq 1 999999999 | head` does not
  stop, what exit status 126 means, and which host modules the image declares.
- The Slop language is described in one tracked file; `help` and the skill
  point to it.
- `npm run image -- pi --plan` after a one-word edit of `docs/slop.md` lists
  only the images that install the package; the list is recorded here.
