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
  fputs("stateful builtins: : . source eval exec exit return cd export unset set shift read getopts local break continue type\n", stdout);
  printf("PATH=%s\n", path == NULL ? "" : path);
  fputs("/bin: slop dollyfile help pwd cd cat echo mkdir touch rm rmdir ln readlink realpath pathchk clear ls stat file test [ mv cp install which command xargs find du dd tail tee tty env printenv basename dirname tr cmp diff patch comm paste join seq expr nl split strings cksum rev fold expand unexpand tsort date time uname hostname mktemp sha256sum md5sum sleep timeout true false grep sed head wc cut od printf sort uniq awk cc c++ ld ar tar gzip download\n", stdout);
  fputs("/usr/bin: curl git make zig ghostty-vt qjs janis tsc pi demo", stdout);
  if (access("/usr/bin/graphics-demo", F_OK) == 0) fputs(" graphics-demo", stdout);
  if (access("/usr/bin/python", F_OK) == 0) fputs(" python python3 bonnie", stdout);
  fputc('\n', stdout);
  fputs("operators: ; newline backslash-newline && || ! | < > >> 2> 2>> 2>&1\n", stdout);
  fputs("conditionals: if COMMANDS; then COMMANDS; [elif ...; then ...;] [else ...;] fi\n", stdout);
  fputs("loops: for NAME [in WORD ...]; do COMMANDS; done; while|until COMMANDS; do COMMANDS; done; break|continue [N]\n", stdout);
  fputs("selection: case WORD in PATTERN[|PATTERN]...) COMMANDS ;; ... esac\n", stdout);
  fputs("functions/groups: NAME () { COMMANDS; }; return [STATUS]; { COMMANDS; }; (COMMANDS)\n", stdout);
  fputs("expansion: $VAR ${VAR} ${VAR:-WORD} ${VAR:=WORD} ${VAR:+WORD} ${VAR:?WORD} ${#VAR} ${VAR#PATTERN} ${VAR##PATTERN} ${VAR%PATTERN} ${VAR%%PATTERN} $? $$ $# $0..9 $@ $* $(command) `command` $((integer expression)) and globs; set [--] ARG...; shift [N]\n", stdout);
  fputs("options: set -e/+e -x/+x -o/+o pipefail; set -o lists finite options\n", stdout);
  fputs("make recipes run serially through /bin/slop -c\n", stdout);
  fputs("TypeScript: tsc FILE.ts --target ES2023 --module ES2022\n", stdout);
  if (access("/usr/bin/bonnie", F_OK) == 0) {
    fputs("Python packages: bonnie install PACKAGE; bonnie list|freeze|show|check\n", stdout);
  }
  return 0;
}
