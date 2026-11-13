#define _POSIX_C_SOURCE 200809L

#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void usage(FILE *stream) {
  fputs("usage: rev [FILE ...]\n", stream);
}

static int is_continuation(unsigned char byte) {
  return (byte & 0xc0u) == 0x80u;
}

static int reverse_stream(FILE *input, const char *name) {
  char *line = NULL;
  size_t capacity = 0;
  ssize_t length;
  int status = 0;

  errno = 0;
  while ((length = getline(&line, &capacity, input)) >= 0) {
    size_t remaining = (size_t)length;
    const int newline = remaining != 0 && line[remaining - 1] == '\n';
    if (newline) remaining--;

    while (remaining != 0) {
      size_t start = remaining - 1;
      while (start != 0 && is_continuation((unsigned char)line[start])) start--;
      if (fwrite(line + start, 1, remaining - start, stdout) != remaining - start) {
        fprintf(stderr, "rev: write: %s\n", strerror(errno));
        status = 1;
        goto done;
      }
      remaining = start;
    }
    if (newline && fputc('\n', stdout) == EOF) {
      fprintf(stderr, "rev: write: %s\n", strerror(errno));
      status = 1;
      goto done;
    }
    errno = 0;
  }
  if (ferror(input)) {
    fprintf(stderr, "rev: read %s: %s\n", name, strerror(errno));
    status = 1;
  }

done:
  free(line);
  return status;
}

int main(int argc, char **argv) {
  int status = 0;
  if (argc == 2 && strcmp(argv[1], "--help") == 0) {
    usage(stdout);
    return 0;
  }

  if (argc == 1) {
    status = reverse_stream(stdin, "<stdin>");
  } else {
    for (int index = 1; index < argc; index++) {
      FILE *input;
      if (strcmp(argv[index], "-") == 0) {
        input = stdin;
      } else {
        input = fopen(argv[index], "rb");
        if (input == NULL) {
          fprintf(stderr, "rev: open %s: %s\n", argv[index], strerror(errno));
          status = 1;
          continue;
        }
      }
      if (reverse_stream(input, argv[index]) != 0) status = 1;
      if (input != stdin && fclose(input) != 0) {
        fprintf(stderr, "rev: close %s: %s\n", argv[index], strerror(errno));
        status = 1;
      }
    }
  }

  if (fflush(stdout) != 0) {
    fprintf(stderr, "rev: flush: %s\n", strerror(errno));
    status = 1;
  }
  return status;
}
