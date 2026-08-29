#include <errno.h>
#include <stdio.h>
#include <string.h>

int main(int argc, char **argv) {
  int no_create = 0;
  int first_file = 1;
  for (; first_file < argc; first_file++) {
    if (strcmp(argv[first_file], "--") == 0) {
      first_file++;
      break;
    }
    if (strcmp(argv[first_file], "--help") == 0) {
      fputs("usage: touch [-c] [--] FILE ...\n", stdout);
      return 0;
    }
    if (strcmp(argv[first_file], "-c") == 0 ||
        strcmp(argv[first_file], "--no-create") == 0) {
      no_create = 1;
    } else if (argv[first_file][0] == '-') {
      fprintf(stderr, "touch: unsupported option: %s\n", argv[first_file]);
      return 2;
    } else {
      break;
    }
  }
  if (first_file == argc) {
    fputs("touch: missing file operand\n", stderr);
    return 2;
  }

  int status = 0;
  for (int index = first_file; index < argc; index++) {
    FILE *file = fopen(argv[index], "rb");
    if (file != NULL) {
      fclose(file);
      continue;
    }
    if (no_create && errno == ENOENT) continue;
    file = fopen(argv[index], "wb");
    if (file == NULL) {
      fprintf(stderr, "touch: %s: %s\n", argv[index], strerror(errno));
      status = 1;
    } else if (fclose(file) != 0) {
      fprintf(stderr, "touch: %s: %s\n", argv[index], strerror(errno));
      status = 1;
    }
  }
  return status;
}
