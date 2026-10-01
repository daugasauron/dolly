# Growing a file past 2 GiB aborts instead of failing

- STATUS: OPEN
- PRIORITY: 160
- TAGS: bug,filesystem,core

Found while sizing local models (`20261001-214000-pi-local-model`). In a
`pi-local` tab, appending 64 MiB writes to `/run/big` succeeds up to
2,147,483,648 bytes; the next write aborts the writing process with
`Aborted()` from `dolly.wasm` (`__abort_js`), and `curl -o` of a 3.0 GB file
fails the same way after 2 GiB. The shell survives.

The same 3 GiB file works when it is sized first: `ftruncate(fd, 3 GiB)` in C,
or a one-byte write at the last offset from Janis, then positional writes
(3,221,225,472 bytes, `ok`). So this is not a size limit but growth: the file's
buffer presumably doubles to 4 GiB while the old 2 GiB is still live, beyond
the 8 GiB kernel memory with the rest of the image resident.

Reproduce in `pi-local`'s recovery shell:

```sh
mkdir -p /run
janis -e 'const fs=process.getBuiltinModule("node:fs");const b=new Uint8Array(64<<20);const fd=fs.openSync("/run/big","w");for(let i=0;i<36;i++)fs.writeSync(fd,b)'
```

Done when growth that cannot be satisfied fails the write with `ENOSPC`/`EFBIG`
instead of aborting, and (if cheap) growth does not need twice the file size.
