# Dolly release audit: developer workflows

Image: `pi-agent`, Dolly 7, packages `/v0.1.4`. Host modules declared: runtime, display, input,
audio, download, http, nena, packages, snapshot, threads, touch, upload. I turned on `dso`,
`sockets` and `pty` with `nena enable` (each printed `nena: <mod>@0 enabled`).

## Summary

| Area | Result |
|---|---|
| CMake + libpng + SQLite | **Works** (Unix Makefiles and Ninja) |
| Python: sqlite3/json/bz2/lzma | **Works**, plus subprocess, threading, urllib, `pip install six` |
| Go | **Fails**: no `go` package, though the dolly skill says `amy install go` works |
| Rust | **Partly works**: build/run/threads OK; `cargo test` broken; crates.io needs hand vendoring (`vendor-crates` is missing) |
| Git | **Mostly works**; local clone/push fail without workarounds |
| Lua 5.1 + LPeg + luv | **Works** |
| Neovim 0.12.5 | **Works** (headless edits, full-screen UI starts) |
| X11 (Xsdl, twm, xeyes, xclock, xterm, imgui-x11) | **Works only with workarounds** (`-nolock`, `SDL_VIDEODRIVER=x11`) |
| SDL2 | **Works** (cc and CMake `find_package(SDL2)`), about 58 fps |
| upload / download | download: tested by delivering this file; upload: prompt appeared, not finished (no human picked a file) |

## 1. CMake project linking amy libraries
`amy install cmake libpng sqlite` took 2.5 s. Project `cmk/`: static lib `grad` (writes and reads a PNG
with libpng) + exe `pngdb` (stores the size in SQLite), using `find_package(PNG)` and `find_package(SQLite3)`.
```
-- Found ZLIB: /usr/lib/libz.a (found version "1.3.2")
-- Found PNG: /usr/lib/libpng.a (found version "1.6.58")
-- Found SQLite3: /usr/lib/libsqlite3.a (found version "3.54.0")
[100%] Built target pngdb
$ ./pngdb  ->  libpng 1.6.58, sqlite 3.54.0 / name=out.png w=64 h=32 px=2048
```
`cmake -G Ninja` also built it. CMake 4.4.3, Clang 24.0.0. My first try used the old
`SQLite::SQLite3` target, which only printed CMake 4 deprecation warnings.
Small issues:
- `file out.png` / `file img.db` print `data` (the magic bytes `89 50 4E 47` and `SQLite format 3` are correct).
  `file` knows only WebAssembly; `man file` shows only its usage line. No workaround needed.
- `od -c` is rejected (`usage: od [-bdosvx] ...`); `od -t x1` / `od -t c` work.

## 2. Python
`amy install python` → Python 3.14.7 (it needs dso+sockets). `py/audit.py` ran in 0.47 s:
```
python 3.14.7 sqlite 3.54.0
sqlite rows 1000 sum of squares 332833500 expected 332833500
fts5 match: [('the quick brown fox',)]
zlib 7502 bytes / bz2 4922 bytes / lzma 3868 bytes, roundtrip ok
lzma file: {'ok': True, 'n': 1000}      bz2 file size 4922
```
Also: `subprocess.run(["echo","hi"])` → `hi`; a thread ran; `urlopen("https://pypi.org/...")` → 200;
`pip install six` → `Successfully installed six-1.17.0`. Nothing failed.

## 3. Go — FAILED, no workaround
```
$ amy install go
amy: go: this site publishes no such package; amy list shows them
$ go version
slop: go: command not found
```
`golang` is missing too. Neither `amy list` nor `/usr/share/doc/dolly` mentions Go, but the
dolly skill says "`amy install go` brings Go". **Either the package is missing from the release or the skill is wrong.**

## 4. Rust
`amy install cargo` → cargo 1.98.1 / rustc 1.98.1 (4 s). `amy install vendor-crates` →
`amy: vendor-crates: this site publishes no such package` (the skill documents it too).
- A crate with no dependencies (HashMap, 4 `std::thread`s, fs): `cargo build --release` 8.3 s; it printed
  `top: [("the", 3), ...]`, `threads sum = 500000500000`. Works.
- **`cargo test` fails:** `error[E0463]: can't find crate for 'test'`. The sysroot `/opt/rust-sdk` has
  no `libtest`, so no `#[test]` can compile. *Workaround:* set `test = false` on the bin and add a
  `[[test]] harness = false` target with a `main()`; that ran (`custom test ok`).
- **A crates.io dependency fails:** `itoa = "1"` → `download of config.json failed ... [7] Browser could
  not fetch the URL: blocked (no CORS headers...)`. index.crates.io and the crates.io API have no CORS headers;
  **static.crates.io returns 200**. *Workaround (worked):* download `itoa-1.0.15.crate` with curl, unpack it
  into `vendor/itoa`, write `.cargo-checksum.json` `{"files":{},"package":"<sha256>"}`, add a
  `[source]` replacement in `.cargo/config.toml`, then `cargo build --offline` → `itoa: 1234567`.
  This is tedious for dependency trees, so the missing `vendor-crates` package hurts.

## 5. Git 2.55.0
Worked: init, config, add, commit, `checkout -b`, diff between branches, `log --oneline --graph --all`,
merge (real merge commit), rebase, stash/pop, `diff --stat`, blame, tag, `archive -o x.zip`, gc, fsck.
The default branch is `master` (my `git diff main` failed with `unknown revision`, which is expected).
- **Local clone fails:** `git clone /workspace/gt gtc` →
  `slop: git-upload-pack: command not found` / `fatal: Could not read from remote repository.`
  `git --exec-path` = `/usr/libexec/dolly`, which has only git-remote-http(s). *Workaround (worked):*
  `git clone --upload-pack='git upload-pack' ...`; for fetches, `git config remote.origin.uploadpack 'git upload-pack'`.
- **Local push fails:** `git push /tmp/bare.git topic` → `slop: git-receive-pack: command not found`;
  with `--receive-pack='git receive-pack'` → `error: fork (async) failed: Function not implemented`.
  *Workaround:* fetch from the target side instead:
  `git -C bare.git fetch --upload-pack='git upload-pack' /workspace/gt topic:topic` worked.
- `git clone https://github.com/...` → `Browser could not fetch the URL` (documented: no relay).

## 6. Lua and Neovim
`amy install lua nvim`. `lua t.lua`: `Lua 5.1`, LPeg parse `lpeg sum 60`, luv
`timer fired after ~51ms`, io, coroutines all OK. This is PUC Lua 5.1, not LuaJIT or 5.4.
Neovim: `NVIM v0.12.5`, **`Build type: Debug`** (a debug build in a release is worth checking).
`nvim --headless -c sort -c '%s/a$/A/' -c wq` edited the file correctly; `vim.version().minor` = 12;
`vim.treesitter.language.add("c")` → true. `timeout 4 nvim file` → status 124 (the UI started).
`:checkhealth vim.provider` warns: no clipboard tool, no node/perl/ruby, no pynvim (to be expected here).

## 7. X11
`amy install sdl2 xorg-server xeyes xclock xterm twm`:
- **xterm refused:** `dollyfile: .../Dollyfile-xterm needs pty@0: nena enable pty` / `amy: xterm: not installed`.
  The failure also **stopped the rest of the batch** (twm was not installed until I ran it again; seen
  again with `amy install tmux zstd`, which installed neither; amy exits 1, correctly). *Workaround:* `nena enable pty`, then install again.
- **Xsdl won't start:** `Xsdl :1 -ac` →
  `Fatal server error: Linking lock file (/tmp/.X1-lock) in place failed: Too many links`;
  every client then printed `unable to open display ":1"`. xterm's version of this error is confusing:
  `This program is an suid-root program or is being run by the root user ... Can't open display: %s`.
  *Workaround (worked):* `Xsdl :1 -ac -nolock`. With it, twm, xeyes, `xclock -update 1` and
  `xterm -e sh -c '...'` all connected (xterm's shell wrote its output file). Harmless warnings:
  `locale not supported by Xlib`, xclock `Unable to load any usable fontset`, xterm
  `Failed to open input method`, xkbcomp `Symbol map for key <FK23> redefined`.
- **imgui-x11 fails** with DISPLAY set: `Error: Dolly display acquire: -10` (status 1). Its SDL
  picks the Dolly video driver ahead of X11. *Workaround (worked):* `SDL_VIDEODRIVER=x11`
  (status 124 = still running at the time limit). Its man page and amy text say only "Run it where DISPLAY
  names an X server"; the "../x11/README.md" that amy's description links to is not in the image.
- No man page for Xsdl (`man: no manual entry for Xsdl`); `Xserver(1)` exists.
- I could not see the screen, so these results show that clients connected, not what was drawn.

## 8. SDL2
`sdl/main.c`: window, renderer, a moving rect for 3 s, event polling. Built both with CMake
(`find_package(SDL2)` + `SDL2::SDL2`) and `cc main.c -lSDL2 -lm`:
```
SDL 2.32.10 video=dolly audio=dolly
renderer=software window=640x400
frames=174 in 3006ms (57.9 fps), events=32
```
Nothing failed. An ACCELERATED|PRESENTVSYNC request quietly falls back to software, as documented.

## 9. Upload / download
- `timeout 90 upload /workspace/uploaded.bin` printed `upload: choose a file in the browser, or cancel`
  and waited. Nobody picked a file, so it ended with status 124 and wrote nothing. **Not verified
  end to end; it needs a human.** The timeout ended it cleanly.
- `download`: this report was delivered with Pi's download tool; whether it saved is up to the user's Save click.

## Failures at a glance
| # | Failure (exact message) | Workaround? |
|---|---|---|
| 1 | `amy: go: this site publishes no such package` | **None** |
| 2 | `amy: vendor-crates: this site publishes no such package` | Hand vendoring from static.crates.io |
| 3 | `error[E0463]: can't find crate for 'test'` (`cargo test`) | `harness = false` test targets |
| 4 | cargo: `download of config.json failed ... [7] Browser could not fetch the URL` | Same as 2 |
| 5 | `slop: git-upload-pack: command not found` (local clone/fetch) | `--upload-pack='git upload-pack'` |
| 6 | `git-receive-pack: command not found`, then `fork (async) failed: Function not implemented` | Fetch from the destination instead |
| 7 | `Linking lock file (/tmp/.X1-lock) in place failed: Too many links` (Xsdl) | `-nolock` |
| 8 | `Error: Dolly display acquire: -10` (imgui-x11) | `SDL_VIDEODRIVER=x11` |
| 9 | `Dollyfile-xterm needs pty@0` also aborts the rest of a multi-package `amy install` | `nena enable pty`; install again |
| 10 | `file` says `data` for PNG/SQLite; `od -c` unsupported; `man file`/`Xsdl` thin or missing | `od -t c`; minor |
| 11 | Neovim reports `Build type: Debug` | n/a (worth checking) |
