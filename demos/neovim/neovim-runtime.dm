DOLLY 5
MODULE neovim-runtime

COPY FROM https://daugasauron.com/Dollyfile-neovim-build e0606ac2fc81631c572a9eaae7d089cc844763e317c03997e39f68978ee18d5b /usr/bin/nvim /usr/bin/nvim
COPY FROM https://daugasauron.com/Dollyfile-neovim-build e0606ac2fc81631c572a9eaae7d089cc844763e317c03997e39f68978ee18d5b /usr/share/nvim /usr/share/nvim
COPY FROM https://daugasauron.com/Dollyfile-neovim-build e0606ac2fc81631c572a9eaae7d089cc844763e317c03997e39f68978ee18d5b /usr/lib/nvim /usr/lib/nvim
COPY FROM https://daugasauron.com/Dollyfile-neovim-build e0606ac2fc81631c572a9eaae7d089cc844763e317c03997e39f68978ee18d5b /usr/share/licenses/neovim /usr/share/licenses/neovim
COPY FROM https://daugasauron.com/Dollyfile-neovim-build e0606ac2fc81631c572a9eaae7d089cc844763e317c03997e39f68978ee18d5b /usr/share/licenses/neovim-parsers /usr/share/licenses/neovim-parsers
COPY FROM https://daugasauron.com/Dollyfile-neovim-build e0606ac2fc81631c572a9eaae7d089cc844763e317c03997e39f68978ee18d5b /usr/share/licenses/libuv /usr/share/licenses/libuv
COPY FROM https://daugasauron.com/Dollyfile-neovim-build e0606ac2fc81631c572a9eaae7d089cc844763e317c03997e39f68978ee18d5b /usr/share/licenses/lua /usr/share/licenses/lua
COPY FROM https://daugasauron.com/Dollyfile-neovim-build e0606ac2fc81631c572a9eaae7d089cc844763e317c03997e39f68978ee18d5b /usr/share/licenses/luv /usr/share/licenses/luv
COPY FROM https://daugasauron.com/Dollyfile-neovim-build e0606ac2fc81631c572a9eaae7d089cc844763e317c03997e39f68978ee18d5b /usr/share/licenses/lua-compat53 /usr/share/licenses/lua-compat53
COPY FROM https://daugasauron.com/Dollyfile-neovim-build e0606ac2fc81631c572a9eaae7d089cc844763e317c03997e39f68978ee18d5b /usr/share/licenses/lpeg /usr/share/licenses/lpeg
COPY FROM https://daugasauron.com/Dollyfile-neovim-build e0606ac2fc81631c572a9eaae7d089cc844763e317c03997e39f68978ee18d5b /usr/share/licenses/utf8proc /usr/share/licenses/utf8proc
COPY FROM https://daugasauron.com/Dollyfile-neovim-build e0606ac2fc81631c572a9eaae7d089cc844763e317c03997e39f68978ee18d5b /usr/share/licenses/treesitter /usr/share/licenses/treesitter
EXPORTS TOOL nvim
EXPORTS FOLDER nvim-runtime /usr/share/nvim
EXPORTS FOLDER nvim-libraries /usr/lib/nvim
