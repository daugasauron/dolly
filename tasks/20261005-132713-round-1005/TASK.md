# Integrate the 2026-10-05 round into a local release candidate

- STATUS: OPEN
- PRIORITY: 340
- TAGS: integration,release

The integrator's record of the round, so an interrupted session can be resumed.

## Branches and worktrees (under `work/`)

| Worktree | Branch | Task |
|---|---|---|
| `host-modules` | `integrate/1005` (main + host-modules contract batch, image inputs `2cc92c2b…`) | round 1: verify and publish |
| `round2` | `integrate/1005-seed` (`integrate/1005` + `work/zero-ad-self`) | round 2: merge everything below, one catalog rebuild |
| `audit-core` | `fix/audit-core` (from `integrate/1005-seed`; seed batch) | silent-126, userspace-gaps, git-fetch |
| `presenter` | `fix/page-presenter` | page-presenter |
| `packages` | `work/more-packages` | more-packages |
| `pi` | `work/pi-1` | pi-1, pi-skills |
| `webgpu` | `work/webgpu-any-gpu` | webgpu-any-gpu |
| `site` | `work/licences` | licences, robots-txt |
| `recordings` | `work/demo-recordings` (source only) | demo-recordings |
| `claude` | `work/claude-code` | claude-code, janis-node-gaps |
| `signals` | `fix/signal-regression` | its own task: libuv SIGINT probe (`cmake`) and the `rts` stall |
| `review` | `review/big-picture` (source only) | big-picture |
| `slopyard-world` | `work/slopyard-world` (two unverified Lua edits, uncommitted) | slopyard-living-world |

Agents were told to have verified commits by 02:30 JST. Nothing is pushed or
deployed; `main` stays at the deployed `18e445e7` until a candidate passes.

## Round 1 (`integrate/1005`)

Verified on the catalog built for `2cc92c2b…` (2026-10-05, 22:17-22:50 JST, logs
in the integrator's scratchpad):

- Source suite 332 pass. Artifact suite 23 of 24: the supervisor-contract test
  compared the new word-layout globals with kernel exports (fixed, `c5b9e132`).
- Browser suites pass in Chrome and Firefox except `host-compute` in Firefox:
  Playwright's Firefox has no WebGPU adapter without a desktop, also on the
  deployed `cb8530a6`; the 2026-10-02 pass had inherited the owner's `DISPLAY`.
  The test now asserts the documented refusal there (`ce74d524`).
- Demo tests pass for python, javascript, emacs, pi, neovim, rust, sdl2,
  studio, codex, bhop and classicube. `cmake` fails: its libuv probe no longer
  handles SIGINT (status 130). It fails the same way on the deployed
  `cb8530a6`, so the regression shipped on 2026-10-02; the only core change
  after the last passing run is `d67ec56e` (pipe wakeup). `rts` failed once
  under load ("mouse menu/quit must not stall either player"). Both are with
  the agent on `fix/signal-regression`.
