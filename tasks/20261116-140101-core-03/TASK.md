# The contract and boundary docs describe what the code no longer does: the image build ID, three contracts, openConsole, amy's index

- STATUS: CLOSED
- PRIORITY: 130
- TAGS: audit,core,abi,docs,0.1.8

From the core audit of 2026-11-16 (`work/audit-1116`, released tree `work/round1113` at `b09b1e243`).

## Closed (2026-11-17)

On `cleanup/0.1.8`: `abi/README.md` states the build ID's inputs as `dolly.data`, the `process`
contracts of every module in `host/manifests.mjs` in its order, then the kernel plugin and image
contracts; its table names `dolly-console-0.wat` (a row of its own) and `dolly-clipboard-0.wat`
and `dolly-packages-0.wat` (with the mailboxes, operations 208-211 and 134); pty's operation is
176. The review map's handle section names `openConsole` (`console@0`). The amy sentences of the
review map, `docs/http.md` and `docs/dollyfile.md` are `recipes-17`'s commit on the same branch.

Checked: the README's rule, followed through `work/round1113/host/manifests.mjs` (the same as
this tree's) over `work/round1113/dist/`, gives `sha256:87c27243…3b758`, its
`dolly-build-id.json`'s `imageBuildId` (`work/cleanup-018-evidence/readme-build-id.mjs`, output
`readme-build-id.txt`); a loop over
`abi/*.wat host/*/*.wat` finds every basename in the README; `git grep amy-index.txt docs/` finds
no document asking a rule for the page's own index; `platform-documents.test.mjs` passes after
re-pinning `dolly-docs`.

## Found

`abi/README.md` is the index of the machine contracts and what a second host (Donna) reads to
start an image without Dolly's JavaScript (AGENTS.md: the API "can be specialized independently of
the backend"); `docs/browser-boundary.md` is the review map AGENTS.md says to keep current.

1. **The image build ID.** `abi/README.md` ("Images and boot files") says `imageBuildId` hashes
   `dolly.data`, `dolly-process-0.wasm`, `dolly-dso-0.wasm`, `dolly-kernel-plugin-0.wasm` and
   `dolly-image-0.wasm`. `scripts/write-build-id.mjs:11-14` hashes every manifest's `process`
   contract since the seed hygiene round: ten files, adding `dolly-process-gate-0`,
   `dolly-threads-0`, `dolly-stack-0`, `dolly-sockets-0` and `dolly-pty-0`. Measured on
   `work/round1113/dist/` (`work/audit-1116-evidence/core/build-id-check.mjs`, output
   `build-id-check.txt`):

   ```
   published          sha256:87c272432c019ccd35bc35fd5576682681a35c1abdcd36f18e456f608d23b758
   abi/README.md (5)  sha256:54baf27099045c946d9cbec4a4f12e80202e0874a2db2bc5bc328db83d139593
   write-build-id (10) sha256:87c272432c019ccd35bc35fd5576682681a35c1abdcd36f18e456f608d23b758
   ```

   Donna stopped computing it for this reason and reads `dist/dolly-build-id.json` instead
   (`~/dev/donna/tasks/20261110-230234-abi/TASK.md`, "which Dolly widened to every process-side
   contract").
2. **The contract table** of `abi/README.md` names neither
   `host/clipboard/dolly-clipboard-0.wat` (operations 208-211, `1abe5a768`),
   `host/console/dolly-console-0.wat` nor `host/packages/dolly-packages-0.wat` (operation 134,
   `bbd825ae8`) (a loop over `abi/*.wat host/*/*.wat` grepping the README for each basename).
3. **Its pty row** says operations "176-177"; `host/pty/dolly-pty-0.wat:38` has 176 alone since
   `39e4b794d` (TIOCSWINSZ a generic terminal request, pty@0's RESIZE gone).
4. **The review map's "The page's handle"** (`docs/browser-boundary.md:288-316`) lists what each
   module adds to `window.__dolly` but not console@0's `openConsole` (`host/console/
   console.mjs:35`, `docs/embedding.md:130-148`), the one member that starts a program with an
   argv the page chooses.
5. **amy's index.** Since `bbd825ae8` amy reads the page's own directory's `amy-index.txt` over
   packages@0's mailbox (`programs/commands/amy.c:578`, `host/packages/transport.mjs:79-84`,
   the page's own `fetch`, not the broker). Three documents still say it goes through http@0:
   the review map (`docs/browser-boundary.md:166-167`, "an ordinary request under the HTTP
   policy", which contradicts its own `:152-153`), `docs/http.md:91-95` (an embedding with a
   policy "that wants `amy list` adds `{ origin: location.origin, path: "/amy-index.txt" }`",
   which it does not need) and `docs/dollyfile.md:357` ("through the HTTP broker"). Only a
   directory named by `amy server URL` is read through the broker.

Every other number and claim of the review map checked in this audit matched the code (the
limits of each row against the contracts and providers, the trusted files table against `page/`,
`site/` and `host/*.mjs`, the build's four modules, the image cache;
`work/audit-1116-evidence/core/checks.txt`); the pack-store row is `20261104-143110-modules-r5`'s
and the foreign directory's sentence `20261116-140747-core-06`'s.

## Do

State the build ID as the files it hashes: "`dolly.data`, the `process` contracts of every module
in `host/manifests.mjs` in its order, then `dolly-kernel-plugin-0.wasm` and `dolly-image-0.wasm`",
so the sentence follows the manifests instead of a list. Add the three contracts to the table;
pty's operation is 176. The handle section names `openConsole` (console@0). The three amy
sentences say the page's own index comes over packages@0 and another server's through the broker.

## Done when

A reader computing the ID from the README's words gets `dist/dolly-build-id.json`'s
`imageBuildId` (`build-id-check.mjs` with the README's rule), every `*.wat` of `abi/` and `host/`
is named in the table, and no document says the page's own `amy-index.txt` needs an HTTP rule.
