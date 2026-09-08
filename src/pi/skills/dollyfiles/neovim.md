# Neovim in Dollyfile Studio

For interactive editing, leave Pi with Ctrl+D on an empty input (or `/exit`),
then run `nvim /workspace/Dollyfile` at the Slop prompt. `i` enters insert mode;
Escape returns to normal; `:w` saves, `:q` quits, `:wq` does both. Run `pi` at
the shell to return. Pi's captured shell tool does not own an interactive
terminal, so do not launch interactive nvim through it.

The installed plugin recognizes Dollyfile, Dollyfile-* and *.dm. It highlights
directives in yellow, sets four-space indentation and shows inline lint errors
on open, save and after edits (leaving insert mode). `:DollyLint` checks the
current buffer immediately without saving it. `:lua vim.diagnostic.open_float()` explains
the current diagnostic. There is no LSP; linting never executes SLOP, downloads
sources or changes image state.

Pi can use `nvim --headless -l SCRIPT.lua` for deterministic editor operations;
it skips user configuration/plugins and exits after the script. To load the
Studio plugin, use `nvim --headless -S SCRIPT.lua` and quit explicitly in the
script. Prefer normal read/write/edit tools for simple changes. `:!COMMAND`
runs Slop; PTY `:terminal`, detached jobs and LuaJIT FFI are unsupported.
