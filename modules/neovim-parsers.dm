DOLLY 3
MODULE neovim-parsers

REQUIRES TOOL cmake
REQUIRES TOOL cc
REQUIRES TOOL make
REQUIRES TOOL slop
REQUIRES TOOL tar
REQUIRES TOOL rm
REQUIRES TOOL nvim
REQUIRES TOOL timeout

# Neovim's pinned grammars and its own CMake build recipes, all built in Dolly.
SOURCE HOST /static/neovim/parsers.tar /tmp/neovim-parsers/source.tar 18656076f67f0cb39a68cbe1c6f628c35faf23e2ec207f914e97874a9cf323f7
SLOP tar -xf /tmp/neovim-parsers/source.tar -C /
FILE /tmp/neovim-parsers/build.slop
    set -ex
    for language in c lua vim vimdoc query markdown; do
      cmake -S /tmp/neovim-parsers/$language -B /tmp/neovim-parsers/$language/build \
        -DCMAKE_INSTALL_PREFIX=/usr -DCMAKE_C_FLAGS=-O0 -DPARSERLANG=$language
      cmake --build /tmp/neovim-parsers/$language/build
      cmake --install /tmp/neovim-parsers/$language/build
    done
SLOP slop /tmp/neovim-parsers/build.slop

FILE /tmp/neovim-parsers/check.lua
    for language, source in pairs({
      c = "int main(void) { return 0; }",
      lua = "return 42",
      vim = "echo 'Dolly'\n",
      vimdoc = "Dolly\n\n",
      query = "(identifier) @name",
      markdown = "# Dolly\n",
      markdown_inline = "**Dolly**",
    }) do
      local parser = vim.treesitter.get_string_parser(source, language)
      local tree = assert(parser:parse()[1])
      assert(not tree:root():has_error(), language .. ": " .. tree:root():sexpr())
    end
    vim.cmd("quit!")
SLOP timeout 30 nvim --clean --headless -l /tmp/neovim-parsers/check.lua

EXPORTS FOLDER nvim-parsers /usr/lib/nvim/parser
EXPORTS FOLDER nvim-parser-licenses /usr/share/licenses/neovim-parsers
SLOP rm -rf /tmp/neovim-parsers
