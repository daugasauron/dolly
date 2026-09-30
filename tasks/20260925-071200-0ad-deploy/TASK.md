# Merge and deploy the verified 0 A.D. checkpoint

- STATUS: CLOSED
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

Before deployment, the domain release was `12b9aaf40169f9c18f168a875164abef536508eda1095e43f6d97f628d97e106`,
Cloudflare deployment `f04b6b14-db66-4626-9ed4-86da11591bda`. It also retained
`cc12357d`, `bf5a5a2c` and `abf018b9`. GitHub Pages served release
`4745abd4657930e47e405867282f7a7003c34a1a0000c8efb6cafb54915a1ac3`.
The prior release directories and exports remain in the GPU worktree for
read-only retention inputs.

0 A.D.'s full assets exceed GitHub Pages' 1 GB limit. Its menu and bookmark routes
use the existing domain-link mechanism. The user subsequently excluded unfinished
Slopyard from this release on both sites. The two committed selection files
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

Published application source is `7ffd9c952f75bf2888146675eb582507bed4f29e` on both hosts. Main was
fast-forwarded and pushed without changing the dirty root checkout. Official
packaging passed real-browser inventory acceptance for all 43 domain images and
all 33 GitHub images. Both exports passed complete wire-hash verification; their
sealed canonical inputs passed exact-source provenance verification.

| Receipt | Domain | GitHub Pages |
| --- | --- | --- |
| Sealed release | `b526f65ff4d19f410479c4e97f4a54c8ceb5c195f62661565bed6bca344b5891` | `9b445bbc9b8b151215e50570b71db0b498b702a2449ed0396cfcc1f575e2c3eb` |
| Export bytes | 10,026,048,297 | 857,512,945 |
| Export manifest SHA-256 | `2dbd452e4ea51c48881a13ee537046e0c01602889e4fd5aaf8bad5fcbabb223d` | `2d529ff64a4001309f71dd61fbc0df0f82e08a11bc1209ba4186ea5bc0ef57f9` |
| Archive bytes | 5,835,667,198 | 521,222,201 |
| Archive SHA-256 | `3809655c2646253ef401933b7a47d197084c88a3ca27ead096c86afff450b774` | `1a29aa6d7d2b44c68de428c48cacd997e9a60abeac265ea3ddab02ae5ce45079` |

Cloudflare production deployment is `98194787-9ac5-45e2-9040-07b4b95a8193`
([deployment](https://98194787.dolly-9dk.pages.dev/),
[public site](https://daugasauron.com/)); its preview was
[6e710ebb](https://6e710ebb.dolly-9dk.pages.dev/). All four prior domain releases listed above remain
accessible and passed delivered-hash checks. The export has 10,912 files,
88 header rules and a 25,406,282-byte largest file.
The duplicate domain archive was removed after durable canonical-seal verification;
its hash receipt, canonical release, export manifest and headers remain under
`build/domain-releases/` and `build/deployments/20260925/domain/`.

GitHub [release `pages-7ffd9c9-r1`](https://github.com/daugasauron/dolly/releases/tag/pages-7ffd9c9-r1) supplies the verified
archive to [successful Pages workflow 36132380812](https://github.com/daugasauron/dolly/actions/runs/36132380812).
The [public site](https://daugasauron.github.io/dolly/) has 33 local images plus links to Pi Local,
Studio and 0 A.D. on the domain. Its 3,018-file export fits the 1 GB limit.
The archive remains at `build/github-20260925/dolly-pages.tar.gz`, with the
canonical seal under `build/github-releases/`.

Public Chromium checks passed on both primary sites: exact menu selection, all
image links, default boot, rg/fd, named-session restoration, rebuild start/cancel,
cross-origin isolation, missing-asset 404s, and Slopyard absent with its route
returning 404. Domain Codex boot/version passed; GitHub's nine domain redirects
preserve query and fragment. No JavaScript errors occurred. Delivered code, Wasm,
metadata and source provenance hashes match each seal; domain large multipart
assets and all four retained releases passed delivery checks. Receipts are
`build/deployments/20260925/{domain,github}/production-{browser,delivery}.json`.

The first public Firefox 0 A.D. cold boot stopped before launching the game: a
25,001,722-byte snapshot pack returned HTTP 524 after 125 seconds. Re-uploading
the identical verified bytes on an isolated preview branch restored HTTP 200
from the existing production URL in 5.78 seconds; production source and HTML
were unchanged. The internal provider cause is undetermined. Exact before/after
measurements and pack hash are retained in
`build/deployments/20260925/domain/pack-delivery-repair.json`.

Developed matches still have measured simulation/AI stalls. They remain open in
[the large-match performance issue](../20260925-064500-0ad-large-match-stalls/TASK.md);
this deployment does not claim to resolve them.

The subsequent complete public Firefox 155 run passed with a non-fallback GPU:
Britons/Acropolis, saving and loading through a new game process, Han/Alpine,
high textures/16x filtering persisted, three matching replays, and no browser
or engine warnings/errors. First uncached download plus menu startup took
824,444 ms (13 min 44 s) on this connection; the encoded game payload is
1,914,095,298 bytes. Match loads were 10,550 ms, 7,622 ms for the saved game,
and 18,899 ms for Alpine. Peak test-scope memory was 4,561,408,000 bytes,
including browser and file cache. This is not a minimum RAM requirement.
The earlier HTTP 524 is preserved alongside the successful retry log,
screenshots, configuration, engine logs and replays under
`build/deployments/20260925/domain/public-0ad/`. All deployment gates passed.
Both public source receipts were rechecked as `7ffd9c9`; this task closure is
a later receipt-only commit and does not change the deployed application.
