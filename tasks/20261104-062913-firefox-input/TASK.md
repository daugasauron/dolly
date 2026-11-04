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

The two steps of `packedRecords` alone, in a bare page with no store, on the model's pack
(1,366,893,825 bytes compressed, 1,396,198,564 decompressed; `firefox-sinks.mjs`,
`sinks-*.log`), the slot's anonymous memory in MB:

| step | Firefox | Firefox, `cache: "no-store"` | Chromium |
| --- | --- | --- | --- |
| fetch the pack into one `Uint8Array` (1.1 s) | 463 -> 4198 | 449 -> 3864 | 1711 -> 2593, then 1810 |
| 3 s idle | up to 4886, then 4269 | up to 5046, then 3973 | 1810 |
| decompress it in 16 KiB pieces, dropping every output chunk (3 to 4.5 s) | 4281 -> 5681 | 3812 -> 5624 | 1820 -> 2243 |

So it is not the HTTP cache: Firefox keeps about 2.5 GB of the response's chunks beyond the array
it copies them into, and all 1.4 GB of the decompressed chunks, uncollected for seconds; the memory
falls later, when idle. Under the cap the content process dies first. Holding less (the merge
re-reading the kept pack from the store instead of holding its compressed bytes) would lower the
floor by 1.37 GB but not the garbage; whether Firefox collects sooner under pressure in a page
that is not capped, and what `about:memory` attributes it to, is not measured.

Done when: the preparation above completes in Firefox under the 6 GB cap with its peak measured,
and the install of `tasks/20261104-012434-install-copy` is measured in Firefox.
