# Host contracts said once: the leased-device protocol, input's and display's values, snapshot's mailbox

- STATUS: CLOSED
- PRIORITY: 160
- TAGS: core,host-modules,abi,cleanup

## Closed (2026-11-05)

All four commits (c0745b24, ad5cc953, 246f0325, 90c3b89b) are on `main`, through
`core/terminal-palette` (950caf5c1), which was built on this branch. The confirming round of
2026-11-05 (`integrate/2026-11-05` at 693b9842f, now `main` 943019e6d, image inputs `88959af6…`)
rebuilt every image. Evidence in `work/integrate/build/round-1105b-evidence/browser.log`; every
suite passed in Chromium and Firefox:
- Item 1: audio, microphone and microphone denied, nena, host compute, dso, host modules, core
  and boundary. gpu indicator passed in Chrome (software, without a Worker adapter, unavailable)
  and Firefox (unavailable).
- Item 3: custom session, session without http (`session-offline-browser.mjs`), snapshot stream
  and indicators.
- Item 2's others: terminal, display, display cursors, touch, shell, upload, pager, pty,
  network, sockets, stack, threads and embedding.
- `test/audio-host.test.mjs` passed in the source suite (475 of 475, `source.log`, test 82).
- Hardware gpu-render passed in Chrome 156 on the branch's images (90c3b89b, adapter "nvidia
  blackwell", the fixture compiled in the guest;
  `work/evidence-2026-11-04/slop/host-contracts-evidence/gpu-render-chrome.log`). The round
  leaves that test out, since it needs a hardware adapter (`test/browser-tests.mjs`). The
  round's GPU stage ran programs that link the rebuilt gpu client on that adapter in Chromium:
  gpu-fluid (each replay equal to Dolly's run, `gpu-gpu-fluid.log`), 0 A.D.'s graphics, pi-local
  and dollyfile-studio's inference (Chromium and Firefox, `gpu-local-llm.log`), and Slopyard on
  rerun.
- The C clients the branch could not build passed in the round: SDL2 and its audio, imgui,
  bhop, classicube, gpu-fluid, Slopyard and pi-phone. Wine's `winedolly.drv` is not in the
  round's demos. It passed on `core/modules-r1` at the same image inputs, in Chromium and
  Firefox (`work/evidence-2026-11-05/catalog/modules-evidence/wine-chromium.log`,
  `wine-firefox-debug.log`).

`host/input/input.mjs` and `host/display/display.mjs` take their values from `abi.mjs`
(`scripts/generate-abi-constants.mjs`). A grep of 693b9842f finds none of the literals ad5cc953
replaced (`keyEvent = 1`, `(flags & 3) === 3`, the locks' `16` and `32`, cursor styles by index).

Three proposals of `tasks/20261101-074546-audit-host`, each prototyped and measured on a branch
from 12c7fbd9 (its fix 10, merged on `integrate/2026-11-02`). Decided 2026-11-04
(`tasks/20261102-133353-owner-decisions`): yes to all three. Each puts one statement of a contract
in its canonical place. Two change digests, so they go in one catalog round; the audit's "with the
next device module" deferred for rebuild cost alone, which is not a reason.

1. **One leased-device protocol** (`proposal/leased-device` ae413349, P1). `gpu@0`, `audio@0`,
   `microphone@0` and `nena@0` speak one protocol written eight times (prose in four WATs, C in
   `src/device-lease.c`, JavaScript in `lease-bridge.mjs` and the GPU Worker, by hand in four
   clients, parsed again by three providers). Now `dolly_device_header` and `dolly_device_request()`
   in `runtime.h`, the reply slots and lease rules in `dolly-supervisor-0.wat`, the bridge checks
   the whole header and hands providers `{ operation, scope, sequence, body }`. 152 lines in, 161
   out; its worth is one place to change the protocol. 29 images rebuilt; audio, microphone, nena,
   gpu-indicator, host-compute, dso, host-modules, core and boundary pass in both browsers,
   hardware gpu-render in Chrome.
2. **Mailbox values in the WATs** (`proposal/host-mailbox-constants` a306babb, P2). `input@0`'s
   record types, actions, modifier bits, composing and lease flags and `display@0`'s graphics
   flag, cursor styles, copy flags and pixel format are enums in the headers and typed again in
   JavaScript (`keyEvent = 1`, `(flags & 3) === 3`, `16` and `32` for the locks, cursor styles by
   index), while `touch@0` keeps its phases in its WAT. AGENTS.md: the canonical machine contract
   is in WAT. Now each value is a WAT global; the headers get them from `*-abi.h`, the JavaScript
   from `abi.mjs`; the enum type names go. No value changes. 28 images rebuilt, 26 suites pass in
   both browsers.
3. **No session name in snapshot@0's mailbox** (`proposal/snapshot-no-session-name` aff0bca6, P4).
   The page writes the save's name into a 128-byte kernel buffer and word 3; the kernel validates
   it a second time and drops it (its marker file went in 5afba99c). The buffer, its export, the
   word and the check go: 41 lines in, 83 out; not an image input. custom-session, session-offline,
   snapshot-stream, nena, indicators and boundary pass in both browsers.

Also found by the audit, not on a branch: `host/{audio,gpu,microphone,nena}/kernel.c` are the same
28 lines but for names; a context pointer in `dolly_kernel_module` could serve all four. Judge once
1 is in: if the four files are then identical but for their export's name, do it in the same round.

State (2026-11-04 13:45): all four done and verified on `core/host-contracts` (c0745b24,
ad5cc953, 246f0325, 90c3b89b); what remains is the done-when's round on integrate, which
rebuilds every image (image inputs change).

Done when: the three are on integrate in one round; the suites above and `test/audio-host.test.mjs`
pass in Chromium and Firefox, hardware gpu-render in Chrome; `scripts/generate-abi-constants.mjs`
is the one source of the values in C and JavaScript (no literal record type, flag or cursor style
in `host/input/*.mjs` or `host/display/*.mjs`).

## Work on core/host-contracts (2026-11-04)

Built on `core/process-archive` (3ed3fd98, image inputs `badb9a41`). Each proposal was
brought over as its code diff, the generated files regenerated and the recipes repinned;
none conflicted with the 510 commits since 12c7fbd9.

1. **Leased device**, 246f0325. As proposed, plus: the GPU Worker checks the version by
   `DOLLY_GPU_VERSION` (it compared with 0); gpu's client now refuses a spent sequence, as the
   other three did; `host/README.md` says what a digest covers since 4512e2f8 (process WAT,
   other headers, contract constants: it still said "the exact bytes of its WAT contracts").
   157 lines in, 164 out outside tests and generated files. Digests: gpu changes (gpu.h);
   audio's and microphone's do not, their wire format being unchanged; runtime.h and nena's
   client (in the seed, no package) are seed inputs.
2. **Mailbox values**, ad5cc953. As proposed, plus: `src/terminal-text.mjs` (the page's
   handle) pushed pointer actions 1, 2, 0; display.mjs compared the frame index with 1 and
   listed the frames as `[0, 1]` (now `DOLLY_DISPLAY_FRAME_COUNT`); the input WAT's prose
   names LEASED and POINTER_RELATIVE where it said bit 0 and bit 1, and keeps input.h's
   "Escape ends the capture". touch@0's BUTTONS (95), PRESS and labels geometry were already
   WAT globals; the block's count and labels were `BUTTONS_OFFSET + 4` and `+ 8` in touch.mjs
   and its test: now `DOLLY_TOUCH_LABEL_COUNT_OFFSET` and `DOLLY_TOUCH_LABELS_OFFSET`, checked
   by touch.h's layout assert. touch's digest changes too. Left as they are, being layout or
   booleans rather than record types, flags or cursor styles: a record's field offsets in
   `writeRecord`, the pointer button in `flags >> 8` (read so by Ghostty, SDL2, Wine and
   slopyard), the FOCUS/CAPTURE/PRESENCE actions and the enabled word (1 or 0).
3. **Snapshot**, c0745b24. As proposed; it touches other hunks of kernel.c, snapshot.mjs and
   ui.mjs than `core/session-mtimes` does: a trial merge (`git merge-tree`) conflicts only in
   recipe pins. Not an image input (image inputs `badb9a41` before and after).
4. **The four kernel.c files**, 90c3b89b. After 1 they were still identical but for names
   and gpu's `reopen_busy`: each defined a call and a release that only forwarded to
   `dolly_device_call/release` with its device. `dolly_kernel_module` now has a `device`
   member that the kernel's module table calls directly; the four files keep only their
   slots, import, mailbox export and numbers (19 lines in, 54 out). A typed member rather than
   a `void *` context, which would have changed the call signature of all fifteen kernel
   modules.

Finding, not changed: `dolly_device_header` and `dolly_device_request()` sit in runtime.h,
which no module digest covers; a change of the header's layout would show only as a device
version, which the kernel and the bridge check. Bump the four versions with such a change.

### Measured (2026-11-04, on 90c3b89b)

- Image inputs `badb9a41` (base) to `56f681bc`; runtime `3e6dbff8`. The 30 images of this
  tree (`default`, `system`, `system-build`, the five `libdolly-*` packages, `stack-wrap`,
  `less`, `ghostty-build` and `zig-build` among them) rebuilt in 1,014 s.
- Pass in Chromium and Firefox on them: audio, microphone, nena, gpu-indicator,
  host-compute, dso, host-modules, boundary, custom-session, session-offline,
  snapshot-stream, indicators, terminal, display, display-cursor, touch (the holder's
  buttons included), shell, upload, pager, pty, network, sockets, stack, threads, embedding
  and core. `test/audio-host.test.mjs` (the bridge's whole-header checks) passes in the
  source suite (470 tests).
- Hardware gpu-render passes in Chrome 156 on Xvfb :142 (adapter "nvidia blackwell", 11 s),
  the fixture compiled in the guest against the rebuilt libdolly-gpu.
- Item 3 alone, before 1 and 2 (c0745b24, on the branch's images): custom-session,
  session-offline, snapshot-stream, indicators and boundary pass in both browsers.
- `default` passes in both browsers once the tree also publishes `python` (its start-up text
  names it; python's closure brings cmake, sqlite, xz and bzip2: 877 s) and `zig` (its
  "composed dependency" case): a narrowed catalog without them fails the test, not the image.

- Also with `dolly-docs` and `html` added to the catalog: docs, slop, html, image-input, ending
  and ended-worker pass in both browsers. process fails in both at its own-abort case only
  (`duplicate symbol: abort`), as e815be85 records on the base: the pinned compiler links
  libdolly-process.a whole until the round pins this branch's llvm-cc. amy needs `sdl2`, which
  this tree does not publish.

For the round: the seed changes (runtime.h, input.h, display.h, nena's client), so every
image rebuilds; programs linked with the input, display, touch or gpu client are refused
until they are, being stamped with the old digests. Not built here and so first measured by
the round: the demos that read input@0 or touch@0 records in C (Ghostty's display.c is in
`ghostty-build`, built here; SDL2, Wine's winedolly.drv, slopyard, bhop, gpu-fluid and
pi-phone's buttons are not), whose headers' values are now unsigned macros where they were
enums.

## Lessons

- A proposal that keeps its code apart from its recipe pins travels. Three prototypes from
  12c7fbd9, 510 commits back, came over as `git show BRANCH -- CODE | git apply` without one
  conflict, then a regeneration and a repin; a trial merge with `core/session-mtimes`
  conflicts only in pins. Never carry a proposal's Dollyfiles.
- `update-recipe-pins.mjs` without `--sources` rewrites FROM/INSTALL pins only, and the source
  suite checks only `Dollyfile-dolly-docs`'s SOURCE pins: a header edit leaves
  `system-build`'s and the `libdolly-*` packages' SOURCE pins stale until an image build
  meets them. After editing a header or client, run it with `--sources` and
  `DOLLY_BUILD_IMAGES` naming those recipes.
- Since 4512e2f8 a digest follows the contract, not the code that writes it: moving the
  header's filling into runtime.h left audio's and microphone's digests, and so every program
  built before, as they were, while gpu's moved with gpu.h's struct. `git diff '*-abi.h'`
  tells which programs a change refuses before any image is built.
- A tree that verifies a seed change needs `python` and `zig` in its catalog for
  `test/default-browser.mjs`; name them in the first image build rather than after the
  suites (it cost a second build of 877 s here).
- Splitting one working tree into per-item commits needs no stash: back up the changed files,
  check out HEAD for the other items' files, regenerate, repin, run the suite, commit,
  restore. The generated files follow their sources.
