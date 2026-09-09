DOLLY 3
MODULE neovim-runtime

USE HOST /modules/posix-shell.dm 8b980e03bb4ee4402bb8eba064503859479298979694a968fa7f1563e94eac51

COPY FROM HOST /Dollyfile-neovim-build 7c260c095c1a1bae1a2bf5f1fb1c3531ead38cfbda4ffc9cecc2fc9d2e824ebc /usr/bin/nvim /usr/bin/nvim
COPY FROM HOST /Dollyfile-neovim-build 7c260c095c1a1bae1a2bf5f1fb1c3531ead38cfbda4ffc9cecc2fc9d2e824ebc /usr/share/nvim /usr/share/nvim
COPY FROM HOST /Dollyfile-neovim-build 7c260c095c1a1bae1a2bf5f1fb1c3531ead38cfbda4ffc9cecc2fc9d2e824ebc /usr/lib/nvim /usr/lib/nvim
COPY FROM HOST /Dollyfile-neovim-build 7c260c095c1a1bae1a2bf5f1fb1c3531ead38cfbda4ffc9cecc2fc9d2e824ebc /usr/share/licenses/neovim /usr/share/licenses/neovim
COPY FROM HOST /Dollyfile-neovim-build 7c260c095c1a1bae1a2bf5f1fb1c3531ead38cfbda4ffc9cecc2fc9d2e824ebc /usr/share/licenses/neovim-parsers /usr/share/licenses/neovim-parsers
COPY FROM HOST /Dollyfile-neovim-build 7c260c095c1a1bae1a2bf5f1fb1c3531ead38cfbda4ffc9cecc2fc9d2e824ebc /usr/share/licenses/libuv /usr/share/licenses/libuv
COPY FROM HOST /Dollyfile-neovim-build 7c260c095c1a1bae1a2bf5f1fb1c3531ead38cfbda4ffc9cecc2fc9d2e824ebc /usr/share/licenses/lua /usr/share/licenses/lua
COPY FROM HOST /Dollyfile-neovim-build 7c260c095c1a1bae1a2bf5f1fb1c3531ead38cfbda4ffc9cecc2fc9d2e824ebc /usr/share/licenses/luv /usr/share/licenses/luv
COPY FROM HOST /Dollyfile-neovim-build 7c260c095c1a1bae1a2bf5f1fb1c3531ead38cfbda4ffc9cecc2fc9d2e824ebc /usr/share/licenses/lua-compat53 /usr/share/licenses/lua-compat53
COPY FROM HOST /Dollyfile-neovim-build 7c260c095c1a1bae1a2bf5f1fb1c3531ead38cfbda4ffc9cecc2fc9d2e824ebc /usr/share/licenses/lpeg /usr/share/licenses/lpeg
COPY FROM HOST /Dollyfile-neovim-build 7c260c095c1a1bae1a2bf5f1fb1c3531ead38cfbda4ffc9cecc2fc9d2e824ebc /usr/share/licenses/utf8proc /usr/share/licenses/utf8proc
COPY FROM HOST /Dollyfile-neovim-build 7c260c095c1a1bae1a2bf5f1fb1c3531ead38cfbda4ffc9cecc2fc9d2e824ebc /usr/share/licenses/treesitter /usr/share/licenses/treesitter
EXPORTS TOOL nvim
EXPORTS FOLDER nvim-runtime /usr/share/nvim
EXPORTS FOLDER nvim-libraries /usr/lib/nvim
