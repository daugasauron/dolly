#define _XOPEN_SOURCE 700

#include "run-program.h"

static void usage(FILE *stream) {
  fputs("usage: diff [-abNqrw] [-u | -U N] [--] FILE FILE\n"
        "Dolly compares with source-built git diff --no-index; output is "
        "always unified.\n", stream);
}

int main(int argc, char **argv) {
  int text = 0, space_change = 0, all_space = 0, brief = 0, new_file = 0;
  char context[16] = "-U3";
  int argument = 1;
  for (; argument < argc && argv[argument][0] == '-' && argv[argument][1] != '\0'; argument++) {
    if (strcmp(argv[argument], "--") == 0) {
      argument++;
      break;
    }
    if (strcmp(argv[argument], "--help") == 0) {
      usage(stdout);
      return 0;
    }
    for (const char *option = argv[argument] + 1; *option != '\0'; option++) {
      if (*option == 'u' || *option == 'r') continue;
      if (*option == 'a') text = 1;
      else if (*option == 'b') space_change = 1;
      else if (*option == 'w') all_space = 1;
      else if (*option == 'q') brief = 1;
      else if (*option == 'N') new_file = 1;
      else if (*option == 'U') {
        const char *lines = option[1] != '\0' ? option + 1 : argv[++argument];
        if (lines == NULL || lines[0] == '\0' || strlen(lines) > 9 ||
            strspn(lines, "0123456789") != strlen(lines)) {
          fputs("diff: -U requires a line count\n", stderr);
          return 2;
        }
        snprintf(context, sizeof(context), "-U%s", lines);
        break;
      } else {
        fprintf(stderr, "diff: unsupported option: -%c\n", *option);
        usage(stderr);
        return 2;
      }
    }
  }
  if (argc - argument != 2) {
    usage(stderr);
    return 2;
  }
  char *arguments[16] = {"git", "--no-pager", "diff", "--no-index", "--no-prefix", context};
  int count = 6;
  if (text) arguments[count++] = "--text";
  if (space_change) arguments[count++] = "-b";
  if (all_space) arguments[count++] = "-w";
  if (brief) arguments[count++] = "--quiet";
  arguments[count++] = "--";
  for (; argument < argc; argument++) {
    struct stat metadata;
    if (lstat(argv[argument], &metadata) == 0) {
      arguments[count++] = argv[argument];
    } else if (new_file && errno == ENOENT) {
      arguments[count++] = "/dev/null";
    } else {
      fprintf(stderr, "diff: %s: %s\n", argv[argument], strerror(errno));
      return 2;
    }
  }
  const int status = run_program("diff", count, arguments, getenv("PATH"), -1);
  if (brief && status == 1) printf("Files %s and %s differ\n", argv[argc - 2], argv[argc - 1]);
  return status <= 1 ? status : 2;
}
