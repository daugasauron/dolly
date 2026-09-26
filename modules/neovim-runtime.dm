DOLLY 4
MODULE neovim-runtime

USE HOST /modules/posix-shell.dm f549dd966c59473892d2fc9f11a19a9b7eaf1c344b1b4a62c5dbf2fbedcc3753

COPY FROM HOST /Dollyfile-neovim-build fda5cd8240bf76bf5b849051f2b556dac417a3807d159ef73c7c1fa529bdade9 /usr/bin/nvim /usr/bin/nvim
COPY FROM HOST /Dollyfile-neovim-build fda5cd8240bf76bf5b849051f2b556dac417a3807d159ef73c7c1fa529bdade9 /usr/share/nvim /usr/share/nvim
COPY FROM HOST /Dollyfile-neovim-build fda5cd8240bf76bf5b849051f2b556dac417a3807d159ef73c7c1fa529bdade9 /usr/lib/nvim /usr/lib/nvim
COPY FROM HOST /Dollyfile-neovim-build fda5cd8240bf76bf5b849051f2b556dac417a3807d159ef73c7c1fa529bdade9 /usr/share/licenses/neovim /usr/share/licenses/neovim
COPY FROM HOST /Dollyfile-neovim-build fda5cd8240bf76bf5b849051f2b556dac417a3807d159ef73c7c1fa529bdade9 /usr/share/licenses/neovim-parsers /usr/share/licenses/neovim-parsers
COPY FROM HOST /Dollyfile-neovim-build fda5cd8240bf76bf5b849051f2b556dac417a3807d159ef73c7c1fa529bdade9 /usr/share/licenses/libuv /usr/share/licenses/libuv
COPY FROM HOST /Dollyfile-neovim-build fda5cd8240bf76bf5b849051f2b556dac417a3807d159ef73c7c1fa529bdade9 /usr/share/licenses/lua /usr/share/licenses/lua
COPY FROM HOST /Dollyfile-neovim-build fda5cd8240bf76bf5b849051f2b556dac417a3807d159ef73c7c1fa529bdade9 /usr/share/licenses/luv /usr/share/licenses/luv
COPY FROM HOST /Dollyfile-neovim-build fda5cd8240bf76bf5b849051f2b556dac417a3807d159ef73c7c1fa529bdade9 /usr/share/licenses/lua-compat53 /usr/share/licenses/lua-compat53
COPY FROM HOST /Dollyfile-neovim-build fda5cd8240bf76bf5b849051f2b556dac417a3807d159ef73c7c1fa529bdade9 /usr/share/licenses/lpeg /usr/share/licenses/lpeg
COPY FROM HOST /Dollyfile-neovim-build fda5cd8240bf76bf5b849051f2b556dac417a3807d159ef73c7c1fa529bdade9 /usr/share/licenses/utf8proc /usr/share/licenses/utf8proc
COPY FROM HOST /Dollyfile-neovim-build fda5cd8240bf76bf5b849051f2b556dac417a3807d159ef73c7c1fa529bdade9 /usr/share/licenses/treesitter /usr/share/licenses/treesitter
EXPORTS TOOL nvim
EXPORTS FOLDER nvim-runtime /usr/share/nvim
EXPORTS FOLDER nvim-libraries /usr/lib/nvim
