DOLLY 4
MODULE neovim-runtime

USE HOST /modules/posix-shell.dm f549dd966c59473892d2fc9f11a19a9b7eaf1c344b1b4a62c5dbf2fbedcc3753

COPY FROM HOST /Dollyfile-neovim-build 452ca10324e6dc14497d4d9b42b998791da112de07f4ca431daf4e90d881ad1c /usr/bin/nvim /usr/bin/nvim
COPY FROM HOST /Dollyfile-neovim-build 452ca10324e6dc14497d4d9b42b998791da112de07f4ca431daf4e90d881ad1c /usr/share/nvim /usr/share/nvim
COPY FROM HOST /Dollyfile-neovim-build 452ca10324e6dc14497d4d9b42b998791da112de07f4ca431daf4e90d881ad1c /usr/lib/nvim /usr/lib/nvim
COPY FROM HOST /Dollyfile-neovim-build 452ca10324e6dc14497d4d9b42b998791da112de07f4ca431daf4e90d881ad1c /usr/share/licenses/neovim /usr/share/licenses/neovim
COPY FROM HOST /Dollyfile-neovim-build 452ca10324e6dc14497d4d9b42b998791da112de07f4ca431daf4e90d881ad1c /usr/share/licenses/neovim-parsers /usr/share/licenses/neovim-parsers
COPY FROM HOST /Dollyfile-neovim-build 452ca10324e6dc14497d4d9b42b998791da112de07f4ca431daf4e90d881ad1c /usr/share/licenses/libuv /usr/share/licenses/libuv
COPY FROM HOST /Dollyfile-neovim-build 452ca10324e6dc14497d4d9b42b998791da112de07f4ca431daf4e90d881ad1c /usr/share/licenses/lua /usr/share/licenses/lua
COPY FROM HOST /Dollyfile-neovim-build 452ca10324e6dc14497d4d9b42b998791da112de07f4ca431daf4e90d881ad1c /usr/share/licenses/luv /usr/share/licenses/luv
COPY FROM HOST /Dollyfile-neovim-build 452ca10324e6dc14497d4d9b42b998791da112de07f4ca431daf4e90d881ad1c /usr/share/licenses/lua-compat53 /usr/share/licenses/lua-compat53
COPY FROM HOST /Dollyfile-neovim-build 452ca10324e6dc14497d4d9b42b998791da112de07f4ca431daf4e90d881ad1c /usr/share/licenses/lpeg /usr/share/licenses/lpeg
COPY FROM HOST /Dollyfile-neovim-build 452ca10324e6dc14497d4d9b42b998791da112de07f4ca431daf4e90d881ad1c /usr/share/licenses/utf8proc /usr/share/licenses/utf8proc
COPY FROM HOST /Dollyfile-neovim-build 452ca10324e6dc14497d4d9b42b998791da112de07f4ca431daf4e90d881ad1c /usr/share/licenses/treesitter /usr/share/licenses/treesitter
EXPORTS TOOL nvim
EXPORTS FOLDER nvim-runtime /usr/share/nvim
EXPORTS FOLDER nvim-libraries /usr/lib/nvim
