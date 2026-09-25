# Merge and deploy the verified 0 A.D. checkpoint

- STATUS: OPEN
- PRIORITY: 250
- TAGS: release,0ad

The user authorizes merging checkpoint `214ec0a` into main, pushing and deploying
through the documented release process. Main fast-forwards from `e0dc968` without
conflicts. Work is in `work/0ad-baseline`; the dirty root checkout is untouched.

Completion requires the 43-image domain release catalog, the GitHub Pages selection,
source and artifact checks, sealed image-inventory acceptance, verified exports,
successful remote publication and public-browser verification. Retain deployed
immutable assets and record source commits, archive/export hashes and deployment
receipts. Keep the measured large-match performance limitations visible.

The current domain release is `12b9aaf40169f9c18f168a875164abef536508eda1095e43f6d97f628d97e106`,
Cloudflare deployment `f04b6b14-db66-4626-9ed4-86da11591bda`. It also retains
`cc12357d`, `bf5a5a2c` and `abf018b9`. GitHub Pages currently serves release
`4745abd4657930e47e405867282f7a7003c34a1a0000c8efb6cafb54915a1ac3`.
The prior release directories and exports remain in the GPU worktree for
read-only retention inputs.

0 A.D.'s full assets exceed GitHub Pages' 1 GB limit. Its menu and bookmark routes
use the existing domain-link mechanism. The user subsequently excluded unfinished
Blockwalker from this release on both sites. The two committed selection files
omit it; the domain retains the other images, complete 0 A.D. content and Agents
at play.

Release preparation rebuilds the 43 selected images against the current runtime and
refreshes pinned build inputs. Source
checks pass 279/279; core and custom-session checks pass in Chromium and Firefox,
including ABI enforcement, denied host access, process recovery and restoration
after closing a tab. Logs are `.cache/0ad/deploy-{source,core,custom-sessions}.log`.
The streaming HTTP check passes a 65 MiB + 17-byte checksum, bounded uploads,
response quotas and cancellation/reuse (`.cache/0ad/deploy-http-stream.log`).
Fluid passes controls, pause/reset, 1080p rendering, GPU replay equivalence,
interruption/restart and boundary checks in Chrome 151 and Firefox 155
(`.cache/0ad/deploy-fluid.log`, `build/fluid-proof/results.json`). Its screenshot
assertions now use bounded Buffer comparisons, avoiding the failure formatter
identified in the host-freeze investigation.

The 0 A.D. archives now have a 24 MiB bound, including ZIP headers, to fit Pages'
25 MiB assets without adding a delivery rule for every source and snapshot pack.
SHA-256 comparison against the checkpoint release confirms all 40,599 archived
files are identical. The largest archive is 25,164,261 bytes; the 77 archives
replace 28 larger archives. Evidence: `.cache/0ad/deploy-archive-equivalence.log`.
All 383 prepared HOST sources pass checksum verification (3,300,324,415 bytes).
The rebuilt game snapshot is `86490e2de07df539a23da57e88bc300ed83ec472a3a13c87ece9134ed7c71b80`;
all 108 snapshot packs fit Pages' file limit. Firefox and Chromium pass the real
menu, Briton/Acropolis and Han/Alpine matches, and save/load through a new game
process, with clean engine logs. Evidence: `.cache/0ad/deploy-zero-menu-{firefox,chromium}.log`.

GitHub's predecessor cannot fit alongside the updated site. Its predecessor's
immutable files occupy 844,717,920 bytes; the new selected source files alone add
468,329,087 bytes under a different release ID. The 1,313,047,007-byte lower bound
already exceeds the 1 GB limit before the new runtime and snapshots. The user
confirmed that GitHub must publish the latest code from the same source commit
as the domain, with the smaller image selection. Publish the current GitHub
release only; older GitHub tabs may need reloading. This is the approved exception
to predecessor retention. The domain retains all four deployed predecessors.

All 43 selected snapshots are built. The full artifact gate passes 27/27 and
source checks pass 279/279 (`deploy-artifacts-final.log`, `deploy-source-final.log`
under `.cache/0ad`). The artifact check now recognizes the explicitly exported
Dollyfile compiler source in Pi Local and Studio. Codex's TUI, shell tools,
device-login cancellation, persisted authentication, refresh and restart pass
against local fixtures (`deploy-codex-checks.log`).

Local inference, engine reuse, cancellation/restart, bounded session saves,
rejection of a modified large model, restoration and fresh boot pass in Chrome
151 and Firefox 155 with external connections denied (`deploy-llm-final.log`).
The test now uses immutable pack headers and CSP instead of Playwright routing,
which disables the HTTP cache. Streaming boots leave cache retention to the
browser: an isolated Chrome check reused 54 packs but fetched the two largest
again. The test records download counts instead of promising cache persistence;
its inference and session assertions remain intact. Runtime code is unchanged.
Core and custom-session checks also pass again in both browsers after the test
server changes (`deploy-core-custom-final.log`).
