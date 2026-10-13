#define _POSIX_C_SOURCE 200809L
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/wait.h>
#include <unistd.h>

int main(int argc, char **argv) {
  if (argc == 2 && strcmp(argv[1], "--help") == 0) {
    fputs("usage: man NAME\n"
          "Print the manual page of the command NAME: /usr/share/man/cat1/NAME.1,\n"
          "a page as plain text, or else /usr/share/man/man1/NAME.1, a page as upstream\n"
          "ships it (mdoc or man source, printed unformatted).\n"
          "A terminal gets the page through $PAGER, a shell command, or else through\n"
          "less when it is installed (amy install less). Output that is not a terminal\n"
          "is never paged, so nothing waits for a key.\n"
          "example: man grep\n", stdout);
    return 0;
  }
  if (argc != 2 || argv[1][0] == '-' || strchr(argv[1], '/') != NULL) {
    fputs("usage: man NAME\n", stderr);
    return 2;
  }
  static const char *const sections[] = {"cat1", "man1"};
  for (int section = 0; section < 2; section++) {
    char path[4096];
    if (snprintf(path, sizeof(path), "/usr/share/man/%s/%s.1", sections[section], argv[1]) >= (int)sizeof(path)) break;
    FILE *page = fopen(path, "r");
    if (page == NULL) continue;
    // Paged as Git pages: by $PAGER, else by less when it is installed, and
    // with Git's LESS, which prints a page that fits the screen and returns.
    const char *pager = getenv("PAGER");
    if (isatty(STDOUT_FILENO) && dup2(fileno(page), STDIN_FILENO) == STDIN_FILENO) {
      setenv("LESS", "FRX", 0);
      return WEXITSTATUS(system(pager != NULL && *pager != '\0' ? pager : "$(command -v less || command -v cat)"));
    }
    char buffer[4096];
    size_t count;
    while ((count = fread(buffer, 1, sizeof(buffer), page)) > 0) fwrite(buffer, 1, count, stdout);
    fclose(page);
    return 0;
  }
  fprintf(stderr, "man: no manual entry for %s\n", argv[1]);
  return 1;
}
