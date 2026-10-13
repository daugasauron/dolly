#include <errno.h>
#include <stdio.h>
#include <string.h>

static int copy_stream(FILE *input, const char *name, int number_lines,
                       unsigned long *line_number) {
  unsigned char buffer[4096];
  int line_start = 1;
  size_t count;
  while ((count = fread(buffer, 1, sizeof(buffer), input)) != 0) {
    if (!number_lines) {
      if (fwrite(buffer, 1, count, stdout) != count) {
        fprintf(stderr, "cat: %s: write failed\n", name);
        return 1;
      }
      continue;
    }
    for (size_t index = 0; index < count; index++) {
      if (line_start) {
        if (fprintf(stdout, "%6lu\t", (*line_number)++) < 0) return 1;
        line_start = 0;
      }
      if (fputc(buffer[index], stdout) == EOF) return 1;
      if (buffer[index] == '\n') line_start = 1;
    }
  }
  if (ferror(input)) {
    fprintf(stderr, "cat: %s: %s\n", name, strerror(errno));
    return 1;
  }
  return 0;
}

int main(int argc, char **argv) {
  int number_lines = 0;
  int first_file = 1;
  for (; first_file < argc; first_file++) {
    if (strcmp(argv[first_file], "--") == 0) {
      first_file++;
      break;
    }
    if (strcmp(argv[first_file], "--help") == 0) {
      fputs("usage: cat [-n] [--] [FILE ...]\n", stdout);
      fputs("with no FILE, or when FILE is -, read standard input\n", stdout);
      return 0;
    }
    if (strcmp(argv[first_file], "-n") == 0) {
      number_lines = 1;
      continue;
    }
    if (argv[first_file][0] == '-' && strcmp(argv[first_file], "-") != 0) {
      fprintf(stderr, "cat: unsupported option: %s\n", argv[first_file]);
      return 2;
    }
    break;
  }

  int status = 0;
  unsigned long line_number = 1;
  if (first_file == argc) {
    status = copy_stream(stdin, "standard input", number_lines, &line_number);
  }
  for (int index = first_file; index < argc; index++) {
    FILE *input = stdin;
    if (strcmp(argv[index], "-") != 0) {
      input = fopen(argv[index], "rb");
      if (input == NULL) {
        fprintf(stderr, "cat: %s: %s\n", argv[index], strerror(errno));
        status = 1;
        continue;
      }
    }
    if (copy_stream(input, argv[index], number_lines, &line_number) != 0) {
      status = 1;
    }
    if (input != stdin && fclose(input) != 0) {
      fprintf(stderr, "cat: %s: %s\n", argv[index], strerror(errno));
      status = 1;
    }
  }
  if (fflush(stdout) != 0) status = 1;
  return status;
}
