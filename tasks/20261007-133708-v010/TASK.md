# Release v0.1.0: what goes in

- STATUS: OPEN
- PRIORITY: 350
- TAGS: release

Owner (2026-10-07): "create a task for this 0.1.0 so it's organized, now I
want to plan what goes in it".

The base is the checkpoint deployed on 2026-10-07 (`93986c67`, 71 images).
How a release is made and hosted is `20261007-131241-release-v010`. This
task is the scope: one line per item, its task, its state. The scope below
the first group is the integrator's proposal until the owner confirms it.

## In: asked for by the owner

| Item | Task | State |
| --- | --- | --- |
| `closed-source-agent`: Claude Code, its TUI with the user's API key | `20261007-085236-claude-code-image` | merged on `main` (`a7108038`): round green on the runtime fix (`457f0ef3`), then the renamed image's tests in chromium and firefox, source 415/0, artifacts 24/0. Left: the owner's run with a real key, and the Terms gate below |
| Versioned hosting, versioned recipe URLs, sessions per version, tags that match releases | `20261007-131241-release-v010`, steps 1 to 4 | planned |
| `robots.txt` that explains and invites | `20261007-132428-robots` | open |

## In: proposed

The version change rewrites every recipe and so rebuilds the whole catalog
once. Changes to the seed cost nothing extra in that round, which is why
they are proposed now.

| Item | Task or branch | Why now |
| --- | --- | --- |
| Recipes without the hard-coded domain, in the same rewrite: `FROM /v0.1.0/Dollyfile-system SHA256`, the origin one setting | `20261005-223931-origin-not-hardcoded` | the owner's direction of 2026-10-06; otherwise every recipe is rewritten twice |
| `cc -fstandalone-debug` and `-ferror-limit=` work | `core/cc-flags` `7dbf0f38` | both fail in the deployed compiler; a seed change |
| File modes and `umask` | `20261006-120641-umask`, `core/file-modes` `c17b186e` | every autoconf `config.status` needs it; a seed change; in if its tests pass in the round |
| libc++, libc++abi and libunwind built by `system-build` from the pinned source instead of taken prebuilt; six driver flags | `20260930-232236-llvm-in-dolly`, `core/runtimes-in-seed` `7d302216` | a seed change: seed 126.8 to 107.9 MB, root build +30 s; proven on a 17-image chain whose programs are byte-identical to the old seed's; its round also rebuilds the Rust seed |
| `input@0`, keyboard and mouse as their own host module | `20261002-072000-input-host-module`, `core/input-module` `fa073dc9` | verified except bhop; a host interface is better changed before a version is published than after |
| Long typed or pasted lines losing characters | `20261001-095000-terminal-text-flake` | a typed line arrived cut at about 150 characters on 2026-10-07; check a paste, fix if it loses text |
| Every demo test run once in Firefox | none yet | the demo runner is Chromium-only; a release should know what fails there |
| Release notes with the known gaps | this task | part of the checklist |

## Parallel, very high priority (owner, 2026-10-07), not blocking

| Item | Task | State |
| --- | --- | --- |
| LLVM, Clang and LLD built inside Dolly | `20260930-232236-llvm-in-dolly` | started on `core/llvm-in-dolly`. TableGen stage is in the catalog; left: a stack overflow on two files (compiler side, a seed change), then the 2,559 files of the compiler (measured: 3.8 h serial, about an hour at four jobs), the link, the comparison with the seed. In 0.1.0 if a Dolly-built Clang compiles and runs a program by then; stage 2 equal to stage 3 is not awaited |

## Out: ships as a documented gap

- Xonotic: sound, rasterizer threads, the `gpu@0` renderer, more than 31 fps
  at the low preset.
- `man`, `less`, `exec`, sockets, touch and voice input.
- The self-hosting tracks other than LLVM: rustc, 0 A.D.'s remaining host
  steps, Zig follow-ups, parallel build jobs, Cargo without Patti, a
  compiler-free base image.
- New demo recordings (need a paid model; the owner's budget).
- Development speed and clean-up tasks: `audit-53`, `audit-24`, builder
  copies, the two kernel-boundary follow-ups, session save memory.
- Known behaviour: RTS freezes on input in its first frames; 0 A.D. stalls
  in large matches; Chrome writes slowly after a refused file growth.

## The owner's gates

Owner (2026-10-07), shown both lists: "All of this is fine." The open
readings and Xonotic's points are accepted, and `closed-source-agent` is in
the domain's catalog. Left of the first gate: the run with a real key.

- Anthropic's Commercial Terms confirmed, before `closed-source-agent` is in
  a published catalog; a funded key for its one real run.
- Xonotic: assets without their own licence statement rest on the release's
  `COPYING`; no trademark statement for the name and logo.

## Done when

- Every row of the two "In" groups is merged or moved to "Out" with the
  owner's word, and 0.1.0 is released by the checklist in
  `20261007-131241-release-v010`.
