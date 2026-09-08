# Neovim

Neovim, PUC Lua and Tree-sitter grammars compile inside Dolly.
Exact versions and hashes live in [source-pins.sh](../config/source-pins.sh).

| Image | Contents |
| --- | --- |
| `cmake-build` | System, libuv and source-built CMake |
| `neovim-build` | Builder dependencies, editor and parsers |
| `neovim` | Copied editor, runtime, parsers and licenses; no CMake/build scratch |

The neovim image enters the editor directly. `i` inserts; Escape returns to
normal; `:w` saves and `:q` returns to Slop. Run `nvim` to reopen it.
Ctrl+C is Dolly's process interrupt and closes the editor, not an insert-mode exit.
`:!command` runs Slop; `/bin/sh` remains its alias with `nvim --clean`.

Studio installs Dollyfile highlighting and inline linting on open/edit/save.
`:DollyLint` checks an unsaved buffer. Interactive editing requires leaving
Pi for Slop; Pi's captured shell tool does not own an editor terminal.

## Port boundary

The TUI and embedded editor exchange RPC over Dolly pipes.
`src/libuv/` uses polling and serial deferred work over existing filesystem,
process and signal operations. No new browser import is added.

`config/neovim-dolly.patch` keeps children attached to their owner, targets
the child PID for cancellation and fixes a memory64 terminfo varargs mismatch.
Ghostty parses/renders terminal output inside Wasm.

PTY `:terminal`, tmux, detached jobs, raw sockets, threads and LuaJIT FFI are
unsupported. Normal/interrupted exits restore terminal mode.

## Checks

```sh
npm run image -- neovim
DOLLY_IMAGE=neovim DOLLY_BUILD_IMAGES=neovim DOLLY_BROWSER_MODE=neovim bash scripts/test-browser.sh
DOLLY_IMAGE=system bash scripts/test-libuv.sh
```

Browser tests cover source compilation, parsers, Unicode editing/paste,
Escape/shifted punctuation, backgrounds, save/quit/reopen, resize, streaming
children and cancellation. Studio's installed syntax/lint plugin has separate
Chrome and Firefox coverage.
