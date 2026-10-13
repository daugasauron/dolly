# Audit of 2026-10-13: the minimal core, the Dollyfile, what can be broken out

- STATUS: OPEN
- PRIORITY: 320
- TAGS: audit,core

Owner (2026-10-13): "After that, I want a full fable audit of the whole
setup. Reflect on the minimal core, dollyfile syntax, things that can be
broken out and made more clean. Etc."

Done when: the findings are here, ranked, each with its evidence (file and
line, or a measurement) and what to do about it; what was cheap is done and
says so.

## State (2026-10-13)

Five reports, each by a Fable auditor that read the tree and changed
nothing: [the core](core.md), [the Dollyfile and the builder](dollyfile.md),
[packages and the catalog](packages.md), [hygiene and iteration
speed](hygiene.md) on `main` `743757a4`, and [the browser boundary](boundary.md)
on the round's branch with `nena@0` in it. Below is the integrator's ranking
across them;
the evidence (file and line, counts, commits) is in the reports under the
finding numbers given. "Round" means a change to the seed or to every recipe:
one rebuild of the catalog, 5.5 h.

## The answers in short

- **The minimal core** is 50 process operations and 44 across eleven host
  modules, none unused; it is small and uniform where it matters (one import,
  one packet shape, one error vocabulary). What is not minimal is around it:
  `runtime.h` (19 functions, 3 needed), fourteen fd/path twins, and above all
  what the seed drags in, so that an edit to one module's header rebuilds 103
  images.
- **The Dollyfile** has two directives that buy nothing (`REQUIRES TOOL`, the
  names of `EXPORTS FILE|FOLDER`), one that is too weak (`SLOP` is one line,
  so scripts hide in `FILE` bodies), and references that carry two things the
  builder does not need written down: the release version and the digest of
  another recipe.
- **What can be broken out**: the host modules' SDKs from the root image, the
  terminal from the build base, the C programs from `Dollyfile-system-build`,
  the builds from `system-tools` into the packages that already name them,
  and two images that hold nothing (`gpu-sdk`, `audio-sdk`).
- **Package dependencies** need no new syntax and no parsing of recipes by
  `amy`: a package's snapshot already holds the pinned `INSTALL` rows of its
  recipe in `/etc/dolly/installed` (dollyfile, the answer section). Done
  today: [dependencies](../20261012-230015-package-dependencies/TASK.md).

## The boundary, and `nena@0`

No hole was found. Without `nena@0` nothing the userspace writes reaches the
set the page enforces: the set is the page's, the Worker follows it by
message, kernel memory holds no module state, and `/etc/dolly/enabled` is
read by trusted code only where the page attached `nena@0`. With it, in
`default`, a compromised userspace can add the GPU, audio (resumed only by a
real key or click), the microphone (the browser's prompt decides), the
button strip (the clipboard only in the user's click on the page's Paste),
pseudo-terminals and sockets; `runtime`, `http`, `display`, `input`,
`snapshot` and `build` are never switched, by a manifest field enforced in
the page. `nena disable nena` is enforced outside Wasm. The kernel has 12
imports; none hands out an eval, a fetch outside the broker, a DOM handle or
a free-form message.

| # | Weakness or cleanliness | Evidence | Cost |
| --- | --- | --- | --- |
| B1 | The switch capability is handed to every provider, though the documents say nena's alone | `host/modules.mjs:105` (boundary W1) | cheap, page side |
| B2 | A call in flight when its module is disabled never completes | `src/device-lease.c:52,71-73`; GPU's bridge does it right (W2) | cheap, page side |
| B3 | A session's recorded modules are enabled inside the 10 s start-up timer, silently | a recorded `gpu@0` on a slow adapter stops the boot (W3, W6) | cheap, page side |
| B4 | Disable asks no dependent; nothing asserts that every depended-on module is fixed | (W4) | a test |
| B5 | Credential stripping is a list of six header names | `host/http/policy.mjs:8-15` (W5) | a sentence, or an allow list |
| B6 | The test surface `__dolly` (24 members) ships in every page | `src/browser.mjs:226-230`; not reachable from Wasm (C1) | the older audit-24 task |
| B7 | Every provider's JavaScript is loaded on every page | `host/modules.mjs:7-8` (C2) | cheap |
| B8 | The page parses the recipe language in JavaScript to decide a custom image's modules | 442 lines whose output is a trust decision (C5) | a redesign of one path |

## Ranked: what to do, and what it costs

Iteration speed first, since the project's own rule puts it first.

| # | What | Evidence | Cost |
| --- | --- | --- | --- |
| 1 | Take the release version out of every reference; `amy` learns its version at run time | 618 references in 103 recipes; two bumps rewrote 85 and 86 recipes and rebuilt everything (hygiene 1, dollyfile 2) | round |
| 2 | Module SDKs (24 headers of 10 modules, their client archives) leave the root image and become packages | 30 commits to them in 30 days, each a round, for headers only GPU, audio, microphone and button programs include (core 1) | round |
| 3 | The ABI digest hashes the generated layout, not the bytes of `process.h` | 15 commits in 30 days; one was a comment (core 2) | round, and a documented decision reversed |
| 4 | `display` leaves `system-tools`; images that open install it | Zig and Ghostty stand before every image with a shell, 8 of the first 11 serial minutes; about 35 build-only recipes carry a terminal (hygiene 2, dollyfile 8) | round |
| 5 | Stop writing another recipe's digest into `FROM`, `INSTALL`, `COPY`; keep `SOURCE` digests | 256 such references; repin commits touch 69 to 81 recipes; 83 commits in 30 days are pins only; a merge tool exists for pin conflicts (dollyfile 1) | redesign and a round; a recipe alone no longer names its inputs, the release's lock does |
| 6 | Tests chosen by what changed, files in parallel | the plan already prints the stale images; 35 files run one after another, 45 boots of a 160 MB image (hygiene 5) | cheap |
| 7 | The demo test runner runs every `*-browser.mjs`, and a run without a GPU is a visible skip | ten browser tests never run, two always pass (hygiene 6) | cheap |

The language and the core:

| # | What | Evidence | Cost |
| --- | --- | --- | --- |
| 8 | Delete `REQUIRES TOOL` | 445 rows; two thirds name base tools; no commit records it catching a mistake, where `REQUIRES HOST` did (dollyfile 3) | round |
| 9 | `FILE` and `FOLDER` retain; `EXPORTS FILE|FOLDER` lose their unused names | `REQUIRES FILE` is used 0 times, `REQUIRES FOLDER` twice (dollyfile 4) | round |
| 10 | `SLOP` takes an indented body, as `FILE` does | 931 continuation lines; 26 build scripts written through `FILE` and run by the next row (dollyfile 6) | round |
| 11 | Licences and manual pages retained by convention | 7% of all directive rows (dollyfile 7) | round |
| 12 | The C programs leave `Dollyfile-system-build` for `src/commands/` | 1,817 of its 2,248 lines, 85 of the 128 KiB a recipe may hold (three reports) | cheap, one root rebuild |
| 13 | `runtime.h` keeps `dolly_spawn_mapped`, `dolly_wait`, `dolly_terminal_publish_result` | the rest duplicates POSIX or has one user (core 3) | round |
| 14 | Fourteen operations merge with their twins: 50 to 36 | fd/path pairs, two-step sizes, four flag calls (core 6) | round |
| 15 | Kernel only: the core's operations register through the module table; the supervisor stops mirroring the process tree and the 32-process limit | a 669-line `process_dispatch`; two limits, two tree walks (core 7, 8) | no round |
| 16 | A block of operation numbers per module, checked by a test | `download` and `upload` sit inside the core's block (core 9) | round |
| 17 | The terminal gets a line discipline | found today by building tools: a program that asks on the terminal and reads a line hangs (`unzip`, `zstd`); `sqlite3`, `dc` and `vi` each needed their own editor ([more packages](../20261012-230015-more-packages/TASK.md)) | kernel and libc; a design |

The catalog:

| # | What | Evidence | Cost |
| --- | --- | --- | --- |
| 18 | Delete `gpu-sdk` and `audio-sdk` | each adds 0 files to `system`; with `nena` a shell with a GPU is `default` and one command (packages 1, 2) | cheap after `nena` |
| 19 | `zero-ad` stops being `FROM default` | the 1.9 GB image pins the 14 MB one people open (packages 4) | one 0 A.D. rebuild |
| 20 | `default` can unpack and compare | no `gzip`, `diff`, `patch` or `less` in it (packages 3) | a repin of `default` |
| 21 | `codex-agent`, `neovim`, `gnu-emacs`, `speech-to-text-mic` on `default`, not `system` | 136 MB less each, no dependents (packages 5) | four rebuilds |
| 22 | `system-tools` and `system` become one base; then the builds move into the packages that are views of them today | they differ by 55,623 bytes; 75 images descend from `system-tools`, so one more tool in `posix` is a round today (packages 11, 12) | round |
| 23 | `amy`: the file list without the download, `remove`, descriptions that say what is inside | `amy files rust` fetches 463 MB; 41 of 49 descriptions end ", as a package" (packages 7, 8) | cheap to seed-sized |
| 24 | Strip `rustc` and `codex` | 248 MB and 199 MB binaries, no strip row (packages 9) | a repin of the Rust chain |

The repository:

| # | What | Evidence | Cost |
| --- | --- | --- | --- |
| 25 | Closed tasks leave the tree | 382 of 416, 38,616 lines; 14 documents link into them (hygiene 7) | cheap; the owner's call |
| 26 | The site's videos leave the repository | 24 of 41 MB tracked (hygiene 8) | cheap; the owner's call |
| 27 | One deployment target and no hand-kept image lists | 1,834 lines; the lists are places three and four the catalog is written down (hygiene 9) | the owner's call |
| 28 | Documents: the stale statements listed in hygiene 14; `docs/architecture.md`'s image graph is wrong on four counts | checked against the code there | cheap |
| 29 | Tests of wording, and `test/dolly.artifacts.mjs` re-asserting the build | 102 message patterns; 250 of 401 lines (hygiene 10, 11) | cheap |
| 30 | Hard constraints of `AGENTS.md` without a test | no capture through audio, forced Worker termination, module reload (hygiene 15) | cheap |

A correction the audit made to the integrator: a `docs/*.md` is not an input
of every image. Documents are pinned only in `dolly-docs`, which only the Pi
page installs (core 13, hygiene 4).

## What is right and should stay

One import and one packet shape; errors as one vocabulary; `host/*/module.json`
as the single registry; `dolly.wasm` outside the image identity, so kernel
work costs no round; the builder's plan, which says why each image rebuilds;
`SOURCE` with the digest of external bytes; `PACKAGE` with `INSTALL` usable
anywhere; thin packages over the images that build a program; the test that
fails by name for a package nobody installs.

## Done today from this list

- 12, in the round of 2026-10-13: twenty-three C programs moved from
  `Dollyfile-system-build` (2,248 lines to 475) to `src/commands/`, the
  installed tools byte for byte the same (`core/commands-source`).
- Dependencies by reference, the owner's question
  ([task](../20261012-230015-package-dependencies/TASK.md)), in the same round.
- B1 to B4 and B3's status line: with the `nena@0` agent, page side, to merge
  after the round.
- 7, 23, 28 and the residue of hygiene 17: with the site agent, to merge
  after the round where they change no image.
