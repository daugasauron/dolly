#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

int main(int argc, char **argv) {
  if (argc > 2 || (argc == 2 && strcmp(argv[1], "--help") != 0)) {
    fprintf(stderr, "help: unsupported argument: %s\n", argv[1]);
    return 2;
  }
  const char *path = getenv("PATH");
  fputs("Dolly Slop: minimal agent-tool compatibility inside Wasm\n", stdout);
  fputs("stateful builtins: : exit cd export unset set\n", stdout);
  printf("PATH=%s\n", path == NULL ? "" : path);
  fputs("/bin: slop help pwd cd cat echo mkdir touch rm clear ls stat file test [ mv cp grep sed head wc printf awk cc c++ ld ar download\n", stdout);
  fputs("/usr/bin: curl git make zig ghostty-vt qjs janis pi demo", stdout);
  if (access("/usr/bin/graphics-demo", F_OK) == 0) fputs(" graphics-demo", stdout);
  fputc('\n', stdout);
  fputs("operators: ; newline && || ! | < > >> 2> 2>> 2>&1\n", stdout);
  fputs("expansion: $VAR ${VAR} $? $$ $# $0..9 $@ $* $(command) and globs\n", stdout);
  fputs("make recipes run serially through /bin/slop -c\n", stdout);
  return 0;
}
