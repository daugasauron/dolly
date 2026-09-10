DOLLY 3
MODULE neovim-runtime

USE HOST /modules/posix-shell.dm 8b980e03bb4ee4402bb8eba064503859479298979694a968fa7f1563e94eac51

COPY FROM HOST /Dollyfile-neovim-build 63b702bc60595a83f8db7a8ba6dc5992f509327893f9918ffcc79b1d30b0fecd /usr/bin/nvim /usr/bin/nvim
COPY FROM HOST /Dollyfile-neovim-build 63b702bc60595a83f8db7a8ba6dc5992f509327893f9918ffcc79b1d30b0fecd /usr/share/nvim /usr/share/nvim
COPY FROM HOST /Dollyfile-neovim-build 63b702bc60595a83f8db7a8ba6dc5992f509327893f9918ffcc79b1d30b0fecd /usr/lib/nvim /usr/lib/nvim
COPY FROM HOST /Dollyfile-neovim-build 63b702bc60595a83f8db7a8ba6dc5992f509327893f9918ffcc79b1d30b0fecd /usr/share/licenses/neovim /usr/share/licenses/neovim
COPY FROM HOST /Dollyfile-neovim-build 63b702bc60595a83f8db7a8ba6dc5992f509327893f9918ffcc79b1d30b0fecd /usr/share/licenses/neovim-parsers /usr/share/licenses/neovim-parsers
COPY FROM HOST /Dollyfile-neovim-build 63b702bc60595a83f8db7a8ba6dc5992f509327893f9918ffcc79b1d30b0fecd /usr/share/licenses/libuv /usr/share/licenses/libuv
COPY FROM HOST /Dollyfile-neovim-build 63b702bc60595a83f8db7a8ba6dc5992f509327893f9918ffcc79b1d30b0fecd /usr/share/licenses/lua /usr/share/licenses/lua
COPY FROM HOST /Dollyfile-neovim-build 63b702bc60595a83f8db7a8ba6dc5992f509327893f9918ffcc79b1d30b0fecd /usr/share/licenses/luv /usr/share/licenses/luv
COPY FROM HOST /Dollyfile-neovim-build 63b702bc60595a83f8db7a8ba6dc5992f509327893f9918ffcc79b1d30b0fecd /usr/share/licenses/lua-compat53 /usr/share/licenses/lua-compat53
COPY FROM HOST /Dollyfile-neovim-build 63b702bc60595a83f8db7a8ba6dc5992f509327893f9918ffcc79b1d30b0fecd /usr/share/licenses/lpeg /usr/share/licenses/lpeg
COPY FROM HOST /Dollyfile-neovim-build 63b702bc60595a83f8db7a8ba6dc5992f509327893f9918ffcc79b1d30b0fecd /usr/share/licenses/utf8proc /usr/share/licenses/utf8proc
COPY FROM HOST /Dollyfile-neovim-build 63b702bc60595a83f8db7a8ba6dc5992f509327893f9918ffcc79b1d30b0fecd /usr/share/licenses/treesitter /usr/share/licenses/treesitter
EXPORTS TOOL nvim
EXPORTS FOLDER nvim-runtime /usr/share/nvim
EXPORTS FOLDER nvim-libraries /usr/lib/nvim
