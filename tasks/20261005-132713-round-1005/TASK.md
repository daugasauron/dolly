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
| `review` | `review/big-picture` (source only) | big-picture |
| `slopyard-world` | `work/slopyard-world` (two unverified Lua edits, uncommitted) | slopyard-living-world |

Agents were told to have verified commits by 02:30 JST. Nothing is pushed or
deployed; `main` stays at the deployed `18e445e7` until a candidate passes.

## Round 1 (`integrate/1005`)
