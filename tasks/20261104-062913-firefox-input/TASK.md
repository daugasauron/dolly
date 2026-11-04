# Firefox's build page cannot prepare a 1.4 GB published input under 6 GB

- STATUS: OPEN
- PRIORITY: 140
- TAGS: bug,firefox,memory,snapshots

Seen by `core/install-copy` (2026-11-04, `tasks/20261104-012434-install-copy`). A custom image
`FROM system` that `INSTALL`s `qwen3.5-2b` (pi-local's install of the 1.4 GB model): the build
page reads the two inputs from their packs into the image store (`prepareImageArtifacts`,
`packagedSystemSnapshot`) before any build starts. In headless Firefox, persistent profile, 6 GB
browser slot, the page is killed by the cap every time (five runs); Chromium's highest anonymous
memory on the same path was 5331 MB, and 2356 MB once `packedRecords` verified each pack as it
decompressed instead of whole (`core/install-copy`). Firefox, with that change
(`build/install-copy-evidence/prepare-after-firefox.memory.txt` in `work/ghostty`):

- anonymous memory jumps from 0.6 to 3.9 GB within about 0.6 s while the model's pack (about
  1.3 GB compressed) is fetched, kept in the pack store and read into memory: 2.5 times the pack;
- then it grows about 230 MB/s, the pace of decompressing and hashing the pack, until the cap
  at 6.3 GB; nothing in Chromium's trace grows that way.

Reproduce: `bash build/install-copy-evidence/install-measured.sh firefox NAME prepare` in that
tree (`install-measured.mjs`), or any page build that reads a published input of that size.
Suspects, unmeasured: the `cache: "force-cache"` fetch of a 1.3 GB pack, the pack store's
`createWritable` while the response is read, `DecompressionStream`'s output in Firefox and when
Firefox collects it. Firefox's own memory report (`about:memory`) of the content process at the
jump would tell which.

Done when: the preparation above completes in Firefox under the 6 GB cap with its peak measured,
and the install of `tasks/20261104-012434-install-copy` is measured in Firefox.
