# Growing a file past 2 GiB aborts instead of failing

- STATUS: CLOSED
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

## Findings (2026-10-02, `fix/fs-growth`)

Reproduced in the `default` image in Chrome, so `pi-local` is not needed: a C
program appending 64 MiB writes (`test/fixtures/fs-growth.c`) aborts once the
file passes 2,147,483,648 bytes. The stack (kernel built with
`--profiling-funcs`):

```
abort <- std::__throw_bad_alloc() <- operator new(unsigned long)
<- std::vector<unsigned char>::resize <- wasmfs::MemoryDataFile::write
<- DataFile::Handle::write <- writeAtOffset <- __wasi_fd_write
```

WasmFS's memory backend keeps each file in one `std::vector<uint8_t>`. Growth
doubles its capacity, and the kernel's C++ has no exceptions, so a failed
`operator new` calls `abort()`. At 2 GiB the vector asks for 4 GiB while the
2 GiB buffer is live, and the earlier 1 MiB ... 1 GiB buffers it freed (about
2 GiB) sit below it and cannot hold the new one: 2 + 2 + 4 GiB plus the image
exceed the kernel's 8 GiB maximum, which fits the abort at exactly 2 GiB even
with nothing else resident. `ftruncate` first works because one exact
allocation leaves no hole. The process got status 126; the kernel survived
only because the abort unwound one dispatch, and any other WasmFS allocation
failure aborts the same way.

## Fix

`src/file-blocks.cpp` (a kernel source in `host/runtime/module.json`) replaces
WasmFS's weak `wasmfs_create_root_dir` with a backend that is WasmFS's memory
backend except for file contents: bytes live in 1 MiB blocks, the last block
grows by doubling, and allocations use malloc/realloc. Growth allocates only new
blocks, so appending needs no copy of the file; a failed allocation frees what
the call added and fails the write, `ftruncate` or `posix_fallocate` with
`ENOSPC`. File blocks also leave 128 MiB of kernel memory allocatable, so after
the filesystem is full the shell can still start commands (the compiler, 78 MB,
is the largest) and WasmFS can still allocate metadata. No Emscripten patch;
`toolchain/CMakeLists.txt` adds WasmFS's header directory and compiles kernel
C++ with `-fno-exceptions` (otherwise the kernel imports `__cxa_throw`). The
kernel's imports are unchanged. Only `dolly.wasm` changes: the seed and image
inputs stay `sha256:ac0b6c21…`, so existing images remain valid.

Appending now fills the file to 8,316,780,544 bytes in `default` (8 GiB less
the reserve and the image) before `ENOSPC`; the shell, `stat`, `rm` and a new
2 GiB file work afterwards.

Old and new kernels measured the same (boot about 2 s in Chrome and 2.6 s in
Firefox; 20,000 files of 300 bytes, 2,000 of 70 KB, a 1 GiB append, `cat` of it,
`git add` of /usr/include), so the blocks and the reserve check cost nothing
visible.

Chrome slows down sharply once the kernel memory nears 8 GiB: sizing a
7,800 MiB file takes 55-58 s with either the old or the new kernel (7,000 MiB
takes 4 s), and later writes stay slow; the renderer's thread pool is busy
throughout. Firefox, which runs the whole growth test (one fill to 8 GiB)
in 23-30 s, does not. This predates the fix and is not addressed here.

Verification (headless Chrome and Firefox, `default`):
`node test/fs-growth-browser.mjs` (append to 2047 MiB, size to 3 GiB, append
until `ENOSPC`, then keep working), `node test/core-browser.mjs chromium` and
`firefox`, `node --test test/*.test.mjs`; also `process`, `snapshot-stream` and
`shell` browser tests in Chrome. The `pi-local` reproduction was not rerun; its
image is not built for this runtime.
