#include <stdio.h>
#include <string.h>

enum {
  SHOW_SYSTEM = 1u << 0,
  SHOW_NODE = 1u << 1,
  SHOW_RELEASE = 1u << 2,
  SHOW_VERSION = 1u << 3,
  SHOW_MACHINE = 1u << 4,
};

static void usage(FILE *stream) {
  fputs("usage: uname [-amnrsv]\n", stream);
}

int main(int argc, char **argv) {
  unsigned fields = 0;
  for (int argument = 1; argument < argc; argument++) {
    if (strcmp(argv[argument], "--help") == 0) {
      usage(stdout);
      return 0;
    }
    if (strcmp(argv[argument], "--") == 0) {
      if (argument + 1 != argc) {
        usage(stderr);
        return 2;
      }
      break;
    }
    if (argv[argument][0] != '-' || argv[argument][1] == '\0') {
      usage(stderr);
      return 2;
    }
    for (const char *option = argv[argument] + 1; *option != '\0'; option++) {
      switch (*option) {
        case 'a':
          fields |= SHOW_SYSTEM | SHOW_NODE | SHOW_RELEASE | SHOW_VERSION |
                    SHOW_MACHINE;
          break;
        case 's': fields |= SHOW_SYSTEM; break;
        case 'n': fields |= SHOW_NODE; break;
        case 'r': fields |= SHOW_RELEASE; break;
        case 'v': fields |= SHOW_VERSION; break;
        case 'm': fields |= SHOW_MACHINE; break;
        default:
          fprintf(stderr, "uname: unsupported option: -%c\n", *option);
          usage(stderr);
          return 2;
      }
    }
  }
  if (fields == 0) fields = SHOW_SYSTEM;

  const struct {
    unsigned field;
    const char *value;
  } values[] = {
    {SHOW_SYSTEM, "Dolly"},
    {SHOW_NODE, "dolly"},
    {SHOW_RELEASE, "0"},
    {SHOW_VERSION, "dolly-process-0"},
    {SHOW_MACHINE, "wasm64"},
  };
  int separator = 0;
  for (size_t index = 0; index < sizeof(values) / sizeof(values[0]); index++) {
    if ((fields & values[index].field) == 0) continue;
    if (separator && fputc(' ', stdout) == EOF) return 1;
    if (fputs(values[index].value, stdout) == EOF) return 1;
    separator = 1;
  }
  if (fputc('\n', stdout) == EOF || fflush(stdout) != 0) return 1;
  return 0;
}
