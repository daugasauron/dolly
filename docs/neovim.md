# Source-built Neovim

Upstream Neovim 0.12.5, PUC Lua 5.1 and its bundled Tree-sitter grammars compile
inside Dolly's browser sandbox. Versions and archive hashes live in
[`source-pins.sh`](../config/source-pins.sh).

## Images

| Image | Contents |
| --- | --- |
| `cmake-build` | System tools, libuv and source-built CMake. Preserves the expensive bootstrap checkpoint. |
| `neovim-build` | CMake builder plus Lua, LPeg, luv, utf8proc, Tree-sitter, Neovim and seven parsers. |
| `neovim` | System tools plus the copied editor, runtime, parsers and licenses. No CMake or build scratch. |

[`Dollyfile-neovim`](../Dollyfile-neovim) opens `/usr/bin/nvim /usr/share/nvim/welcome.txt`
immediately and configures `/bin/slop` for `:!command`. A small in-sandbox entry
script starts the recovery Slop shell after `:q` or interruption. Run `nvim` to
reopen the editor; no browser-side program selection or recovery policy is added.
`nvim --clean` skips user configuration; `/bin/sh` still resolves to Slop.

```sh
npm run image -- neovim
DOLLY_IMAGE=neovim DOLLY_BUILD_IMAGES=neovim DOLLY_BROWSER_MODE=neovim bash scripts/test-browser.sh
DOLLY_IMAGE=neovim-build DOLLY_BUILD_IMAGES=neovim DOLLY_BROWSER_MODE=neovim bash scripts/test-browser.sh
```

## Port boundary

The upstream TUI launches an embedded editor and exchanges RPC over ordinary
Dolly pipes. Ghostty parses and renders terminal bytes inside Wasm. Neither
Neovim nor libuv receives a new browser import; the executable passes the exact
process contract with only `env.memory` and `dolly_process_0.call`.

[`libuv`](../src/libuv/) uses polling and serial deferred work above the
existing filesystem, process and signal operations. Its browser test covers
dynamic loading, files, streaming children, cancellation, terminal input,
resize and terminal-mode restoration: `DOLLY_IMAGE=system bash scripts/test-libuv.sh`.

The [Neovim patch](../config/neovim-dolly.patch) keeps ordinary children and
the embedded editor attached to their owner, and targets the child PID when
cancelling a job. The recipe explicitly defines `DOLLY` to select these branches.
It also fixes an upstream terminfo formatter passing `int` for `%ld`, which
produced invalid coordinates and colors on wasm64. Patches apply without fuzz.

PTY `:terminal`, detached jobs, raw sockets, arbitrary threads and LuaJIT FFI
are unsupported. No host fallback is provided. Ctrl+C is Dolly's process
interrupt and closes the editor; use Escape to leave insert mode.

## Verification checkpoint

- Passed: source compilation, Lua generators, Unicode write/save/reopen,
  Slop child output, incremental job output/input and job cancellation.
- Passed: source compilation and loading of C, Lua, Vim, Vimdoc, query,
  Markdown and inline-Markdown parsers.
- Passed: runtime-image separation and exact executable ABI validation.
- Passed: interactive editing, Unicode paste, resize, save/quit, reopen,
  configured Slop commands and Ctrl+C recovery. Both normal and interrupted
  exits restore terminal settings. These run in Chrome with the actual image.
- Passed: direct Neovim entry, physically shifted punctuation, standalone Escape,
  and matching text/erased-cell backgrounds in RGB and palette modes.
- Passed: terminal output processing, stdout detection, descriptor-specific
  size queries, libuv and CPython's termios adapter. The browser boundary and
  process lifecycle regressions also pass; no browser import was added.

Measured on 2026-09-07: the Neovim builder took 258.3 seconds with CMake cached;
the cold CMake bootstrap took 1,323.2 seconds. Uncompressed snapshots are
274,606,351 bytes for the builder and 182,054,162 for the runtime; the editor
executable is 10,271,351 bytes. Timings depend on the browser and machine load.
