#define _POSIX_C_SOURCE 200809L

#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

static int write_all(const char *bytes, size_t length) {
  while (length != 0) {
    const ssize_t written = write(STDOUT_FILENO, bytes, length);
    if (written < 0 && errno == EINTR) continue;
    if (written <= 0) return -1;
    bytes += written;
    length -= (size_t)written;
  }
  return 0;
}

// Writes what each read returns, so a pipe's bytes pass as they arrive.
static int copy_descriptor(int input, const char *name, int number_lines,
                           unsigned long *line_number, int *line_start) {
  char buffer[16384];
  for (;;) {
    const ssize_t count = read(input, buffer, sizeof(buffer));
    if (count < 0 && errno == EINTR) continue;
    if (count < 0) {
      fprintf(stderr, "cat: %s: %s\n", name, strerror(errno));
      return 1;
    }
    if (count == 0) return 0;
    for (size_t start = 0; start < (size_t)count;) {
      size_t end = (size_t)count;
      if (number_lines) {
        if (*line_start) {
          char number[32];
          const int length = snprintf(number, sizeof(number), "%6lu\t", (*line_number)++);
          if (write_all(number, (size_t)length) != 0) goto write_failed;
          *line_start = 0;
        }
        const char *newline = memchr(buffer + start, '\n', (size_t)count - start);
        if (newline != NULL) {
          end = (size_t)(newline - buffer) + 1;
          *line_start = 1;
        }
      }
      if (write_all(buffer + start, end - start) != 0) goto write_failed;
      start = end;
    }
  }
write_failed:
  fprintf(stderr, "cat: write failed: %s\n", strerror(errno));
  return 1;
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
      fputs("usage: cat [-nu] [--] [FILE ...]\n", stdout);
      fputs("with no FILE, or when FILE is -, read standard input; output is never buffered (-u)\n", stdout);
      return 0;
    }
    if (strcmp(argv[first_file], "-n") == 0 || strcmp(argv[first_file], "-u") == 0 ||
        strcmp(argv[first_file], "-nu") == 0 || strcmp(argv[first_file], "-un") == 0) {
      if (strchr(argv[first_file], 'n') != NULL) number_lines = 1;
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
  int line_start = 1;
  if (first_file == argc) {
    status = copy_descriptor(STDIN_FILENO, "standard input", number_lines, &line_number, &line_start);
  }
  for (int index = first_file; index < argc; index++) {
    const int standard_input = strcmp(argv[index], "-") == 0;
    const int input = standard_input ? STDIN_FILENO : open(argv[index], O_RDONLY);
    if (input < 0) {
      fprintf(stderr, "cat: %s: %s\n", argv[index], strerror(errno));
      status = 1;
      continue;
    }
    if (copy_descriptor(input, argv[index], number_lines, &line_number, &line_start) != 0) status = 1;
    if (!standard_input && close(input) != 0) {
      fprintf(stderr, "cat: %s: %s\n", argv[index], strerror(errno));
      status = 1;
    }
  }
  return status;
}
