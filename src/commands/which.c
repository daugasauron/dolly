#define _XOPEN_SOURCE 700

#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

static void usage(FILE *stream) {
  fputs("usage: which [-a] NAME ...\n"
        "Prints the program PATH runs for each NAME (with -a, every match).\n"
        "Status 1 when a NAME has none; builtins and functions are not programs.\n", stream);
}

static int program(const char *path) {
  struct stat metadata;
  return stat(path, &metadata) == 0 && S_ISREG(metadata.st_mode);
}

// Lookup, as Slop's, finds regular files: there are no execute bits.
static int which(const char *search, const char *name, int every) {
  if (strchr(name, '/') != NULL) return program(name) && puts(name) >= 0;
  int found = 0;
  for (const char *directory = search; !found || every; directory++) {
    const size_t length = strcspn(directory, ":");
    char path[PATH_MAX];
    const int size = snprintf(path, sizeof(path), "%.*s%s%s", length ? (int)length : 1, length ? directory : ".",
                              length && directory[length - 1] == '/' ? "" : "/", name);
    if (size < (int)sizeof(path) && program(path)) found = puts(path) >= 0;
    directory += length;
    if (*directory == '\0') break;
  }
  return found;
}

int main(int argc, char **argv) {
  if (argc == 2 && strcmp(argv[1], "--help") == 0) {
    usage(stdout);
    return 0;
  }
  const int every = argc > 1 && strcmp(argv[1], "-a") == 0;
  int argument = 1 + every;
  if (argument < argc && strcmp(argv[argument], "--") == 0) argument++;
  if (argument == argc || argv[argument][0] == '-') {
    usage(stderr);
    return 2;
  }
  const char *search = getenv("PATH");
  int status = 0;
  for (; argument < argc; argument++) {
    if (!which(search == NULL ? "/bin:/usr/bin" : search, argv[argument], every)) status = 1;
  }
  return fflush(stdout) == 0 ? status : 1;
}
