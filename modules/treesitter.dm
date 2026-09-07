DOLLY 3
MODULE treesitter

REQUIRES HEADER libc
REQUIRES TOOL cc
REQUIRES TOOL ar
REQUIRES TOOL make
REQUIRES TOOL tar
REQUIRES TOOL cp
REQUIRES TOOL rm
REQUIRES TOOL uname

SOURCE HOST /static/neovim/treesitter.tar /tmp/treesitter/source.tar c31944873f3cd13235f2e9148b474f329b6bf183823baea50eacdb125fc46f9c
SLOP tar -xf /tmp/treesitter/source.tar -C /
SLOP make -C /tmp/treesitter/source CC=cc CFLAGS=-O0 MACHINE=wasm64-unknown-emscripten libtree-sitter.a
SLOP cp /tmp/treesitter/source/libtree-sitter.a /usr/lib/libtree-sitter.a
SLOP cp -R /tmp/treesitter/source/lib/include/tree_sitter /usr/include
SLOP cp /tmp/treesitter/source/lib/src/unicode/LICENSE /usr/share/licenses/treesitter/Unicode-LICENSE

FILE /tmp/treesitter/check.c
    #include <tree_sitter/api.h>
    #include <assert.h>
    int main(void) {
      TSParser *parser = ts_parser_new();
      assert(parser && ts_parser_language(parser) == 0);
      ts_parser_reset(parser);
      ts_parser_delete(parser);
      return 0;
    }
SLOP cc -O0 /tmp/treesitter/check.c -ltree-sitter -o /tmp/treesitter/check
SLOP /tmp/treesitter/check

EXPORTS HEADER treesitter /usr/include/tree_sitter
EXPORTS LIB treesitter /usr/lib/libtree-sitter.a
FILE /usr/share/licenses/treesitter/LICENSE
FILE /usr/share/licenses/treesitter/Unicode-LICENSE
SLOP rm -rf /tmp/treesitter
