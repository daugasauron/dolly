DOLLY 5
MODULE neovim-runtime

COPY FROM https://daugasauron.com/demos/neovim/Dollyfile-neovim-build 9810b297da7013c50fe196c6f69be7c297b8d5b491a22157dd08389cd66dbbd6 /usr/bin/nvim /usr/bin/nvim
COPY FROM https://daugasauron.com/demos/neovim/Dollyfile-neovim-build 9810b297da7013c50fe196c6f69be7c297b8d5b491a22157dd08389cd66dbbd6 /usr/share/nvim /usr/share/nvim
COPY FROM https://daugasauron.com/demos/neovim/Dollyfile-neovim-build 9810b297da7013c50fe196c6f69be7c297b8d5b491a22157dd08389cd66dbbd6 /usr/lib/nvim /usr/lib/nvim
COPY FROM https://daugasauron.com/demos/neovim/Dollyfile-neovim-build 9810b297da7013c50fe196c6f69be7c297b8d5b491a22157dd08389cd66dbbd6 /usr/share/licenses/neovim /usr/share/licenses/neovim
COPY FROM https://daugasauron.com/demos/neovim/Dollyfile-neovim-build 9810b297da7013c50fe196c6f69be7c297b8d5b491a22157dd08389cd66dbbd6 /usr/share/licenses/neovim-parsers /usr/share/licenses/neovim-parsers
COPY FROM https://daugasauron.com/demos/neovim/Dollyfile-neovim-build 9810b297da7013c50fe196c6f69be7c297b8d5b491a22157dd08389cd66dbbd6 /usr/share/licenses/libuv /usr/share/licenses/libuv
COPY FROM https://daugasauron.com/demos/neovim/Dollyfile-neovim-build 9810b297da7013c50fe196c6f69be7c297b8d5b491a22157dd08389cd66dbbd6 /usr/share/licenses/lua /usr/share/licenses/lua
COPY FROM https://daugasauron.com/demos/neovim/Dollyfile-neovim-build 9810b297da7013c50fe196c6f69be7c297b8d5b491a22157dd08389cd66dbbd6 /usr/share/licenses/luv /usr/share/licenses/luv
COPY FROM https://daugasauron.com/demos/neovim/Dollyfile-neovim-build 9810b297da7013c50fe196c6f69be7c297b8d5b491a22157dd08389cd66dbbd6 /usr/share/licenses/lua-compat53 /usr/share/licenses/lua-compat53
COPY FROM https://daugasauron.com/demos/neovim/Dollyfile-neovim-build 9810b297da7013c50fe196c6f69be7c297b8d5b491a22157dd08389cd66dbbd6 /usr/share/licenses/lpeg /usr/share/licenses/lpeg
COPY FROM https://daugasauron.com/demos/neovim/Dollyfile-neovim-build 9810b297da7013c50fe196c6f69be7c297b8d5b491a22157dd08389cd66dbbd6 /usr/share/licenses/utf8proc /usr/share/licenses/utf8proc
COPY FROM https://daugasauron.com/demos/neovim/Dollyfile-neovim-build 9810b297da7013c50fe196c6f69be7c297b8d5b491a22157dd08389cd66dbbd6 /usr/share/licenses/treesitter /usr/share/licenses/treesitter
EXPORTS TOOL nvim
EXPORTS FOLDER nvim-runtime /usr/share/nvim
EXPORTS FOLDER nvim-libraries /usr/lib/nvim
