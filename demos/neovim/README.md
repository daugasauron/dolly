# Neovim

Neovim, PUC Lua and Tree-sitter grammars compiled inside Dolly from pinned source.

## Images

- `neovim`: Neovim with Lua and syntax parsers.
- `neovim-build`: Neovim, Lua and syntax-parser build tools.
- `nvim`: Neovim with its runtime and parsers, as a package.

Open `/neovim/`; build with `npm run image -- neovim`. The image enters the
editor; `:q` returns to Slop and `nvim` reopens it. `:!command` runs Slop.
Ctrl+C is Dolly's process interrupt, not an insert-mode exit.

## Key files

- [`Dollyfile-neovim-build`](Dollyfile-neovim-build), [`Dollyfile-neovim-build`](Dollyfile-neovim-build), [`Dollyfile-neovim-build`](Dollyfile-neovim-build),
  [`Dollyfile-neovim-build`](Dollyfile-neovim-build), [`Dollyfile-neovim-build`](Dollyfile-neovim-build):
  builds, starting from `cmake-build` ([CMake](../cmake/README.md)).
- [`neovim-dolly.patch`](neovim-dolly.patch): keeps children attached to their
  owner, targets the child PID on cancel, fixes a memory64 terminfo varargs call.
- The TUI and embedded editor talk RPC over Dolly pipes through the libuv port in
  `demos/cmake/libuv/`; no browser import is added.

## Limits

- No PTY `:terminal`, tmux, detached jobs, network sockets, threads or LuaJIT FFI.

Test: `npm run test:demos -- neovim` ([`test/`](test/)).
