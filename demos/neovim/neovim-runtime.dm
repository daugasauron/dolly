DOLLY 4
MODULE neovim-runtime

COPY FROM HOST /Dollyfile-neovim-build 6dc05d36ccd0e9b6a7cf0b96c12d3e4edfe78eff02bb557f010b0183192d016f /usr/bin/nvim /usr/bin/nvim
COPY FROM HOST /Dollyfile-neovim-build 6dc05d36ccd0e9b6a7cf0b96c12d3e4edfe78eff02bb557f010b0183192d016f /usr/share/nvim /usr/share/nvim
COPY FROM HOST /Dollyfile-neovim-build 6dc05d36ccd0e9b6a7cf0b96c12d3e4edfe78eff02bb557f010b0183192d016f /usr/lib/nvim /usr/lib/nvim
COPY FROM HOST /Dollyfile-neovim-build 6dc05d36ccd0e9b6a7cf0b96c12d3e4edfe78eff02bb557f010b0183192d016f /usr/share/licenses/neovim /usr/share/licenses/neovim
COPY FROM HOST /Dollyfile-neovim-build 6dc05d36ccd0e9b6a7cf0b96c12d3e4edfe78eff02bb557f010b0183192d016f /usr/share/licenses/neovim-parsers /usr/share/licenses/neovim-parsers
COPY FROM HOST /Dollyfile-neovim-build 6dc05d36ccd0e9b6a7cf0b96c12d3e4edfe78eff02bb557f010b0183192d016f /usr/share/licenses/libuv /usr/share/licenses/libuv
COPY FROM HOST /Dollyfile-neovim-build 6dc05d36ccd0e9b6a7cf0b96c12d3e4edfe78eff02bb557f010b0183192d016f /usr/share/licenses/lua /usr/share/licenses/lua
COPY FROM HOST /Dollyfile-neovim-build 6dc05d36ccd0e9b6a7cf0b96c12d3e4edfe78eff02bb557f010b0183192d016f /usr/share/licenses/luv /usr/share/licenses/luv
COPY FROM HOST /Dollyfile-neovim-build 6dc05d36ccd0e9b6a7cf0b96c12d3e4edfe78eff02bb557f010b0183192d016f /usr/share/licenses/lua-compat53 /usr/share/licenses/lua-compat53
COPY FROM HOST /Dollyfile-neovim-build 6dc05d36ccd0e9b6a7cf0b96c12d3e4edfe78eff02bb557f010b0183192d016f /usr/share/licenses/lpeg /usr/share/licenses/lpeg
COPY FROM HOST /Dollyfile-neovim-build 6dc05d36ccd0e9b6a7cf0b96c12d3e4edfe78eff02bb557f010b0183192d016f /usr/share/licenses/utf8proc /usr/share/licenses/utf8proc
COPY FROM HOST /Dollyfile-neovim-build 6dc05d36ccd0e9b6a7cf0b96c12d3e4edfe78eff02bb557f010b0183192d016f /usr/share/licenses/treesitter /usr/share/licenses/treesitter
EXPORTS TOOL nvim
EXPORTS FOLDER nvim-runtime /usr/share/nvim
EXPORTS FOLDER nvim-libraries /usr/lib/nvim
