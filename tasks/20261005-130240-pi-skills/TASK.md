# Update the Pi skills for Dollyfile 6, packages, amy and host modules

- STATUS: CLOSED
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

## Review note (2026-10-05, `20261005-131642-big-picture`)

The facts the skill lacked are core facts, needed by any agent (Codex too),
and `docs/` already states them. `20261005-133403-self-description` ships
those documents in the image as a package; the skill should then point at
`/usr/share/doc/dolly/` and keep only what is specific to Pi, instead of
becoming a fourth hand-kept copy.

## Rewrite (2026-10-05, `work/pi-1`)

Both skills now speak from inside the image and follow the review note: they
say how to discover a fact on the machine (`cat /etc/dolly/Dollyfile`,
`ls /bin /usr/bin`, `help`, `amy list`, `/usr/include/dolly/`, the Studio copy
of `dollyfile.md`) and keep only judgement the machine cannot tell: what the
network reaches and how to get source without `git clone`, which shell idioms
work, `make -j` as the parallel path, that Dolly headers link their clients
without `-l`, what 126 means, Janis's module shape. No interface reference is
pasted in. When `20261005-133403-self-description` lands, the discovery lines
gain `/usr/share/doc/dolly/`.

- `demos/pi/skills/dolly/SKILL.md` (65 → 94 lines, all replaced): machine, discovery,
  network and source fetching (raw, a jsDelivr tree listed with Janis and
  fetched with a `make -j` Makefile, npm tarballs through `gzip -dc -`), Slop,
  C/C++ and 126, Janis. The repository map and `npm run` steps are gone.
- `demos/pi/SYSTEM.md` (always in context) says what the machine is and to
  read the `dolly` skill before installing, fetching, compiling or diagnosing.
- `demos/studio/skills/dollyfiles/SKILL.md` (117 → 74 lines): workflow, the
  rules that cost retries (roles, the complete `REQUIRES HOST` set including
  installed packages' modules, `FILE` bodies), where pins come from (the
  package index at `packages.dolly.invalid/v1/index`, `sha256sum` of
  `/etc/dolly/recipes/*`), and a pointer to the shipped `dollyfile.md`.
- `pi` and `dollyfile-studio` now declare `packages@0`: the skill teaches
  `amy`, and without it `amy` refused in both images.
- `demos/pi/test/pi-browser.mjs` proves what the skill teaches in the image:
  `amy install`, the `make -j` fetch Makefile, a `<dolly/display.h>` program
  linking with no `-l` and stamping `dolly.hostdisplay`, and a `gpu.h` program
  exiting 126 in an image without `gpu@0`.

Every statement was run in the `pi` or `dollyfile-studio` image in headless
Chrome (`build/pi-evidence/out/*.out`); claims that did not hold were fixed
first: `gzip -dc` needs `-` for stdin, `grep` has no `-o`, `cc -c` takes one
source, `head -c` does not exist, `Worker` is undefined, and the display
client is `libdolly-display.a` linked automatically (not `libdolly-js.a`, which
is QuickJS: the audit's agent was misled by its own guess).

### Sessions (OpenRouter `stealth/space-bunny-alpha`, `pi --mode json`)

Before = the old skill and `SYSTEM.md` copied into the same Pi 1.0 image; after
= the new ones. Tool calls, errors, wall time:

| Image, task | Before | After |
| --- | --- | --- |
| `pi`: install Python, count the lines of `/usr/include/dolly/*.h` | 18, 2, 111 s | 6, 0, 31 s |
| `pi`: fetch zlib's README, draw a gradient with Dolly's display library | 11, 1, 75 s | 6, 0, 55 s |
| `pi`: why does `/workspace/probe` exit 126 (a `gpu.h` program) | 39, 2, 336 s | 6, 0, 40 s |
| `dollyfile-studio`: write, lint, build a recipe installing ripgrep with its full `REQUIRES HOST` set | 17, 1, 176 s | 12, 0, 99 s |

What the transcripts showed and what changed:
- Before, the agent tried `apt`, python.org, GNU and GitHub mirrors and
  `nohup … &` before finding `amy` at call 14; it guessed `-ldisplay`; it
  diagnosed 126 by decoding the Wasm sections with `od` and `awk`; in Studio it
  invented an `INSTALL` pin and found ripgrep's URL by trial.
- The first rewrite's display run wrote a program that waited for a key
  forever (no one is at the tool's keyboard) and hung for 30 minutes: the
  skill now says so and to bound such commands with `timeout`; the rerun used
  `timeout 60` and released the display.
- Studio after: the agent read the package index and ripgrep's recipe and got
  the host set right first time; its one retry was an empty line inside a
  `FILE` body, so that rule now says what happens.
- A harder task with the baked skill (fetch zlib v1.3.1's tree and build
  `test/example.c`): the jsDelivr listing and `make -j8` fetch worked first
  time; zlib's `./configure` failed under Slop, so the skill now says to
  compile sources directly. 28 calls, 6 errors, of which `require` once.

With the skills baked into the rebuilt images (no injection): `pi`, "install
ripgrep with amy and use it" took 6 calls, 0 errors, 38 s; `dollyfile-studio`,
the recipe task above, took 9 calls, 0 errors, 86 s, linting and building at
the first attempt.

### Closed

Done-when holds: every line was run in the image it ships in, real sessions
in `pi` and `dollyfile-studio` completed the tasks from the skill alone, and
`pi-browser.mjs` fails when a taught command stops working. Verified in
Chrome on the final images: `npm run test:demos -- pi studio javascript`,
`local-llm` (Chrome on my own Xvfb), `node test/core-browser.mjs chromium`,
`npm run -s test:source` (332 pass). Commits `1a7c9679`, `67a65263`,
`b7186d6f`. Not covered by design: the display input record layout belongs in
`display.h` (`20261005-131650-userspace-gaps`), and the pointer to
`/usr/share/doc/dolly/` waits for `20261005-133403-self-description`.
