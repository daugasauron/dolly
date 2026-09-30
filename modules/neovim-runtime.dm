DOLLY 4
MODULE neovim-runtime

USE HOST /modules/posix-shell.dm f549dd966c59473892d2fc9f11a19a9b7eaf1c344b1b4a62c5dbf2fbedcc3753

COPY FROM HOST /Dollyfile-neovim-build cf27046ea80a7965d26fb150299603d6fd87d706371d05204861a3fff5d12f59 /usr/bin/nvim /usr/bin/nvim
COPY FROM HOST /Dollyfile-neovim-build cf27046ea80a7965d26fb150299603d6fd87d706371d05204861a3fff5d12f59 /usr/share/nvim /usr/share/nvim
COPY FROM HOST /Dollyfile-neovim-build cf27046ea80a7965d26fb150299603d6fd87d706371d05204861a3fff5d12f59 /usr/lib/nvim /usr/lib/nvim
COPY FROM HOST /Dollyfile-neovim-build cf27046ea80a7965d26fb150299603d6fd87d706371d05204861a3fff5d12f59 /usr/share/licenses/neovim /usr/share/licenses/neovim
COPY FROM HOST /Dollyfile-neovim-build cf27046ea80a7965d26fb150299603d6fd87d706371d05204861a3fff5d12f59 /usr/share/licenses/neovim-parsers /usr/share/licenses/neovim-parsers
COPY FROM HOST /Dollyfile-neovim-build cf27046ea80a7965d26fb150299603d6fd87d706371d05204861a3fff5d12f59 /usr/share/licenses/libuv /usr/share/licenses/libuv
COPY FROM HOST /Dollyfile-neovim-build cf27046ea80a7965d26fb150299603d6fd87d706371d05204861a3fff5d12f59 /usr/share/licenses/lua /usr/share/licenses/lua
COPY FROM HOST /Dollyfile-neovim-build cf27046ea80a7965d26fb150299603d6fd87d706371d05204861a3fff5d12f59 /usr/share/licenses/luv /usr/share/licenses/luv
COPY FROM HOST /Dollyfile-neovim-build cf27046ea80a7965d26fb150299603d6fd87d706371d05204861a3fff5d12f59 /usr/share/licenses/lua-compat53 /usr/share/licenses/lua-compat53
COPY FROM HOST /Dollyfile-neovim-build cf27046ea80a7965d26fb150299603d6fd87d706371d05204861a3fff5d12f59 /usr/share/licenses/lpeg /usr/share/licenses/lpeg
COPY FROM HOST /Dollyfile-neovim-build cf27046ea80a7965d26fb150299603d6fd87d706371d05204861a3fff5d12f59 /usr/share/licenses/utf8proc /usr/share/licenses/utf8proc
COPY FROM HOST /Dollyfile-neovim-build cf27046ea80a7965d26fb150299603d6fd87d706371d05204861a3fff5d12f59 /usr/share/licenses/treesitter /usr/share/licenses/treesitter
EXPORTS TOOL nvim
EXPORTS FOLDER nvim-runtime /usr/share/nvim
EXPORTS FOLDER nvim-libraries /usr/lib/nvim
