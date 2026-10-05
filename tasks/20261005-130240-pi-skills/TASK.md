# Update the Pi skills for Dollyfile 6, packages, amy and host modules

- STATUS: OPEN
- PRIORITY: 285
- TAGS: pi,studio,skills,docs

Requested by the owner on 2026-10-02: the skills Pi loads inside Dolly should
reflect everything that landed since they were written, in Dollyfile Studio too.

## Evidence (main `18e445e7`)

- `demos/pi/skills/dolly/SKILL.md` (65 lines) is installed at
  `/home/dolly/.pi/agent/skills/dolly/SKILL.md` by `pi-coding-agent`, so every
  image built on it carries it (`pi`, `pi-local`, `dollyfile-studio`, and the
  games with an agent). It says nothing about Dollyfile 6 (`APPLICATION`,
  `TOOLCHAIN`, `PACKAGE`, `INSTALL`, `RUN`, `REQUIRES HOST`), `amy`, or model
  packages, and its repository map still lists `modules/`, which no longer exists.
- `demos/studio/skills/dollyfiles/SKILL.md` (117 lines) and `neovim.md` were
  brought to Dollyfile 6 Phase 3 in `8736d36f`, but never mention `TOOLCHAIN`,
  `PACKAGE`, `amy`, Emacs or the model packages.
- Still to land and then to cover: the host-modules contract batch
  (`core/host-modules-2`) and `input@0` (`20261002-072000-input-host-module`).

## Done when

- Each skill is checked line by line against `docs/dollyfile.md`,
  `host/README.md` and the current tree, and states only what holds.
- A Pi session in `pi` and one in `dollyfile-studio` each complete a task that
  needs the new material (install a package with `amy`; write and build a
  `DOLLY 6` recipe with an explicit `REQUIRES HOST` set) using the skill alone.
- The skills stay short: update and delete before adding.

## Owner (2026-10-05)

"The pi dolly skills inside the image are completely outdated, it needs a lot
better knowledge about the environment (including amy etc.)."

`~/Downloads/AUDIT-sandbox-painpoints.md` is the list of what a capable agent got wrong for lack of this knowledge
(§10 on the skill itself): the skill describes a repository checkout (`npm run
image`, `docs/`, `test/`, cloning into `/workspace`), not the machine the agent
is in. What the agent needed and had to discover: `git clone` cannot work but
`api.github.com` and `raw.githubusercontent.com` do; curl's option subset and
`timeout`; Slop's limits; `make -j` as the parallel path; linking
`/usr/lib/libdolly-js.a`; which host modules the image has; Janis's shape
(`.mjs`, no `require`); what exit 126 means; the display input record layout.

Additional done-when: an agent given only the skill answers those points
correctly in a real session, and the skill is generated or checked against the
image it ships in wherever a fact can be read from the image.
