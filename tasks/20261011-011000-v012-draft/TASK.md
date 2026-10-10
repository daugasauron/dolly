# A draft v0.1.2: a rebuild with the new Wine and pi-phone

- STATUS: OPEN
- PRIORITY: 180
- TAGS: release

Owner (2026-10-11), about the Wine relaunch bug, the desktop as a folder and its README: "After
that is fixed, I want a draft v0.1.2 rebuild that includes wine and the new pi-phone image."

A draft is local: built, tested, packaged and served on this machine. Nothing is tagged, pushed
or deployed without the owner saying so.

Done means:

1. `main` holds the Wine work (`demo/gimp`: GIMP, the Command Prompt, the relaunch fix, the
   desktop as a folder, `README.txt`) and the phone work (`buttons@0`, `pi-phone`, the new
   `speech-to-text`), with the version at 0.1.2.
2. Every image of the catalog rebuilt on that seed: the kernel and SDK changed after v0.1.1
   (`microphone@0`, `buttons@0`, the display's cursors and font rule), so none of v0.1.1's
   images is current.
3. The release round's checks, with what failed said plainly.
4. Both sites packaged; GitHub Pages under its 1 GB, and which images that leaves out.
5. Served locally, with the addresses in the report.

## The draft (2026-10-11, 02:22 to 08:10)

Branch `release/v0.1.2-draft` in `work/rust`: `main` with the Wine branch merged (`56b0223b`),
the version at 0.1.2 (`d802b73b`) and the catalog repinned as built (`8e7c4d92`). The round
(`work/release-round.sh`, evidence in `build/v012-evidence/`) on image inputs `a7ee26c5...`:

| Stage | Result |
|---|---|
| Runtime and Rust seed | built, 02:22 to 02:25 |
| Codex chain, 70 light images, 13 heavy | all built, 02:25 to 06:05, none failed |
| Source tests | 424 passed, 0 failed |
| Artifact checks | 25 passed, 0 failed |
| Core browser tests | all passed in Chrome and Firefox, 951 s |
| Demo tests | all passed, with `wine` (148 s), `speech`, `speech refused` and `pi-phone` |
| GPU tests | local-llm, 0ad-spidermonkey, 0ad-engine, 0ad-graphics, slopyard: all passed |
| Full site | `build/v012-releases`, release `87eb9d6d...` |
| Domain site | `build/v012-domain-releases`, release `c502623a...`, with `wine`, `speech-to-text`, `pi-phone` |
| GitHub Pages subset | `build/v012-github-releases`, release `c06c44ed...`, 939 MB of its 1 GB, without `wine`, `speech-to-text`, `pi-phone`, `neovim`, `rts-arena` |

Served as it would be deployed by the user unit `dolly-serve-9005`: http://127.0.0.1:9005/ leads
to `/v0.1.2/`; `/v0.1.1/...` and unversioned paths are 404 there. The integrator, on that server:
the phone page in Chrome's Pixel 7 emulation showed its buttons 5.2 s after opening and typed
the dictated sample into Pi; the Wine page ran the desktop's sample, closed it, compiled, copied
the program to the Desktop folder and ran it twice.

Not done, because a draft is local: no tag, no push, no deployment, no release notes. A release
would also need the published v0.1.0 and v0.1.1 beside it in the deployment, as
`docs/deployment.md` says.

Known in this draft: the phone's open items (`tasks/20261010-193000-phone-voice-pi`,
`tasks/20261010-234000-pi-stray-reply`), GIMP without plug-ins and its one Firefox fault
(`tasks/20261010-195200-gimp-in-wine`), and the Wine executable being GPL-2.0-only as a whole.
The disk is at 12 GB free: `work/rust/build/pages-v0.1.0` (18 GB) and
`work/rust/build/domain-releases` (19 GB) are local packagings of the two published versions,
whose archive is `work/locks/published`; they were not removed without the owner's word.
