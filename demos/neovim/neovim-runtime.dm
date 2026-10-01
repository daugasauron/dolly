DOLLY 4
MODULE neovim-runtime

COPY FROM HOST /Dollyfile-neovim-build cfd822c91990feda796245104e486ae66746fd95ca0bbcdac2b4aa4006de023b /usr/bin/nvim /usr/bin/nvim
COPY FROM HOST /Dollyfile-neovim-build cfd822c91990feda796245104e486ae66746fd95ca0bbcdac2b4aa4006de023b /usr/share/nvim /usr/share/nvim
COPY FROM HOST /Dollyfile-neovim-build cfd822c91990feda796245104e486ae66746fd95ca0bbcdac2b4aa4006de023b /usr/lib/nvim /usr/lib/nvim
COPY FROM HOST /Dollyfile-neovim-build cfd822c91990feda796245104e486ae66746fd95ca0bbcdac2b4aa4006de023b /usr/share/licenses/neovim /usr/share/licenses/neovim
COPY FROM HOST /Dollyfile-neovim-build cfd822c91990feda796245104e486ae66746fd95ca0bbcdac2b4aa4006de023b /usr/share/licenses/neovim-parsers /usr/share/licenses/neovim-parsers
COPY FROM HOST /Dollyfile-neovim-build cfd822c91990feda796245104e486ae66746fd95ca0bbcdac2b4aa4006de023b /usr/share/licenses/libuv /usr/share/licenses/libuv
COPY FROM HOST /Dollyfile-neovim-build cfd822c91990feda796245104e486ae66746fd95ca0bbcdac2b4aa4006de023b /usr/share/licenses/lua /usr/share/licenses/lua
COPY FROM HOST /Dollyfile-neovim-build cfd822c91990feda796245104e486ae66746fd95ca0bbcdac2b4aa4006de023b /usr/share/licenses/luv /usr/share/licenses/luv
COPY FROM HOST /Dollyfile-neovim-build cfd822c91990feda796245104e486ae66746fd95ca0bbcdac2b4aa4006de023b /usr/share/licenses/lua-compat53 /usr/share/licenses/lua-compat53
COPY FROM HOST /Dollyfile-neovim-build cfd822c91990feda796245104e486ae66746fd95ca0bbcdac2b4aa4006de023b /usr/share/licenses/lpeg /usr/share/licenses/lpeg
COPY FROM HOST /Dollyfile-neovim-build cfd822c91990feda796245104e486ae66746fd95ca0bbcdac2b4aa4006de023b /usr/share/licenses/utf8proc /usr/share/licenses/utf8proc
COPY FROM HOST /Dollyfile-neovim-build cfd822c91990feda796245104e486ae66746fd95ca0bbcdac2b4aa4006de023b /usr/share/licenses/treesitter /usr/share/licenses/treesitter
EXPORTS TOOL nvim
EXPORTS FOLDER nvim-runtime /usr/share/nvim
EXPORTS FOLDER nvim-libraries /usr/lib/nvim
