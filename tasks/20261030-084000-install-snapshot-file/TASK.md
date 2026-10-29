# amy install holds a package's snapshot beside the files it installs

- STATUS: OPEN
- PRIORITY: 70
- TAGS: amy,kernel,memory,packages

Since `c8d69656` the page holds a package's compressed packs while amy reads its snapshot; the
rest of an install's memory is the kernel's. For `nena enable stack && amy install lean` in
`default` that is about 4.6 GB at its high-water for 3.06 GB of installed files (the renderer is
4.9 GB in Chromium at the end of `lean-meta`'s install):

- amy writes each snapshot to `/etc/dolly/artifacts` and the engine copies every record out of it
  into its file (`copy_artifact_file`, `src/dollyfile.c`), so `lean-meta`'s 1.58 GB snapshot and
  its 1.58 GB of files are in kernel memory at once;
- amy keeps `lean`'s 685 MB snapshot while `lean-std` and `lean-meta`, which it records,
  install (`install_row`, `src/commands/amy.c`).

Both are in the seed: a change rebuilds every image. What each would save:

- amy removes a package's snapshot once it has read the rows it records, and fetches it again
  after them: 685 MB for `lean`, at the cost of a second transfer;
- the engine installs from the HTTP response as the kernel restores a boot snapshot
  (`dolly_snapshot_stream_*`, `src/system-snapshot.c`), with no snapshot file: the largest
  package's size, 1.58 GB.

Done-when: the kernel's high-water for `amy install lean` is the installed files and little more,
measured in Chromium and Firefox.
